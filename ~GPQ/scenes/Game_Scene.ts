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

// ─── GRID_SIZE is a true constant — it never mutates ─────────────────────────
const GRID_SIZE = 10;

interface HudConfig {
  userWidth: number;
  opponentWidth: number;
  userHeight: number;
  opponentHeight: number;
  userBarWidth: number;
  opponentBarWidth: number;
  padding: number;
  barHeight: number;  // stored already-scaled; do NOT multiply by scaleFactor again
  skillSize: number;
  marginX: number;
  marginY: number;
  colors: {
    hp: number;
    charge: number;
    opponentHp: number;
    opponentCharge: number;
    bg: number;
    border: number;
  };
}

interface VisualCell {
  sprite: Phaser.GameObjects.Container;
}

export class Game_Scene extends BaseScene implements IEffectDelegate {
  constructor() {
    super('Game_Scene');
  }

  // ─── Layout scalars (class props — not module-level lets) ──────────────────
  private CELL_SIZE: number = 88;
  private BASE_GRID_WIDTH: number = 880;
  private HUD_CONFIG: HudConfig = {
    userWidth: 720,
    opponentWidth: 480,
    userHeight: 270,
    opponentHeight: 180,
    userBarWidth: 608,
    opponentBarWidth: 372,
    padding: 20,
    barHeight: 21,
    skillSize: 128,
    marginX: 24,
    marginY: 96,
    colors: {
      hp: 0x10b981,
      charge: 0x3b82f6,
      opponentHp: 0xef4444,
      opponentCharge: 0xeab308,
      bg: 0x000000,
      border: 0xffffff,
    },
  };

  private logic!: GameLogic;
  private visualGrid: (VisualCell | null)[][] = [];
  private isProcessing = false;
  private isGameOver = false;
  private powerSurge = 0;
  private selectionRect!: Phaser.GameObjects.Rectangle;
  private swipeHandler!: SwipeHandler;
  private effectManager!: EffectManager;
  private colors: Record<ShapeType, number> = {} as any;

  // HUD Elements
  private userHUD!: Phaser.GameObjects.Container;
  private opponentHUD!: Phaser.GameObjects.Container;
  private powerText!: Phaser.GameObjects.Text;
  private userHpBar!: Phaser.GameObjects.Graphics;
  private userChargeBar!: Phaser.GameObjects.Graphics;
  private opponentHpBar!: Phaser.GameObjects.Graphics;
  private opponentChargeBar!: Phaser.GameObjects.Graphics;
  private userHpText!: Phaser.GameObjects.Text;
  private userChargeText!: Phaser.GameObjects.Text;
  private opponentHpText!: Phaser.GameObjects.Text;
  private opponentChargeText!: Phaser.GameObjects.Text;
  private skillButtons: Phaser.GameObjects.Container[] = [];
  private opponentAI: OpponentAI | null = null;
  private userGlow!: Phaser.GameObjects.Graphics;
  private opponentGlow!: Phaser.GameObjects.Graphics;
  private turnHUD!: Phaser.GameObjects.Container;
  private powerHUD!: Phaser.GameObjects.Container;
  private turnCountText!: Phaser.GameObjects.Text;
  private activeSkillBtn!: Phaser.GameObjects.Container;
  private queuedIconsContainer!: Phaser.GameObjects.Container;
  private opponentQueuedIconsContainer!: Phaser.GameObjects.Container;

  protected onInit() {
    this.isGameOver = false;

    // ── Scale layout scalars ──────────────────────────────────────────────────
    this.CELL_SIZE = Math.floor(88 * this.scaleFactor);
    this.BASE_GRID_WIDTH = this.CELL_SIZE * GRID_SIZE;

    // HUD_CONFIG values are stored already-scaled.
    // Do NOT multiply HUD_CONFIG members by scaleFactor a second time elsewhere.
    this.HUD_CONFIG = {
      ...this.HUD_CONFIG,
      userWidth: Math.floor(720 * this.scaleFactor),
      opponentWidth: Math.floor(480 * this.scaleFactor),
      userHeight: Math.floor(270 * this.scaleFactor),
      opponentHeight: Math.floor(180 * this.scaleFactor),
      userBarWidth: Math.floor(608 * this.scaleFactor),
      opponentBarWidth: Math.floor(372 * this.scaleFactor),
      padding: Math.floor(20 * this.scaleFactor),
      barHeight: Math.floor(21 * this.scaleFactor),   // stored scaled ✓
      skillSize: Math.floor(128 * this.scaleFactor),
      marginX: Math.floor(24 * this.scaleFactor),
      marginY: Math.floor(96 * this.scaleFactor),
    };

    // Load gem colour map from registry
    const registry = GemRegistry.getInstance();
    const normalGems = registry.getAllGems().filter(g => g.type === 'normal');
    normalGems.forEach(gem => {
      if (gem.shape && gem.color) {
        const shapeType = ShapeType[gem.shape as keyof typeof ShapeType];
        this.colors[shapeType] = parseInt(gem.color.replace('0x', ''), 16);
      }
    });

    if (Object.keys(this.colors).length === 0) {
      this.colors = {
        [ShapeType.TRIANGLE]: 0x3b82f6,
        [ShapeType.SQUARE]: 0x22c55e,
        [ShapeType.PENTAGON]: 0xec4899,
        [ShapeType.HEXAGON]: 0xeab308,
        [ShapeType.STAR]: 0xef4444,
        [ShapeType.NONE]: 0x8b5cf6,
      };
    }
  }

  preload() {
    this.createTextures();
  }

  private createTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    const cs = this.CELL_SIZE;

    Object.entries(this.colors).forEach(([type, color]) => {
      graphics.clear();
      const size = cs * 0.7;
      const center = cs / 2;

      if (type === ShapeType.NONE) {
        graphics.fillStyle(0x111111, 1);
        graphics.fillCircle(center, center, size / 2 + 4);
        graphics.lineStyle(3, 0x8b5cf6, 1);
        graphics.strokeCircle(center, center, size / 2 + 4);
        graphics.fillStyle(0x8b5cf6, 0.5);
        graphics.fillCircle(center, center, size / 3);
        graphics.fillStyle(0xffffff, 0.8);
        graphics.fillCircle(center, center, size / 6);
      } else {
        this.drawGem(graphics, type as ShapeType, color, center, size);
      }

      graphics.generateTexture(`shape_${type}`, cs, cs);
    });

    const skillIcons = ['slash', 'fury', 'fireball', 'arcane_focus', 'ice_lance'];
    skillIcons.forEach(icon => {
      graphics.clear();
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRect(0, 0, 64, 64);
      graphics.generateTexture(`icon_${icon}`, 64, 64);
    });

    // Pulsar arrows + ring
    graphics.clear();
    graphics.fillStyle(0xffffff, 0.9);
    graphics.beginPath(); graphics.moveTo(cs * 0.1, cs / 2); graphics.lineTo(cs * 0.3, cs * 0.35); graphics.lineTo(cs * 0.3, cs * 0.65); graphics.closePath(); graphics.fillPath();
    graphics.beginPath(); graphics.moveTo(cs * 0.9, cs / 2); graphics.lineTo(cs * 0.7, cs * 0.35); graphics.lineTo(cs * 0.7, cs * 0.65); graphics.closePath(); graphics.fillPath();
    graphics.beginPath(); graphics.moveTo(cs / 2, cs * 0.1); graphics.lineTo(cs * 0.35, cs * 0.3); graphics.lineTo(cs * 0.65, cs * 0.3); graphics.closePath(); graphics.fillPath();
    graphics.beginPath(); graphics.moveTo(cs / 2, cs * 0.9); graphics.lineTo(cs * 0.35, cs * 0.7); graphics.lineTo(cs * 0.65, cs * 0.7); graphics.closePath(); graphics.fillPath();
    graphics.lineStyle(3, 0xffffff, 0.8);
    graphics.strokeCircle(cs / 2, cs / 2, cs * 0.2);
    graphics.generateTexture('special_pulsar', cs, cs);

    // Missile
    graphics.clear();
    graphics.fillStyle(0xffffff, 0.9);
    graphics.beginPath(); graphics.moveTo(cs / 2, cs * 0.15); graphics.lineTo(cs * 0.65, cs * 0.4); graphics.lineTo(cs * 0.65, cs * 0.7); graphics.lineTo(cs * 0.35, cs * 0.7); graphics.lineTo(cs * 0.35, cs * 0.4); graphics.closePath(); graphics.fillPath();
    graphics.fillStyle(0xff3300, 0.9);
    graphics.beginPath(); graphics.moveTo(cs * 0.35, cs * 0.5); graphics.lineTo(cs * 0.15, cs * 0.75); graphics.lineTo(cs * 0.35, cs * 0.7); graphics.closePath(); graphics.fillPath();
    graphics.beginPath(); graphics.moveTo(cs * 0.65, cs * 0.5); graphics.lineTo(cs * 0.85, cs * 0.75); graphics.lineTo(cs * 0.65, cs * 0.7); graphics.closePath(); graphics.fillPath();
    graphics.fillStyle(0x00ffff, 0.9); graphics.fillCircle(cs / 2, cs * 0.45, cs * 0.1);
    graphics.fillStyle(0xffaa00, 0.9);
    graphics.beginPath(); graphics.moveTo(cs * 0.4, cs * 0.7); graphics.lineTo(cs / 2, cs * 0.9); graphics.lineTo(cs * 0.6, cs * 0.7); graphics.closePath(); graphics.fillPath();
    graphics.generateTexture('special_missile', cs, cs);

    // Bomb
    graphics.clear();
    graphics.lineStyle(4, 0x444444, 1); graphics.strokeCircle(cs / 2, cs / 2, cs * 0.35);
    graphics.lineStyle(2, 0xffffff, 0.8); graphics.strokeCircle(cs / 2, cs / 2, cs * 0.35);
    graphics.lineStyle(3, 0xffaa00, 1);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      graphics.moveTo(cs / 2 + Math.cos(angle) * cs * 0.35, cs / 2 + Math.sin(angle) * cs * 0.35);
      graphics.lineTo(cs / 2 + Math.cos(angle) * cs * 0.45, cs / 2 + Math.sin(angle) * cs * 0.45);
    }
    graphics.strokePath();
    graphics.fillStyle(0xff3300, 1); graphics.fillCircle(cs * 0.75, cs * 0.25, cs * 0.12);
    graphics.fillStyle(0xffaa00, 1); graphics.fillCircle(cs * 0.75, cs * 0.25, cs * 0.08);
    graphics.fillStyle(0xffffff, 1); graphics.fillCircle(cs * 0.75, cs * 0.25, cs * 0.04);
    graphics.generateTexture('special_bomb', cs, cs);

    // Parasite
    graphics.clear();
    graphics.lineStyle(3, 0xd946ef, 1);
    graphics.fillStyle(0x8b5cf6, 0.9);
    this.drawStar(graphics, cs / 2, cs / 2, 12, cs * 0.45, cs * 0.2);
    graphics.fillStyle(0xffffff, 0.8);
    graphics.fillCircle(cs / 2, cs / 2, cs * 0.1);
    graphics.generateTexture('special_parasite', cs, cs);

    // Particles
    graphics.clear(); graphics.fillStyle(0xffffff, 1); graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('particle', 8, 8);
    graphics.clear(); graphics.fillStyle(0xffffff, 0.8); graphics.fillCircle(2, 2, 2);
    graphics.generateTexture('star_particle', 4, 4);
  }

  private drawGem(graphics: Phaser.GameObjects.Graphics, type: ShapeType, color: number, center: number, size: number) {
    const colorObj = Phaser.Display.Color.ValueToColor(color);
    const lightColor = colorObj.clone().lighten(30).color;
    const darkColor  = colorObj.clone().darken(30).color;
    graphics.fillStyle(0x000000, 0.4); this.drawShapePath(graphics, type, center, center + 4, size); graphics.fillPath();
    graphics.fillStyle(darkColor, 1);  this.drawShapePath(graphics, type, center, center,     size); graphics.fillPath();
    graphics.fillStyle(color, 1);      this.drawShapePath(graphics, type, center, center,     size * 0.85); graphics.fillPath();
    graphics.fillStyle(lightColor, 1); this.drawShapePath(graphics, type, center, center,     size * 0.5);  graphics.fillPath();
    graphics.fillStyle(0xffffff, 0.5);
    graphics.beginPath();
    graphics.arc(center - size * 0.15, center - size * 0.15, size * 0.15, 0, Math.PI * 2);
    graphics.fillPath();
  }

  private drawShapePath(graphics: Phaser.GameObjects.Graphics, type: ShapeType, x: number, y: number, size: number) {
    graphics.beginPath();
    switch (type) {
      case ShapeType.TRIANGLE:
        graphics.moveTo(x, y - size / 2); graphics.lineTo(x - size / 2, y + size / 2); graphics.lineTo(x + size / 2, y + size / 2); break;
      case ShapeType.SQUARE:
        graphics.moveTo(x - size / 2, y - size / 2); graphics.lineTo(x + size / 2, y - size / 2); graphics.lineTo(x + size / 2, y + size / 2); graphics.lineTo(x - size / 2, y + size / 2); break;
      case ShapeType.PENTAGON:
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; const px = x + Math.cos(a) * (size / 2); const py = y + Math.sin(a) * (size / 2); i === 0 ? graphics.moveTo(px, py) : graphics.lineTo(px, py); } break;
      case ShapeType.HEXAGON:
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; const px = x + Math.cos(a) * (size / 2); const py = y + Math.sin(a) * (size / 2); i === 0 ? graphics.moveTo(px, py) : graphics.lineTo(px, py); } break;
      case ShapeType.STAR: {
        const outer = size / 2; const inner = size / 4;
        for (let i = 0; i < 10; i++) { const r = i % 2 === 0 ? outer : inner; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const px = x + Math.cos(a) * r; const py = y + Math.sin(a) * r; i === 0 ? graphics.moveTo(px, py) : graphics.lineTo(px, py); }
        break;
      }
      case ShapeType.NONE:
        graphics.arc(x, y, size / 2, 0, Math.PI * 2); break;
    }
    graphics.closePath();
  }

  private drawStar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, points: number, outerRadius: number, innerRadius: number) {
    const step = Math.PI / points;
    graphics.beginPath();
    for (let i = 0; i < 2 * points; i++) {
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const a = i * step - Math.PI / 2;
      const px = x + Math.cos(a) * r; const py = y + Math.sin(a) * r;
      i === 0 ? graphics.moveTo(px, py) : graphics.lineTo(px, py);
    }
    graphics.closePath(); graphics.fillPath(); graphics.strokePath();
  }

  create(data: { userCharId?: string; opponentCharId?: string }) {
    this.logic = new GameLogic(GRID_SIZE);
    this.logic.initializeGrid();
    while (!this.logic.hasPossibleMoves()) { this.logic.initializeGrid(); }
    this.effectManager = new EffectManager(this);

    const width   = this.gameWidth;
    const height  = this.gameHeight;
    const cs      = this.CELL_SIZE;
    const gridW   = GRID_SIZE * cs;
    const offsetX = this.getOffsetX();
    const offsetY = this.getOffsetY();

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a2a, 0x1a0a3a, 0x0a1a3a, 0x050515, 1, 1, 1, 1);
    bg.fillRect(0, 0, width, height);

    this.add.particles(0, 0, 'star_particle', {
      x: { min: 0, max: width }, y: { min: height, max: height + 100 },
      lifespan: 10000, speedY: { min: -10, max: -30 }, speedX: { min: -10, max: 10 },
      scale: { start: 0.5, end: 1.5 }, alpha: { start: 0, end: 0.5, ease: 'Sine.easeInOut' },
      quantity: 1, frequency: 300, blendMode: 'ADD',
    });

    this.add.image(width / 2, height / 2, 'menu_bg').setDisplaySize(width, height).setAlpha(0.2);

    const boardBg = this.add.graphics();
    boardBg.lineStyle(6, 0x4a00e0, 0.4); boardBg.strokeRoundedRect(offsetX - 12, offsetY - 12, gridW + 24, gridW + 24, 20);
    boardBg.fillStyle(0x000000, 0.6);    boardBg.fillRoundedRect(offsetX - 10, offsetY - 10, gridW + 20, gridW + 20, 16);
    boardBg.lineStyle(2, 0xffffff, 0.05);
    for (let i = 1; i < GRID_SIZE; i++) {
      boardBg.moveTo(offsetX + i * cs, offsetY); boardBg.lineTo(offsetX + i * cs, offsetY + gridW);
      boardBg.moveTo(offsetX, offsetY + i * cs); boardBg.lineTo(offsetX + gridW, offsetY + i * cs);
    }
    boardBg.strokePath();

    this.selectionRect = this.add.rectangle(0, 0, cs, cs, 0xffffff, 0);
    this.selectionRect.setOrigin(0.5).setStrokeStyle(4, 0x00ffff, 1).setVisible(false).setDepth(10);
    this.tweens.add({ targets: this.selectionRect, alpha: 0.5, scale: 1.1, duration: 400, yoyo: true, repeat: -1 });

    this.initVisualGrid(offsetX, offsetY);

    this.swipeHandler = new SwipeHandler(this, cs, offsetX, offsetY, GRID_SIZE,
      (start, end) => {
        if (this.isProcessing) return;
        if (CombatManager.getInstance().currentTurn !== 'USER') return;
        this.swapCells(start.r, start.c, end.r, end.c);
      },
      (r, c) => this.updateSelectionRect(r, c),
      (r, c) => this.updateSelectionRect(r, c),
      () => this.selectionRect.setVisible(false),
    );

    this.game.events.emit('SCENE_READY', 'Game_Scene');

    const combatRegistry = CombatRegistry.getInstance();
    const user     = combatRegistry.getCharacter(data?.userCharId     || 'warrior');
    const opponent = combatRegistry.getCharacter(data?.opponentCharId || 'mage');

    if (user && opponent) {
      CombatManager.getInstance().init(user, opponent);
      this.createHUD();
      this.setupCombatListeners();
      this.opponentAI = new OpponentAI(
        this.game, this.logic,
        async (r1, c1, r2, c2) => { await this.swapCells(r1, c1, r2, c2); },
        () => this.powerSurge,
      );
    }

    this.events.on('shutdown', this.shutdown, this);
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  private createHUD() {
    const width   = this.gameWidth;
    const height  = this.gameHeight;
    const offsetX = this.getOffsetX();
    const offsetY = this.getOffsetY();
    const gridW   = this.BASE_GRID_WIDTH;
    const hc      = this.HUD_CONFIG;

    this.opponentHUD = this.add.container(hc.marginX, hc.marginY);
    this.drawCharacterHUD(this.opponentHUD, 'OPPONENT', false);

    this.userHUD = this.add.container(hc.marginX, height - hc.marginY - hc.userHeight);
    this.drawCharacterHUD(this.userHUD, 'USER', true);

    const opponentHudBottom = hc.marginY + hc.opponentHeight;
    const boardTop          = offsetY;
    const opponentQueuedY   = opponentHudBottom + (boardTop - opponentHudBottom) / 2;
    const boardBottom       = offsetY + gridW;
    const userHudTop        = height - hc.marginY - hc.userHeight;
    const userQueuedY       = boardBottom + (userHudTop - boardBottom) / 2;

    this.queuedIconsContainer          = this.add.container(hc.marginX + 240 * this.scaleFactor, userQueuedY);
    this.opponentQueuedIconsContainer  = this.add.container(hc.marginX + 160 * this.scaleFactor, opponentQueuedY);

    this.game.events.on('SKILL_QUEUED', (data: { character: string; icon: string; skillId: string }) => {
      if (data.character === 'USER') {
        const icon = this.add.image(0, 0, data.icon).setDisplaySize(84.5 * this.scaleFactor, 84.5 * this.scaleFactor).setInteractive({ useHandCursor: true });
        icon.setData('skillId', data.skillId);
        icon.on('pointerdown', () => CombatManager.getInstance().removeQueuedSkill(data.skillId, 'USER'));
        this.queuedIconsContainer.add(icon);
        this.queuedIconsContainer.getAll().forEach((child, index) => {
          (child as Phaser.GameObjects.Image).x = (index - (this.queuedIconsContainer.length - 1) / 2) * 92.5 * this.scaleFactor;
        });
        const skillBtn = this.skillButtons.find(btn => btn.getData('skillId') === data.skillId);
        if (skillBtn) skillBtn.setVisible(false);
      } else {
        const icon = this.add.image(0, 0, data.icon).setDisplaySize(37 * this.scaleFactor, 37 * this.scaleFactor);
        icon.setData('skillId', data.skillId);
        this.opponentQueuedIconsContainer.add(icon);
        this.opponentQueuedIconsContainer.getAll().forEach((child, index) => {
          (child as Phaser.GameObjects.Image).x = (index - (this.opponentQueuedIconsContainer.length - 1) / 2) * 46 * this.scaleFactor;
        });
      }
    });

    this.game.events.on('SKILL_DEACTIVATED', (data: { character: string; icon: string; skillId?: string }) => {
      if (data.character === 'USER') {
        const icon = this.queuedIconsContainer.getAll().find(child => {
          const img = child as Phaser.GameObjects.Image;
          return (data.skillId && img.getData('skillId') === data.skillId) || img.texture.key === data.icon;
        });
        if (icon) {
          const skillId = (icon as Phaser.GameObjects.Image).getData('skillId');
          this.queuedIconsContainer.remove(icon, true);
          this.queuedIconsContainer.getAll().forEach((child, index) => {
            (child as Phaser.GameObjects.Image).x = (index - (this.queuedIconsContainer.length - 1) / 2) * 92.5 * this.scaleFactor;
          });
          if (skillId) {
            const skillBtn = this.skillButtons.find(btn => btn.getData('skillId') === skillId);
            if (skillBtn) skillBtn.setVisible(true);
          }
        }
      } else {
        const icon = this.opponentQueuedIconsContainer.getAll().find(child => {
          const img = child as Phaser.GameObjects.Image;
          return (data.skillId && img.getData('skillId') === data.skillId) || img.texture.key === data.icon;
        });
        if (icon) {
          this.opponentQueuedIconsContainer.remove(icon, true);
          this.opponentQueuedIconsContainer.getAll().forEach((child, index) => {
            (child as Phaser.GameObjects.Image).x = (index - (this.opponentQueuedIconsContainer.length - 1) / 2) * 46 * this.scaleFactor;
          });
        }
      }
    });

    // Power HUD
    const powerHudWidth  = 240 * this.scaleFactor;
    const powerHudHeight = 120 * this.scaleFactor;
    const powerHudX      = width - offsetX - powerHudWidth;
    const powerHudY      = 96 * this.scaleFactor;

    this.powerHUD = this.add.container(powerHudX, powerHudY);
    const powerBg = this.add.graphics();
    powerBg.fillStyle(0x000000, 0.5); powerBg.fillRoundedRect(0, 0, powerHudWidth, powerHudHeight, 24 * this.scaleFactor);
    powerBg.lineStyle(2, 0xffffff, 0.1); powerBg.strokeRoundedRect(0, 0, powerHudWidth, powerHudHeight, 24 * this.scaleFactor);
    this.powerHUD.add(powerBg);
    this.powerHUD.add(this.add.text(20 * this.scaleFactor, 22 * this.scaleFactor, 'POWER', { fontFamily: 'monospace', fontSize: `${Math.floor(18 * this.scaleFactor)}px`, color: '#ffffff' }).setAlpha(0.5));
    this.powerText = this.add.text(20 * this.scaleFactor, 52 * this.scaleFactor, '0', { fontFamily: 'monospace', fontSize: `${Math.floor(36 * this.scaleFactor)}px`, fontStyle: 'bold', color: '#fbbf24' });
    this.powerHUD.add(this.powerText);

    // Turn HUD
    const turnHudWidth  = 90 * this.scaleFactor;
    const turnHudHeight = 120 * this.scaleFactor;
    const turnHudX      = powerHudX - 12 * this.scaleFactor - turnHudWidth;
    const turnHudY      = 96 * this.scaleFactor;

    this.turnHUD = this.add.container(turnHudX, turnHudY);
    const turnBg = this.add.graphics();
    turnBg.fillStyle(0x000000, 0.5); turnBg.fillRoundedRect(0, 0, turnHudWidth, turnHudHeight, 24 * this.scaleFactor);
    turnBg.lineStyle(2, 0xffffff, 0.1); turnBg.strokeRoundedRect(0, 0, turnHudWidth, turnHudHeight, 24 * this.scaleFactor);
    this.turnHUD.add(turnBg);
    this.turnHUD.add(this.add.text(turnHudWidth / 2, 22 * this.scaleFactor, 'TURNS', { fontFamily: 'monospace', fontSize: `${Math.floor(18 * this.scaleFactor)}px`, color: '#ffffff' }).setOrigin(0.5, 0).setAlpha(0.5));
    this.turnCountText = this.add.text(turnHudWidth / 2, 52 * this.scaleFactor, '1', { fontFamily: 'monospace', fontSize: `${Math.floor(36 * this.scaleFactor)}px`, fontStyle: 'bold', color: '#3b82f6' }).setOrigin(0.5, 0);
    this.turnHUD.add(this.turnCountText);

    this.ActiveSkillButton();
    this.handleTurnSwitched(CombatManager.getInstance().currentTurn);
  }

  private ActiveSkillButton() {
    const width   = this.gameWidth;
    const height  = this.gameHeight;
    const offsetX = this.getOffsetX();
    const hc      = this.HUD_CONFIG;
    const combat  = CombatManager.getInstance();
    const user    = combat.user;
    if (!user || !user.loadout.active) return;

    const skillId = user.loadout.active;
    const skill   = CombatRegistry.getInstance().getSkill(skillId);
    const size    = 180 * this.scaleFactor;
    const x       = width - offsetX - size / 2;
    const y       = height - hc.marginY - hc.userHeight / 2;

    this.activeSkillBtn = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.8); bg.fillCircle(0, 0, size / 2);
    bg.lineStyle(4, 0x10b981, 1); bg.strokeCircle(0, 0, size / 2);
    this.activeSkillBtn.add(bg);
    const icon  = this.add.text(0, -15 * this.scaleFactor, '⚡', { fontSize: `${Math.floor(60 * this.scaleFactor)}px` }).setOrigin(0.5);
    const label = this.add.text(0, 35 * this.scaleFactor, skill ? skill.name.toUpperCase() : 'SKILL', { fontFamily: 'monospace', fontSize: `${Math.floor(20 * this.scaleFactor)}px`, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    const costText = this.add.text(0, 60 * this.scaleFactor, skill ? `${skill.chargeCost} EP` : '', { fontFamily: 'monospace', fontSize: `${Math.floor(16 * this.scaleFactor)}px`, color: '#3b82f6' }).setOrigin(0.5);
    this.activeSkillBtn.add([icon, label, costText]);

    this.activeSkillBtn.setInteractive(new Phaser.Geom.Circle(0, 0, size / 2), Phaser.Geom.Circle.Contains);
    this.activeSkillBtn.on('pointerover', () => {
      SoundManager.getInstance().play(SoundType.SELECT);
      this.tweens.add({ targets: this.activeSkillBtn, scale: 1.1, duration: 100 });
      bg.clear(); bg.fillStyle(0x10b981, 0.2); bg.fillCircle(0, 0, size / 2); bg.lineStyle(4, 0x34d399, 1); bg.strokeCircle(0, 0, size / 2);
    });
    this.activeSkillBtn.on('pointerout', () => {
      this.tweens.add({ targets: this.activeSkillBtn, scale: 1.0, duration: 100 });
      bg.clear(); bg.fillStyle(0x000000, 0.8); bg.fillCircle(0, 0, size / 2); bg.lineStyle(4, 0x10b981, 1); bg.strokeCircle(0, 0, size / 2);
    });
    this.activeSkillBtn.on('pointerdown', () => {
      SoundManager.getInstance().play(SoundType.CLICK);
      this.tweens.add({ targets: this.activeSkillBtn, scale: 0.9, duration: 50, yoyo: true });
      const c = CombatManager.getInstance();
      const u = c.user;
      if (u && skill && u.currentCharge >= skill.chargeCost && c.currentTurn === 'USER') {
        this.game.events.emit('SKILL_ACTIVATED', { character: 'USER', skillId, powerSurge: this.powerSurge });
      } else {
        this.tweens.add({ targets: this.activeSkillBtn, x: x + 5 * this.scaleFactor, duration: 50, yoyo: true, repeat: 3 });
        if (u && skill && u.currentCharge < skill.chargeCost && this.userChargeBar) {
          this.tweens.add({ targets: this.userChargeBar, alpha: 0.2, duration: 100, yoyo: true, repeat: 1 });
        }
      }
    });
  }

  private drawCharacterHUD(container: Phaser.GameObjects.Container, type: string, isUser: boolean) {
    const combat = CombatManager.getInstance();
    const char   = isUser ? combat.user : combat.opponent;
    const hc     = this.HUD_CONFIG;
    if (!char) return;

    const hudWidth  = isUser ? hc.userWidth  : hc.opponentWidth;
    const hudHeight = isUser ? hc.userHeight : hc.opponentHeight;

    const glow = this.add.graphics(); glow.setAlpha(0); container.add(glow);
    if (isUser) this.userGlow = glow; else this.opponentGlow = glow;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.5); bg.fillRoundedRect(0, 0, hudWidth, hudHeight, 20 * this.scaleFactor);
    bg.lineStyle(2, isUser ? 0x10b981 : 0xef4444, 0.3); bg.strokeRoundedRect(0, 0, hudWidth, hudHeight, 20 * this.scaleFactor);
    container.add(bg);

    this.updateGlow(glow, hudWidth, hudHeight, isUser ? 0x10b981 : 0xef4444);

    container.add(this.add.text(15 * this.scaleFactor, 15 * this.scaleFactor, char.name.toUpperCase(), { fontFamily: 'monospace', fontSize: `${Math.floor(24 * this.scaleFactor)}px`, fontStyle: 'bold', color: isUser ? '#34d399' : '#f87171' }));
    container.add(this.add.text(hudWidth - 15 * this.scaleFactor, 15 * this.scaleFactor, char.classType, { fontFamily: 'monospace', fontSize: `${Math.floor(22 * this.scaleFactor)}px`, color: '#ffffff' }).setOrigin(1, 0).setAlpha(0.5));
    container.add(this.add.image(hudWidth - 15 * this.scaleFactor, 45 * this.scaleFactor, `shape_${char.linkedGem}`).setScale(2.5 * this.scaleFactor).setOrigin(1, 0));

    // HP bar
    const barWidth = isUser ? hc.userBarWidth : hc.opponentBarWidth;
    container.add(this.add.text(15 * this.scaleFactor, 55 * this.scaleFactor, 'HP', { fontSize: `${Math.floor(15 * this.scaleFactor)}px`, color: '#ffffff' }).setAlpha(0.7));
    const hpValText = this.add.text(15 * this.scaleFactor + barWidth, 55 * this.scaleFactor, `${Math.floor(char.currentHp)}/${char.maxHp}`, { fontSize: `${Math.floor(15 * this.scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff' }).setOrigin(1, 0).setAlpha(0.7);
    container.add(hpValText);
    if (isUser) this.userHpText = hpValText; else this.opponentHpText = hpValText;
    const hpBar = this.add.graphics(); container.add(hpBar);
    if (isUser) this.userHpBar = hpBar; else this.opponentHpBar = hpBar;
    this.updateBar(hpBar, char.currentHp / char.maxHp, isUser ? hc.colors.hp : hc.colors.opponentHp, barWidth, 70 * this.scaleFactor);

    // Charge bar
    container.add(this.add.text(15 * this.scaleFactor, 95 * this.scaleFactor, 'CHARGE', { fontSize: `${Math.floor(15 * this.scaleFactor)}px`, color: '#ffffff' }).setAlpha(0.7));
    const chargeValText = this.add.text(15 * this.scaleFactor + barWidth, 95 * this.scaleFactor, `${Math.floor(char.currentCharge)}/${char.maxCharge}`, { fontSize: `${Math.floor(15 * this.scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff' }).setOrigin(1, 0).setAlpha(0.7);
    container.add(chargeValText);
    if (isUser) this.userChargeText = chargeValText; else this.opponentChargeText = chargeValText;
    const chargeBar = this.add.graphics(); container.add(chargeBar);
    if (isUser) this.userChargeBar = chargeBar; else this.opponentChargeBar = chargeBar;
    this.updateBar(chargeBar, char.currentCharge / char.maxCharge, isUser ? hc.colors.charge : hc.colors.opponentCharge, barWidth, 110 * this.scaleFactor);

    // Stats
    const statsContainer = this.add.container(15 * this.scaleFactor, 145 * this.scaleFactor);
    const statStyle = { fontSize: `${Math.floor(14 * this.scaleFactor)}px`, fontFamily: 'monospace', color: '#aaaaaa' };
    const valStyle  = { fontSize: `${Math.floor(14 * this.scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' };
    [
      { label: 'STR', val: char.stats.strength,   x: 0 },
      { label: 'END', val: char.stats.endurance,  x: 68  * this.scaleFactor },
      { label: 'PWR', val: char.stats.power,       x: 135 * this.scaleFactor },
      { label: 'RES', val: char.stats.resistance, x: 202 * this.scaleFactor },
      { label: 'SPD', val: char.stats.speed,       x: 270 * this.scaleFactor },
      { label: 'ACC', val: char.stats.accuracy,    x: 338 * this.scaleFactor },
    ].forEach(s => {
      statsContainer.add(this.add.text(s.x, 0, `${s.label}:`, statStyle));
      statsContainer.add(this.add.text(s.x + 22 * this.scaleFactor, 0, s.val.toString(), valStyle));
    });
    container.add(statsContainer);

    if (isUser) {
      const skillY      = 190 * this.scaleFactor;
      const stackSkills = char.loadout.stacks || [];
      const numSkills   = stackSkills.length;
      if (numSkills > 0) {
        const padding       = 15 * this.scaleFactor;
        const spacing       = 10 * this.scaleFactor;
        const availableWidth = hudWidth - padding * 2;
        let btnWidth        = (availableWidth - (numSkills - 1) * spacing) / numSkills;
        btnWidth            = Math.max(128 * this.scaleFactor, Math.min(200 * this.scaleFactor, btnWidth));
        const totalWidth    = numSkills * btnWidth + (numSkills - 1) * spacing;
        const isOverflow    = totalWidth > availableWidth;

        const skillListContainer = this.add.container(0, 0);
        container.add(skillListContainer);

        if (isOverflow) {
          const worldX    = container.x + padding;
          const worldY    = container.y + skillY;
          const maskShape = this.make.graphics({ x: 0, y: 0 });
          maskShape.fillStyle(0xffffff); maskShape.fillRoundedRect(worldX, worldY, availableWidth, 60 * this.scaleFactor, 8 * this.scaleFactor);
          skillListContainer.setMask(maskShape.createGeometryMask());
          skillListContainer.x = padding;
          const scrollHitArea = new Phaser.Geom.Rectangle(0, skillY, totalWidth, 60 * this.scaleFactor);
          skillListContainer.setInteractive(scrollHitArea, Phaser.Geom.Rectangle.Contains);
          this.input.setDraggable(skillListContainer);
          skillListContainer.on('drag', (_pointer: any, dragX: number) => {
            skillListContainer.x = Phaser.Math.Clamp(dragX, padding - (totalWidth - availableWidth), padding);
          });
        } else {
          skillListContainer.x = (hudWidth - totalWidth) / 2;
        }

        stackSkills.forEach((skillId, i) => {
          const skillBtn = this.add.container(i * (btnWidth + spacing), skillY);
          skillBtn.setData('skillId', skillId);
          const btnBg = this.add.graphics();
          btnBg.fillStyle(0xffffff, 0.1); btnBg.fillRoundedRect(0, 0, btnWidth, 40 * this.scaleFactor, 8 * this.scaleFactor);
          skillBtn.add(btnBg);
          const skill = CombatRegistry.getInstance().getSkill(skillId);
          if (skill) {
            skillBtn.add(this.add.image(10 * this.scaleFactor, 20 * this.scaleFactor, skill.icon).setDisplaySize(24 * this.scaleFactor, 24 * this.scaleFactor).setOrigin(0, 0.5));
            const charW        = 6 * this.scaleFactor;
            const costLabelW   = 25 * this.scaleFactor;
            const availW       = btnWidth - 40 * this.scaleFactor - costLabelW - 10 * this.scaleFactor;
            const maxChars     = Math.floor(availW / charW);
            let displayName    = skill.name;
            if (displayName.length > maxChars) displayName = displayName.substring(0, Math.max(0, maxChars - 3)) + '...';
            skillBtn.add(this.add.text(40 * this.scaleFactor, 20 * this.scaleFactor, displayName, { fontSize: `${Math.floor(10 * this.scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff' }).setOrigin(0, 0.5));
            skillBtn.add(this.add.text(btnWidth - 10 * this.scaleFactor, 20 * this.scaleFactor, `${skill.chargeCost}`, { fontSize: `${Math.floor(10 * this.scaleFactor)}px`, fontFamily: 'monospace', color: '#fbbf24', fontStyle: 'bold' }).setOrigin(1, 0.5));
          }
          skillBtn.setInteractive(new Phaser.Geom.Rectangle(0, 0, btnWidth, 40 * this.scaleFactor), Phaser.Geom.Rectangle.Contains);
          skillBtn.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY) > 10) return;
            const c2   = CombatManager.getInstance();
            const u    = c2.user;
            const sk   = CombatRegistry.getInstance().getSkill(skillId);
            if (u && sk && u.currentCharge >= sk.chargeCost && c2.currentTurn === 'USER') {
              this.game.events.emit('SKILL_ACTIVATED', { character: 'USER', skillId, moveScore: 0, comboNumber: 1, powerSurge: this.powerSurge });
            } else if (u && sk) {
              this.tweens.add({ targets: skillBtn, x: skillBtn.x + 5, duration: 50, yoyo: true, repeat: 3 });
              if (u.currentCharge < sk.chargeCost && this.userChargeBar) {
                this.tweens.add({ targets: this.userChargeBar, alpha: 0.2, duration: 100, yoyo: true, repeat: 1 });
              }
            }
          });
          skillListContainer.add(skillBtn);
          this.skillButtons.push(skillBtn);
        });
      }
    }
  }

  /**
   * Renders a progress bar.
   * @param y  Y position in LOCAL container space, already scaled.
   * @param width  Bar width in already-scaled pixels.
   *
   * NOTE: HUD_CONFIG.barHeight is stored pre-scaled in onInit(). Use it
   * directly — do NOT multiply by scaleFactor here.
   */
  private updateBar(graphics: Phaser.GameObjects.Graphics, percent: number, color: number, width: number, y: number) {
    const hc = this.HUD_CONFIG;
    graphics.clear();
    // Background track
    graphics.fillStyle(0x000000, 0.5);
    graphics.fillRoundedRect(15 * this.scaleFactor, y, width, hc.barHeight, 7 * this.scaleFactor);
    // Fill
    graphics.fillStyle(color, 1);
    if (percent > 0) {
      graphics.fillRoundedRect(15 * this.scaleFactor, y, width * percent, hc.barHeight, 7 * this.scaleFactor);
    }
  }

  // ─── Combat listeners ─────────────────────────────────────────────────────

  private setupCombatListeners() {
    this.game.events.on('HP_UPDATED',     this.handleHpUpdated,     this);
    this.game.events.on('CHARGE_UPDATED', this.handleChargeUpdated, this);
    this.game.events.on('POWER_UPDATE',   this.handlePowerUpdate,   this);
    this.game.events.on('TURN_SWITCHED',  this.handleTurnSwitched,  this);
    this.game.events.on('SKILL_EXECUTED', this.handleSkillExecuted, this);
    this.game.events.on('SKILL_MISSED',   this.handleSkillMissed,   this);
    this.game.events.on('GAME_OVER',      this.handleGameOver,      this);
  }

  private handleGameOver = (data: { winner: string }) => {
    if (this.isGameOver) return;
    this.isGameOver   = true;
    this.isProcessing = true;
    const isUserWinner = data.winner === 'USER';
    const width  = this.gameWidth;
    const height = this.gameHeight;
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setInteractive().setDepth(1000);
    const title   = this.add.text(width / 2, height / 2 - 50 * this.scaleFactor, isUserWinner ? 'VICTORY!' : 'DEFEAT...', { fontFamily: 'monospace', fontSize: `${Math.floor(84 * this.scaleFactor)}px`, fontStyle: 'bold', color: isUserWinner ? '#10b981' : '#ef4444', stroke: '#ffffff', strokeThickness: 8 * this.scaleFactor }).setOrigin(0.5).setScale(0).setDepth(1001);
    const powerLabel = this.add.text(width / 2, height / 2 + 50 * this.scaleFactor, `Final Power: ${this.powerSurge}`, { fontFamily: 'monospace', fontSize: `${Math.floor(32 * this.scaleFactor)}px`, color: '#ffffff' }).setOrigin(0.5).setAlpha(0).setDepth(1001);
    const restartBtn = this.add.container(width / 2, height / 2 + 150 * this.scaleFactor);
    restartBtn.setDepth(1001);
    const btnBg   = this.add.rectangle(0, 0, 200 * this.scaleFactor, 60 * this.scaleFactor, 0xffffff, 0.2).setStrokeStyle(2 * this.scaleFactor, 0xffffff);
    const btnText = this.add.text(0, 0, 'RESTART', { fontFamily: 'monospace', fontSize: `${Math.floor(24 * this.scaleFactor)}px`, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    restartBtn.add([btnBg, btnText]);
    restartBtn.setSize(200 * this.scaleFactor, 60 * this.scaleFactor).setInteractive({ useHandCursor: true }).setAlpha(0);
    restartBtn.on('pointerover', () => btnBg.setFillStyle(0xffffff, 0.4));
    restartBtn.on('pointerout',  () => btnBg.setFillStyle(0xffffff, 0.2));
    restartBtn.on('pointerdown', () => this.scene.restart());
    this.tweens.add({ targets: title, scale: 1, duration: 800, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [powerLabel, restartBtn], alpha: 1, duration: 500, delay: 800 });
  };

  private handleSkillMissed = (data: { skill: any; character: string }) => {
    const isUser = data.character === 'USER';
    const x = this.gameWidth / 2;
    const y = isUser ? this.gameHeight - 200 * this.scaleFactor : 200 * this.scaleFactor;
    const missText = this.add.text(x, y, 'MISSED!', { fontFamily: 'monospace', fontSize: `${Math.floor(48 * this.scaleFactor)}px`, fontStyle: 'bold', color: '#ef4444', stroke: '#000000', strokeThickness: 6 * this.scaleFactor }).setOrigin(0.5);
    this.tweens.add({ targets: missText, y: y - 100 * this.scaleFactor, alpha: 0, scale: 1.5, duration: 1000, ease: 'Cubic.easeOut', onComplete: () => missText.destroy() });
  };

  private handleSkillExecuted = (data: { skill: any; character: string }) => {
    const isUser = data.character === 'USER';
    const x = this.gameWidth / 2;
    const y = isUser ? this.gameHeight - 200 * this.scaleFactor : 200 * this.scaleFactor;
    const text = this.add.text(x, y, data.skill.name.toUpperCase(), { fontFamily: 'monospace', fontSize: `${Math.floor(48 * this.scaleFactor)}px`, fontStyle: 'bold', color: isUser ? '#10b981' : '#ef4444', stroke: '#000000', strokeThickness: 6 * this.scaleFactor }).setOrigin(0.5).setAlpha(0).setScale(0.5);
    this.tweens.add({ targets: text, alpha: 1, scale: 1.2, duration: 300, ease: 'Back.easeOut', onComplete: () => {
      this.tweens.add({ targets: text, alpha: 0, y: y - 50 * this.scaleFactor, duration: 500, delay: 500, ease: 'Power2', onComplete: () => text.destroy() });
    }});
  };

  private handleTurnSwitched = (turn: string) => {
    const combat = CombatManager.getInstance();
    this.turnCountText.setText(combat.turnCount.toString());
    if (turn === 'USER') {
      this.tweens.add({ targets: this.userGlow,     alpha: 1, duration: 300 });
      this.tweens.add({ targets: this.opponentGlow, alpha: 0, duration: 300 });
    } else {
      this.tweens.add({ targets: this.userGlow,     alpha: 0, duration: 300 });
      this.tweens.add({ targets: this.opponentGlow, alpha: 1, duration: 300 });
    }
  };

  private updateGlow(graphics: Phaser.GameObjects.Graphics, width: number, height: number, color: number) {
    graphics.clear();
    for (let i = 1; i <= 10; i++) {
      graphics.lineStyle(i * 2 * this.scaleFactor, color, 0.1 / i);
      graphics.strokeRoundedRect(-i * this.scaleFactor, -i * this.scaleFactor, width + i * 2 * this.scaleFactor, height + i * 2 * this.scaleFactor, 20 * this.scaleFactor + i * this.scaleFactor);
    }
    graphics.lineStyle(3 * this.scaleFactor, color, 0.5);
    graphics.strokeRoundedRect(0, 0, width, height, 20 * this.scaleFactor);
  }

  private handleHpUpdated = (data: any) => {
    const isUser  = data.character === 'USER';
    const bar     = isUser ? this.userHpBar     : this.opponentHpBar;
    const text    = isUser ? this.userHpText    : this.opponentHpText;
    const color   = isUser ? this.HUD_CONFIG.colors.hp : this.HUD_CONFIG.colors.opponentHp;
    const width   = isUser ? this.HUD_CONFIG.userBarWidth : this.HUD_CONFIG.opponentBarWidth;
    this.updateBar(bar, data.hp / data.maxHp, color, width, 70 * this.scaleFactor);
    if (text) text.setText(`${Math.floor(data.hp)}/${data.maxHp}`);
  };

  private handleChargeUpdated = (data: any) => {
    const isUser = data.character === 'USER';
    const bar    = isUser ? this.userChargeBar  : this.opponentChargeBar;
    const text   = isUser ? this.userChargeText : this.opponentChargeText;
    const color  = isUser ? this.HUD_CONFIG.colors.charge : this.HUD_CONFIG.colors.opponentCharge;
    const width  = isUser ? this.HUD_CONFIG.userBarWidth  : this.HUD_CONFIG.opponentBarWidth;
    this.updateBar(bar, data.charge / data.maxCharge, color, width, 110 * this.scaleFactor);
    if (text) text.setText(`${Math.floor(data.charge)}/${data.maxCharge}`);
  };

  private handlePowerUpdate = (power: number) => { this.powerText.setText(power.toString()); };

  // ─── Grid ─────────────────────────────────────────────────────────────────

  private initVisualGrid(offsetX: number, offsetY: number) {
    const cs = this.CELL_SIZE;
    for (let r = 0; r < GRID_SIZE; r++) {
      this.visualGrid[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        const cellX = offsetX + c * cs + cs / 2;
        const cellY = offsetY + r * cs + cs / 2;
        this.add.circle(cellX, cellY, cs * 0.4, 0xffffff, 0.03).setBlendMode(Phaser.BlendModes.ADD);
        this.spawnVisualCell(r, c, offsetX, offsetY, this.logic.grid[r][c]!.shape);
      }
    }
  }

  private spawnVisualCell(r: number, c: number, offsetX: number, offsetY: number, shape: ShapeType) {
    const cs = this.CELL_SIZE;
    const x  = offsetX + c * cs + cs / 2;
    const y  = offsetY + r * cs + cs / 2;
    const container = this.add.container(x, y);
    container.add(this.add.sprite(0, 0, `shape_${shape}`));
    container.setSize(cs, cs);
    this.visualGrid[r][c] = { sprite: container };
    return this.visualGrid[r][c];
  }

  public updateSelectionRect(r: number, c: number) {
    if (this.isProcessing) return;
    if (CombatManager.getInstance().currentTurn !== 'USER') return;
    const cell = this.visualGrid[r][c];
    if (cell) { this.selectionRect.setPosition(cell.sprite.x, cell.sprite.y).setVisible(true); }
  }

  public async swapCells(r1: number, c1: number, r2: number, c2: number) {
    this.isProcessing = true;
    const vCell1 = this.visualGrid[r1][c1];
    const vCell2 = this.visualGrid[r2][c2];
    const lCell1 = this.logic.grid[r1][c1];
    const lCell2 = this.logic.grid[r2][c2];
    if (!vCell1 || !vCell2 || !lCell1 || !lCell2) { this.isProcessing = false; return; }

    await Promise.all([this.animateMove(vCell1.sprite, vCell2.sprite.x, vCell2.sprite.y), this.animateMove(vCell2.sprite, vCell1.sprite.x, vCell1.sprite.y)]);
    this.logic.swap(r1, c1, r2, c2);
    this.visualGrid[r1][c1] = vCell2;
    this.visualGrid[r2][c2] = vCell1;

    const newCell1 = this.logic.grid[r1][c1]!;
    const newCell2 = this.logic.grid[r2][c2]!;

    if (newCell1.special === SpecialType.PARASITE || newCell2.special === SpecialType.PARASITE) {
      const parasite = newCell1.special === SpecialType.PARASITE ? newCell1 : newCell2;
      const other    = newCell1.special === SpecialType.PARASITE ? newCell2 : newCell1;
      await this.effectManager.handleParasiteCombination(parasite, other, r2, c2);
      await this.processBoard();
      CombatManager.getInstance().switchTurn();
      this.isProcessing = false; return;
    }

    if (newCell1.special !== SpecialType.NONE && newCell2.special !== SpecialType.NONE) {
      await this.effectManager.handleSpecialCombination(newCell1, newCell2, r2, c2);
      await this.processBoard();
      CombatManager.getInstance().switchTurn();
      this.isProcessing = false; return;
    }

    let matches = this.logic.findMatches();
    if (matches.length === 0) {
      await Promise.all([this.animateMove(vCell1.sprite, vCell2.sprite.x, vCell2.sprite.y), this.animateMove(vCell2.sprite, vCell1.sprite.x, vCell1.sprite.y)]);
      this.logic.swap(r1, c1, r2, c2);
      this.visualGrid[r1][c1] = vCell1;
      this.visualGrid[r2][c2] = vCell2;
    } else {
      matches.forEach(m => {
        if (m.specialCreation) {
          if (m.cells.some(cell => cell.r === r2 && cell.c === c2)) { m.specialCreation.r = r2; m.specialCreation.c = c2; }
          else if (m.cells.some(cell => cell.r === r1 && cell.c === c1)) { m.specialCreation.r = r1; m.specialCreation.c = c1; }
        }
      });
      await this.processBoard(true, matches);
      CombatManager.getInstance().switchTurn();
    }
    this.isProcessing = false;
  }

  private animateMove(obj: Phaser.GameObjects.Container, x: number, y: number, ease = 'Power2') {
    return new Promise<void>(resolve => {
      const emitter = this.add.particles(0, 0, 'particle', { speed: { min: 10, max: 30 }, scale: { start: 0.5, end: 0 }, alpha: { start: 0.5, end: 0 }, lifespan: 300, blendMode: 'ADD', tint: 0xffffff });
      emitter.startFollow(obj);
      this.tweens.add({ targets: obj, x, y, duration: 250, ease, onComplete: () => { emitter.stop(); this.time.delayedCall(300, () => emitter.destroy()); resolve(); } });
    });
  }

  // ─── Offset helpers ───────────────────────────────────────────────────────

  private getOffsetX() {
    return this.getCenteredX(GRID_SIZE * this.CELL_SIZE);
  }

  /**
   * FIX: pass raw logical pixels (−77) — getCenteredY scales internally.
   * Previously passed −77 * scaleFactor which caused double-scaling (sf²).
   */
  private getOffsetY() {
    return this.getCenteredY(GRID_SIZE * this.CELL_SIZE, -77);
  }

  // ─── Special handling ────────────────────────────────────────────────────

  private setSpecial(r: number, c: number, type: SpecialType) {
    const lCell = this.logic.grid[r][c];
    const vCell = this.visualGrid[r][c];
    if (lCell && vCell) {
      lCell.special = type;
      const overlay = this.add.sprite(0, 0, `special_${type}`);
      if (type !== SpecialType.PARASITE) overlay.setBlendMode(Phaser.BlendModes.ADD);
      overlay.setAlpha(0.9);
      vCell.sprite.add(overlay);
      this.tweens.add({ targets: overlay, scale: 1.15, alpha: 1, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private spawnParticles(x: number, y: number, color: number) {
    const emitter = this.add.particles(x, y, 'particle', { speed: { min: 50, max: 150 }, angle: { min: 0, max: 360 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, tint: color, lifespan: 500, quantity: 10, emitting: false });
    emitter.explode();
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private spawnFloatingText(x: number, y: number, text: string) {
    const floatText = this.add.text(x, y, text, { fontSize: '20px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
    this.tweens.add({ targets: floatText, y: y - 40, alpha: 0, duration: 800, ease: 'Power2', onComplete: () => floatText.destroy() });
  }

  private pendingSpecials: LogicCell[] = [];

  public destroyCell(r: number, c: number, isSpecial: boolean, spawnParticlesFlag = true, moveScore = 10, comboNumber = 1): Promise<void> {
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
          this.game.events.emit('GEMS_DESTROYED', { shape: lCell.shape, count: 1, moveScore, comboNumber, powerSurge: this.powerSurge });
        }
        const x = this.getOffsetX() + c * this.CELL_SIZE + this.CELL_SIZE / 2;
        const y = this.getOffsetY() + r * this.CELL_SIZE + this.CELL_SIZE / 2;
        if (spawnParticlesFlag) this.spawnParticles(x, y, this.colors[lCell.shape]);
        this.tweens.add({ targets: vCell.sprite, scale: 1.2, duration: 50, yoyo: true, onComplete: () => {
          this.tweens.add({ targets: vCell.sprite, scale: 0, alpha: 0, duration: 150, onComplete: () => { vCell.sprite.destroy(); resolve(); } });
        }});
      } else { resolve(); }
    });
  }

  private async processBoard(giveScore = true, initialMatches?: MatchResult[]) {
    let matches     = initialMatches || this.logic.findMatches();
    const hasEmpty  = () => this.logic.grid.some(row => row.some(cell => cell === null));
    let comboNumber = 1;

    while (matches.length > 0 || this.pendingSpecials.length > 0 || hasEmpty()) {
      if (matches.length > 0) {
        SoundManager.getInstance().play(SoundType.MATCH);
        const toDestroy     = new Map<string, number>();
        const specialCreations: { r: number; c: number; type: SpecialType; shape: ShapeType }[] = [];
        matches.forEach(match => {
          if (match.specialCreation) specialCreations.push(match.specialCreation);
          match.cells.forEach(m => {
            const key = `${m.r},${m.c}`;
            if (!toDestroy.has(key)) toDestroy.set(key, match.score);
            else toDestroy.set(key, Math.max(toDestroy.get(key)!, match.score));
          });
        });
        const destroyPromises: Promise<void>[] = [];
        for (const [posStr, baseMatchScore] of toDestroy.entries()) {
          const [r, c]        = posStr.split(',').map(Number);
          const isSpecialTgt  = specialCreations.some(sc => sc.r === r && sc.c === c);
          const comboMul      = Math.pow(1.1, comboNumber - 1);
          const matchScore    = Math.round(baseMatchScore * comboMul);
          if (giveScore) {
            this.powerSurge += matchScore;
            this.spawnFloatingText(this.getOffsetX() + c * this.CELL_SIZE + this.CELL_SIZE / 2, this.getOffsetY() + r * this.CELL_SIZE + this.CELL_SIZE / 2, `+${matchScore}`);
          }
          const lCell = this.logic.grid[r][c];
          if (lCell && lCell.shape !== ShapeType.NONE) {
            if (isSpecialTgt) {
              this.game.events.emit('GEMS_DESTROYED', { shape: lCell.shape, count: 1, moveScore: matchScore, comboNumber, powerSurge: this.powerSurge });
              if (lCell.special !== SpecialType.NONE) this.pendingSpecials.push({ ...lCell });
            } else {
              destroyPromises.push(this.destroyCell(r, c, true, true, matchScore, comboNumber));
            }
          }
        }
        await Promise.all(destroyPromises);
        specialCreations.forEach(sc => {
          const lCell = this.logic.grid[sc.r][sc.c];
          const vCell = this.visualGrid[sc.r][sc.c];
          if (!vCell || !lCell) {
            this.logic.grid[sc.r][sc.c] = { r: sc.r, c: sc.c, shape: sc.shape, special: SpecialType.NONE };
            this.spawnVisualCell(sc.r, sc.c, this.getOffsetX(), this.getOffsetY(), sc.shape);
          } else if (lCell.shape !== sc.shape) {
            lCell.shape = sc.shape;
            vCell.sprite.destroy(); this.visualGrid[sc.r][sc.c] = null;
            this.spawnVisualCell(sc.r, sc.c, this.getOffsetX(), this.getOffsetY(), sc.shape);
          }
          this.setSpecial(sc.r, sc.c, sc.type);
        });
      }
      while (this.pendingSpecials.length > 0) { await this.activateSpecial(this.pendingSpecials.shift()!); }
      await this.fillGrid();
      matches = this.logic.findMatches();
      if (matches.length > 0) comboNumber++;
    }
    this.game.events.emit('POWER_UPDATE', this.powerSurge);
    if (!this.logic.hasPossibleMoves()) { await this.shuffleBoard(); }
  }

  public async shuffleBoard() {
    this.isProcessing = true;
    const offsetX = this.getOffsetX();
    const offsetY = this.getOffsetY();
    const destroyPromises: Promise<void>[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.visualGrid[r][c]) {
          const vCell = this.visualGrid[r][c]!;
          destroyPromises.push(new Promise(resolve => {
            this.tweens.add({ targets: vCell.sprite, scale: 0, alpha: 0, duration: 200, onComplete: () => { vCell.sprite.destroy(); resolve(); } });
          }));
          this.visualGrid[r][c] = null;
        }
      }
    }
    await Promise.all(destroyPromises);
    const updates = this.logic.shuffleBoard();
    const spawnPromises: Promise<void>[] = [];
    updates.forEach(u => {
      const vCell = this.spawnVisualCell(u.r, u.c, offsetX, offsetY, u.shape);
      if (u.special !== SpecialType.NONE) this.setSpecial(u.r, u.c, u.special);
      vCell.sprite.scale = 0; vCell.sprite.alpha = 0;
      spawnPromises.push(new Promise(resolve => {
        this.tweens.add({ targets: vCell.sprite, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut', onComplete: () => resolve() });
      }));
    });
    await Promise.all(spawnPromises);
    this.isProcessing = false;
  }

  private async fillGrid() {
    const offsetX  = this.getOffsetX();
    const offsetY  = this.getOffsetY();
    const cs       = this.CELL_SIZE;
    const anims: Promise<void>[] = [];
    const { drops, newCells } = this.logic.applyGravity();
    drops.forEach(drop => {
      const vCell = this.visualGrid[drop.r][drop.c]!;
      this.visualGrid[drop.newR][drop.c] = vCell;
      this.visualGrid[drop.r][drop.c]   = null;
      anims.push(this.animateMove(vCell.sprite, offsetX + drop.c * cs + cs / 2, offsetY + drop.newR * cs + cs / 2, 'Bounce.easeOut'));
    });
    newCells.forEach(nc => {
      const vCell = this.spawnVisualCell(nc.r, nc.c, offsetX, offsetY, nc.shape);
      vCell.sprite.y -= GRID_SIZE * cs;
      anims.push(this.animateMove(vCell.sprite, offsetX + nc.c * cs + cs / 2, offsetY + nc.r * cs + cs / 2, 'Bounce.easeOut'));
    });
    await Promise.all(anims);
  }

  private async activateSpecial(cell: LogicCell) { await this.effectManager.activateSpecial(cell); }

  // ─── Visual effect delegates ───────────────────────────────────────────────

  public playPulsarVisual(r: number, c: number, isHorizontal: boolean, isVertical: boolean, width: number): void {
    const cs  = this.CELL_SIZE;
    const cx  = this.getOffsetX() + c * cs + cs / 2;
    const cy  = this.getOffsetY() + r * cs + cs / 2;
    const bCX = this.getOffsetX() + GRID_SIZE * cs / 2;
    const bCY = this.getOffsetY() + GRID_SIZE * cs / 2;
    if (isHorizontal) {
      const hBeam = this.add.rectangle(bCX, cy, GRID_SIZE * cs, cs * width, 0x00ffff, 0.5).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: hBeam, scaleY: 0, alpha: 0, duration: 400, onComplete: () => hBeam.destroy() });
    }
    if (isVertical) {
      const vBeam = this.add.rectangle(cx, bCY, cs * width, GRID_SIZE * cs, 0xff00ff, 0.5).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: vBeam, scaleX: 0, alpha: 0, duration: 400, onComplete: () => vBeam.destroy() });
    }
  }

  public async playMissileVisual(r: number, c: number, targetR: number, targetC: number): Promise<void> {
    const cs      = this.CELL_SIZE;
    const startX  = this.getOffsetX() + c * cs + cs / 2;
    const startY  = this.getOffsetY() + r * cs + cs / 2;
    const targetX = this.getOffsetX() + targetC * cs + cs / 2;
    const targetY = this.getOffsetY() + targetR * cs + cs / 2;
    const missile = this.add.sprite(startX, startY, 'special_missile').setScale(0.5);
    missile.setRotation(Phaser.Math.Angle.Between(startX, startY, targetX, targetY) + Math.PI / 2);
    const particles = this.add.particles(0, 0, 'particle', { speed: 50, scale: { start: 0.5, end: 0 }, alpha: { start: 1, end: 0 }, tint: 0xffaa00, lifespan: 300, follow: missile });
    return new Promise<void>(resolve => {
      this.tweens.add({ targets: missile, x: targetX, y: targetY, duration: 400, ease: 'Cubic.easeIn', onComplete: () => { particles.stop(); missile.destroy(); this.time.delayedCall(300, () => particles.destroy()); resolve(); } });
    });
  }

  public playBombVisual(r: number, c: number, radius: number): void {
    const cs  = this.CELL_SIZE;
    const cx  = this.getOffsetX() + c * cs + cs / 2;
    const cy  = this.getOffsetY() + r * cs + cs / 2;
    const exp = this.add.circle(cx, cy, cs * 0.5, 0xffaa00, 0.8).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: exp, scale: radius * 2.5, alpha: 0, duration: 500, ease: 'Cubic.easeOut', onComplete: () => exp.destroy() });
  }

  public async playParasiteVortex(r: number, c: number, scale: number, duration: number): Promise<void> {
    const cs     = this.CELL_SIZE;
    const cx     = this.getOffsetX() + c * cs + cs / 2;
    const cy     = this.getOffsetY() + r * cs + cs / 2;
    const vortex = this.add.sprite(cx, cy, 'special_parasite').setScale(0);
    return new Promise<void>(resolve => {
      this.tweens.add({ targets: vortex, scale, angle: duration > 800 ? 1080 : 720, alpha: 0, duration, ease: duration > 800 ? 'Cubic.easeIn' : 'Cubic.easeOut', onComplete: () => { vortex.destroy(); resolve(); } });
    });
  }

  public async playParasiteVisual(r: number, c: number, targetShape: ShapeType, targetCells: { r: number; c: number }[]): Promise<void> {
    const cs   = this.CELL_SIZE;
    const cx   = this.getOffsetX() + c * cs + cs / 2;
    const cy   = this.getOffsetY() + r * cs + cs / 2;
    const promises = targetCells.map(cell => {
      const tx   = this.getOffsetX() + cell.c * cs + cs / 2;
      const ty   = this.getOffsetY() + cell.r * cs + cs / 2;
      const beam = this.add.line(0, 0, cx, cy, tx, ty, 0xd946ef, 0.8).setOrigin(0, 0).setLineWidth(4);
      const particle = this.add.sprite(cx, cy, 'particle').setTint(0xd946ef).setScale(2);
      return new Promise<void>(resolve => {
        this.tweens.add({ targets: particle, x: tx, y: ty, duration: 400, ease: 'Power2', onComplete: () => { particle.destroy(); beam.destroy(); resolve(); } });
      });
    });
    if (promises.length > 0) await Promise.all(promises);
    else await new Promise(resolve => this.time.delayedCall(400, resolve));
  }

  public shakeCamera(duration: number, intensity: number): void { this.cameras.main.shake(duration, intensity); }
  public getGridSize(): number { return this.logic.gridSize; }
  public getGrid(): (LogicCell | null)[][] { return this.logic.grid; }

  shutdown() {
    if (this.opponentAI) { this.opponentAI.destroy(); this.opponentAI = null; }
    this.game.events.off('HP_UPDATED',     this.handleHpUpdated,     this);
    this.game.events.off('CHARGE_UPDATED', this.handleChargeUpdated, this);
    this.game.events.off('POWER_UPDATE',   this.handlePowerUpdate,   this);
    this.game.events.off('TURN_SWITCHED',  this.handleTurnSwitched,  this);
    this.game.events.off('SKILL_EXECUTED', this.handleSkillExecuted, this);
    this.game.events.off('SKILL_MISSED',   this.handleSkillMissed,   this);
    this.game.events.off('GAME_OVER',      this.handleGameOver,      this);
  }
}
