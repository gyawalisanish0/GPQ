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

let GRID_SIZE = 10;
let CELL_SIZE = 88;
let BASE_GRID_WIDTH = 880;

// HUD Parameters
let HUD_CONFIG = {
  width: 480,
  padding: 20,
  barHeight: 14,
  barWidth: 200,
  skillSize: 128,
  colors: {
    hp: 0x10b981, // emerald-500
    charge: 0x3b82f6, // blue-500
    opponentHp: 0xef4444, // red-500
    opponentCharge: 0xeab308, // yellow-500
    bg: 0x000000,
    border: 0xffffff
  }
};

interface VisualCell {
  sprite: Phaser.GameObjects.Container;
}

export class Game_Scene extends Phaser.Scene implements IEffectDelegate {
  constructor() {
    super('Game_Scene');
  }
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
  private turnCountText!: Phaser.GameObjects.Text;
  private activeSkillBtn!: Phaser.GameObjects.Container;
  private queuedIconsContainer!: Phaser.GameObjects.Container;
  private opponentQueuedIconsContainer!: Phaser.GameObjects.Container;
  private scaleFactor: number = 1;

  init() {
    this.isGameOver = false;

    // Calculate responsive sizes
    const { width, height } = this.cameras.main;
    const isLandscape = width > height;
    
    // Base scale factor based on 1080x1920
    this.scaleFactor = Math.min(width / 1080, height / 1920);
    
    CELL_SIZE = Math.floor(88 * this.scaleFactor);
    BASE_GRID_WIDTH = CELL_SIZE * GRID_SIZE;
    
    HUD_CONFIG = {
      ...HUD_CONFIG,
      width: Math.floor(480 * this.scaleFactor),
      padding: Math.floor(20 * this.scaleFactor),
      barHeight: Math.floor(14 * this.scaleFactor),
      barWidth: Math.floor(200 * this.scaleFactor),
      skillSize: Math.floor(128 * this.scaleFactor)
    };

    // Load gem configurations from registry
    const registry = GemRegistry.getInstance();
    const normalGems = registry.getAllGems().filter(g => g.type === 'normal');
    
    normalGems.forEach(gem => {
      if (gem.shape && gem.color) {
        const shapeType = ShapeType[gem.shape as keyof typeof ShapeType];
        this.colors[shapeType] = parseInt(gem.color.replace('0x', ''), 16);
      }
    });

    // Fallback if JSON loading fails
    if (Object.keys(this.colors).length === 0) {
      this.colors = {
        [ShapeType.TRIANGLE]: 0x3b82f6,
        [ShapeType.SQUARE]: 0x22c55e,
        [ShapeType.PENTAGON]: 0xec4899,
        [ShapeType.HEXAGON]: 0xeab308,
        [ShapeType.STAR]: 0xef4444,
        [ShapeType.NONE]: 0x8b5cf6
      };
    }
  }

  preload() {
    this.createTextures();
  }

  private createTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0 });

    Object.entries(this.colors).forEach(([type, color]) => {
      graphics.clear();
      const size = CELL_SIZE * 0.7;
      const center = CELL_SIZE / 2;

      if (type === ShapeType.NONE) {
        // Dark orb for the base of the parasite
        graphics.fillStyle(0x111111, 1);
        graphics.fillCircle(center, center, size / 2 + 4);
        graphics.lineStyle(3, 0x8b5cf6, 1);
        graphics.strokeCircle(center, center, size / 2 + 4);
        // Inner glow
        graphics.fillStyle(0x8b5cf6, 0.5);
        graphics.fillCircle(center, center, size / 3);
        graphics.fillStyle(0xffffff, 0.8);
        graphics.fillCircle(center, center, size / 6);
      } else {
        this.drawGem(graphics, type as ShapeType, color, center, size);
      }

      graphics.generateTexture(`shape_${type}`, CELL_SIZE, CELL_SIZE);
    });

    // Create textures for skill icons
    const skillIcons = ['slash', 'fury', 'fireball', 'arcane_focus', 'ice_lance'];
    skillIcons.forEach(icon => {
        graphics.clear();
        graphics.fillStyle(0xffffff, 1);
        graphics.fillRect(0, 0, 64, 64); // Placeholder
        graphics.generateTexture(`icon_${icon}`, 64, 64);
    });
    graphics.clear();
    graphics.fillStyle(0xffffff, 0.9);
    
    // Horizontal arrows
    graphics.beginPath();
    graphics.moveTo(CELL_SIZE * 0.1, CELL_SIZE / 2);
    graphics.lineTo(CELL_SIZE * 0.3, CELL_SIZE * 0.35);
    graphics.lineTo(CELL_SIZE * 0.3, CELL_SIZE * 0.65);
    graphics.closePath();
    graphics.fillPath();
    
    graphics.beginPath();
    graphics.moveTo(CELL_SIZE * 0.9, CELL_SIZE / 2);
    graphics.lineTo(CELL_SIZE * 0.7, CELL_SIZE * 0.35);
    graphics.lineTo(CELL_SIZE * 0.7, CELL_SIZE * 0.65);
    graphics.closePath();
    graphics.fillPath();

    // Vertical arrows
    graphics.beginPath();
    graphics.moveTo(CELL_SIZE / 2, CELL_SIZE * 0.1);
    graphics.lineTo(CELL_SIZE * 0.35, CELL_SIZE * 0.3);
    graphics.lineTo(CELL_SIZE * 0.65, CELL_SIZE * 0.3);
    graphics.closePath();
    graphics.fillPath();

    graphics.beginPath();
    graphics.moveTo(CELL_SIZE / 2, CELL_SIZE * 0.9);
    graphics.lineTo(CELL_SIZE * 0.35, CELL_SIZE * 0.7);
    graphics.lineTo(CELL_SIZE * 0.65, CELL_SIZE * 0.7);
    graphics.closePath();
    graphics.fillPath();

    // Center ring
    graphics.lineStyle(3, 0xffffff, 0.8);
    graphics.strokeCircle(CELL_SIZE / 2, CELL_SIZE / 2, CELL_SIZE * 0.2);
    
    graphics.generateTexture('special_pulsar', CELL_SIZE, CELL_SIZE);

    // Missile: A rocket shape
    graphics.clear();
    // Rocket body
    graphics.fillStyle(0xffffff, 0.9);
    graphics.beginPath();
    graphics.moveTo(CELL_SIZE / 2, CELL_SIZE * 0.15); // Nose
    graphics.lineTo(CELL_SIZE * 0.65, CELL_SIZE * 0.4);
    graphics.lineTo(CELL_SIZE * 0.65, CELL_SIZE * 0.7);
    graphics.lineTo(CELL_SIZE * 0.35, CELL_SIZE * 0.7);
    graphics.lineTo(CELL_SIZE * 0.35, CELL_SIZE * 0.4);
    graphics.closePath();
    graphics.fillPath();
    // Fins
    graphics.fillStyle(0xff3300, 0.9);
    graphics.beginPath();
    graphics.moveTo(CELL_SIZE * 0.35, CELL_SIZE * 0.5);
    graphics.lineTo(CELL_SIZE * 0.15, CELL_SIZE * 0.75);
    graphics.lineTo(CELL_SIZE * 0.35, CELL_SIZE * 0.7);
    graphics.closePath();
    graphics.fillPath();
    graphics.beginPath();
    graphics.moveTo(CELL_SIZE * 0.65, CELL_SIZE * 0.5);
    graphics.lineTo(CELL_SIZE * 0.85, CELL_SIZE * 0.75);
    graphics.lineTo(CELL_SIZE * 0.65, CELL_SIZE * 0.7);
    graphics.closePath();
    graphics.fillPath();
    // Window
    graphics.fillStyle(0x00ffff, 0.9);
    graphics.fillCircle(CELL_SIZE / 2, CELL_SIZE * 0.45, CELL_SIZE * 0.1);
    // Flame
    graphics.fillStyle(0xffaa00, 0.9);
    graphics.beginPath();
    graphics.moveTo(CELL_SIZE * 0.4, CELL_SIZE * 0.7);
    graphics.lineTo(CELL_SIZE / 2, CELL_SIZE * 0.9);
    graphics.lineTo(CELL_SIZE * 0.6, CELL_SIZE * 0.7);
    graphics.closePath();
    graphics.fillPath();
    
    graphics.generateTexture('special_missile', CELL_SIZE, CELL_SIZE);

    // Bomb: A glowing outer ring with spikes and a fuse, leaving center clear
    graphics.clear();
    // Outer ring
    graphics.lineStyle(4, 0x444444, 1);
    graphics.strokeCircle(CELL_SIZE / 2, CELL_SIZE / 2, CELL_SIZE * 0.35);
    graphics.lineStyle(2, 0xffffff, 0.8);
    graphics.strokeCircle(CELL_SIZE / 2, CELL_SIZE / 2, CELL_SIZE * 0.35);
    
    // Spikes
    graphics.lineStyle(3, 0xffaa00, 1);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      graphics.moveTo(CELL_SIZE / 2 + Math.cos(angle) * CELL_SIZE * 0.35, CELL_SIZE / 2 + Math.sin(angle) * CELL_SIZE * 0.35);
      graphics.lineTo(CELL_SIZE / 2 + Math.cos(angle) * CELL_SIZE * 0.45, CELL_SIZE / 2 + Math.sin(angle) * CELL_SIZE * 0.45);
    }
    graphics.strokePath();

    // Fuse spark
    graphics.fillStyle(0xff3300, 1);
    graphics.fillCircle(CELL_SIZE * 0.75, CELL_SIZE * 0.25, CELL_SIZE * 0.12);
    graphics.fillStyle(0xffaa00, 1);
    graphics.fillCircle(CELL_SIZE * 0.75, CELL_SIZE * 0.25, CELL_SIZE * 0.08);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(CELL_SIZE * 0.75, CELL_SIZE * 0.25, CELL_SIZE * 0.04);

    graphics.generateTexture('special_bomb', CELL_SIZE, CELL_SIZE);

    // Parasite: Swirling vortex / multi-pointed star
    graphics.clear();
    graphics.lineStyle(3, 0xd946ef, 1); // Fuchsia outline
    graphics.fillStyle(0x8b5cf6, 0.9); // Purple fill
    this.drawStar(graphics, CELL_SIZE / 2, CELL_SIZE / 2, 12, CELL_SIZE * 0.45, CELL_SIZE * 0.2);
    graphics.fillPath();
    graphics.strokePath();
    // Inner core
    graphics.fillStyle(0xffffff, 0.8);
    graphics.fillCircle(CELL_SIZE / 2, CELL_SIZE / 2, CELL_SIZE * 0.1);
    graphics.generateTexture('special_parasite', CELL_SIZE, CELL_SIZE);
    
    // Particle texture for explosions
    graphics.clear();
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('particle', 8, 8);
    
    // Star particle for background
    graphics.clear();
    graphics.fillStyle(0xffffff, 0.8);
    graphics.fillCircle(2, 2, 2);
    graphics.generateTexture('star_particle', 4, 4);
  }

  private drawGem(graphics: Phaser.GameObjects.Graphics, type: ShapeType, color: number, center: number, size: number) {
    const colorObj = Phaser.Display.Color.ValueToColor(color);
    const lightColor = colorObj.clone().lighten(30).color;
    const darkColor = colorObj.clone().darken(30).color;

    // Base shadow
    graphics.fillStyle(0x000000, 0.4);
    this.drawShapePath(graphics, type, center, center + 4, size);
    graphics.fillPath();

    // Outer dark border
    graphics.fillStyle(darkColor, 1);
    this.drawShapePath(graphics, type, center, center, size);
    graphics.fillPath();

    // Main color
    graphics.fillStyle(color, 1);
    this.drawShapePath(graphics, type, center, center, size * 0.85);
    graphics.fillPath();

    // Inner light highlight
    graphics.fillStyle(lightColor, 1);
    this.drawShapePath(graphics, type, center, center, size * 0.5);
    graphics.fillPath();

    // Top shine
    graphics.fillStyle(0xffffff, 0.5);
    graphics.beginPath();
    graphics.arc(center - size*0.15, center - size*0.15, size*0.15, 0, Math.PI*2);
    graphics.fillPath();
  }

  private drawShapePath(graphics: Phaser.GameObjects.Graphics, type: ShapeType, x: number, y: number, size: number) {
    graphics.beginPath();
    switch (type) {
      case ShapeType.TRIANGLE:
        graphics.moveTo(x, y - size / 2);
        graphics.lineTo(x - size / 2, y + size / 2);
        graphics.lineTo(x + size / 2, y + size / 2);
        break;
      case ShapeType.SQUARE:
        graphics.moveTo(x - size / 2, y - size / 2);
        graphics.lineTo(x + size / 2, y - size / 2);
        graphics.lineTo(x + size / 2, y + size / 2);
        graphics.lineTo(x - size / 2, y + size / 2);
        break;
      case ShapeType.PENTAGON:
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const px = x + Math.cos(angle) * (size / 2);
          const py = y + Math.sin(angle) * (size / 2);
          if (i === 0) graphics.moveTo(px, py);
          else graphics.lineTo(px, py);
        }
        break;
      case ShapeType.HEXAGON:
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const px = x + Math.cos(angle) * (size / 2);
          const py = y + Math.sin(angle) * (size / 2);
          if (i === 0) graphics.moveTo(px, py);
          else graphics.lineTo(px, py);
        }
        break;
      case ShapeType.STAR:
        const outerRadius = size / 2;
        const innerRadius = size / 4;
        for (let i = 0; i < 10; i++) {
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const px = x + Math.cos(angle) * radius;
          const py = y + Math.sin(angle) * radius;
          if (i === 0) graphics.moveTo(px, py);
          else graphics.lineTo(px, py);
        }
        break;
      case ShapeType.NONE:
        graphics.arc(x, y, size / 2, 0, Math.PI * 2);
        break;
    }
    graphics.closePath();
  }

  private drawStar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, points: number, outerRadius: number, innerRadius: number) {
    const step = Math.PI / points;
    graphics.beginPath();
    for (let i = 0; i < 2 * points; i++) {
      const r = (i % 2 === 0) ? outerRadius : innerRadius;
      const angle = i * step - Math.PI / 2;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) graphics.moveTo(px, py);
      else graphics.lineTo(px, py);
    }
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }

  create(data: { userCharId?: string, opponentCharId?: string }) {
    this.logic = new GameLogic(GRID_SIZE);
    this.logic.initializeGrid();
    while (!this.logic.hasPossibleMoves()) {
      this.logic.initializeGrid();
    }
    this.effectManager = new EffectManager(this);

    const { width, height } = this.cameras.main;
    const gridWidth = GRID_SIZE * CELL_SIZE;
    const offsetX = (width - gridWidth) / 2;
    const offsetY = (height - gridWidth) / 2;

    // Animated gradient background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a2a, 0x1a0a3a, 0x0a1a3a, 0x050515, 1, 1, 1, 1);
    bg.fillRect(0, 0, width, height);

    // Floating background particles
    this.add.particles(0, 0, 'star_particle', {
      x: { min: 0, max: width },
      y: { min: height, max: height + 100 },
      lifespan: 10000,
      speedY: { min: -10, max: -30 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.5, end: 1.5 },
      alpha: { start: 0, end: 0.5, ease: 'Sine.easeInOut' },
      quantity: 1,
      frequency: 300,
      blendMode: 'ADD'
    });

    // Background
    this.add.image(width / 2, height / 2, 'menu_bg').setDisplaySize(width, height).setAlpha(0.2);

    // Glassy board background
    const boardBg = this.add.graphics();
    
    // Outer glow
    boardBg.lineStyle(6, 0x4a00e0, 0.4);
    boardBg.strokeRoundedRect(offsetX - 12, offsetY - 12, gridWidth + 24, gridWidth + 24, 20);
    
    // Inner dark glass
    boardBg.fillStyle(0x000000, 0.6);
    boardBg.fillRoundedRect(offsetX - 10, offsetY - 10, gridWidth + 20, gridWidth + 20, 16);
    
    // Grid lines
    boardBg.lineStyle(2, 0xffffff, 0.05);
    for (let i = 1; i < GRID_SIZE; i++) {
      boardBg.moveTo(offsetX + i * CELL_SIZE, offsetY);
      boardBg.lineTo(offsetX + i * CELL_SIZE, offsetY + gridWidth);
      boardBg.moveTo(offsetX, offsetY + i * CELL_SIZE);
      boardBg.lineTo(offsetX + gridWidth, offsetY + i * CELL_SIZE);
    }
    boardBg.strokePath();
    
    // Selection indicator
    this.selectionRect = this.add.rectangle(0, 0, CELL_SIZE, CELL_SIZE, 0xffffff, 0);
    this.selectionRect.setOrigin(0.5, 0.5);
    this.selectionRect.setStrokeStyle(4, 0x00ffff, 1);
    this.selectionRect.setVisible(false);
    this.selectionRect.setDepth(10);
    
    // Add pulsing effect to selection rect
    this.tweens.add({
      targets: this.selectionRect,
      alpha: 0.5,
      scale: 1.1,
      duration: 400,
      yoyo: true,
      repeat: -1
    });

    this.initVisualGrid(offsetX, offsetY);
    
    this.swipeHandler = new SwipeHandler(this, CELL_SIZE, offsetX, offsetY, (start, end) => {
      if (this.isProcessing) return;
      if (CombatManager.getInstance().currentTurn !== 'USER') return;
      this.swapCells(start.r, start.c, end.r, end.c);
    }, (r, c) => {
      this.updateSelectionRect(r, c);
    }, (r, c) => {
      this.updateSelectionRect(r, c);
    }, () => {
      this.selectionRect.setVisible(false);
    });

    this.game.events.emit('SCENE_READY', 'Game_Scene');
    
    // Initialize Combat
    const combatRegistry = CombatRegistry.getInstance();
    const userCharId = data?.userCharId || 'warrior';
    const opponentCharId = data?.opponentCharId || 'mage';
    
    const user = combatRegistry.getCharacter(userCharId);
    const opponent = combatRegistry.getCharacter(opponentCharId);
    
    if (user && opponent) {
      CombatManager.getInstance().init(user, opponent);
      this.createHUD();
      this.setupCombatListeners();
      
      this.opponentAI = new OpponentAI(this.game, this.logic, async (r1, c1, r2, c2) => {
        await this.swapCells(r1, c1, r2, c2);
      }, () => this.powerSurge);
    }

    this.events.on('shutdown', this.shutdown, this);
  }

  private createHUD() {
    const { width, height } = this.cameras.main;
    const offsetX = (width - BASE_GRID_WIDTH) / 2;
    const offsetY = (height - BASE_GRID_WIDTH) / 2;
    const gridWidth = BASE_GRID_WIDTH;

    // --- Opponent HUD (Top Left) ---
    this.opponentHUD = this.add.container(24 * this.scaleFactor, 96 * this.scaleFactor);
    this.drawCharacterHUD(this.opponentHUD, 'OPPONENT', false);

    // --- User HUD (Bottom Left) ---
    this.userHUD = this.add.container(24 * this.scaleFactor, 1554 * this.scaleFactor);
    this.drawCharacterHUD(this.userHUD, 'USER', true);

    // Queued Skills Container
    // Centered horizontally with the HUDs
    // User HUD is at offsetX, width 480. Center = offsetX + 240
    this.queuedIconsContainer = this.add.container(offsetX + 240 * this.scaleFactor, offsetY + gridWidth + 20 * this.scaleFactor);
    
    // Opponent HUD is at offsetX, width HUD_CONFIG.width (needs to be defined or estimated)
    // HUD_CONFIG.width is likely 320 based on previous code.
    // Position it between opponent HUD (offsetY - 172) and board (offsetY).
    this.opponentQueuedIconsContainer = this.add.container(offsetX + 160 * this.scaleFactor, offsetY - 26 * this.scaleFactor);

    this.game.events.on('SKILL_QUEUED', (data: { character: string, icon: string, skillId: string }) => {
        if (data.character === 'USER') {
            const icon = this.add.image(0, 0, data.icon).setDisplaySize(64 * this.scaleFactor, 64 * this.scaleFactor).setInteractive({ useHandCursor: true });
            icon.setData('skillId', data.skillId);
            icon.on('pointerdown', () => {
                CombatManager.getInstance().removeQueuedSkill(data.skillId, 'USER');
            });
            this.queuedIconsContainer.add(icon);
            this.queuedIconsContainer.getAll().forEach((child, index) => {
                (child as Phaser.GameObjects.Image).x = (index - (this.queuedIconsContainer.length - 1) / 2) * 70 * this.scaleFactor;
            });
            
            // Hide the skill button in the HUD list
            const skillBtn = this.skillButtons.find(btn => btn.getData('skillId') === data.skillId);
            if (skillBtn) {
                skillBtn.setVisible(false);
            }
        } else {
            const icon = this.add.image(0, 0, data.icon).setDisplaySize(28 * this.scaleFactor, 28 * this.scaleFactor);
            icon.setData('skillId', data.skillId);
            this.opponentQueuedIconsContainer.add(icon);
            this.opponentQueuedIconsContainer.getAll().forEach((child, index) => {
                (child as Phaser.GameObjects.Image).x = (index - (this.opponentQueuedIconsContainer.length - 1) / 2) * 35 * this.scaleFactor;
            });
        }
    });

    this.game.events.on('SKILL_DEACTIVATED', (data: { character: string, icon: string, skillId?: string }) => {
        if (data.character === 'USER') {
            const icon = this.queuedIconsContainer.getAll().find((child) => {
                const img = child as Phaser.GameObjects.Image;
                return (data.skillId && img.getData('skillId') === data.skillId) || img.texture.key === data.icon;
            });
            if (icon) {
                const skillId = icon.getData('skillId');
                this.queuedIconsContainer.remove(icon, true);
                this.queuedIconsContainer.getAll().forEach((child, index) => {
                    (child as Phaser.GameObjects.Image).x = (index - (this.queuedIconsContainer.length - 1) / 2) * 70 * this.scaleFactor;
                });
                
                // Show the skill button in the HUD list again
                if (skillId) {
                    const skillBtn = this.skillButtons.find(btn => btn.getData('skillId') === skillId);
                    if (skillBtn) {
                        skillBtn.setVisible(true);
                    }
                }
            }
        } else {
            const icon = this.opponentQueuedIconsContainer.getAll().find((child) => {
                const img = child as Phaser.GameObjects.Image;
                return (data.skillId && img.getData('skillId') === data.skillId) || img.texture.key === data.icon;
            });
            if (icon) {
                this.opponentQueuedIconsContainer.remove(icon, true);
                this.opponentQueuedIconsContainer.getAll().forEach((child, index) => {
                    (child as Phaser.GameObjects.Image).x = (index - (this.opponentQueuedIconsContainer.length - 1) / 2) * 35 * this.scaleFactor;
                });
            }
        }
    });

    // --- Turn Count HUD (Top Middle-Right) ---
    // Positioned between Opponent HUD (offsetX + 320) and Score HUD (width - offsetX - 160)
    const turnHudX = offsetX + 330 * this.scaleFactor; 
    const turnHudWidth = 60 * this.scaleFactor;
    
    this.turnHUD = this.add.container(turnHudX, offsetY - 172 * this.scaleFactor);
    const turnBg = this.add.graphics();
    turnBg.fillStyle(0x000000, 0.5);
    turnBg.fillRoundedRect(0, 0, turnHudWidth, 80 * this.scaleFactor, 16 * this.scaleFactor);
    turnBg.lineStyle(2, 0xffffff, 0.1);
    turnBg.strokeRoundedRect(0, 0, turnHudWidth, 80 * this.scaleFactor, 16 * this.scaleFactor);
    this.turnHUD.add(turnBg);

    this.turnHUD.add(this.add.text(turnHudWidth / 2, 15 * this.scaleFactor, 'TURNS', {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(12 * this.scaleFactor)}px`,
      color: '#ffffff'
    }).setOrigin(0.5, 0).setAlpha(0.5));

    this.turnCountText = this.add.text(turnHudWidth / 2, 35 * this.scaleFactor, '1', {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(24 * this.scaleFactor)}px`,
      fontStyle: 'bold',
      color: '#3b82f6'
    }).setOrigin(0.5, 0);
    this.turnHUD.add(this.turnCountText);

    // --- Power HUD (Top Right) ---
    const powerBg = this.add.graphics();
    powerBg.fillStyle(0x000000, 0.5);
    powerBg.fillRoundedRect(width - offsetX - 160 * this.scaleFactor, offsetY - 172 * this.scaleFactor, 160 * this.scaleFactor, 80 * this.scaleFactor, 16 * this.scaleFactor);
    powerBg.lineStyle(2, 0xffffff, 0.1);
    powerBg.strokeRoundedRect(width - offsetX - 160 * this.scaleFactor, offsetY - 172 * this.scaleFactor, 160 * this.scaleFactor, 80 * this.scaleFactor, 16 * this.scaleFactor);

    this.add.text(width - offsetX - 140 * this.scaleFactor, offsetY - 157 * this.scaleFactor, 'POWER', {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(12 * this.scaleFactor)}px`,
      color: '#ffffff'
    }).setAlpha(0.5);

    this.powerText = this.add.text(width - offsetX - 140 * this.scaleFactor, offsetY - 137 * this.scaleFactor, '0', {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(24 * this.scaleFactor)}px`,
      fontStyle: 'bold',
      color: '#fbbf24'
    });

    this.ActiveSkillButton();
    
    // Initial turn state
    this.handleTurnSwitched(CombatManager.getInstance().currentTurn);
  }

  private ActiveSkillButton() {
    const { width, height } = this.cameras.main;
    const offsetX = (width - BASE_GRID_WIDTH) / 2;
    const offsetY = (height - BASE_GRID_WIDTH) / 2;
    const gridWidth = BASE_GRID_WIDTH;

    const combat = CombatManager.getInstance();
    const user = combat.user;
    if (!user || !user.loadout.active) return;

    const skillId = user.loadout.active;
    const skill = CombatRegistry.getInstance().getSkill(skillId);
    
    const size = 120 * this.scaleFactor;
    const x = width - offsetX - size/2;
    const y = offsetY + gridWidth + 130 * this.scaleFactor; // Centered vertically with Player HUD (180px height)

    this.activeSkillBtn = this.add.container(x, y);
    
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.8);
    bg.fillCircle(0, 0, size/2);
    bg.lineStyle(4, 0x10b981, 1);
    bg.strokeCircle(0, 0, size/2);
    this.activeSkillBtn.add(bg);

    // Icon (placeholder or generic skill icon)
    const icon = this.add.text(0, -10 * this.scaleFactor, '⚡', { fontSize: `${Math.floor(40 * this.scaleFactor)}px` }).setOrigin(0.5);
    this.activeSkillBtn.add(icon);

    const label = this.add.text(0, 25 * this.scaleFactor, skill ? skill.name.toUpperCase() : 'SKILL', {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(14 * this.scaleFactor)}px`,
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    this.activeSkillBtn.add(label);

    const costText = this.add.text(0, 40 * this.scaleFactor, skill ? `${skill.chargeCost} EP` : '', {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(12 * this.scaleFactor)}px`,
      color: '#3b82f6'
    }).setOrigin(0.5);
    this.activeSkillBtn.add(costText);

    this.activeSkillBtn.setInteractive(new Phaser.Geom.Circle(0, 0, size/2), Phaser.Geom.Circle.Contains);
    
    this.activeSkillBtn.on('pointerover', () => {
      SoundManager.getInstance().play(SoundType.SELECT);
      this.tweens.add({ targets: this.activeSkillBtn, scale: 1.1, duration: 100 });
      bg.clear();
      bg.fillStyle(0x10b981, 0.2);
      bg.fillCircle(0, 0, size/2);
      bg.lineStyle(4, 0x34d399, 1);
      bg.strokeCircle(0, 0, size/2);
    });

    this.activeSkillBtn.on('pointerout', () => {
      this.tweens.add({ targets: this.activeSkillBtn, scale: 1.0, duration: 100 });
      bg.clear();
      bg.fillStyle(0x000000, 0.8);
      bg.fillCircle(0, 0, size/2);
      bg.lineStyle(4, 0x10b981, 1);
      bg.strokeCircle(0, 0, size/2);
    });

    this.activeSkillBtn.on('pointerdown', () => {
      SoundManager.getInstance().play(SoundType.CLICK);
      this.tweens.add({ targets: this.activeSkillBtn, scale: 0.9, duration: 50, yoyo: true });
      
      const combat = CombatManager.getInstance();
      const user = combat.user;
      if (user && skill && user.currentCharge >= skill.chargeCost && combat.currentTurn === 'USER') {
        this.game.events.emit('SKILL_ACTIVATED', { character: 'USER', skillId, powerSurge: this.powerSurge });
      } else {
        // Shake feedback
        this.tweens.add({
          targets: this.activeSkillBtn,
          x: x + 5 * this.scaleFactor,
          duration: 50,
          yoyo: true,
          repeat: 3
        });
        if (user && skill && user.currentCharge < skill.chargeCost && this.userChargeBar) {
          this.tweens.add({
            targets: this.userChargeBar,
            alpha: 0.2,
            duration: 100,
            yoyo: true,
            repeat: 1
          });
        }
      }
    });
  }

  private drawCharacterHUD(container: Phaser.GameObjects.Container, type: string, isUser: boolean) {
    const combat = CombatManager.getInstance();
    const char = isUser ? combat.user : combat.opponent;
    if (!char) return;

    const hudWidth = isUser ? 720 * this.scaleFactor : HUD_CONFIG.width;
    const hudHeight = isUser ? 270 * this.scaleFactor : 180 * this.scaleFactor;

    // Glow
    const glow = this.add.graphics();
    glow.setAlpha(0);
    container.add(glow);
    if (isUser) this.userGlow = glow; else this.opponentGlow = glow;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.5);
    bg.fillRoundedRect(0, 0, hudWidth, hudHeight, 20 * this.scaleFactor);
    bg.lineStyle(2, isUser ? 0x10b981 : 0xef4444, 0.3);
    bg.strokeRoundedRect(0, 0, hudWidth, hudHeight, 20 * this.scaleFactor);
    container.add(bg);

    // Initial glow draw
    this.updateGlow(glow, hudWidth, hudHeight, isUser ? 0x10b981 : 0xef4444);

    const nameText = this.add.text(15 * this.scaleFactor, 15 * this.scaleFactor, char.name.toUpperCase(), {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(16 * this.scaleFactor)}px`,
      fontStyle: 'bold',
      color: isUser ? '#34d399' : '#f87171'
    });
    container.add(nameText);

    const classText = this.add.text(hudWidth - 15 * this.scaleFactor, 18 * this.scaleFactor, char.classType, {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(10 * this.scaleFactor)}px`,
      color: '#ffffff'
    }).setOrigin(1, 0).setAlpha(0.5);
    container.add(classText);

    // Linked Gem Indicator
    const gemIcon = this.add.image(hudWidth - 15 * this.scaleFactor, 35 * this.scaleFactor, `shape_${char.linkedGem}`).setScale(0.5 * this.scaleFactor).setOrigin(1, 0);
    container.add(gemIcon);

    // HP Bar
    container.add(this.add.text(15 * this.scaleFactor, 45 * this.scaleFactor, 'HP', { fontSize: `${Math.floor(10 * this.scaleFactor)}px`, color: '#ffffff' }).setAlpha(0.7));
    const barWidth = isUser ? 360 * this.scaleFactor : HUD_CONFIG.barWidth;
    const hpValText = this.add.text(15 * this.scaleFactor + barWidth, 45 * this.scaleFactor, `${Math.floor(char.currentHp)}/${char.maxHp}`, { 
      fontSize: `${Math.floor(10 * this.scaleFactor)}px`, 
      fontFamily: 'monospace',
      color: '#ffffff' 
    }).setOrigin(1, 0).setAlpha(0.7);
    container.add(hpValText);
    if (isUser) this.userHpText = hpValText; else this.opponentHpText = hpValText;

    const hpBar = this.add.graphics();
    container.add(hpBar);
    if (isUser) this.userHpBar = hpBar; else this.opponentHpBar = hpBar;
    this.updateBar(hpBar, char.currentHp / char.maxHp, isUser ? HUD_CONFIG.colors.hp : HUD_CONFIG.colors.opponentHp, barWidth);

    // Charge Bar
    container.add(this.add.text(15 * this.scaleFactor, 85 * this.scaleFactor, 'CHARGE', { fontSize: `${Math.floor(10 * this.scaleFactor)}px`, color: '#ffffff' }).setAlpha(0.7));
    const chargeValText = this.add.text(15 * this.scaleFactor + barWidth, 85 * this.scaleFactor, `${Math.floor(char.currentCharge)}/${char.maxCharge}`, { 
      fontSize: `${Math.floor(10 * this.scaleFactor)}px`, 
      fontFamily: 'monospace',
      color: '#ffffff' 
    }).setOrigin(1, 0).setAlpha(0.7);
    container.add(chargeValText);
    if (isUser) this.userChargeText = chargeValText; else this.opponentChargeText = chargeValText;

    const chargeBar = this.add.graphics();
    container.add(chargeBar);
    if (isUser) this.userChargeBar = chargeBar; else this.opponentChargeBar = chargeBar;
    this.updateBar(chargeBar, char.currentCharge / char.maxCharge, isUser ? HUD_CONFIG.colors.charge : HUD_CONFIG.colors.opponentCharge, barWidth);

    // Stats Display
    const statsContainer = this.add.container(15 * this.scaleFactor, 115 * this.scaleFactor);
    const statStyle = { fontSize: `${Math.floor(9 * this.scaleFactor)}px`, fontFamily: 'monospace', color: '#aaaaaa' };
    const valStyle = { fontSize: `${Math.floor(9 * this.scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' };
    
    const stats = [
        { label: 'STR', val: char.stats.strength, x: 0, y: 0 },
        { label: 'END', val: char.stats.endurance, x: 45 * this.scaleFactor, y: 0 },
        { label: 'PWR', val: char.stats.power, x: 90 * this.scaleFactor, y: 0 },
        { label: 'RES', val: char.stats.resistance, x: 135 * this.scaleFactor, y: 0 },
        { label: 'SPD', val: char.stats.speed, x: 180 * this.scaleFactor, y: 0 },
        { label: 'ACC', val: char.stats.accuracy, x: 225 * this.scaleFactor, y: 0 },
    ];

    stats.forEach(s => {
        statsContainer.add(this.add.text(s.x, s.y, `${s.label}:`, statStyle));
        statsContainer.add(this.add.text(s.x + 22 * this.scaleFactor, s.y, s.val.toString(), valStyle));
    });
    container.add(statsContainer);

    // Skills (User only for now)
    if (isUser) {
      const stackSkills = char.loadout.stacks || [];
      const equippedSkills = [...stackSkills];
      const numSkills = equippedSkills.length;

      if (numSkills > 0) {
        const padding = 15 * this.scaleFactor;
        const spacing = 10 * this.scaleFactor;
        const availableWidth = hudWidth - (padding * 2);
        
        // Calculate dynamic width (clamped between 128 and 200)
        let btnWidth = (availableWidth - (numSkills - 1) * spacing) / numSkills;
        btnWidth = Math.max(128 * this.scaleFactor, Math.min(200 * this.scaleFactor, btnWidth));
        
        const totalWidth = (numSkills * btnWidth) + (numSkills - 1) * spacing;
        const isOverflow = totalWidth > availableWidth;

        // Skill list container
        const skillListContainer = this.add.container(0, 0);
        container.add(skillListContainer);

        if (isOverflow) {
          // Masking for overflow
          // We use world coordinates for the geometry mask
          const worldX = container.x + padding;
          const worldY = container.y + 135 * this.scaleFactor; // Adjusted Y position for skills
          
          const maskShape = this.make.graphics({ x: 0, y: 0 });
          maskShape.fillStyle(0xffffff);
          maskShape.fillRoundedRect(worldX, worldY, availableWidth, 50 * this.scaleFactor, 8 * this.scaleFactor);
          const mask = maskShape.createGeometryMask();
          skillListContainer.setMask(mask);
          
          skillListContainer.x = padding;

          // Make container draggable for scrolling
          const scrollHitArea = new Phaser.Geom.Rectangle(0, 135 * this.scaleFactor, totalWidth, 50 * this.scaleFactor);
          skillListContainer.setInteractive(scrollHitArea, Phaser.Geom.Rectangle.Contains);
          this.input.setDraggable(skillListContainer);
          
          skillListContainer.on('drag', (pointer: any, dragX: number, dragY: number) => {
            const minX = padding - (totalWidth - availableWidth);
            const maxX = padding;
            skillListContainer.x = Phaser.Math.Clamp(dragX, minX, maxX);
          });
        } else {
          // Center the list
          skillListContainer.x = (hudWidth - totalWidth) / 2;
        }

        equippedSkills.forEach((skillId, i) => {
          const skillBtn = this.add.container(i * (btnWidth + spacing), 135 * this.scaleFactor); // Adjusted Y position for skills
          skillBtn.setData('skillId', skillId);
          const btnBg = this.add.graphics();
          btnBg.fillStyle(0xffffff, 0.1);
          btnBg.fillRoundedRect(0, 0, btnWidth, 40 * this.scaleFactor, 8 * this.scaleFactor);
          skillBtn.add(btnBg);

          const skill = CombatRegistry.getInstance().getSkill(skillId);
          if (skill) {
            // Icon (leftmost)
            const icon = this.add.image(10 * this.scaleFactor, 20 * this.scaleFactor, skill.icon).setDisplaySize(24 * this.scaleFactor, 24 * this.scaleFactor).setOrigin(0, 0.5);
            skillBtn.add(icon);

            // Name label (middle)
            let displayName = skill.name;
            // Approximate width: 10px font size, monospace -> ~6px per char
            const charWidth = 6 * this.scaleFactor;
            const costLabelWidth = 25 * this.scaleFactor; // Estimate
            const availableWidth = btnWidth - 40 * this.scaleFactor - costLabelWidth - 10 * this.scaleFactor;
            const maxChars = Math.floor(availableWidth / charWidth);
            
            if (displayName.length > maxChars) {
                displayName = displayName.substring(0, Math.max(0, maxChars - 3)) + '...';
            }

            const nameLabel = this.add.text(40 * this.scaleFactor, 20 * this.scaleFactor, displayName, {
              fontSize: `${Math.floor(10 * this.scaleFactor)}px`,
              fontFamily: 'monospace',
              color: '#ffffff'
            }).setOrigin(0, 0.5);
            skillBtn.add(nameLabel);

            // Charge cost (right)
            const costLabel = this.add.text(btnWidth - 10 * this.scaleFactor, 20 * this.scaleFactor, `${skill.chargeCost}`, {
              fontSize: `${Math.floor(10 * this.scaleFactor)}px`,
              fontFamily: 'monospace',
              color: '#fbbf24',
              fontStyle: 'bold'
            }).setOrigin(1, 0.5);
            skillBtn.add(costLabel);
          }

          skillBtn.setInteractive(new Phaser.Geom.Rectangle(0, 0, btnWidth, 40 * this.scaleFactor), Phaser.Geom.Rectangle.Contains);
          skillBtn.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            // Only activate if not dragging (moved less than 10px)
            const distance = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
            if (distance > 10) return;

            const combat = CombatManager.getInstance();
            const user = combat.user;
            const skill = CombatRegistry.getInstance().getSkill(skillId);
            
            if (user && skill && user.currentCharge >= skill.chargeCost && combat.currentTurn === 'USER') {
              // Calculate potential move score if it's an active skill that includes it
              let moveScore = 0;
              let comboNumber = 1;
              if (skill.type === 'ACTIVE' && skill.includeMoveDamage) {
                  // This is a bit tricky, as the skill is activated before a move.
                  // For now, we'll just pass 0, as active skills usually happen before a match.
                  // If we want active skills to trigger *after* a match, we need a different flow.
                  // Let's assume active skills that include move damage are meant to be used *during* a combo,
                  // which isn't currently supported by the UI flow.
                  // So, we pass 0 for now.
                  moveScore = 0;
                  comboNumber = 1;
              }
              this.game.events.emit('SKILL_ACTIVATED', { character: 'USER', skillId, moveScore, comboNumber, powerSurge: this.powerSurge });
            } else if (user && skill) {
              console.log(`[Game_Scene] Cannot use ${skill.name}: Insufficient charge or not your turn`);
              this.tweens.add({
                targets: skillBtn,
                x: skillBtn.x + 5,
                duration: 50,
                yoyo: true,
                repeat: 3
              });
              if (user.currentCharge < skill.chargeCost && this.userChargeBar) {
                this.tweens.add({
                  targets: this.userChargeBar,
                  alpha: 0.2,
                  duration: 100,
                  yoyo: true,
                  repeat: 1
                });
              }
            }
          });

          skillListContainer.add(skillBtn);
          this.skillButtons.push(skillBtn);
        });
      }
    }
  }

  private updateBar(graphics: Phaser.GameObjects.Graphics, percent: number, color: number, customWidth?: number) {
    graphics.clear();
    const barWidth = customWidth || HUD_CONFIG.barWidth;
    // Background
    graphics.fillStyle(0x000000, 0.5);
    graphics.fillRoundedRect(15 * this.scaleFactor, 60 * this.scaleFactor, barWidth, HUD_CONFIG.barHeight, 7 * this.scaleFactor);
    if (graphics === this.userChargeBar || graphics === this.opponentChargeBar) {
        graphics.fillRoundedRect(15 * this.scaleFactor, 100 * this.scaleFactor, barWidth, HUD_CONFIG.barHeight, 7 * this.scaleFactor);
    }

    // Fill
    graphics.fillStyle(color, 1);
    const y = (graphics === this.userHpBar || graphics === this.opponentHpBar) ? 60 * this.scaleFactor : 100 * this.scaleFactor;
    if (percent > 0) {
        graphics.fillRoundedRect(15 * this.scaleFactor, y, barWidth * percent, HUD_CONFIG.barHeight, 7 * this.scaleFactor);
    }
  }

  private setupCombatListeners() {
    this.game.events.on('HP_UPDATED', this.handleHpUpdated, this);
    this.game.events.on('CHARGE_UPDATED', this.handleChargeUpdated, this);
    this.game.events.on('POWER_UPDATE', this.handlePowerUpdate, this);
    this.game.events.on('TURN_SWITCHED', this.handleTurnSwitched, this);
    this.game.events.on('SKILL_EXECUTED', this.handleSkillExecuted, this);
    this.game.events.on('SKILL_MISSED', this.handleSkillMissed, this);
    this.game.events.on('GAME_OVER', this.handleGameOver, this);
  }

  private handleGameOver = (data: { winner: string }) => {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.isProcessing = true; // Block further input
    const isUserWinner = data.winner === 'USER';
    const { width, height } = this.cameras.main;

    // Overlay
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
    overlay.setInteractive(); // Block clicks
    overlay.setDepth(1000);

    const resultText = isUserWinner ? 'VICTORY!' : 'DEFEAT...';
    const resultColor = isUserWinner ? '#10b981' : '#ef4444';

    const title = this.add.text(width / 2, height / 2 - 50 * this.scaleFactor, resultText, {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(84 * this.scaleFactor)}px`,
      fontStyle: 'bold',
      color: resultColor,
      stroke: '#ffffff',
      strokeThickness: 8 * this.scaleFactor
    }).setOrigin(0.5).setScale(0).setDepth(1001);

    const powerLabel = this.add.text(width / 2, height / 2 + 50 * this.scaleFactor, `Final Power: ${this.powerSurge}`, {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(32 * this.scaleFactor)}px`,
      color: '#ffffff'
    }).setOrigin(0.5).setAlpha(0).setDepth(1001);

    const restartBtn = this.add.container(width / 2, height / 2 + 150 * this.scaleFactor);
    restartBtn.setDepth(1001);
    const btnBg = this.add.rectangle(0, 0, 200 * this.scaleFactor, 60 * this.scaleFactor, 0xffffff, 0.2).setStrokeStyle(2 * this.scaleFactor, 0xffffff);
    const btnText = this.add.text(0, 0, 'RESTART', {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(24 * this.scaleFactor)}px`,
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    restartBtn.add([btnBg, btnText]);
    restartBtn.setSize(200 * this.scaleFactor, 60 * this.scaleFactor);
    restartBtn.setInteractive({ useHandCursor: true });
    restartBtn.setAlpha(0);

    restartBtn.on('pointerover', () => btnBg.setFillStyle(0xffffff, 0.4));
    restartBtn.on('pointerout', () => btnBg.setFillStyle(0xffffff, 0.2));
    restartBtn.on('pointerdown', () => {
      this.scene.restart();
    });

    this.tweens.add({
      targets: title,
      scale: 1,
      duration: 800,
      ease: 'Back.easeOut'
    });

    this.tweens.add({
      targets: [powerLabel, restartBtn],
      alpha: 1,
      duration: 500,
      delay: 800
    });
  }

  private handleSkillMissed = (data: { skill: any, character: string }) => {
    const isUser = data.character === 'USER';
    const { width, height } = this.cameras.main;
    const x = width / 2;
    const y = isUser ? height - 200 * this.scaleFactor : 200 * this.scaleFactor;

    const missText = this.add.text(x, y, 'MISSED!', {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(48 * this.scaleFactor)}px`,
      fontStyle: 'bold',
      color: '#ef4444',
      stroke: '#000000',
      strokeThickness: 6 * this.scaleFactor
    }).setOrigin(0.5);

    this.tweens.add({
      targets: missText,
      y: y - 100 * this.scaleFactor,
      alpha: 0,
      scale: 1.5,
      duration: 1000,
      ease: 'Cubic.easeOut',
      onComplete: () => missText.destroy()
    });
  }

  private handleSkillExecuted = (data: { skill: any, character: string }) => {
    const isUser = data.character === 'USER';
    const { width, height } = this.cameras.main;
    const x = width / 2;
    const y = isUser ? height - 200 * this.scaleFactor : 200 * this.scaleFactor;

    const text = this.add.text(x, y, data.skill.name.toUpperCase(), {
      fontFamily: 'monospace',
      fontSize: `${Math.floor(48 * this.scaleFactor)}px`,
      fontStyle: 'bold',
      color: isUser ? '#10b981' : '#ef4444',
      stroke: '#000000',
      strokeThickness: 6 * this.scaleFactor
    }).setOrigin(0.5).setAlpha(0).setScale(0.5);

    this.tweens.add({
      targets: text,
      alpha: 1,
      scale: 1.2,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          y: y - 50 * this.scaleFactor,
          duration: 500,
          delay: 500,
          ease: 'Power2',
          onComplete: () => text.destroy()
        });
      }
    });
  };

  private handleTurnSwitched = (turn: string) => {
    const combat = CombatManager.getInstance();
    this.turnCountText.setText(combat.turnCount.toString());

    if (turn === 'USER') {
      this.tweens.add({
        targets: this.userGlow,
        alpha: 1,
        duration: 300
      });
      this.tweens.add({
        targets: this.opponentGlow,
        alpha: 0,
        duration: 300
      });
    } else {
      this.tweens.add({
        targets: this.userGlow,
        alpha: 0,
        duration: 300
      });
      this.tweens.add({
        targets: this.opponentGlow,
        alpha: 1,
        duration: 300
      });
    }
  };

  private updateGlow(graphics: Phaser.GameObjects.Graphics, width: number, height: number, color: number) {
    graphics.clear();
    // Outer glow
    for (let i = 1; i <= 10; i++) {
      graphics.lineStyle(i * 2 * this.scaleFactor, color, 0.1 / i);
      graphics.strokeRoundedRect(-i * this.scaleFactor, -i * this.scaleFactor, width + i * 2 * this.scaleFactor, height + i * 2 * this.scaleFactor, 20 * this.scaleFactor + i * this.scaleFactor);
    }
    // Inner highlight
    graphics.lineStyle(3 * this.scaleFactor, color, 0.5);
    graphics.strokeRoundedRect(0, 0, width, height, 20 * this.scaleFactor);
  }

  private handleHpUpdated = (data: any) => {
    const isUser = data.character === 'USER';
    const bar = isUser ? this.userHpBar : this.opponentHpBar;
    const text = isUser ? this.userHpText : this.opponentHpText;
    const color = isUser ? HUD_CONFIG.colors.hp : HUD_CONFIG.colors.opponentHp;
    const barWidth = isUser ? 360 * this.scaleFactor : HUD_CONFIG.barWidth;
    this.updateBar(bar, data.hp / data.maxHp, color, barWidth);
    if (text) {
      text.setText(`${Math.floor(data.hp)}/${data.maxHp}`);
    }
  };

  private handleChargeUpdated = (data: any) => {
    const isUser = data.character === 'USER';
    const bar = isUser ? this.userChargeBar : this.opponentChargeBar;
    const text = isUser ? this.userChargeText : this.opponentChargeText;
    const color = isUser ? HUD_CONFIG.colors.charge : HUD_CONFIG.colors.opponentCharge;
    const barWidth = isUser ? 360 * this.scaleFactor : HUD_CONFIG.barWidth;
    this.updateBar(bar, data.charge / data.maxCharge, color, barWidth);
    if (text) {
      text.setText(`${Math.floor(data.charge)}/${data.maxCharge}`);
    }
  };

  private handlePowerUpdate = (power: number) => {
    this.powerText.setText(power.toString());
  };

  private initVisualGrid(offsetX: number, offsetY: number) {
    for (let r = 0; r < GRID_SIZE; r++) {
      this.visualGrid[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        // Add subtle cell background glow
        const cellX = offsetX + c * CELL_SIZE + CELL_SIZE / 2;
        const cellY = offsetY + r * CELL_SIZE + CELL_SIZE / 2;
        const cellBg = this.add.circle(cellX, cellY, CELL_SIZE * 0.4, 0xffffff, 0.03);
        cellBg.setBlendMode(Phaser.BlendModes.ADD);

        const logicCell = this.logic.grid[r][c]!;
        this.spawnVisualCell(r, c, offsetX, offsetY, logicCell.shape);
      }
    }
  }

  private spawnVisualCell(r: number, c: number, offsetX: number, offsetY: number, shape: ShapeType) {
    const x = offsetX + c * CELL_SIZE + CELL_SIZE / 2;
    const y = offsetY + r * CELL_SIZE + CELL_SIZE / 2;

    const container = this.add.container(x, y);
    const sprite = this.add.sprite(0, 0, `shape_${shape}`);
    container.add(sprite);

    container.setSize(CELL_SIZE, CELL_SIZE);

    this.visualGrid[r][c] = {
      sprite: container
    };

    return this.visualGrid[r][c];
  }

  public updateSelectionRect(r: number, c: number) {
    if (this.isProcessing) return;
    // Don't allow selection if it's opponent's turn
    if (CombatManager.getInstance().currentTurn !== 'USER') return;
    
    const cell = this.visualGrid[r][c];
    if (cell) {
      this.selectionRect.setPosition(cell.sprite.x, cell.sprite.y);
      this.selectionRect.setVisible(true);
    }
  }

  public async swapCells(r1: number, c1: number, r2: number, c2: number) {
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
      this.animateMove(vCell2.sprite, vCell1.sprite.x, vCell1.sprite.y)
    ]);

    // Logic swap
    this.logic.swap(r1, c1, r2, c2);
    this.visualGrid[r1][c1] = vCell2;
    this.visualGrid[r2][c2] = vCell1;

    // After swap, lCell1 is at r2, c2 and lCell2 is at r1, c1
    // But we can just check the grid at the new positions
    const newCell1 = this.logic.grid[r1][c1]!; // was lCell2
    const newCell2 = this.logic.grid[r2][c2]!; // was lCell1

    // Handle parasite swap logic
    if (newCell1.special === SpecialType.PARASITE || newCell2.special === SpecialType.PARASITE) {
      const parasite = newCell1.special === SpecialType.PARASITE ? newCell1 : newCell2;
      const other = newCell1.special === SpecialType.PARASITE ? newCell2 : newCell1;
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
        this.animateMove(vCell1.sprite, vCell2.sprite.x, vCell2.sprite.y), // vCell1 is at r2,c2, moving to r1,c1
        this.animateMove(vCell2.sprite, vCell1.sprite.x, vCell1.sprite.y)
      ]);
      this.logic.swap(r1, c1, r2, c2);
      this.visualGrid[r1][c1] = vCell1;
      this.visualGrid[r2][c2] = vCell2;
    } else {
      // Set the target cell for special creation to the cell the user moved TO (r2, c2)
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

  private animateMove(obj: Phaser.GameObjects.Container, x: number, y: number, ease: string = 'Power2') {
    return new Promise<void>(resolve => {
      // Create a particle emitter for the trail
      const emitter = this.add.particles(0, 0, 'particle', {
        speed: { min: 10, max: 30 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.5, end: 0 },
        lifespan: 300,
        blendMode: 'ADD',
        tint: 0xffffff
      });
      
      emitter.startFollow(obj);

      this.tweens.add({
        targets: obj,
        x, y,
        duration: 250,
        ease: ease,
        onComplete: () => {
          emitter.stop();
          this.time.delayedCall(300, () => emitter.destroy());
          resolve();
        }
      });
    });
  }

  private getOffsetX() {
    return (this.cameras.main.width - GRID_SIZE * CELL_SIZE) / 2;
  }

  private getOffsetY() {
    return (this.cameras.main.height - GRID_SIZE * CELL_SIZE) / 2;
  }

  private setSpecial(r: number, c: number, type: SpecialType) {
    const lCell = this.logic.grid[r][c];
    const vCell = this.visualGrid[r][c];
    if (lCell && vCell) {
      lCell.special = type;
      const overlay = this.add.sprite(0, 0, `special_${type}`);
      
      // Use additive blending for a glowing effect that doesn't obscure the base color
      if (type !== SpecialType.PARASITE) {
        overlay.setBlendMode(Phaser.BlendModes.ADD);
      }
      
      overlay.setAlpha(0.9);
      vCell.sprite.add(overlay);

      this.tweens.add({
        targets: overlay,
        scale: 1.15,
        alpha: 1,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  private spawnParticles(x: number, y: number, color: number) {
    const emitter = this.add.particles(x, y, 'particle', {
      speed: { min: 50, max: 150 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: color,
      lifespan: 500,
      quantity: 10,
      emitting: false
    });
    emitter.explode();
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private spawnFloatingText(x: number, y: number, text: string) {
    const floatText = this.add.text(x, y, text, {
      fontSize: '20px',
      fontFamily: 'monospace',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.tweens.add({
      targets: floatText,
      y: y - 40,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => floatText.destroy()
    });
  }

  private pendingSpecials: LogicCell[] = [];

  public destroyCell(r: number, c: number, isSpecial: boolean, spawnParticles: boolean = true, moveScore: number = 10, comboNumber: number = 1): Promise<void> {
    return new Promise(resolve => {
      const vCell = this.visualGrid[r][c];
      const lCell = this.logic.grid[r][c];
      
      if (vCell && lCell) {
        if (isSpecial && lCell.special !== SpecialType.NONE) {
          this.pendingSpecials.push({ ...lCell });
          SoundManager.getInstance().play(SoundType.SPECIAL);
        }
        
        this.logic.grid[r][c] = null;
        this.visualGrid[r][c] = null;

        // Emit GEMS_DESTROYED for CombatManager
        if (lCell.shape !== ShapeType.NONE) {
          this.game.events.emit('GEMS_DESTROYED', { shape: lCell.shape, count: 1, moveScore, comboNumber, powerSurge: this.powerSurge });
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
              scale: 0,
              alpha: 0,
              duration: 150,
              onComplete: () => {
                vCell.sprite.destroy();
                resolve();
              }
            });
          }
        });
      } else {
        resolve();
      }
    });
  }

  private async processBoard(giveScore = true, initialMatches?: MatchResult[]) {
    let matches = initialMatches || this.logic.findMatches();
    const hasEmpty = () => this.logic.grid.some(row => row.some(cell => cell === null));
    let comboNumber = 1;
    
    while (matches.length > 0 || this.pendingSpecials.length > 0 || hasEmpty()) {
      if (matches.length > 0) {
        SoundManager.getInstance().play(SoundType.MATCH);
        const toDestroy = new Map<string, number>(); // posStr -> moveScore
        const specialCreations: { r: number; c: number; type: SpecialType; shape: ShapeType }[] = [];

        matches.forEach(match => {
          if (match.specialCreation) {
            specialCreations.push(match.specialCreation);
          }
          match.cells.forEach(m => {
              const key = `${m.r},${m.c}`;
              // If a cell is part of multiple matches, we can just take the max score or add them. Let's just use the match score.
              if (!toDestroy.has(key)) {
                  toDestroy.set(key, match.score);
              } else {
                  toDestroy.set(key, Math.max(toDestroy.get(key)!, match.score));
              }
          });
        });

        const destroyPromises: Promise<void>[] = [];

        for (const [posStr, baseMatchScore] of toDestroy.entries()) {
          const [r, c] = posStr.split(',').map(Number);
          // Don't destroy the cell if it's going to become a special
          const isSpecialTarget = specialCreations.some(sc => sc.r === r && sc.c === c);
          
          // Apply compounding combo multiplier: 1.1^(combo - 1)
          const comboMultiplier = Math.pow(1.1, comboNumber - 1);
          const matchScore = Math.round(baseMatchScore * comboMultiplier);

          if (giveScore) {
            this.powerSurge += matchScore; // Add the scaled match score
            const x = this.getOffsetX() + c * CELL_SIZE + CELL_SIZE / 2;
            const y = this.getOffsetY() + r * CELL_SIZE + CELL_SIZE / 2;
            this.spawnFloatingText(x, y, `+${matchScore}`);
          }

          const lCell = this.logic.grid[r][c];
          if (lCell && lCell.shape !== ShapeType.NONE) {
            if (isSpecialTarget) {
              // For special targets, we don't call destroyCell, so we emit manually
              this.game.events.emit('GEMS_DESTROYED', { shape: lCell.shape, count: 1, moveScore: matchScore, comboNumber: comboNumber, powerSurge: this.powerSurge });
              
              // If the target cell already has a special effect, trigger it!
              if (lCell.special !== SpecialType.NONE) {
                this.pendingSpecials.push({ ...lCell });
              }
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
             // If the shape changed (e.g., becoming a Parasite with ShapeType.NONE), update it
             lCell.shape = sc.shape;
             
             // Re-create the visual cell to reflect the new shape
             vCell.sprite.destroy();
             this.visualGrid[sc.r][sc.c] = null;
             this.spawnVisualCell(sc.r, sc.c, this.getOffsetX(), this.getOffsetY(), sc.shape);
          }
          
          this.setSpecial(sc.r, sc.c, sc.type);
        });
      }

      while (this.pendingSpecials.length > 0) {
        const specialCell = this.pendingSpecials.shift()!;
        await this.activateSpecial(specialCell);
      }

      await this.fillGrid();
      matches = this.logic.findMatches();
      if (matches.length > 0) {
          comboNumber++;
      }
    }
    
    this.game.events.emit('POWER_UPDATE', this.powerSurge);
    
    if (!this.logic.hasPossibleMoves()) {
      console.log('No possible moves, shuffling board...');
      await this.shuffleBoard();
    }
  }

  public async shuffleBoard() {
    this.isProcessing = true;
    const offsetX = this.getOffsetX();
    const offsetY = this.getOffsetY();

    // Destroy all current visual cells
    const destroyPromises: Promise<void>[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.visualGrid[r][c]) {
          const vCell = this.visualGrid[r][c]!;
          destroyPromises.push(new Promise(resolve => {
            this.tweens.add({
              targets: vCell.sprite,
              scale: 0,
              alpha: 0,
              duration: 200,
              onComplete: () => {
                vCell.sprite.destroy();
                resolve();
              }
            });
          }));
          this.visualGrid[r][c] = null;
        }
      }
    }
    await Promise.all(destroyPromises);

    // Shuffle logic
    const updates = this.logic.shuffleBoard();

    // Spawn new visual cells
    const spawnPromises: Promise<void>[] = [];
    updates.forEach(u => {
      const vCell = this.spawnVisualCell(u.r, u.c, offsetX, offsetY, u.shape);
      if (u.special !== SpecialType.NONE) {
        this.setSpecial(u.r, u.c, u.special);
      }
      
      vCell.sprite.scale = 0;
      vCell.sprite.alpha = 0;
      spawnPromises.push(new Promise(resolve => {
        this.tweens.add({
          targets: vCell.sprite,
          scale: 1,
          alpha: 1,
          duration: 300,
          ease: 'Back.easeOut',
          onComplete: () => resolve()
        });
      }));
    });
    
    await Promise.all(spawnPromises);
    this.isProcessing = false;
  }

  private async fillGrid() {
    const offsetX = this.getOffsetX();
    const offsetY = this.getOffsetY();
    const animations: Promise<void>[] = [];

    const { drops, newCells } = this.logic.applyGravity();

    // Animate drops
    drops.forEach(drop => {
      const vCell = this.visualGrid[drop.r][drop.c]!;
      this.visualGrid[drop.newR][drop.c] = vCell;
      this.visualGrid[drop.r][drop.c] = null;
      animations.push(this.animateMove(vCell.sprite, offsetX + drop.c * CELL_SIZE + CELL_SIZE / 2, offsetY + drop.newR * CELL_SIZE + CELL_SIZE / 2, 'Bounce.easeOut'));
    });

    // Spawn and animate new cells
    newCells.forEach(nc => {
      const vCell = this.spawnVisualCell(nc.r, nc.c, offsetX, offsetY, nc.shape);
      vCell.sprite.y -= GRID_SIZE * CELL_SIZE;
      animations.push(this.animateMove(vCell.sprite, offsetX + nc.c * CELL_SIZE + CELL_SIZE / 2, offsetY + nc.r * CELL_SIZE + CELL_SIZE / 2, 'Bounce.easeOut'));
    });

    await Promise.all(animations);
  }

  private async activateSpecial(cell: LogicCell) {
    await this.effectManager.activateSpecial(cell);
  }

  public playPulsarVisual(r: number, c: number, isHorizontal: boolean, isVertical: boolean, width: number): void {
    const centerX = this.getOffsetX() + c * CELL_SIZE + CELL_SIZE / 2;
    const centerY = this.getOffsetY() + r * CELL_SIZE + CELL_SIZE / 2;
    const boardCenterX = this.getOffsetX() + GRID_SIZE * CELL_SIZE / 2;
    const boardCenterY = this.getOffsetY() + GRID_SIZE * CELL_SIZE / 2;
    
    if (isHorizontal) {
      const hBeam = this.add.rectangle(boardCenterX, centerY, GRID_SIZE * CELL_SIZE, CELL_SIZE * width, 0x00ffff, 0.5);
      hBeam.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: hBeam, scaleY: 0, alpha: 0, duration: 400, onComplete: () => hBeam.destroy() });
    }
    
    if (isVertical) {
      const vBeam = this.add.rectangle(centerX, boardCenterY, CELL_SIZE * width, GRID_SIZE * CELL_SIZE, 0xff00ff, 0.5);
      vBeam.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: vBeam, scaleX: 0, alpha: 0, duration: 400, onComplete: () => vBeam.destroy() });
    }
  }

  public async playMissileVisual(r: number, c: number, targetR: number, targetC: number): Promise<void> {
    const startX = this.getOffsetX() + c * CELL_SIZE + CELL_SIZE / 2;
    const startY = this.getOffsetY() + r * CELL_SIZE + CELL_SIZE / 2;
    const targetX = this.getOffsetX() + targetC * CELL_SIZE + CELL_SIZE / 2;
    const targetY = this.getOffsetY() + targetR * CELL_SIZE + CELL_SIZE / 2;

    const missile = this.add.sprite(startX, startY, 'special_missile');
    missile.setScale(0.5);
    
    const angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);
    missile.setRotation(angle + Math.PI / 2);

    const particles = this.add.particles(0, 0, 'particle', {
      speed: 50,
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xffaa00,
      lifespan: 300,
      follow: missile
    });

    return new Promise<void>(resolve => {
      this.tweens.add({
        targets: missile,
        x: targetX,
        y: targetY,
        duration: 400,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          particles.stop();
          missile.destroy();
          this.time.delayedCall(300, () => particles.destroy());
          resolve();
        }
      });
    });
  }

  public playBombVisual(r: number, c: number, radius: number): void {
    const centerX = this.getOffsetX() + c * CELL_SIZE + CELL_SIZE / 2;
    const centerY = this.getOffsetY() + r * CELL_SIZE + CELL_SIZE / 2;
    
    const explosion = this.add.circle(centerX, centerY, CELL_SIZE * 0.5, 0xffaa00, 0.8);
    explosion.setBlendMode(Phaser.BlendModes.ADD);
    
    this.tweens.add({
      targets: explosion,
      scale: radius * 2.5,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => explosion.destroy()
    });
  }

  public async playParasiteVortex(r: number, c: number, scale: number, duration: number): Promise<void> {
    const centerX = this.getOffsetX() + c * CELL_SIZE + CELL_SIZE / 2;
    const centerY = this.getOffsetY() + r * CELL_SIZE + CELL_SIZE / 2;

    const vortex = this.add.sprite(centerX, centerY, 'special_parasite');
    vortex.setScale(0);
    
    return new Promise<void>(resolve => {
      this.tweens.add({
        targets: vortex,
        scale: scale,
        angle: duration > 800 ? 1080 : 720,
        alpha: 0,
        duration: duration,
        ease: duration > 800 ? 'Cubic.easeIn' : 'Cubic.easeOut',
        onComplete: () => {
          vortex.destroy();
          resolve();
        }
      });
    });
  }

  public async playParasiteVisual(r: number, c: number, targetShape: ShapeType, targetCells: {r: number, c: number}[]): Promise<void> {
    const centerX = this.getOffsetX() + c * CELL_SIZE + CELL_SIZE / 2;
    const centerY = this.getOffsetY() + r * CELL_SIZE + CELL_SIZE / 2;

    const promises = targetCells.map(cell => {
      const targetX = this.getOffsetX() + cell.c * CELL_SIZE + CELL_SIZE / 2;
      const targetY = this.getOffsetY() + cell.r * CELL_SIZE + CELL_SIZE / 2;
      
      const beam = this.add.line(0, 0, centerX, centerY, targetX, targetY, 0xd946ef, 0.8);
      beam.setOrigin(0, 0);
      beam.setLineWidth(4);
      
      const particle = this.add.sprite(centerX, centerY, 'particle');
      particle.setTint(0xd946ef);
      particle.setScale(2);

      return new Promise<void>(resolve => {
        this.tweens.add({
          targets: particle,
          x: targetX,
          y: targetY,
          duration: 400,
          ease: 'Power2',
          onComplete: () => {
            particle.destroy();
            beam.destroy();
            resolve();
          }
        });
      });
    });

    if (promises.length > 0) {
      await Promise.all(promises);
    } else {
      await new Promise(resolve => this.time.delayedCall(400, resolve));
    }
  }

  public shakeCamera(duration: number, intensity: number): void {
    this.cameras.main.shake(duration, intensity);
  }

  public getGridSize(): number {
    return this.logic.gridSize;
  }

  public getGrid(): (LogicCell | null)[][] {
    return this.logic.grid;
  }

  shutdown() {
    if (this.opponentAI) {
      this.opponentAI.destroy();
      this.opponentAI = null;
    }
    
    this.game.events.off('HP_UPDATED', this.handleHpUpdated, this);
    this.game.events.off('CHARGE_UPDATED', this.handleChargeUpdated, this);
    this.game.events.off('POWER_UPDATE', this.handlePowerUpdate, this);
    this.game.events.off('TURN_SWITCHED', this.handleTurnSwitched, this);
    this.game.events.off('SKILL_EXECUTED', this.handleSkillExecuted, this);
    this.game.events.off('SKILL_MISSED', this.handleSkillMissed, this);
    this.game.events.off('GAME_OVER', this.handleGameOver, this);
  }
}
