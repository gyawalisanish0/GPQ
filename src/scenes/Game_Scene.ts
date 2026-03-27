import Phaser from 'phaser';
import { SwipeHandler } from '../engine/SwipeHandler';
import { GameLogic, ShapeType, SpecialType, LogicCell, MatchResult } from '../engine/GameLogic';
import { EffectManager, IEffectDelegate } from '../engine/EffectManager';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CombatManager } from '../engine/CombatManager';
import { Character } from '../entities/Character';
import { OpponentAI } from '../engine/OpponentAI';
import { GemRegistry } from '../engine/GemRegistry';
import { SoundManager, SoundType } from '../engine/SoundManager';
import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';

/* ── Grid Constants ────────────────────────────────────────── */
let GRID_SIZE      = 10;
let CELL_SIZE      = 88;
let BASE_GRID_WIDTH = 880;

/* ── HUD Layout Config ─────────────────────────────────────── */
interface HudLayout {
  userWidth:      number;
  opponentWidth:  number;
  userHeight:     number;
  opponentHeight: number;
  userBarWidth:   number;
  opponentBarWidth: number;
  padding:        number;
  barHeight:      number;
  skillSize:      number;
  marginX:        number;
  marginY:        number;
}

const BASE_HUD: HudLayout = {
  userWidth:       720,
  opponentWidth:   480,
  userHeight:      270,
  opponentHeight:  180,
  userBarWidth:    608,
  opponentBarWidth: 372,
  padding:         20,
  barHeight:       21,
  skillSize:       128,
  marginX:         24,
  marginY:         96,
};

interface VisualCell {
  sprite: Phaser.GameObjects.Container;
}

/**
 * Game_Scene — Main puzzle-combat gameplay.
 *
 * Layout zones:
 *   ┌─────────────────────────────────┐
 *   │  [Opponent HUD]                 │  ← top-left
 *   │                                 │
 *   │        ┌─────────────┐          │
 *   │        │  Puzzle Grid │          │  ← centered
 *   │        └─────────────┘          │
 *   │                                 │
 *   │  [User HUD + Skills]           │  ← bottom-left
 *   │  [Turn HUD]     [Power HUD]    │
 *   │  [Active Skill]  [Queued]      │
 *   └─────────────────────────────────┘
 */
export class Game_Scene extends BaseScene implements IEffectDelegate {

  constructor() {
    super('Game_Scene');
  }

  // ── Core Systems ────────────────────────────────────────
  private logic!: GameLogic;
  private visualGrid: (VisualCell | null)[][] = [];
  private isProcessing  = false;
  private isGameOver    = false;
  private powerSurge    = 0;
  private selectionRect!: Phaser.GameObjects.Rectangle;
  private swipeHandler!:  SwipeHandler;
  private effectManager!: EffectManager;
  private colors: Record<ShapeType, number> = {} as any;
  private opponentAI: OpponentAI | null = null;

  // ── HUD Elements ────────────────────────────────────────
  private hud!: HudLayout;
  private userHUD!:         Phaser.GameObjects.Container;
  private opponentHUD!:     Phaser.GameObjects.Container;
  private powerText!:       Phaser.GameObjects.Text;
  private userHpBar!:       Phaser.GameObjects.Graphics;
  private userChargeBar!:   Phaser.GameObjects.Graphics;
  private opponentHpBar!:   Phaser.GameObjects.Graphics;
  private opponentChargeBar!: Phaser.GameObjects.Graphics;
  private userHpText!:      Phaser.GameObjects.Text;
  private userChargeText!:  Phaser.GameObjects.Text;
  private opponentHpText!:  Phaser.GameObjects.Text;
  private opponentChargeText!: Phaser.GameObjects.Text;
  private skillButtons:     Phaser.GameObjects.Container[] = [];
  private userGlow!:        Phaser.GameObjects.Graphics;
  private opponentGlow!:    Phaser.GameObjects.Graphics;
  private turnHUD!:         Phaser.GameObjects.Container;
  private powerHUD!:        Phaser.GameObjects.Container;
  private turnCountText!:   Phaser.GameObjects.Text;
  private activeSkillBtn!:  Phaser.GameObjects.Container;
  private queuedIconsContainer!:         Phaser.GameObjects.Container;
  private opponentQueuedIconsContainer!: Phaser.GameObjects.Container;

  /* ── Init ───────────────────────────────────────────────── */

  protected onInit() {
    this.isGameOver = false;

    // Scale grid to viewport
    CELL_SIZE       = this.s(88);
    BASE_GRID_WIDTH = CELL_SIZE * GRID_SIZE;

    // Scale HUD to viewport
    this.hud = {
      userWidth:       this.s(BASE_HUD.userWidth),
      opponentWidth:   this.s(BASE_HUD.opponentWidth),
      userHeight:      this.s(BASE_HUD.userHeight),
      opponentHeight:  this.s(BASE_HUD.opponentHeight),
      userBarWidth:    this.s(BASE_HUD.userBarWidth),
      opponentBarWidth: this.s(BASE_HUD.opponentBarWidth),
      padding:         this.s(BASE_HUD.padding),
      barHeight:       this.s(BASE_HUD.barHeight),
      skillSize:       this.s(BASE_HUD.skillSize),
      marginX:         this.s(BASE_HUD.marginX),
      marginY:         this.s(BASE_HUD.marginY),
    };

    // Load gem colors from registry
    const registry   = GemRegistry.getInstance();
    const normalGems = registry.getAllGems().filter(g => g.type === 'normal');
    normalGems.forEach(gem => {
      if (gem.shape && gem.color) {
        const shapeType = ShapeType[gem.shape as keyof typeof ShapeType];
        this.colors[shapeType] = parseInt(gem.color.replace('0x', ''), 16);
      }
    });

    // Fallback palette
    if (Object.keys(this.colors).length === 0) {
      this.colors = {
        [ShapeType.TRIANGLE]: 0x3b82f6,
        [ShapeType.SQUARE]:   0x22c55e,
        [ShapeType.PENTAGON]: 0xec4899,
        [ShapeType.HEXAGON]:  0xeab308,
        [ShapeType.STAR]:     0xef4444,
        [ShapeType.NONE]:     0x8b5cf6,
      };
    }
  }

  /* ── Preload ────────────────────────────────────────────── */

  preload() {
    this.createTextures();
  }

  private createTextures(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });

    Object.entries(this.colors).forEach(([type, color]) => {
      graphics.clear();
      const size   = CELL_SIZE * 0.7;
      const center = CELL_SIZE / 2;

      if (type === ShapeType.NONE) {
        graphics.fillStyle(0x111111, 1);
        graphics.fillCircle(center, center, size / 2 + 4);
        graphics.lineStyle(2, 0x8b5cf6, 0.6);
        graphics.strokeCircle(center, center, size / 2 + 4);
        graphics.fillStyle(0x8b5cf6, 0.3);
        graphics.fillCircle(center, center, size / 3);
      } else {
        graphics.fillStyle(color as number, 1);
        graphics.lineStyle(2, 0xffffff, 0.3);
        this.drawShape(graphics, type as ShapeType, center, center, size);
      }

      const key = `gem_${type}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      graphics.generateTexture(key, CELL_SIZE, CELL_SIZE);
    });

    // Star particle for ambient effects
    if (!this.textures.exists('star_particle')) {
      graphics.clear();
      graphics.fillStyle(0xffffff, 1);
      graphics.fillCircle(4, 4, 3);
      graphics.generateTexture('star_particle', 8, 8);
    }

    graphics.destroy();
  }

  private drawShape(
    gfx: Phaser.GameObjects.Graphics,
    type: ShapeType, x: number, y: number, size: number,
  ): void {
    const half = size / 2;

    switch (type) {
      case ShapeType.TRIANGLE:
        gfx.beginPath();
        gfx.moveTo(x, y - half);
        gfx.lineTo(x + half, y + half * 0.7);
        gfx.lineTo(x - half, y + half * 0.7);
        gfx.closePath();
        gfx.fillPath();
        gfx.strokePath();
        break;

      case ShapeType.SQUARE:
        gfx.fillRoundedRect(x - half * 0.8, y - half * 0.8, size * 0.8, size * 0.8, 6);
        gfx.strokeRoundedRect(x - half * 0.8, y - half * 0.8, size * 0.8, size * 0.8, 6);
        break;

      case ShapeType.PENTAGON:
        this.drawPolygon(gfx, x, y, half, 5);
        break;

      case ShapeType.HEXAGON:
        this.drawPolygon(gfx, x, y, half, 6);
        break;

      case ShapeType.STAR:
        this.drawStar(gfx, x, y, half, half * 0.4, 5);
        break;
    }
  }

  private drawPolygon(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number, radius: number, sides: number,
  ): void {
    gfx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    }
    gfx.closePath();
    gfx.fillPath();
    gfx.strokePath();
  }

  private drawStar(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number,
    outerR: number, innerR: number, points: number,
  ): void {
    const step = Math.PI / points;
    gfx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = i * step - Math.PI / 2;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    }
    gfx.closePath();
    gfx.fillPath();
    gfx.strokePath();
  }

  /* ── Create ─────────────────────────────────────────────── */

  create(data: { userCharId?: string; opponentCharId?: string }) {
    // Initialize logic
    this.logic = new GameLogic(GRID_SIZE);
    this.logic.initializeGrid();
    while (!this.logic.hasPossibleMoves()) {
      this.logic.initializeGrid();
    }
    this.effectManager = new EffectManager(this);

    const gridWidth = GRID_SIZE * CELL_SIZE;
    const offsetX   = this.getOffsetX();
    const offsetY   = this.getOffsetY();

    // ── Background ───────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillGradientStyle(
      UITheme.colors.bgDeep, UITheme.colors.bgDeep,
      UITheme.colors.bgPanel, UITheme.colors.bgGlass,
      1, 1, 1, 1,
    );
    bg.fillRect(0, 0, this.gameWidth, this.gameHeight);

    this.createAmbientParticles(this.add.container(0, 0));

    if (this.textures.exists('menu_bg')) {
      this.add.image(this.centerX, this.centerY, 'menu_bg')
        .setDisplaySize(this.gameWidth, this.gameHeight)
        .setAlpha(0.1)
        .setTint(0x3b82f6);
    }

    // ── Board Background (layered glass) ─────────────────
    const boardBg = this.add.graphics();

    // Outer soft glow
    boardBg.lineStyle(8, UITheme.colors.glowPurple, 0.15);
    boardBg.strokeRoundedRect(offsetX - 16, offsetY - 16, gridWidth + 32, gridWidth + 32, UITheme.radius.xxl);

    // Mid glow
    boardBg.lineStyle(3, UITheme.colors.glowCyan, 0.2);
    boardBg.strokeRoundedRect(offsetX - 10, offsetY - 10, gridWidth + 20, gridWidth + 20, UITheme.radius.xl);

    // Dark glass fill
    boardBg.fillStyle(0x000000, 0.55);
    boardBg.fillRoundedRect(offsetX - 8, offsetY - 8, gridWidth + 16, gridWidth + 16, UITheme.radius.lg);

    // Inner top highlight
    boardBg.fillStyle(0xffffff, 0.02);
    boardBg.fillRoundedRect(offsetX - 6, offsetY - 6, gridWidth + 12, 40, { tl: UITheme.radius.lg, tr: UITheme.radius.lg, bl: 0, br: 0 });

    // Grid lines (subtle)
    boardBg.lineStyle(1, 0xffffff, 0.03);
    for (let i = 1; i < GRID_SIZE; i++) {
      boardBg.moveTo(offsetX + i * CELL_SIZE, offsetY);
      boardBg.lineTo(offsetX + i * CELL_SIZE, offsetY + gridWidth);
      boardBg.moveTo(offsetX, offsetY + i * CELL_SIZE);
      boardBg.lineTo(offsetX + gridWidth, offsetY + i * CELL_SIZE);
    }
    boardBg.strokePath();

    // Border
    boardBg.lineStyle(1, UITheme.colors.border, 0.3);
    boardBg.strokeRoundedRect(offsetX - 8, offsetY - 8, gridWidth + 16, gridWidth + 16, UITheme.radius.lg);

    // ── Selection Indicator ──────────────────────────────
    this.selectionRect = this.add.rectangle(0, 0, CELL_SIZE, CELL_SIZE, 0xffffff, 0)
      .setOrigin(0.5)
      .setStrokeStyle(4, 0x00ffff, 1)
      .setVisible(false)
      .setDepth(10);

    this.tweens.add({
      targets: this.selectionRect,
      alpha: 0.5,
      scale: 1.1,
      duration: 400,
      yoyo: true,
      repeat: -1,
    });

    // ── Visual Grid ──────────────────────────────────────
    this.initVisualGrid(offsetX, offsetY);

    // ── Swipe Handler ────────────────────────────────────
    this.swipeHandler = new SwipeHandler(
      this, CELL_SIZE, offsetX, offsetY, GRID_SIZE,
      (start, end) => {
        if (this.isProcessing) return;
        if (CombatManager.getInstance().currentTurn !== 'USER') return;
        this.swapCells(start.r, start.c, end.r, end.c);
      },
      (r, c) => this.updateSelectionRect(r, c),
      (r, c) => this.updateSelectionRect(r, c),
      ()     => this.selectionRect.setVisible(false),
    );

    this.game.events.emit('SCENE_READY', 'Game_Scene');

    // ── Initialize Combat ────────────────────────────────
    const combatRegistry = CombatRegistry.getInstance();
    const userCharId     = data?.userCharId     || 'warrior';
    const opponentCharId = data?.opponentCharId || 'mage';

    const user     = combatRegistry.getCharacter(userCharId);
    const opponent = combatRegistry.getCharacter(opponentCharId);

    if (user && opponent) {
      CombatManager.getInstance().init(user, opponent);
      this.buildHUD();
      this.setupCombatListeners();

      this.opponentAI = new OpponentAI(
        this.game, this.logic,
        async (r1, c1, r2, c2) => { await this.swapCells(r1, c1, r2, c2); },
        () => this.powerSurge,
      );
    }

    this.events.on('shutdown', this.shutdown, this);
  }

  /* ── HUD Construction ───────────────────────────────────── */

  private buildHUD(): void {
    const { colors, font } = UITheme;
    const h = this.hud;

    // ── Opponent HUD (top-left) ──────────────────────────
    this.opponentHUD = this.add.container(h.marginX, h.marginY);
    this.buildCharacterHUD(this.opponentHUD, false);

    // ── User HUD (bottom-left) ───────────────────────────
    this.userHUD = this.add.container(h.marginX, this.gameHeight - h.marginY - h.userHeight);
    this.buildCharacterHUD(this.userHUD, true);

    // ── Queued Skills Containers ─────────────────────────
    const queuedX = h.marginX + h.userWidth / 2;
    this.queuedIconsContainer = this.add.container(queuedX, this.userHUD.y - this.s(35));
    this.opponentQueuedIconsContainer = this.add.container(
      h.marginX + h.opponentWidth / 2,
      this.opponentHUD.y + h.opponentHeight + this.s(10),
    );

    // ── Turn + Power HUDs (centered between board and HUDs)
    this.buildTurnHUD();
    this.buildPowerHUD();

    // ── Active Skill Button ──────────────────────────────
    this.buildActiveSkillButton();
  }

  /**
   * Builds one character HUD panel (user or opponent).
   * Pro-level glass panel with accent borders, progress bars, and stat chips.
   */
  private buildCharacterHUD(container: Phaser.GameObjects.Container, isUser: boolean): void {
    const { colors, font, radius, glass } = UITheme;
    const combat = CombatManager.getInstance();
    const char   = isUser ? combat.user : combat.opponent;
    if (!char) return;

    const hudW   = isUser ? this.hud.userWidth   : this.hud.opponentWidth;
    const hudH   = isUser ? this.hud.userHeight   : this.hud.opponentHeight;
    const barW   = isUser ? this.hud.userBarWidth  : this.hud.opponentBarWidth;
    const pad    = this.hud.padding;

    // ── Glass panel background
    const panelGfx = this.createPanel(0, 0, hudW, hudH, {
      fillColor:   colors.bgGlass,
      fillAlpha:   glass.fillAlpha,
      strokeColor: isUser ? colors.border : colors.border,
      strokeAlpha: glass.borderAlpha,
      strokeWidth: 1,
      radius:      radius.lg,
    });
    container.add(panelGfx);

    // ── Side accent bar (user=green, opponent=red)
    const accentColor = isUser ? colors.hpUser : colors.hpOpponent;
    const accentGfx = this.add.graphics();
    accentGfx.fillStyle(accentColor, 0.6);
    accentGfx.fillRect(0, 4, 3, hudH - 8);
    container.add(accentGfx);

    // ── Turn-indicator glow (behind panel)
    const glow = this.add.graphics();
    container.add(glow);
    if (isUser) this.userGlow = glow;
    else this.opponentGlow = glow;

    // ── Character name with class color
    const nameText = this.add.text(this.s(15), this.s(10), char.name.toUpperCase(), {
      fontSize: font.size(16, this.scaleFactor), fontFamily: font.family,
      fontStyle: 'bold', color: colors.textPrimary, letterSpacing: this.s(2),
    });
    container.add(nameText);

    // ── HP Label + Bar
    const hpLabelY = this.s(38);
    container.add(this.add.text(this.s(15), hpLabelY, 'HP', {
      fontSize: font.size(12, this.scaleFactor), fontFamily: font.family,
      color: colors.textDim,
    }));

    const hpValText = this.add.text(this.s(15) + barW, hpLabelY, `${Math.floor(char.currentHp)}/${char.maxHp}`, {
      fontSize: font.size(12, this.scaleFactor), fontFamily: font.family,
      fontStyle: 'bold', color: colors.textPrimary,
    }).setOrigin(1, 0);
    container.add(hpValText);
    if (isUser) this.userHpText = hpValText;
    else this.opponentHpText = hpValText;

    const hpBar = this.add.graphics();
    container.add(hpBar);
    if (isUser) this.userHpBar = hpBar;
    else this.opponentHpBar = hpBar;
    const hpColor = isUser ? colors.hpUser : colors.hpOpponent;
    this.drawProgressBar(hpBar, char.currentHp / char.maxHp, hpColor, barW, this.s(56));

    // ── Charge Label + Bar
    const chargeLabelY = this.s(82);
    container.add(this.add.text(this.s(15), chargeLabelY, 'CHARGE', {
      fontSize: font.size(12, this.scaleFactor), fontFamily: font.family,
      color: colors.textDim,
    }));

    const chargeValText = this.add.text(this.s(15) + barW, chargeLabelY, `${Math.floor(char.currentCharge)}/${char.maxCharge}`, {
      fontSize: font.size(12, this.scaleFactor), fontFamily: font.family,
      fontStyle: 'bold', color: colors.textPrimary,
    }).setOrigin(1, 0);
    container.add(chargeValText);
    if (isUser) this.userChargeText = chargeValText;
    else this.opponentChargeText = chargeValText;

    const chargeBar = this.add.graphics();
    container.add(chargeBar);
    if (isUser) this.userChargeBar = chargeBar;
    else this.opponentChargeBar = chargeBar;
    const chargeColor = isUser ? colors.chargeUser : colors.chargeOpponent;
    this.drawProgressBar(chargeBar, char.currentCharge / char.maxCharge, chargeColor, barW, this.s(98));

    // ── Stats Row (compact)
    const statData = [
      { label: 'STR', value: char.stats.strength },
      { label: 'END', value: char.stats.endurance },
      { label: 'PWR', value: char.stats.power },
      { label: 'RES', value: char.stats.resistance },
      { label: 'SPD', value: char.stats.speed },
      { label: 'ACC', value: char.stats.accuracy },
    ];
    const statsRow = this.createStatRow(statData, { x: this.s(15), y: this.s(125), labelSize: 11, valueSize: 12 });
    container.add(statsRow);

    // ── Skill Buttons (user only)
    if (isUser) {
      this.buildSkillSlots(container, char, hudW);
    }
  }

  /**
   * Renders premium skill slot buttons inside the user HUD.
   */
  private buildSkillSlots(
    container: Phaser.GameObjects.Container,
    char: Character,
    hudW: number,
  ): void {
    const { colors, font, radius } = UITheme;
    const skillY     = this.s(165);
    const stackSkills = char.loadout.stacks || [];
    if (stackSkills.length === 0) return;

    const pad     = this.s(15);
    const spacing = this.s(8);
    const availW  = hudW - pad * 2;
    const btnW    = Math.min(this.s(120), (availW - spacing * (stackSkills.length - 1)) / stackSkills.length);
    const btnH    = this.s(42);
    const totalW  = stackSkills.length * btnW + (stackSkills.length - 1) * spacing;
    const startX  = pad + (availW - totalW) / 2;

    this.skillButtons = [];

    stackSkills.forEach((skillId, i) => {
      const skill = CombatRegistry.getInstance().getSkill(skillId);
      const x = startX + i * (btnW + spacing);

      const btn = this.add.container(x, skillY);

      // Glass button background
      const bgGfx = this.add.graphics();
      bgGfx.fillStyle(colors.bgCard, 0.7);
      bgGfx.fillRoundedRect(0, 0, btnW, btnH, radius.sm);
      bgGfx.lineStyle(1, colors.warning, 0.3);
      bgGfx.strokeRoundedRect(0, 0, btnW, btnH, radius.sm);
      // Top accent
      bgGfx.fillStyle(colors.warning, 0.4);
      bgGfx.fillRect(2, 0, btnW - 4, 2);
      btn.add(bgGfx);

      if (skill) {
        const nameLabel = this.add.text(this.s(8), btnH / 2, skill.name.substring(0, 8).toUpperCase(), {
          fontSize: font.size(9, this.scaleFactor), fontFamily: font.family,
          fontStyle: 'bold', color: colors.textPrimary,
        }).setOrigin(0, 0.5);
        btn.add(nameLabel);

        const costLabel = this.add.text(btnW - this.s(8), btnH / 2, `${skill.chargeCost}`, {
          fontSize: font.size(10, this.scaleFactor), fontFamily: font.family,
          fontStyle: 'bold', color: colors.textDamage,
        }).setOrigin(1, 0.5);
        btn.add(costLabel);
      }

      btn.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, btnW, btnH),
        Phaser.Geom.Rectangle.Contains,
      );

      btn.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const dist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
        if (dist > 10) return;

        const combat = CombatManager.getInstance();
        const user   = combat.user;
        if (user && skill && user.currentCharge >= skill.chargeCost && combat.currentTurn === 'USER') {
          let moveScore   = 0;
          let comboNumber = 1;
          this.game.events.emit('SKILL_ACTIVATED', {
            character: 'USER',
            skillId,
            moveScore,
            comboNumber,
            powerSurge: this.powerSurge,
          });
        }
      });

      container.add(btn);
      this.skillButtons.push(btn);
    });
  }

  /* ── Turn HUD ───────────────────────────────────────────── */

  private buildTurnHUD(): void {
    const { colors, font, radius, glass } = UITheme;
    const x = this.gameWidth - this.s(140);
    const y = this.s(50);

    this.turnHUD = this.add.container(x, y);

    const bg = this.createPanel(-this.s(70), -this.s(22), this.s(140), this.s(44), {
      fillColor: colors.bgGlass, fillAlpha: glass.fillAlpha,
      strokeColor: colors.primary, strokeAlpha: 0.3,
      radius: radius.md,
    });
    this.turnHUD.add(bg);

    // Accent dot
    const dot = this.add.circle(-this.s(52), 0, this.s(4), colors.primary, 0.8);
    this.turnHUD.add(dot);
    this.tweens.add({ targets: dot, alpha: 0.3, duration: 1200, yoyo: true, repeat: -1 });

    this.turnCountText = this.add.text(0, 0, 'YOUR TURN', {
      fontSize: font.size(14, this.scaleFactor), fontFamily: font.family,
      fontStyle: 'bold', color: colors.textAccent, letterSpacing: this.s(2),
    }).setOrigin(0.5);
    this.turnHUD.add(this.turnCountText);
  }

  /* ── Power HUD ──────────────────────────────────────────── */

  private buildPowerHUD(): void {
    const { colors, font, radius, glass } = UITheme;
    const x = this.gameWidth - this.s(140);
    const y = this.s(110);

    this.powerHUD = this.add.container(x, y);

    const bg = this.createPanel(-this.s(70), -this.s(22), this.s(140), this.s(44), {
      fillColor: colors.bgGlass, fillAlpha: glass.fillAlpha,
      strokeColor: colors.warning, strokeAlpha: 0.2,
      radius: radius.md,
    });
    this.powerHUD.add(bg);

    this.powerText = this.add.text(0, 0, `⚡ ${this.powerSurge}`, {
      fontSize: font.size(16, this.scaleFactor), fontFamily: font.family,
      fontStyle: 'bold', color: colors.textDamage, letterSpacing: this.s(1),
    }).setOrigin(0.5);
    this.powerHUD.add(this.powerText);
  }

  /* ── Active Skill Button ────────────────────────────────── */

  private buildActiveSkillButton(): void {
    const { colors, font, anim } = UITheme;
    const combat = CombatManager.getInstance();
    const user   = combat.user;
    if (!user) return;

    const skillId = user.loadout.active;
    const skill   = skillId ? CombatRegistry.getInstance().getSkill(skillId) : null;

    const size = this.hud.skillSize;
    const x    = this.gameWidth - this.s(100);
    const y    = this.gameHeight - this.s(180);

    this.activeSkillBtn = this.add.container(x, y);

    // Outer glow ring
    const outerGlow = this.add.graphics();
    outerGlow.lineStyle(2, colors.primary, 0.15);
    outerGlow.strokeCircle(0, 0, size / 2 + 6);
    this.activeSkillBtn.add(outerGlow);

    // Main circle (glass style)
    const bg = this.add.graphics();
    bg.fillStyle(colors.bgGlass, 0.7);
    bg.fillCircle(0, 0, size / 2);
    bg.lineStyle(3, colors.primary, 0.8);
    bg.strokeCircle(0, 0, size / 2);
    // Top highlight arc
    bg.fillStyle(0xffffff, 0.06);
    bg.fillCircle(0, -size * 0.12, size * 0.38);
    this.activeSkillBtn.add(bg);

    // Pulsing ring animation
    this.tweens.add({
      targets: outerGlow,
      alpha: 0.6,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: anim.ease.sine,
    });

    const label = this.add.text(0, -this.s(10), skill ? skill.name.toUpperCase() : 'SKILL', {
      fontSize: font.size(18, this.scaleFactor), fontFamily: font.family,
      fontStyle: 'bold', color: colors.textPrimary,
    }).setOrigin(0.5);
    this.activeSkillBtn.add(label);

    const costText = this.add.text(0, this.s(18), skill ? `${skill.chargeCost} EP` : '', {
      fontSize: font.size(14, this.scaleFactor), fontFamily: font.family,
      fontStyle: 'bold', color: colors.textCharge,
    }).setOrigin(0.5);
    this.activeSkillBtn.add(costText);

    this.activeSkillBtn.setInteractive(
      new Phaser.Geom.Circle(0, 0, size / 2),
      Phaser.Geom.Circle.Contains,
    );

    this.activeSkillBtn.on('pointerover', () => {
      SoundManager.getInstance().play(SoundType.SELECT);
      this.tweens.add({ targets: this.activeSkillBtn, scale: 1.08, duration: anim.fast });
      bg.clear();
      bg.fillStyle(colors.primary, 0.15);
      bg.fillCircle(0, 0, size / 2);
      bg.lineStyle(3, colors.primaryLight, 1);
      bg.strokeCircle(0, 0, size / 2);
    });

    this.activeSkillBtn.on('pointerout', () => {
      this.tweens.add({ targets: this.activeSkillBtn, scale: 1, duration: anim.fast });
      bg.clear();
      bg.fillStyle(colors.bgGlass, 0.7);
      bg.fillCircle(0, 0, size / 2);
      bg.lineStyle(3, colors.primary, 0.8);
      bg.strokeCircle(0, 0, size / 2);
    });

    this.activeSkillBtn.on('pointerdown', () => {
      SoundManager.getInstance().play(SoundType.CLICK);
      this.tweens.add({ targets: this.activeSkillBtn, scale: 0.92, duration: 50, yoyo: true });

      const cm = CombatManager.getInstance();
      if (user && skill && user.currentCharge >= skill.chargeCost && cm.currentTurn === 'USER') {
        this.game.events.emit('SKILL_ACTIVATED', {
          character: 'USER', skillId, powerSurge: this.powerSurge,
        });
      } else {
        // Shake feedback
        this.tweens.add({
          targets: this.activeSkillBtn, x: x + this.s(5),
          duration: 50, yoyo: true, repeat: 3,
        });
        if (user && skill && user.currentCharge < skill.chargeCost && this.userChargeBar) {
          this.tweens.add({
            targets: this.userChargeBar, alpha: 0.2,
            duration: 100, yoyo: true, repeat: 1,
          });
        }
      }
    });
  }

  /* ── HUD Updates ────────────────────────────────────────── */

  private updateHUD(): void {
    const combat = CombatManager.getInstance();
    const { colors } = UITheme;

    if (combat.user) {
      const u = combat.user;
      this.drawProgressBar(this.userHpBar, u.currentHp / u.maxHp, colors.hpUser, this.hud.userBarWidth, this.s(60));
      this.drawProgressBar(this.userChargeBar, u.currentCharge / u.maxCharge, colors.chargeUser, this.hud.userBarWidth, this.s(100));
      this.userHpText.setText(`${Math.floor(u.currentHp)}/${u.maxHp}`);
      this.userChargeText.setText(`${Math.floor(u.currentCharge)}/${u.maxCharge}`);
    }

    if (combat.opponent) {
      const o = combat.opponent;
      this.drawProgressBar(this.opponentHpBar, o.currentHp / o.maxHp, colors.hpOpponent, this.hud.opponentBarWidth, this.s(60));
      this.drawProgressBar(this.opponentChargeBar, o.currentCharge / o.maxCharge, colors.chargeOpponent, this.hud.opponentBarWidth, this.s(100));
      this.opponentHpText.setText(`${Math.floor(o.currentHp)}/${o.maxHp}`);
      this.opponentChargeText.setText(`${Math.floor(o.currentCharge)}/${o.maxCharge}`);
    }

    this.powerText?.setText(`⚡ ${this.powerSurge}`);
  }

  /* ────────────────────────────────────────────────────────── */
  /* The remaining methods (grid init, swap, match processing, */
  /* combat listeners, effects delegate, AI, game-over, etc.)  */
  /* are preserved identically from the original Game_Scene.   */
  /* They are listed below as stubs to keep this file focused  */
  /* on the UI refactoring. Copy them verbatim from the        */
  /* original Game_Scene.ts.                                   */
  /* ────────────────────────────────────────────────────────── */

  private getOffsetX(): number {
    return this.getCenteredX(GRID_SIZE * CELL_SIZE);
  }

  private getOffsetY(): number {
    return this.getCenteredY(GRID_SIZE * CELL_SIZE, -77);
  }

  private updateSelectionRect(r: number, c: number): void {
    const offsetX = this.getOffsetX();
    const offsetY = this.getOffsetY();
    this.selectionRect.setPosition(
      offsetX + c * CELL_SIZE + CELL_SIZE / 2,
      offsetY + r * CELL_SIZE + CELL_SIZE / 2,
    );
    this.selectionRect.setVisible(true);
  }

  private initVisualGrid(offsetX: number, offsetY: number): void {
    this.visualGrid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      this.visualGrid[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        // Subtle cell background glow
        const cellX  = offsetX + c * CELL_SIZE + CELL_SIZE / 2;
        const cellY  = offsetY + r * CELL_SIZE + CELL_SIZE / 2;
        const cellBg = this.add.circle(cellX, cellY, CELL_SIZE * 0.4, 0xffffff, 0.03);
        cellBg.setBlendMode(Phaser.BlendModes.ADD);

        const logicCell = this.logic.grid[r][c];
        if (logicCell) {
          const sprite = this.createGemSprite(logicCell, offsetX, offsetY, r, c);
          this.visualGrid[r][c] = { sprite };
        } else {
          this.visualGrid[r][c] = null;
        }
      }
    }
  }

  private createGemSprite(
    cell: LogicCell,
    offsetX: number, offsetY: number,
    r: number, c: number,
  ): Phaser.GameObjects.Container {
    const x = offsetX + c * CELL_SIZE + CELL_SIZE / 2;
    const y = offsetY + r * CELL_SIZE + CELL_SIZE / 2;

    const container = this.add.container(x, y);
    const key = `gem_${cell.shape}`;
    if (this.textures.exists(key)) {
      const img = this.add.image(0, 0, key).setDisplaySize(CELL_SIZE * 0.85, CELL_SIZE * 0.85);
      container.add(img);
    }

    // Special type overlay
    if (cell.special !== SpecialType.NONE) {
      const overlay = this.add.text(0, 0, this.getSpecialGlyph(cell.special), {
        fontSize: UITheme.font.size(24, this.scaleFactor),
        fontFamily: UITheme.font.family,
        color: '#ffffff',
      }).setOrigin(0.5).setAlpha(0.8);
      container.add(overlay);
    }

    return container;
  }

  private getSpecialGlyph(type: SpecialType): string {
    switch (type) {
      case SpecialType.LINE_H:  return '━';
      case SpecialType.LINE_V:  return '┃';
      case SpecialType.BOMB:    return '◉';
      case SpecialType.RAINBOW: return '✦';
      default: return '';
    }
  }

  // ── Pending specials queue for cascade processing ──
  private pendingSpecials: LogicCell[] = [];

  /* ── Swap + Cascade Logic ───────────────────────────────── */

  public async swapCells(r1: number, c1: number, r2: number, c2: number): Promise<void> {
    this.isProcessing = true;

    const vCell1 = this.visualGrid[r1][c1];
    const vCell2 = this.visualGrid[r2][c2];
    const lCell1 = this.logic.grid[r1][c1];
    const lCell2 = this.logic.grid[r2][c2];

    if (!vCell1 || !vCell2 || !lCell1 || !lCell2) {
      this.isProcessing = false;
      return;
    }

    // Visual swap
    await Promise.all([
      this.animateMove(vCell1.sprite, vCell2.sprite.x, vCell2.sprite.y),
      this.animateMove(vCell2.sprite, vCell1.sprite.x, vCell1.sprite.y),
    ]);

    // Logic swap
    this.logic.swap(r1, c1, r2, c2);
    this.visualGrid[r1][c1] = vCell2;
    this.visualGrid[r2][c2] = vCell1;

    const newCell1 = this.logic.grid[r1][c1]!;
    const newCell2 = this.logic.grid[r2][c2]!;

    // Handle parasite swap
    if (newCell1.special === SpecialType.PARASITE || newCell2.special === SpecialType.PARASITE) {
      const parasite = newCell1.special === SpecialType.PARASITE ? newCell1 : newCell2;
      const other    = newCell1.special === SpecialType.PARASITE ? newCell2 : newCell1;
      await this.effectManager.handleParasiteCombination(parasite, other, r2, c2);
      await this.processBoard();
      CombatManager.getInstance().switchTurn();
      this.isProcessing = false;
      return;
    }

    // Handle special + special combination
    if (newCell1.special !== SpecialType.NONE && newCell2.special !== SpecialType.NONE) {
      await this.effectManager.handleSpecialCombination(newCell1, newCell2, r2, c2);
      await this.processBoard();
      CombatManager.getInstance().switchTurn();
      this.isProcessing = false;
      return;
    }

    let matches = this.logic.findMatches();

    // If no matches, swap back
    if (matches.length === 0) {
      await Promise.all([
        this.animateMove(vCell1.sprite, vCell2.sprite.x, vCell2.sprite.y),
        this.animateMove(vCell2.sprite, vCell1.sprite.x, vCell1.sprite.y),
      ]);
      this.logic.swap(r1, c1, r2, c2);
      this.visualGrid[r1][c1] = vCell1;
      this.visualGrid[r2][c2] = vCell2;
    } else {
      // Point special creation towards the cell the user moved TO
      matches.forEach(m => {
        if (m.specialCreation) {
          const inMatch1 = m.cells.some(c => c.r === r1 && c.c === c1);
          const inMatch2 = m.cells.some(c => c.r === r2 && c.c === c2);
          if (inMatch2) {
            m.specialCreation.r = r2;
            m.specialCreation.c = c2;
          } else if (inMatch1) {
            m.specialCreation.r = r1;
            m.specialCreation.c = c1;
          }
        }
      });
      await this.processBoard(true, matches);
      CombatManager.getInstance().switchTurn();
    }

    this.isProcessing = false;
  }

  /* ── Move Animation ─────────────────────────────────────── */

  private animateMove(
    obj: Phaser.GameObjects.Container,
    x: number, y: number,
    ease: string = 'Power2',
  ): Promise<void> {
    return new Promise(resolve => {
      const emitter = this.textures.exists('particle')
        ? this.add.particles(0, 0, 'particle', {
            speed: { min: 10, max: 30 },
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.5, end: 0 },
            lifespan: 300,
            blendMode: 'ADD',
            tint: 0xffffff,
          })
        : null;

      emitter?.startFollow(obj);

      this.tweens.add({
        targets: obj,
        x, y,
        duration: 250,
        ease,
        onComplete: () => {
          emitter?.stop();
          if (emitter) this.time.delayedCall(300, () => emitter.destroy());
          resolve();
        },
      });
    });
  }

  /* ── Cell Destruction ───────────────────────────────────── */

  private destroyCell(
    r: number, c: number,
    moveScore: number = 0, comboNumber: number = 1,
    spawnParticles: boolean = true, isSpecial: boolean = false,
  ): Promise<void> {
    return new Promise(resolve => {
      const vCell = this.visualGrid[r][c];
      const lCell = this.logic.grid[r][c];

      if (vCell && lCell) {
        if (isSpecial && lCell.special !== SpecialType.NONE) {
          this.pendingSpecials.push({ ...lCell });
          SoundManager.getInstance().play(SoundType.SPECIAL);
        }

        this.logic.grid[r][c]   = null;
        this.visualGrid[r][c]   = null;

        if (lCell.shape !== ShapeType.NONE) {
          this.game.events.emit('GEMS_DESTROYED', {
            shape: lCell.shape, count: 1,
            moveScore, comboNumber, powerSurge: this.powerSurge,
          });
        }

        const x = this.getOffsetX() + c * CELL_SIZE + CELL_SIZE / 2;
        const y = this.getOffsetY() + r * CELL_SIZE + CELL_SIZE / 2;

        if (spawnParticles) {
          this.spawnParticles(x, y, this.colors[lCell.shape]);
        }

        this.tweens.add({
          targets: vCell.sprite,
          scale: 1.2,
          duration: 50,
          yoyo: true,
          onComplete: () => {
            this.tweens.add({
              targets: vCell.sprite,
              scale: 0, alpha: 0,
              duration: 150,
              onComplete: () => {
                vCell.sprite.destroy();
                resolve();
              },
            });
          },
        });
      } else {
        resolve();
      }
    });
  }

  /* ── Board Processing (match → destroy → gravity → refill → repeat) */

  private async processBoard(giveScore = true, initialMatches?: MatchResult[]): Promise<void> {
    let matches = initialMatches || this.logic.findMatches();
    const hasEmpty = () => this.logic.grid.some(row => row.some(cell => cell === null));
    let comboNumber = 1;

    while (matches.length > 0 || this.pendingSpecials.length > 0 || hasEmpty()) {
      if (matches.length > 0) {
        SoundManager.getInstance().play(SoundType.MATCH);

        const toDestroy = new Map<string, number>();
        const specialCreations: { r: number; c: number; type: SpecialType; shape: ShapeType }[] = [];

        matches.forEach(match => {
          if (match.specialCreation) specialCreations.push(match.specialCreation);
          match.cells.forEach(m => {
            const key = `${m.r},${m.c}`;
            if (!toDestroy.has(key)) toDestroy.set(key, match.score ?? 0);
          });
        });

        // Destroy matched cells
        const destroyPromises: Promise<void>[] = [];
        toDestroy.forEach((score, key) => {
          const [r, c] = key.split(',').map(Number);
          const isCreationCell = specialCreations.some(sc => sc.r === r && sc.c === c);
          if (!isCreationCell) {
            destroyPromises.push(this.destroyCell(r, c, score, comboNumber, true, true));
          }
        });
        await Promise.all(destroyPromises);

        // Create specials at designated positions
        for (const sc of specialCreations) {
          const vCell = this.visualGrid[sc.r][sc.c];
          if (vCell) {
            vCell.sprite.destroy();
            this.visualGrid[sc.r][sc.c] = null;
          }
          this.logic.grid[sc.r][sc.c] = {
            shape: sc.shape, special: sc.type,
            r: sc.r, c: sc.c,
          };
          const sprite = this.createGemSprite(
            this.logic.grid[sc.r][sc.c]!,
            this.getOffsetX(), this.getOffsetY(), sc.r, sc.c,
          );
          this.visualGrid[sc.r][sc.c] = { sprite };

          // Entrance flash
          sprite.setScale(0);
          this.tweens.add({ targets: sprite, scale: 1, duration: 300, ease: 'Back.easeOut' });
        }

        comboNumber++;
      }

      // Process pending specials
      if (this.pendingSpecials.length > 0) {
        const specials = [...this.pendingSpecials];
        this.pendingSpecials = [];
        for (const sp of specials) {
          await this.effectManager.triggerSpecial(sp);
        }
      }

      // Gravity + refill
      const { drops, newCells } = this.logic.applyGravity();
      const offsetX = this.getOffsetX();
      const offsetY = this.getOffsetY();

      // Animate drops
      const dropPromises = drops.map(d => {
        const vCell = this.visualGrid[d.r][d.c];
        if (vCell) {
          this.visualGrid[d.newR][d.c] = vCell;
          this.visualGrid[d.r][d.c]    = null;
          const newY = offsetY + d.newR * CELL_SIZE + CELL_SIZE / 2;
          return this.animateMove(vCell.sprite, vCell.sprite.x, newY, 'Bounce.easeOut');
        }
        return Promise.resolve();
      });
      await Promise.all(dropPromises);

      // Spawn new cells
      for (const nc of newCells) {
        const logicCell = this.logic.grid[nc.r][nc.c];
        if (logicCell) {
          const sprite = this.createGemSprite(logicCell, offsetX, offsetY, nc.r, nc.c);

          // Drop from above
          sprite.y = offsetY - CELL_SIZE;
          const targetY = offsetY + nc.r * CELL_SIZE + CELL_SIZE / 2;
          this.visualGrid[nc.r][nc.c] = { sprite };
          await this.animateMove(sprite, sprite.x, targetY, 'Bounce.easeOut');
        }
      }

      // Check for new matches
      matches = this.logic.findMatches();

      // Update HUD after each cascade step
      this.updateHUD();
    }

    // Final: ensure grid is playable
    if (!this.logic.hasPossibleMoves()) {
      this.logic.initializeGrid();
      while (!this.logic.hasPossibleMoves()) {
        this.logic.initializeGrid();
      }
      // Rebuild visual grid
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const vc = this.visualGrid[r]?.[c];
          if (vc) vc.sprite.destroy();
        }
      }
      this.initVisualGrid(this.getOffsetX(), this.getOffsetY());
    }
  }

  /* ── Particle FX ────────────────────────────────────────── */

  private spawnParticles(x: number, y: number, color: number): void {
    if (!this.textures.exists('star_particle')) return;
    const emitter = this.add.particles(x, y, 'star_particle', {
      speed:     { min: 50, max: 150 },
      scale:     { start: 0.6, end: 0 },
      alpha:     { start: 1, end: 0 },
      lifespan:  400,
      quantity:  6,
      blendMode: 'ADD',
      tint:      color,
    });
    this.time.delayedCall(500, () => emitter.destroy());
  }

  /* ── Visual Grid Spawn ──────────────────────────────────── */

  private spawnVisualCell(r: number, c: number, offsetX: number, offsetY: number, shape: ShapeType): VisualCell | null {
    const x = offsetX + c * CELL_SIZE + CELL_SIZE / 2;
    const y = offsetY + r * CELL_SIZE + CELL_SIZE / 2;
    const container = this.add.container(x, y);
    const key = `gem_${shape}`;
    if (this.textures.exists(key)) {
      const sprite = this.add.image(0, 0, key).setDisplaySize(CELL_SIZE * 0.85, CELL_SIZE * 0.85);
      container.add(sprite);
    }
    container.setSize(CELL_SIZE, CELL_SIZE);
    this.visualGrid[r][c] = { sprite: container };
    return this.visualGrid[r][c];
  }

  /* ── Combat Event Listeners ─────────────────────────────── */

  private setupCombatListeners(): void {
    const { colors } = UITheme;

    // HP updated
    this.game.events.on('HP_UPDATED', (data: any) => {
      const isUser = data.character === 'USER';
      const bar    = isUser ? this.userHpBar     : this.opponentHpBar;
      const text   = isUser ? this.userHpText    : this.opponentHpText;
      const color  = isUser ? colors.hpUser      : colors.hpOpponent;
      const barW   = isUser ? this.hud.userBarWidth : this.hud.opponentBarWidth;

      this.drawProgressBar(bar, data.hp / data.maxHp, color, barW, this.s(60));
      text?.setText(`${Math.floor(data.hp)}/${data.maxHp}`);
    });

    // Charge updated
    this.game.events.on('CHARGE_UPDATED', (data: any) => {
      const isUser = data.character === 'USER';
      const bar    = isUser ? this.userChargeBar     : this.opponentChargeBar;
      const text   = isUser ? this.userChargeText    : this.opponentChargeText;
      const color  = isUser ? colors.chargeUser      : colors.chargeOpponent;
      const barW   = isUser ? this.hud.userBarWidth  : this.hud.opponentBarWidth;

      this.drawProgressBar(bar, data.charge / data.maxCharge, color, barW, this.s(100));
      text?.setText(`${Math.floor(data.charge)}/${data.maxCharge}`);
    });

    // Power surge
    this.game.events.on('POWER_UPDATE', (power: number) => {
      this.powerSurge = power;
      this.powerText?.setText(`⚡ ${power}`);
    });

    // Turn switched
    this.game.events.on('TURN_SWITCHED', (data: any) => {
      const isUserTurn = data.turn === 'USER';
      this.turnCountText?.setText(isUserTurn ? 'YOUR TURN' : 'ENEMY TURN');
      this.turnCountText?.setColor(isUserTurn ? colors.textAccent : '#f87171');

      // Glow active player's HUD with subtle animated border
      if (this.userGlow) {
        this.userGlow.clear();
        if (isUserTurn) {
          this.userGlow.lineStyle(2, colors.hpUser, 0.4);
          this.userGlow.strokeRoundedRect(-3, -3, this.hud.userWidth + 6, this.hud.userHeight + 6, UITheme.radius.lg + 2);
        }
      }
      if (this.opponentGlow) {
        this.opponentGlow.clear();
        if (!isUserTurn) {
          this.opponentGlow.lineStyle(2, colors.hpOpponent, 0.4);
          this.opponentGlow.strokeRoundedRect(-3, -3, this.hud.opponentWidth + 6, this.hud.opponentHeight + 6, UITheme.radius.lg + 2);
        }
      }

      // Trigger AI on opponent turn
      if (!isUserTurn && this.opponentAI) {
        this.time.delayedCall(800, () => {
          this.opponentAI?.takeTurn();
        });
      }
    });

    // Game over
    this.game.events.on('GAME_OVER', (data: any) => {
      this.isGameOver = true;
      this.showGameOver(data.winner);
    });
  }

  /* ── Game Over Overlay ──────────────────────────────────── */

  private showGameOver(winner: string): void {
    const { colors, font, anim } = UITheme;
    const isUserWin = winner === 'USER';

    // Dark overlay with gradient
    const overlay = this.add.rectangle(this.centerX, this.centerY, this.gameWidth, this.gameHeight, 0x000000, 0)
      .setDepth(100);
    this.tweens.add({ targets: overlay, fillAlpha: 0.85, duration: 1200 });

    // Result color
    const resultColor = isUserWin ? colors.primary : colors.danger;
    const resultText  = isUserWin ? 'VICTORY' : 'DEFEAT';

    // Glow behind text
    const glow = this.add.graphics().setDepth(100);
    glow.fillStyle(resultColor, 0);
    glow.fillCircle(this.centerX, this.centerY - this.s(60), this.s(150));
    glow.setAlpha(0);
    this.tweens.add({ targets: glow, alpha: 0.15, duration: 1500, delay: 300 });

    // Title
    const text = this.add.text(this.centerX, this.centerY - this.s(60), resultText, {
      fontSize: font.size(80, this.scaleFactor), fontFamily: font.family,
      fontStyle: 'bold', letterSpacing: this.s(12),
      color: isUserWin ? colors.textAccent : '#f87171',
    }).setOrigin(0.5).setAlpha(0).setScale(0.8).setDepth(101);

    this.tweens.add({
      targets: text, alpha: 1, scale: 1,
      y: this.centerY - this.s(80),
      duration: 1000, delay: 400,
      ease: anim.ease.back,
    });

    // Subtitle
    const sub = this.add.text(this.centerX, this.centerY - this.s(20), isUserWin ? 'The Genesis bows to your power' : 'The Genesis claims another soul', {
      fontSize: font.size(16, this.scaleFactor), fontFamily: font.family,
      color: colors.textSecondary, letterSpacing: this.s(2),
    }).setOrigin(0.5).setAlpha(0).setDepth(101);
    this.tweens.add({ targets: sub, alpha: 0.7, duration: 800, delay: 900 });

    // Button
    const restartBtn = this.createMenuButton(
      this.centerX, this.centerY + this.s(60),
      'RETURN TO MENU',
      () => this.scene.start('MainMenuScene'),
      resultColor,
    );
    restartBtn.setDepth(101).setAlpha(0);
    this.tweens.add({ targets: restartBtn, alpha: 1, duration: 800, delay: 1200, ease: anim.ease.out });
  }

  /* ── Shutdown / Cleanup ─────────────────────────────────── */

  private shutdown(): void {
    this.game.events.off('HP_UPDATED');
    this.game.events.off('CHARGE_UPDATED');
    this.game.events.off('POWER_UPDATE');
    this.game.events.off('TURN_SWITCHED');
    this.game.events.off('GAME_OVER');
    this.game.events.off('SKILL_ACTIVATED');
    this.opponentAI = null;
  }

  /* ── IEffectDelegate Interface ──────────────────────────── */

  getVisualGrid()    { return this.visualGrid; }
  getCellSize()      { return CELL_SIZE; }
  getOffsetXPublic() { return this.getOffsetX(); }
  getOffsetYPublic() { return this.getOffsetY(); }

  async destroyCellPublic(r: number, c: number, moveScore: number, comboNumber: number): Promise<void> {
    return this.destroyCell(r, c, moveScore, comboNumber);
  }

  spawnVisualCellPublic(r: number, c: number, shape: ShapeType): VisualCell | null {
    return this.spawnVisualCell(r, c, this.getOffsetX(), this.getOffsetY(), shape);
  }
}
