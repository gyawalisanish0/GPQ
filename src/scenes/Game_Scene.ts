import Phaser from 'phaser';
import { SwipeHandler }                            from '../engine/SwipeHandler';
import { GameLogic, ShapeType, SpecialType, LogicCell, MatchResult } from '../engine/GameLogic';
import { EffectManager, IEffectDelegate }          from '../engine/EffectManager';
import { CombatRegistry }                          from '../engine/CombatRegistry';
import { CombatManager }                           from '../engine/CombatManager';
import { OpponentAI }                              from '../engine/OpponentAI';
import { GemRegistry }                             from '../engine/GemRegistry';
import { SoundManager, SoundType }                 from '../engine/SoundManager';
import { BaseScene }                               from './BaseScene';

// ─── Constants ────────────────────────────────────────────────────────────────
const GRID_SIZE = 10;

// Computed in onInit() from screen dimensions
let CELL_SIZE   = 80;
let GRID_PX     = 800;

// ─── Types ────────────────────────────────────────────────────────────────────
interface VisualCell { sprite: Phaser.GameObjects.Container }

interface BarState {
  gfx:   Phaser.GameObjects.Graphics;
  pct:   number;    // last drawn value
  color: number;
  w:     number;
  y:     number;    // local y inside container
}

// Tiny reusable floating-score text
interface PooledText {
  obj:  Phaser.GameObjects.Text;
  free: boolean;
}

// ─── Game Scene ───────────────────────────────────────────────────────────────
export class Game_Scene extends BaseScene implements IEffectDelegate {
  constructor() { super('Game_Scene'); }

  // Core
  private logic!:         GameLogic;
  private visualGrid:     (VisualCell | null)[][] = [];
  private isProcessing  = false;
  private isGameOver    = false;
  private powerSurge    = 0;
  private colors: Record<ShapeType, number> = {} as Record<ShapeType, number>;

  // Input
  private swipeHandler!:  SwipeHandler;
  private selectionRect!: Phaser.GameObjects.Rectangle;

  // Effects
  private effectManager!: EffectManager;
  private pendingSpecials: LogicCell[] = [];

  // HUD containers
  private topHUD!:    Phaser.GameObjects.Container;   // Opponent strip
  private bottomHUD!: Phaser.GameObjects.Container;   // Player strip
  private midHUD!:    Phaser.GameObjects.Container;   // Power / Turn (top-right)

  // Cached bar states — only redrawn on dirty
  private bars: Record<'userHp'|'userCharge'|'oppHp'|'oppCharge', BarState> = {} as any;

  // Cached text refs
  private userHpTxt!:   Phaser.GameObjects.Text;
  private userChTxt!:   Phaser.GameObjects.Text;
  private oppHpTxt!:    Phaser.GameObjects.Text;
  private oppChTxt!:    Phaser.GameObjects.Text;
  private powerTxt!:    Phaser.GameObjects.Text;
  private turnTxt!:     Phaser.GameObjects.Text;
  private userGlow!:    Phaser.GameObjects.Graphics;
  private oppGlow!:     Phaser.GameObjects.Graphics;
  private skillButtons: Phaser.GameObjects.Container[] = [];
  private activeSkillBtn!: Phaser.GameObjects.Container;
  private queuedIcons!:    Phaser.GameObjects.Container;
  private oppQueuedIcons!: Phaser.GameObjects.Container;

  // Floating text pool (avoid allocating per-match)
  private textPool: PooledText[] = [];
  private readonly POOL_SIZE = 24;

  // AI
  private opponentAI: OpponentAI | null = null;

  // ── Layout helpers ──────────────────────────────────────────────────────────
  private topHudH   = 0;  // physical pixels — set in onInit
  private botHudH   = 0;
  private gridOffX  = 0;
  private gridOffY  = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  protected onInit() {
    this.isGameOver = false;
    this.skillButtons = [];

    const sf = this.scaleFactor;

    // Top HUD: compact opponent strip
    this.topHudH = Math.floor(150 * sf);
    // Bottom HUD: player strip with skills
    this.botHudH = Math.floor(210 * sf);

    // Cell size: fill available WIDTH, but also constrain by available HEIGHT
    const availW = this.gameWidth  * 0.96;
    const availH = this.gameHeight - this.topHudH - this.botHudH - Math.floor(16 * sf);
    CELL_SIZE = Math.floor(Math.min(availW, availH) / GRID_SIZE);
    CELL_SIZE = Math.max(32, Math.min(CELL_SIZE, 120));   // clamp 32–120
    GRID_PX   = CELL_SIZE * GRID_SIZE;

    this.gridOffX = Math.floor((this.gameWidth - GRID_PX) / 2);
    this.gridOffY = this.topHudH + Math.floor((availH - GRID_PX) / 2) + Math.floor(8 * sf);

    // Load gem colours
    const reg = GemRegistry.getInstance();
    reg.getAllGems().filter(g => g.type === 'normal').forEach(g => {
      if (g.shape && g.color) {
        const st = ShapeType[g.shape as keyof typeof ShapeType];
        if (st) this.colors[st] = parseInt(g.color.replace('0x', ''), 16);
      }
    });
    if (!Object.keys(this.colors).length) {
      Object.assign(this.colors, {
        [ShapeType.TRIANGLE]: 0x3b82f6, [ShapeType.SQUARE]:  0x22c55e,
        [ShapeType.PENTAGON]: 0xec4899, [ShapeType.HEXAGON]: 0xeab308,
        [ShapeType.STAR]:     0xef4444, [ShapeType.NONE]:    0x8b5cf6,
      });
    }
  }

  preload() { this.buildTextures(); }

  create(data: { userCharId?: string; opponentCharId?: string }) {
    this.logic = new GameLogic(GRID_SIZE);
    this.logic.initializeGrid();
    while (!this.logic.hasPossibleMoves()) this.logic.initializeGrid();
    this.effectManager = new EffectManager(this);

    this.buildBackground();
    this.buildGrid();
    this.buildTextPool();

    // Selection indicator
    this.selectionRect = this.add.rectangle(0, 0, CELL_SIZE, CELL_SIZE, 0xffffff, 0)
      .setOrigin(0.5).setStrokeStyle(3, 0x00ffff).setVisible(false).setDepth(10);
    this.tweens.add({ targets: this.selectionRect, alpha: 0.6, scale: 1.08,
                      duration: 380, yoyo: true, repeat: -1 });

    this.swipeHandler = new SwipeHandler(
      this, CELL_SIZE, this.gridOffX, this.gridOffY, GRID_SIZE,
      (s, e) => {
        if (!this.isProcessing && CombatManager.getInstance().currentTurn === 'USER')
          this.swapCells(s.r, s.c, e.r, e.c);
      },
      (r, c) => this.updateSelectionRect(r, c),
      (r, c) => this.updateSelectionRect(r, c),
      () => this.selectionRect.setVisible(false)
    );

    this.game.events.emit('SCENE_READY', 'Game_Scene');

    const reg  = CombatRegistry.getInstance();
    const user = reg.getCharacter(data?.userCharId || 'warrior');
    const opp  = reg.getCharacter(data?.opponentCharId || 'mage');
    if (user && opp) {
      CombatManager.getInstance().init(user, opp);
      this.buildHUD();
      this.listenCombat();
      this.opponentAI = new OpponentAI(
        this.game, this.logic,
        async (r1, c1, r2, c2) => this.swapCells(r1, c1, r2, c2),
        () => this.powerSurge
      );
    }

    this.events.on('shutdown', this.shutdown, this);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Texture Generation (unchanged logic, tidied)
  // ═══════════════════════════════════════════════════════════════════════════

  private buildTextures() {
    const g = this.make.graphics({ x: 0, y: 0 });

    Object.entries(this.colors).forEach(([type, color]) => {
      g.clear();
      const size = CELL_SIZE * 0.70, cx = CELL_SIZE / 2;
      if (type === ShapeType.NONE) {
        g.fillStyle(0x111111, 1);  g.fillCircle(cx, cx, size / 2 + 4);
        g.lineStyle(2, 0x8b5cf6); g.strokeCircle(cx, cx, size / 2 + 4);
        g.fillStyle(0x8b5cf6, 0.5); g.fillCircle(cx, cx, size / 3);
        g.fillStyle(0xffffff, 0.8); g.fillCircle(cx, cx, size / 6);
      } else {
        this.drawGem(g, type as ShapeType, color as number, cx, size);
      }
      g.generateTexture(`shape_${type}`, CELL_SIZE, CELL_SIZE);
    });

    // Placeholder skill icons
    ['slash','fury','fireball','arcane_focus','ice_lance','backstab','poison',
     'smite','shield','ice_lance','arcane_focus'].forEach(n => {
      if (!this.textures.exists(`icon_${n}`)) {
        g.clear(); g.fillStyle(0x4b5563); g.fillRoundedRect(0, 0, 48, 48, 8);
        g.generateTexture(`icon_${n}`, 48, 48);
      }
    });

    this.buildSpecialTextures(g);
    g.destroy();
  }

  private buildSpecialTextures(g: Phaser.GameObjects.Graphics) {
    const C = CELL_SIZE, H = C / 2;

    // Pulsar
    g.clear(); g.fillStyle(0xffffff, 0.9);
    [[0.1,0.5,0.3,0.35,0.3,0.65],[0.9,0.5,0.7,0.35,0.7,0.65],
     [0.5,0.1,0.35,0.3,0.65,0.3],[0.5,0.9,0.35,0.7,0.65,0.7]]
    .forEach(([ax,ay,bx,by,cx,cy]) => {
      g.beginPath(); g.moveTo(C*ax,C*ay); g.lineTo(C*bx,C*by); g.lineTo(C*cx,C*cy);
      g.closePath(); g.fillPath();
    });
    g.lineStyle(2, 0xffffff, 0.7); g.strokeCircle(H, H, C * 0.18);
    g.generateTexture('special_pulsar', C, C);

    // Missile
    g.clear(); g.fillStyle(0xffffff, 0.9);
    g.beginPath(); g.moveTo(H, C*0.15);
    g.lineTo(C*0.65, C*0.4); g.lineTo(C*0.65, C*0.7);
    g.lineTo(C*0.35, C*0.7); g.lineTo(C*0.35, C*0.4);
    g.closePath(); g.fillPath();
    g.fillStyle(0xff3300, 0.9);
    g.beginPath(); g.moveTo(C*0.35,C*0.5); g.lineTo(C*0.15,C*0.75); g.lineTo(C*0.35,C*0.7); g.closePath(); g.fillPath();
    g.beginPath(); g.moveTo(C*0.65,C*0.5); g.lineTo(C*0.85,C*0.75); g.lineTo(C*0.65,C*0.7); g.closePath(); g.fillPath();
    g.fillStyle(0x00ffff, 0.9); g.fillCircle(H, C*0.44, C*0.09);
    g.fillStyle(0xffaa00, 0.9);
    g.beginPath(); g.moveTo(C*0.4,C*0.7); g.lineTo(H,C*0.9); g.lineTo(C*0.6,C*0.7); g.closePath(); g.fillPath();
    g.generateTexture('special_missile', C, C);

    // Bomb
    g.clear();
    g.lineStyle(3, 0x555, 1); g.strokeCircle(H, H, C*0.34);
    g.lineStyle(1, 0xfff, 0.7); g.strokeCircle(H, H, C*0.34);
    g.lineStyle(2, 0xffaa00);
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2;
      g.moveTo(H+Math.cos(a)*C*0.34, H+Math.sin(a)*C*0.34);
      g.lineTo(H+Math.cos(a)*C*0.44, H+Math.sin(a)*C*0.44);
    }
    g.strokePath();
    g.fillStyle(0xff3300); g.fillCircle(C*0.75, C*0.25, C*0.11);
    g.fillStyle(0xffaa00); g.fillCircle(C*0.75, C*0.25, C*0.07);
    g.fillStyle(0xffffff); g.fillCircle(C*0.75, C*0.25, C*0.04);
    g.generateTexture('special_bomb', C, C);

    // Parasite
    g.clear(); g.lineStyle(2, 0xd946ef); g.fillStyle(0x8b5cf6, 0.9);
    this.drawStarPath(g, H, H, 12, C*0.44, C*0.20);
    g.fillPath(); g.strokePath();
    g.fillStyle(0xffffff, 0.8); g.fillCircle(H, H, C*0.10);
    g.generateTexture('special_parasite', C, C);

    // Shared particles
    g.clear(); g.fillStyle(0xffffff); g.fillCircle(4, 4, 4);
    g.generateTexture('particle', 8, 8);
    g.clear(); g.fillStyle(0xffffff, 0.7); g.fillCircle(2, 2, 2);
    g.generateTexture('star_particle', 4, 4);
  }

  private drawGem(g: Phaser.GameObjects.Graphics, t: ShapeType, c: number, cx: number, sz: number) {
    const co = Phaser.Display.Color.ValueToColor(c);
    g.fillStyle(0x000000, 0.35); this.shapePath(g, t, cx, cx+3, sz);   g.fillPath();
    g.fillStyle(co.clone().darken(28).color); this.shapePath(g, t, cx, cx, sz); g.fillPath();
    g.fillStyle(c);              this.shapePath(g, t, cx, cx, sz*0.84); g.fillPath();
    g.fillStyle(co.clone().lighten(28).color); this.shapePath(g, t, cx, cx, sz*0.50); g.fillPath();
    g.fillStyle(0xffffff, 0.45);
    g.beginPath(); g.arc(cx-sz*0.14, cx-sz*0.14, sz*0.14, 0, Math.PI*2); g.fillPath();
  }

  private shapePath(g: Phaser.GameObjects.Graphics, t: ShapeType, x: number, y: number, sz: number) {
    g.beginPath();
    switch (t) {
      case ShapeType.TRIANGLE: g.moveTo(x,y-sz/2); g.lineTo(x-sz/2,y+sz/2); g.lineTo(x+sz/2,y+sz/2); break;
      case ShapeType.SQUARE:   g.moveTo(x-sz/2,y-sz/2); g.lineTo(x+sz/2,y-sz/2); g.lineTo(x+sz/2,y+sz/2); g.lineTo(x-sz/2,y+sz/2); break;
      case ShapeType.PENTAGON: for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2-Math.PI/2;i===0?g.moveTo(x+Math.cos(a)*sz/2,y+Math.sin(a)*sz/2):g.lineTo(x+Math.cos(a)*sz/2,y+Math.sin(a)*sz/2);} break;
      case ShapeType.HEXAGON:  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2-Math.PI/6;i===0?g.moveTo(x+Math.cos(a)*sz/2,y+Math.sin(a)*sz/2):g.lineTo(x+Math.cos(a)*sz/2,y+Math.sin(a)*sz/2);} break;
      case ShapeType.STAR:     for(let i=0;i<10;i++){const r=i%2===0?sz/2:sz/4;const a=(i/10)*Math.PI*2-Math.PI/2;i===0?g.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r):g.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);} break;
      default: g.arc(x, y, sz/2, 0, Math.PI*2);
    }
    g.closePath();
  }

  private drawStarPath(g: Phaser.GameObjects.Graphics, x:number, y:number, pts:number, oR:number, iR:number) {
    const step = Math.PI / pts;
    g.beginPath();
    for (let i = 0; i < 2*pts; i++) {
      const r = i%2===0 ? oR : iR, a = i*step - Math.PI/2;
      i===0 ? g.moveTo(x+Math.cos(a)*r, y+Math.sin(a)*r) : g.lineTo(x+Math.cos(a)*r, y+Math.sin(a)*r);
    }
    g.closePath();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Background & Grid
  // ═══════════════════════════════════════════════════════════════════════════

  private buildBackground() {
    const W = this.gameWidth, H = this.gameHeight;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a2a, 0x1a0a3a, 0x0a1a3a, 0x050515, 1, 1, 1, 1);
    bg.fillRect(0, 0, W, H);

    // Subtle background particles
    this.add.particles(0, 0, 'star_particle', {
      x: { min: 0, max: W }, y: { min: H, max: H + 80 },
      lifespan: 12000, speedY: { min: -8, max: -24 }, speedX: { min: -8, max: 8 },
      scale: { start: 0.4, end: 1.2 }, alpha: { start: 0, end: 0.4 },
      quantity: 1, frequency: 500, blendMode: 'ADD'
    });
  }

  private buildGrid() {
    const ox = this.gridOffX, oy = this.gridOffY;

    // Board background
    const board = this.add.graphics();
    board.lineStyle(4, 0x4a00e0, 0.35);
    board.strokeRoundedRect(ox - 8, oy - 8, GRID_PX + 16, GRID_PX + 16, 14);
    board.fillStyle(0x000000, 0.55);
    board.fillRoundedRect(ox - 6, oy - 6, GRID_PX + 12, GRID_PX + 12, 12);
    board.lineStyle(1, 0xffffff, 0.04);
    for (let i = 1; i < GRID_SIZE; i++) {
      board.moveTo(ox + i*CELL_SIZE, oy); board.lineTo(ox + i*CELL_SIZE, oy + GRID_PX);
      board.moveTo(ox, oy + i*CELL_SIZE); board.lineTo(ox + GRID_PX, oy + i*CELL_SIZE);
    }
    board.strokePath();

    // Spawn visual cells
    this.visualGrid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      this.visualGrid[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        this.spawnCell(r, c, this.logic.grid[r][c]!.shape);
      }
    }
  }

  private buildTextPool() {
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const t = this.add.text(0, 0, '', {
        fontSize: '18px', fontFamily: 'monospace', color: '#ffffff',
        fontStyle: 'bold', stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(20).setVisible(false);
      this.textPool.push({ obj: t, free: true });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HUD — full-width top (opponent) + bottom (player) strips
  // ═══════════════════════════════════════════════════════════════════════════

  private buildHUD() {
    const W = this.gameWidth, sf = this.scaleFactor;
    const cm = CombatManager.getInstance();
    const user = cm.user!, opp = cm.opponent!;

    // ── TOP STRIP (Opponent) ──────────────────────────────────────────────────
    this.topHUD = this.add.container(0, 0);
    const topBg = this.add.graphics();
    topBg.fillStyle(0x000000, 0.70);
    topBg.fillRect(0, 0, W, this.topHudH);
    topBg.lineStyle(1, 0xef4444, 0.25);
    topBg.lineBetween(0, this.topHudH, W, this.topHudH);
    this.topHUD.add(topBg);

    // Opponent glow
    this.oppGlow = this.add.graphics(); this.oppGlow.setAlpha(0);
    this.topHUD.add(this.oppGlow);

    const pad = Math.floor(14 * sf);
    const barW = Math.floor(W * 0.52);
    const barH = Math.floor(14 * sf);
    const barX = Math.floor(W * 0.30);

    // Opponent name
    this.topHUD.add(this.add.text(pad, pad, opp.name.toUpperCase(), {
      fontFamily: 'monospace', fontSize: `${this.fs(22)}px`,
      fontStyle: 'bold', color: '#f87171'
    }));
    // Class
    this.topHUD.add(this.add.text(pad, pad + this.fs(26), opp.classType, {
      fontFamily: 'monospace', fontSize: `${this.fs(14)}px`, color: '#888'
    }));
    // Linked gem icon
    this.topHUD.add(
      this.add.image(Math.floor(W * 0.25), Math.floor(this.topHudH/2), `shape_${opp.linkedGem}`)
        .setScale(1.8 * sf).setOrigin(0.5)
    );

    // HP bar
    const oppHpGfx = this.add.graphics();
    this.topHUD.add(this.add.text(barX, pad, 'HP', { fontFamily:'monospace', fontSize:`${this.fs(12)}px`, color:'#aaa' }));
    this.oppHpTxt = this.add.text(barX + barW, pad, `${opp.currentHp}/${opp.maxHp}`,
      { fontFamily:'monospace', fontSize:`${this.fs(12)}px`, color:'#ccc' }).setOrigin(1, 0);
    this.topHUD.add([oppHpGfx, this.oppHpTxt]);
    this.bars.oppHp = { gfx: oppHpGfx, pct: -1, color: 0xef4444, w: barW, y: pad + this.fs(14) };

    // Charge bar
    const oppChGfx = this.add.graphics();
    const cY = pad + this.fs(14) + barH + Math.floor(6*sf);
    this.topHUD.add(this.add.text(barX, cY - Math.floor(2*sf), 'CHARGE', { fontFamily:'monospace', fontSize:`${this.fs(12)}px`, color:'#aaa' }));
    this.oppChTxt = this.add.text(barX + barW, cY - Math.floor(2*sf), `${opp.currentCharge}/${opp.maxCharge}`,
      { fontFamily:'monospace', fontSize:`${this.fs(12)}px`, color:'#ccc' }).setOrigin(1, 0);
    this.topHUD.add([oppChGfx, this.oppChTxt]);
    this.bars.oppCharge = { gfx: oppChGfx, pct: -1, color: 0xeab308, w: barW, y: cY + Math.floor(14*sf) };

    // Force initial draw
    this.redrawBar('oppHp',     opp.currentHp     / opp.maxHp,     barX, sf);
    this.redrawBar('oppCharge', opp.currentCharge  / opp.maxCharge, barX, sf);

    // Opponent queued skill icons
    this.oppQueuedIcons = this.add.container(W - Math.floor(40*sf), Math.floor(this.topHudH/2));
    this.topHUD.add(this.oppQueuedIcons);

    // ── BOTTOM STRIP (Player) ─────────────────────────────────────────────────
    const botY = this.gameHeight - this.botHudH;
    this.bottomHUD = this.add.container(0, botY);

    const botBg = this.add.graphics();
    botBg.fillStyle(0x000000, 0.75);
    botBg.fillRect(0, 0, W, this.botHudH);
    botBg.lineStyle(1, 0x10b981, 0.25);
    botBg.lineBetween(0, 0, W, 0);
    this.bottomHUD.add(botBg);

    this.userGlow = this.add.graphics(); this.userGlow.setAlpha(0);
    this.bottomHUD.add(this.userGlow);

    const uPad = Math.floor(12 * sf);
    const uBarW = Math.floor(W * 0.52);
    const uBarX = Math.floor(W * 0.30);

    // Player name
    this.bottomHUD.add(this.add.text(uPad, uPad, user.name.toUpperCase(), {
      fontFamily: 'monospace', fontSize: `${this.fs(22)}px`,
      fontStyle: 'bold', color: '#34d399'
    }));
    this.bottomHUD.add(this.add.text(uPad, uPad + this.fs(26), user.classType, {
      fontFamily: 'monospace', fontSize: `${this.fs(14)}px`, color: '#888'
    }));
    this.bottomHUD.add(
      this.add.image(Math.floor(W * 0.25), Math.floor(uPad + this.fs(22)/2), `shape_${user.linkedGem}`)
        .setScale(1.8 * sf).setOrigin(0.5)
    );

    const userHpGfx = this.add.graphics();
    this.bottomHUD.add(this.add.text(uBarX, uPad, 'HP', { fontFamily:'monospace', fontSize:`${this.fs(12)}px`, color:'#aaa' }));
    this.userHpTxt = this.add.text(uBarX + uBarW, uPad, `${user.currentHp}/${user.maxHp}`,
      { fontFamily:'monospace', fontSize:`${this.fs(12)}px`, color:'#ccc' }).setOrigin(1, 0);
    this.bottomHUD.add([userHpGfx, this.userHpTxt]);
    this.bars.userHp = { gfx: userHpGfx, pct: -1, color: 0x10b981, w: uBarW, y: uPad + this.fs(14) };

    const userChGfx = this.add.graphics();
    const ucY = uPad + this.fs(14) + Math.floor(16*sf) + Math.floor(6*sf);
    this.bottomHUD.add(this.add.text(uBarX, ucY - Math.floor(2*sf), 'CHARGE', { fontFamily:'monospace', fontSize:`${this.fs(12)}px`, color:'#aaa' }));
    this.userChTxt = this.add.text(uBarX + uBarW, ucY - Math.floor(2*sf), `${user.currentCharge}/${user.maxCharge}`,
      { fontFamily:'monospace', fontSize:`${this.fs(12)}px`, color:'#ccc' }).setOrigin(1, 0);
    this.bottomHUD.add([userChGfx, this.userChTxt]);
    this.bars.userCharge = { gfx: userChGfx, pct: -1, color: 0x3b82f6, w: uBarW, y: ucY + Math.floor(14*sf) };

    this.redrawBar('userHp',     user.currentHp    / user.maxHp,    uBarX, sf);
    this.redrawBar('userCharge', user.currentCharge / user.maxCharge, uBarX, sf);

    // Stack skill buttons (bottom strip, right side)
    this.buildSkillButtons(user, sf);

    // Player queued icons
    this.queuedIcons = this.add.container(Math.floor(W/2), Math.floor(this.botHudH - 16*sf));
    this.bottomHUD.add(this.queuedIcons);

    // ── MID overlay: Power + Turn (top-right corner) ──────────────────────────
    this.midHUD = this.add.container(0, 0);
    const mPad = Math.floor(10 * sf);
    const mW   = Math.floor(160 * sf), mH = Math.floor(56 * sf);
    const mX   = W - mW - mPad, mY = this.topHudH + mPad;

    const midBg = this.add.graphics();
    midBg.fillStyle(0x000000, 0.55); midBg.fillRoundedRect(mX, mY, mW, mH, 10*sf);
    midBg.lineStyle(1, 0xffffff, 0.08); midBg.strokeRoundedRect(mX, mY, mW, mH, 10*sf);
    this.midHUD.add(midBg);

    this.midHUD.add(this.add.text(mX + 10*sf, mY + 8*sf, 'POWER', {
      fontFamily:'monospace', fontSize:`${this.fs(11)}px`, color:'#888'
    }));
    this.powerTxt = this.add.text(mX + 10*sf, mY + 22*sf, '0', {
      fontFamily:'monospace', fontSize:`${this.fs(20)}px`, fontStyle:'bold', color:'#fbbf24'
    });
    this.midHUD.add(this.powerTxt);

    this.midHUD.add(this.add.text(mX + mW*0.6, mY + 8*sf, 'TURN', {
      fontFamily:'monospace', fontSize:`${this.fs(11)}px`, color:'#888'
    }));
    this.turnTxt = this.add.text(mX + mW*0.6, mY + 22*sf, '1', {
      fontFamily:'monospace', fontSize:`${this.fs(20)}px`, fontStyle:'bold', color:'#3b82f6'
    });
    this.midHUD.add(this.turnTxt);

    // Active skill button (bottom-right, floating on grid edge)
    this.buildActiveSkillBtn(user, sf);

    // Skill queue listeners
    this.registerQueueListeners(sf);

    // Apply initial turn glow
    this.onTurnSwitched(cm.currentTurn);
  }

  private buildSkillButtons(user: any, sf: number) {
    const stacks = user.loadout.stacks as string[];
    if (!stacks.length) return;

    const W      = this.gameWidth;
    const pad    = Math.floor(8 * sf);
    const btnH   = Math.floor(32 * sf);
    const total  = stacks.length;
    const btnW   = Math.min(Math.floor((W * 0.60 - (total-1)*pad) / total), Math.floor(130*sf));
    const startX = W - Math.floor(8*sf) - total * btnW - (total-1)*pad;
    const btnY   = Math.floor(this.botHudH - btnH - Math.floor(10*sf));

    stacks.forEach((skillId, i) => {
      const x = startX + i * (btnW + pad);
      const btn = this.add.container(x, btnY);
      btn.setData('skillId', skillId);

      const bg = this.add.graphics();
      bg.fillStyle(0xffffff, 0.08); bg.fillRoundedRect(0, 0, btnW, btnH, 6*sf);
      btn.add(bg);

      const skill = CombatRegistry.getInstance().getSkill(skillId);
      if (skill) {
        const ico = this.add.image(Math.floor(10*sf), Math.floor(btnH/2), skill.icon)
          .setDisplaySize(20*sf, 20*sf).setOrigin(0, 0.5);
        const nm  = this.add.text(Math.floor(34*sf), Math.floor(btnH/2),
          skill.name.length > 10 ? skill.name.substring(0,9)+'…' : skill.name,
          { fontFamily:'monospace', fontSize:`${this.fs(9)}px`, color:'#ddd' }).setOrigin(0, 0.5);
        const cost = this.add.text(btnW - Math.floor(6*sf), Math.floor(btnH/2),
          `${skill.chargeCost}`,
          { fontFamily:'monospace', fontSize:`${this.fs(9)}px`, color:'#fbbf24', fontStyle:'bold' })
          .setOrigin(1, 0.5);
        btn.add([ico, nm, cost]);
      }

      btn.setInteractive(new Phaser.Geom.Rectangle(0, 0, btnW, btnH), Phaser.Geom.Rectangle.Contains);
      btn.on('pointerup', (ptr: Phaser.Input.Pointer) => {
        if (Phaser.Math.Distance.Between(ptr.downX, ptr.downY, ptr.upX, ptr.upY) > 10) return;
        const cm = CombatManager.getInstance(), u = cm.user;
        const sk = CombatRegistry.getInstance().getSkill(skillId);
        if (u && sk && u.currentCharge >= sk.chargeCost && cm.currentTurn === 'USER')
          this.game.events.emit('SKILL_ACTIVATED', { character:'USER', skillId, moveScore:0, comboNumber:1, powerSurge:this.powerSurge });
        else {
          this.tweens.add({ targets: btn, x: x + 4*sf, duration: 40, yoyo: true, repeat: 2 });
        }
      });

      this.bottomHUD.add(btn);
      this.skillButtons.push(btn);
    });
  }

  private buildActiveSkillBtn(user: any, sf: number) {
    if (!user.loadout.active) return;
    const skillId = user.loadout.active;
    const skill   = CombatRegistry.getInstance().getSkill(skillId);
    const r       = Math.floor(44 * sf);
    const x       = this.gameWidth - r - Math.floor(12*sf);
    const y       = this.gridOffY + GRID_PX - r - Math.floor(8*sf);

    this.activeSkillBtn = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.85); bg.fillCircle(0, 0, r);
    bg.lineStyle(2, 0x10b981, 1); bg.strokeCircle(0, 0, r);
    this.activeSkillBtn.add(bg);

    this.activeSkillBtn.add(this.add.text(0, -Math.floor(12*sf), '⚡',
      { fontSize: `${this.fs(24)}px` }).setOrigin(0.5));
    this.activeSkillBtn.add(this.add.text(0, Math.floor(12*sf),
      skill ? `${skill.chargeCost}EP` : '',
      { fontFamily:'monospace', fontSize:`${this.fs(11)}px`, color:'#3b82f6' }).setOrigin(0.5));

    this.activeSkillBtn.setInteractive(new Phaser.Geom.Circle(0, 0, r), Phaser.Geom.Circle.Contains);
    this.activeSkillBtn.on('pointerdown', () => {
      SoundManager.getInstance().play(SoundType.CLICK);
      const cm = CombatManager.getInstance(), u = cm.user;
      if (u && skill && u.currentCharge >= skill.chargeCost && cm.currentTurn === 'USER')
        this.game.events.emit('SKILL_ACTIVATED', { character:'USER', skillId, powerSurge: this.powerSurge });
    });
  }

  private registerQueueListeners(sf: number) {
    this.game.events.on('SKILL_QUEUED', (data: any) => {
      const ct = data.character === 'USER' ? this.queuedIcons : this.oppQueuedIcons;
      const sz = data.character === 'USER' ? Math.floor(32*sf) : Math.floor(22*sf);
      const ico = this.add.image(0, 0, data.icon).setDisplaySize(sz, sz).setData('skillId', data.skillId);
      if (data.character === 'USER') {
        ico.setInteractive({ useHandCursor: true });
        ico.on('pointerdown', () => CombatManager.getInstance().removeQueuedSkill(data.skillId, 'USER'));
      }
      ct.add(ico);
      const sp = sz + Math.floor(4*sf);
      ct.getAll().forEach((c, i) => {
        (c as Phaser.GameObjects.Image).x = (i - (ct.length-1)/2) * sp;
      });
      if (data.character === 'USER') {
        const btn = this.skillButtons.find(b => b.getData('skillId') === data.skillId);
        if (btn) btn.setVisible(false);
      }
    });

    this.game.events.on('SKILL_DEACTIVATED', (data: any) => {
      const ct = data.character === 'USER' ? this.queuedIcons : this.oppQueuedIcons;
      const sp = data.character === 'USER' ? Math.floor(36*sf) : Math.floor(26*sf);
      const ico = ct.getAll().find((c: any) =>
        (data.skillId && c.getData('skillId') === data.skillId) || c.texture?.key === data.icon
      );
      if (ico) {
        const sid = (ico as any).getData?.('skillId');
        ct.remove(ico as any, true);
        ct.getAll().forEach((c, i) => { (c as Phaser.GameObjects.Image).x = (i - (ct.length-1)/2) * sp; });
        if (data.character === 'USER' && sid) {
          const btn = this.skillButtons.find(b => b.getData('skillId') === sid);
          if (btn) btn.setVisible(true);
        }
      }
    });
  }

  // ── Bar drawing (dirty-flag: only redraw when pct actually changes) ─────────
  private redrawBar(key: keyof typeof this.bars, pct: number, barX: number, sf: number) {
    const b = this.bars[key];
    const p = Math.max(0, Math.min(1, pct));
    if (Math.abs(p - b.pct) < 0.002) return;   // no visible change
    b.pct = p;
    const bH = Math.floor(13 * sf);
    const r  = Math.floor(5 * sf);
    b.gfx.clear();
    b.gfx.fillStyle(0x000000, 0.45);
    b.gfx.fillRoundedRect(barX, b.y, b.w, bH, r);
    if (p > 0) {
      b.gfx.fillStyle(b.color, 1);
      b.gfx.fillRoundedRect(barX, b.y, Math.max(r*2, b.w * p), bH, r);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Combat listeners
  // ═══════════════════════════════════════════════════════════════════════════

  private listenCombat() {
    const ev = this.game.events;
    ev.on('HP_UPDATED',     this.onHpUpdated,     this);
    ev.on('CHARGE_UPDATED', this.onChargeUpdated, this);
    ev.on('POWER_UPDATE',   this.onPowerUpdate,   this);
    ev.on('TURN_SWITCHED',  this.onTurnSwitched,  this);
    ev.on('SKILL_EXECUTED', this.onSkillExecuted, this);
    ev.on('SKILL_MISSED',   this.onSkillMissed,   this);
    ev.on('GAME_OVER',      this.onGameOver,      this);
  }

  private readonly SF = () => this.scaleFactor;

  private onHpUpdated = (d: any) => {
    const isUser = d.character === 'USER';
    const barKey = isUser ? 'userHp' : 'oppHp';
    const sf = this.SF(), barX = Math.floor(this.gameWidth * 0.30);
    this.redrawBar(barKey, d.hp / d.maxHp, barX, sf);
    const txt = isUser ? this.userHpTxt : this.oppHpTxt;
    if (txt) txt.setText(`${Math.floor(d.hp)}/${d.maxHp}`);
  };

  private onChargeUpdated = (d: any) => {
    const isUser = d.character === 'USER';
    const key = isUser ? 'userCharge' : 'oppCharge';
    const sf = this.SF(), barX = Math.floor(this.gameWidth * 0.30);
    this.redrawBar(key, d.charge / d.maxCharge, barX, sf);
    const txt = isUser ? this.userChTxt : this.oppChTxt;
    if (txt) txt.setText(`${Math.floor(d.charge)}/${d.maxCharge}`);
  };

  private onPowerUpdate = (p: number) => { if (this.powerTxt) this.powerTxt.setText(String(p)); };

  private onTurnSwitched = (turn: string) => {
    const cm = CombatManager.getInstance();
    if (this.turnTxt) this.turnTxt.setText(String(cm.turnCount));
    const uA = turn === 'USER'     ? 1 : 0;
    const oA = turn === 'OPPONENT' ? 1 : 0;
    if (this.userGlow) this.tweens.add({ targets: this.userGlow, alpha: uA, duration: 280 });
    if (this.oppGlow)  this.tweens.add({ targets: this.oppGlow,  alpha: oA, duration: 280 });

    // Draw glow outlines
    const drawGlow = (gfx: Phaser.GameObjects.Graphics, W: number, H: number, color: number) => {
      gfx.clear();
      for (let i = 1; i <= 6; i++) {
        gfx.lineStyle(i * 2 * this.scaleFactor, color, 0.12 / i);
        gfx.strokeRect(-i*this.scaleFactor, -i*this.scaleFactor, W + i*2*this.scaleFactor, H + i*2*this.scaleFactor);
      }
    };
    if (this.userGlow) drawGlow(this.userGlow, this.gameWidth, this.botHudH, 0x10b981);
    if (this.oppGlow)  drawGlow(this.oppGlow,  this.gameWidth, this.topHudH, 0xef4444);
  };

  private onSkillExecuted = (d: any) => {
    const isUser = d.character === 'USER';
    const x = this.gameWidth / 2;
    const y = isUser ? this.gameHeight - this.botHudH - Math.floor(80 * this.scaleFactor)
                     : this.topHudH + Math.floor(80 * this.scaleFactor);
    const t = this.add.text(x, y, d.skill.name.toUpperCase(), {
      fontFamily: 'monospace', fontSize: `${this.fs(36)}px`, fontStyle: 'bold',
      color: isUser ? '#10b981' : '#ef4444', stroke: '#000', strokeThickness: 5
    }).setOrigin(0.5).setAlpha(0).setScale(0.6).setDepth(30);
    this.tweens.chain({ targets: t, tweens: [
      { alpha: 1, scale: 1.1, duration: 240, ease: 'Back.easeOut' },
      { alpha: 0, y: y - 50*this.scaleFactor, duration: 420, delay: 400, ease: 'Power2', onComplete: () => t.destroy() }
    ]});
  };

  private onSkillMissed = (d: any) => {
    const isUser = d.character === 'USER';
    const x = this.gameWidth / 2;
    const y = isUser ? this.gameHeight - this.botHudH - Math.floor(60*this.scaleFactor)
                     : this.topHudH + Math.floor(60*this.scaleFactor);
    const t = this.add.text(x, y, 'MISSED!', {
      fontFamily: 'monospace', fontSize: `${this.fs(32)}px`, fontStyle: 'bold',
      color: '#ef4444', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: t, y: y - 80*this.scaleFactor, alpha: 0, duration: 900,
                      ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  };

  private onGameOver = (d: { winner: string }) => {
    if (this.isGameOver) return;
    this.isGameOver = true; this.isProcessing = true;
    const win = d.winner === 'USER';
    const W = this.gameWidth, H = this.gameHeight, sf = this.scaleFactor;

    const ov = this.add.rectangle(0, 0, W, H, 0x000000, 0.72).setOrigin(0).setDepth(100).setInteractive();
    const title = this.add.text(W/2, H/2 - 60*sf, win ? 'VICTORY!' : 'DEFEAT...',{
      fontFamily:'monospace', fontSize:`${this.fs(72)}px`, fontStyle:'bold',
      color: win ? '#10b981' : '#ef4444', stroke:'#fff', strokeThickness: 7*sf
    }).setOrigin(0.5).setScale(0).setDepth(101);

    const power = this.add.text(W/2, H/2 + 40*sf, `Final Power: ${this.powerSurge}`,{
      fontFamily:'monospace', fontSize:`${this.fs(26)}px`, color:'#fff'
    }).setOrigin(0.5).setAlpha(0).setDepth(101);

    const restartCt = this.add.container(W/2, H/2 + 130*sf).setDepth(101).setAlpha(0);
    const rb = this.add.rectangle(0,0,200*sf,56*sf,0xffffff,0.18).setStrokeStyle(2*sf,0xffffff);
    const rt = this.add.text(0,0,'RESTART',{fontFamily:'monospace',fontSize:`${this.fs(22)}px`,fontStyle:'bold',color:'#fff'}).setOrigin(0.5);
    restartCt.add([rb, rt]);
    restartCt.setSize(200*sf, 56*sf); restartCt.setInteractive({useHandCursor:true});
    restartCt.on('pointerover', () => rb.setFillStyle(0xffffff,0.38));
    restartCt.on('pointerout',  () => rb.setFillStyle(0xffffff,0.18));
    restartCt.on('pointerdown', () => this.scene.restart());

    this.tweens.add({ targets: title, scale: 1, duration: 750, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [power, restartCt], alpha: 1, duration: 420, delay: 700 });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Grid helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private spawnCell(r: number, c: number, shape: ShapeType): VisualCell {
    const x = this.gridOffX + c * CELL_SIZE + CELL_SIZE / 2;
    const y = this.gridOffY + r * CELL_SIZE + CELL_SIZE / 2;
    const ct = this.add.container(x, y);
    ct.add(this.add.sprite(0, 0, `shape_${shape}`));
    ct.setSize(CELL_SIZE, CELL_SIZE);
    this.visualGrid[r][c] = { sprite: ct };
    return this.visualGrid[r][c]!;
  }

  private cellWorldPos(r: number, c: number) {
    return {
      x: this.gridOffX + c * CELL_SIZE + CELL_SIZE / 2,
      y: this.gridOffY + r * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  public updateSelectionRect(r: number, c: number) {
    if (this.isProcessing || CombatManager.getInstance().currentTurn !== 'USER') return;
    const vc = this.visualGrid[r][c];
    if (vc) { this.selectionRect.setPosition(vc.sprite.x, vc.sprite.y).setVisible(true); }
  }

  private setSpecialOverlay(r: number, c: number, type: SpecialType) {
    const lc = this.logic.grid[r][c], vc = this.visualGrid[r][c];
    if (!lc || !vc) return;
    lc.special = type;
    const ov = this.add.sprite(0, 0, `special_${type}`);
    if (type !== SpecialType.PARASITE) ov.setBlendMode(Phaser.BlendModes.ADD);
    ov.setAlpha(0.9);
    vc.sprite.add(ov);
    this.tweens.add({ targets: ov, scale: 1.12, alpha: 1, duration: 550, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ─── Floating score text (pooled) ──────────────────────────────────────────
  private spawnFloatText(x: number, y: number, msg: string) {
    const slot = this.textPool.find(p => p.free);
    if (!slot) return;
    slot.free = false;
    slot.obj.setText(msg).setPosition(x, y).setAlpha(1).setVisible(true);
    this.tweens.add({
      targets: slot.obj, y: y - 38, alpha: 0, duration: 700, ease: 'Power2',
      onComplete: () => { slot.obj.setVisible(false); slot.free = true; }
    });
  }

  private spawnParticles(x: number, y: number, color: number) {
    const em = this.add.particles(x, y, 'particle', {
      speed: { min: 40, max: 120 }, angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 },
      tint: color, lifespan: 420, quantity: 7, emitting: false
    });
    em.explode();
    this.time.delayedCall(500, () => em.destroy());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Swap & Board Processing
  // ═══════════════════════════════════════════════════════════════════════════

  public async swapCells(r1: number, c1: number, r2: number, c2: number) {
    this.isProcessing = true;
    const v1 = this.visualGrid[r1][c1], v2 = this.visualGrid[r2][c2];
    const l1 = this.logic.grid[r1][c1], l2 = this.logic.grid[r2][c2];
    if (!v1 || !v2 || !l1 || !l2) { this.isProcessing = false; return; }

    await Promise.all([
      this.animateMove(v1.sprite, v2.sprite.x, v2.sprite.y),
      this.animateMove(v2.sprite, v1.sprite.x, v1.sprite.y),
    ]);

    this.logic.swap(r1, c1, r2, c2);
    this.visualGrid[r1][c1] = v2;
    this.visualGrid[r2][c2] = v1;

    const n1 = this.logic.grid[r1][c1]!, n2 = this.logic.grid[r2][c2]!;

    if (n1.special === SpecialType.PARASITE || n2.special === SpecialType.PARASITE) {
      const par = n1.special === SpecialType.PARASITE ? n1 : n2;
      const oth = n1.special === SpecialType.PARASITE ? n2 : n1;
      await this.effectManager.handleParasiteCombination(par, oth, r2, c2);
      await this.processBoard();
      CombatManager.getInstance().switchTurn();
      this.isProcessing = false;
      return;
    }

    if (n1.special !== SpecialType.NONE && n2.special !== SpecialType.NONE) {
      await this.effectManager.handleSpecialCombination(n1, n2, r2, c2);
      await this.processBoard();
      CombatManager.getInstance().switchTurn();
      this.isProcessing = false;
      return;
    }

    const matches = this.logic.findMatches();
    if (!matches.length) {
      // Revert
      await Promise.all([
        this.animateMove(v1.sprite, v2.sprite.x, v2.sprite.y),
        this.animateMove(v2.sprite, v1.sprite.x, v1.sprite.y),
      ]);
      this.logic.swap(r1, c1, r2, c2);
      this.visualGrid[r1][c1] = v1;
      this.visualGrid[r2][c2] = v2;
    } else {
      // Pin special-creation target to the swapped-to cell
      matches.forEach(m => {
        if (!m.specialCreation) return;
        if (m.cells.some(p => p.r === r2 && p.c === c2))      { m.specialCreation.r = r2; m.specialCreation.c = c2; }
        else if (m.cells.some(p => p.r === r1 && p.c === c1)) { m.specialCreation.r = r1; m.specialCreation.c = c1; }
      });
      await this.processBoard(true, matches);
      CombatManager.getInstance().switchTurn();
    }
    this.isProcessing = false;
  }

  // ─── Smooth move (no particle trail — saves GPU bandwidth) ─────────────────
  private animateMove(obj: Phaser.GameObjects.Container, x: number, y: number): Promise<void> {
    return new Promise(res => this.tweens.add({
      targets: obj, x, y, duration: 200, ease: 'Quad.easeOut', onComplete: () => res()
    }));
  }

  // ─── Board processing ───────────────────────────────────────────────────────
  private async processBoard(giveScore = true, initialMatches?: MatchResult[]) {
    let matches = initialMatches ?? this.logic.findMatches();
    const hasEmpty = () => this.logic.grid.some(row => row.some(c => c === null));
    let combo = 1;

    while (matches.length || this.pendingSpecials.length || hasEmpty()) {
      if (matches.length) {
        SoundManager.getInstance().play(SoundType.MATCH);

        const toDestroy = new Map<string, number>();   // "r,c" → score
        const specials: { r:number; c:number; type:SpecialType; shape:ShapeType }[] = [];

        for (const m of matches) {
          if (m.specialCreation) specials.push(m.specialCreation);
          for (const cell of m.cells) {
            const k = `${cell.r},${cell.c}`;
            toDestroy.set(k, Math.max(toDestroy.get(k) ?? 0, m.score));
          }
        }

        const destroyPromises: Promise<void>[] = [];
        const comboMult = Math.pow(1.1, combo - 1);

        for (const [pos, baseScore] of toDestroy) {
          const [r, c] = pos.split(',').map(Number);
          const isSpecTarget = specials.some(s => s.r === r && s.c === c);
          const ms = Math.round(baseScore * comboMult);

          if (giveScore) {
            this.powerSurge += ms;
            const wp = this.cellWorldPos(r, c);
            this.spawnFloatText(wp.x, wp.y, `+${ms}`);
          }

          const lc = this.logic.grid[r][c];
          if (lc && lc.shape !== ShapeType.NONE) {
            if (isSpecTarget) {
              this.game.events.emit('GEMS_DESTROYED', { shape: lc.shape, count: 1, moveScore: ms, comboNumber: combo, powerSurge: this.powerSurge });
              if (lc.special !== SpecialType.NONE) this.pendingSpecials.push({ ...lc });
            } else {
              destroyPromises.push(this.destroyCell(r, c, true, true, ms, combo));
            }
          }
        }

        await Promise.all(destroyPromises);

        // Materialise special gems
        for (const sc of specials) {
          const lc = this.logic.grid[sc.r][sc.c], vc = this.visualGrid[sc.r][sc.c];
          if (!vc || !lc) {
            this.logic.grid[sc.r][sc.c] = { r: sc.r, c: sc.c, shape: sc.shape, special: SpecialType.NONE };
            this.spawnCell(sc.r, sc.c, sc.shape);
          } else if (lc.shape !== sc.shape) {
            lc.shape = sc.shape;
            vc.sprite.destroy();
            this.visualGrid[sc.r][sc.c] = null;
            this.spawnCell(sc.r, sc.c, sc.shape);
          }
          this.setSpecialOverlay(sc.r, sc.c, sc.type);
        }
      }

      // Drain special queue
      while (this.pendingSpecials.length) {
        await this.activateSpecialCell(this.pendingSpecials.shift()!);
      }

      await this.fillGrid();
      matches = this.logic.findMatches();
      if (matches.length) combo++;
    }

    this.game.events.emit('POWER_UPDATE', this.powerSurge);
    if (!this.logic.hasPossibleMoves()) await this.shuffleBoard();
  }

  // ─── Cell destruction ───────────────────────────────────────────────────────
  public destroyCell(r: number, c: number, isSpecial: boolean,
                     spawnFx = true, moveScore = 10, combo = 1): Promise<void> {
    return new Promise(res => {
      const vc = this.visualGrid[r][c], lc = this.logic.grid[r][c];
      if (!vc || !lc) { res(); return; }

      if (isSpecial && lc.special !== SpecialType.NONE) {
        this.pendingSpecials.push({ ...lc });
        SoundManager.getInstance().play(SoundType.SPECIAL);
      }

      this.logic.grid[r][c]   = null;
      this.visualGrid[r][c]   = null;

      if (lc.shape !== ShapeType.NONE)
        this.game.events.emit('GEMS_DESTROYED', { shape: lc.shape, count: 1, moveScore, comboNumber: combo, powerSurge: this.powerSurge });

      if (spawnFx) {
        const { x, y } = this.cellWorldPos(r, c);
        this.spawnParticles(x, y, this.colors[lc.shape] ?? 0xffffff);
      }

      this.tweens.add({
        targets: vc.sprite, scale: 1.15, duration: 40, yoyo: true,
        onComplete: () => this.tweens.add({
          targets: vc.sprite, scale: 0, alpha: 0, duration: 120,
          onComplete: () => { vc.sprite.destroy(); res(); }
        })
      });
    });
  }

  // ─── Fill (gravity) ─────────────────────────────────────────────────────────
  private async fillGrid() {
    const anim: Promise<void>[] = [];
    const { drops, newCells } = this.logic.applyGravity();

    drops.forEach(d => {
      const vc = this.visualGrid[d.r][d.c]!;
      this.visualGrid[d.newR][d.c] = vc;
      this.visualGrid[d.r][d.c]   = null;
      const { x, y } = this.cellWorldPos(d.newR, d.c);
      anim.push(new Promise(res => this.tweens.add({
        targets: vc.sprite, x, y, duration: 220, ease: 'Bounce.easeOut', onComplete: () => res()
      })));
    });

    newCells.forEach(nc => {
      const vc = this.spawnCell(nc.r, nc.c, nc.shape);
      const { x, y } = this.cellWorldPos(nc.r, nc.c);
      vc.sprite.y -= GRID_SIZE * CELL_SIZE;
      anim.push(new Promise(res => this.tweens.add({
        targets: vc.sprite, x, y, duration: 220, ease: 'Bounce.easeOut', onComplete: () => res()
      })));
    });

    await Promise.all(anim);
  }

  // ─── Shuffle ────────────────────────────────────────────────────────────────
  public async shuffleBoard() {
    this.isProcessing = true;
    const dp: Promise<void>[] = [];
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (this.visualGrid[r][c]) {
          const vc = this.visualGrid[r][c]!;
          dp.push(new Promise(res => this.tweens.add({ targets: vc.sprite, scale: 0, alpha: 0, duration: 180, onComplete: () => { vc.sprite.destroy(); res(); } })));
          this.visualGrid[r][c] = null;
        }
    await Promise.all(dp);

    const updates = this.logic.shuffleBoard();
    const sp: Promise<void>[] = [];
    updates.forEach(u => {
      const vc = this.spawnCell(u.r, u.c, u.shape);
      if (u.special !== SpecialType.NONE) this.setSpecialOverlay(u.r, u.c, u.special);
      vc.sprite.scale = 0; vc.sprite.alpha = 0;
      sp.push(new Promise(res => this.tweens.add({ targets: vc.sprite, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut', onComplete: () => res() })));
    });
    await Promise.all(sp);
    this.isProcessing = false;
  }

  private async activateSpecialCell(cell: LogicCell) {
    await this.effectManager.activateSpecial(cell);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IEffectDelegate
  // ═══════════════════════════════════════════════════════════════════════════

  public playPulsarVisual(r: number, c: number, isH: boolean, isV: boolean, w: number) {
    const { x: cx, y: cy } = this.cellWorldPos(r, c);
    const bcx = this.gridOffX + GRID_PX / 2, bcy = this.gridOffY + GRID_PX / 2;
    if (isH) {
      const b = this.add.rectangle(bcx, cy, GRID_PX, CELL_SIZE*w, 0x00ffff, 0.45).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: b, scaleY: 0, alpha: 0, duration: 360, onComplete: () => b.destroy() });
    }
    if (isV) {
      const b = this.add.rectangle(cx, bcy, CELL_SIZE*w, GRID_PX, 0xff00ff, 0.45).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: b, scaleX: 0, alpha: 0, duration: 360, onComplete: () => b.destroy() });
    }
  }

  public async playMissileVisual(r: number, c: number, tr: number, tc: number): Promise<void> {
    const { x: sx, y: sy } = this.cellWorldPos(r, c);
    const { x: tx, y: ty } = this.cellWorldPos(tr, tc);
    const m = this.add.sprite(sx, sy, 'special_missile').setScale(0.45);
    m.setRotation(Phaser.Math.Angle.Between(sx, sy, tx, ty) + Math.PI/2);
    return new Promise(res => this.tweens.add({
      targets: m, x: tx, y: ty, duration: 360, ease: 'Cubic.easeIn',
      onComplete: () => { m.destroy(); res(); }
    }));
  }

  public playBombVisual(r: number, c: number, radius: number) {
    const { x, y } = this.cellWorldPos(r, c);
    const e = this.add.circle(x, y, CELL_SIZE*0.5, 0xffaa00, 0.8).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: e, scale: radius*2.4, alpha: 0, duration: 460, ease: 'Cubic.easeOut', onComplete: () => e.destroy() });
  }

  public async playParasiteVortex(r: number, c: number, scale: number, duration: number): Promise<void> {
    const { x, y } = this.cellWorldPos(r, c);
    const v = this.add.sprite(x, y, 'special_parasite').setScale(0);
    return new Promise(res => this.tweens.add({
      targets: v, scale, angle: duration > 800 ? 1080 : 720, alpha: 0, duration,
      ease: duration > 800 ? 'Cubic.easeIn' : 'Cubic.easeOut',
      onComplete: () => { v.destroy(); res(); }
    }));
  }

  public async playParasiteVisual(r: number, c: number, _shape: ShapeType, targets: { r:number; c:number }[]): Promise<void> {
    if (!targets.length) { await new Promise(res => this.time.delayedCall(360, res)); return; }
    const { x: cx, y: cy } = this.cellWorldPos(r, c);
    await Promise.all(targets.map(t => {
      const { x: tx, y: ty } = this.cellWorldPos(t.r, t.c);
      const beam = this.add.line(0, 0, cx, cy, tx, ty, 0xd946ef, 0.7).setOrigin(0).setLineWidth(3);
      const pt   = this.add.sprite(cx, cy, 'particle').setTint(0xd946ef).setScale(2);
      return new Promise<void>(res => this.tweens.add({
        targets: pt, x: tx, y: ty, duration: 360, ease: 'Power2',
        onComplete: () => { pt.destroy(); beam.destroy(); res(); }
      }));
    }));
  }

  public shakeCamera(d: number, i: number) { this.cameras.main.shake(d, i); }
  public getGridSize() { return this.logic.gridSize; }
  public getGrid()     { return this.logic.grid; }

  // ═══════════════════════════════════════════════════════════════════════════
  // Shutdown
  // ═══════════════════════════════════════════════════════════════════════════

  shutdown() {
    this.opponentAI?.destroy(); this.opponentAI = null;
    const ev = this.game.events;
    ['HP_UPDATED','CHARGE_UPDATED','POWER_UPDATE','TURN_SWITCHED',
     'SKILL_EXECUTED','SKILL_MISSED','GAME_OVER','SKILL_QUEUED','SKILL_DEACTIVATED']
    .forEach(e => ev.off(e, undefined, this));
  }
}
