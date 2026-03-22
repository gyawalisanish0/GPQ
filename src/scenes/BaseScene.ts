import Phaser from 'phaser';
import { UITheme } from './UITheme';

/**
 * BaseScene — Foundation for every scene in Genesis Puzzle Quest.
 *
 * Provides:
 *  • Responsive dimension tracking (gameWidth, gameHeight, scaleFactor)
 *  • Resize lifecycle (onResize)
 *  • Shared UI primitives: buttons, panels, progress bars, headers, stat rows
 *
 * All pixel values accept *design-space* numbers (1080×1920 basis).
 * They are scaled internally via `this.s(value)`.
 */
export class BaseScene extends Phaser.Scene {

  // ── Responsive state ──────────────────────────────────────
  protected gameWidth:   number = 0;
  protected gameHeight:  number = 0;
  protected centerX:     number = 0;
  protected centerY:     number = 0;
  protected scaleFactor: number = 1;

  constructor(key: string) {
    super(key);
  }

  /* ── Lifecycle ──────────────────────────────────────────── */

  init(data?: any) {
    this.updateDimensions();
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
    });
    this.onInit(data);
  }

  protected onInit(_data?: any) { /* override */ }

  protected updateDimensions() {
    this.gameWidth  = this.cameras.main.width;
    this.gameHeight = this.cameras.main.height;
    this.centerX    = this.gameWidth  / 2;
    this.centerY    = this.gameHeight / 2;
    this.scaleFactor = Math.min(this.gameWidth / 1080, this.gameHeight / 1920);
  }

  protected handleResize(gameSize: Phaser.Structs.Size) {
    this.cameras.resize(gameSize.width, gameSize.height);
    this.updateDimensions();
    this.onResize();
  }

  protected onResize() { /* override */ }

  /* ── Scale helper ───────────────────────────────────────── */

  /** Scale a design-space value by the current scaleFactor. */
  protected s(v: number): number {
    return Math.floor(v * this.scaleFactor);
  }

  /* ── Layout helpers ─────────────────────────────────────── */

  protected getCenteredX(contentWidth: number): number {
    return (this.gameWidth - contentWidth) / 2;
  }

  protected getCenteredY(contentHeight: number, yOffset: number = 0): number {
    return (this.gameHeight - contentHeight) / 2 + this.s(yOffset);
  }

  /* ── Shared Background ──────────────────────────────────── */

  /**
   * Draws the standard deep-gradient background + subtle texture image.
   * Returns the container so the caller can manage depth.
   */
  protected createSceneBackground(container: Phaser.GameObjects.Container): void {
    const { colors } = UITheme;

    // Gradient fill
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a2a, 0x1a0a3a, 0x0a1a3a, 0x050515, 1, 1, 1, 1);
    bg.fillRect(0, 0, this.gameWidth, this.gameHeight);
    container.add(bg);

    // Optional texture overlay (if loaded)
    if (this.textures.exists('menu_bg')) {
      const tex = this.add.image(this.centerX, this.centerY, 'menu_bg')
        .setDisplaySize(this.gameWidth, this.gameHeight)
        .setAlpha(0.2);
      container.add(tex);
    }
  }

  /* ── Ambient Particles ──────────────────────────────────── */

  protected createAmbientParticles(
    container: Phaser.GameObjects.Container,
    tint: number = UITheme.colors.particleTint,
  ): void {
    if (!this.textures.exists('star_particle')) return;
    const particles = this.add.particles(0, 0, 'star_particle', {
      x: { min: 0, max: this.gameWidth },
      y: { min: this.gameHeight, max: this.gameHeight + 100 },
      lifespan: 10000,
      speedY:   { min: -10, max: -30 },
      speedX:   { min: -10, max: 10 },
      scale:    { start: 0.5, end: 1.5 },
      alpha:    { start: 0, end: 0.5, ease: 'Sine.easeInOut' },
      quantity: 1,
      frequency: 300,
      blendMode: 'ADD',
      tint,
    });
    container.add(particles);
  }

  /* ── Scene Header ───────────────────────────────────────── */

  /**
   * Renders a top-area scene title with optional subtitle.
   * Consistent placement across all pre-game scenes.
   */
  protected createHeader(
    container: Phaser.GameObjects.Container,
    title: string,
    subtitle?: string,
    opts: { titleSize?: number; subtitleSize?: number; y?: number; color?: string } = {},
  ): { title: Phaser.GameObjects.Text; subtitle?: Phaser.GameObjects.Text } {
    const { font, colors } = UITheme;
    const titleSize    = opts.titleSize    ?? 42;
    const subtitleSize = opts.subtitleSize ?? 22;
    const yPos         = opts.y            ?? UITheme.spacing.edge * 1.6;
    const color        = opts.color        ?? colors.textAccent;

    const titleObj = this.add.text(this.centerX, this.s(yPos), title, {
      fontSize:   font.size(titleSize, this.scaleFactor),
      fontFamily: font.family,
      fontStyle:  'bold',
      color,
    }).setOrigin(0.5);
    container.add(titleObj);

    let subObj: Phaser.GameObjects.Text | undefined;
    if (subtitle) {
      subObj = this.add.text(this.centerX, titleObj.y + this.s(titleSize + 10), subtitle, {
        fontSize:   font.size(subtitleSize, this.scaleFactor),
        fontFamily: font.family,
        color:      colors.textSecondary,
      }).setOrigin(0.5);
      container.add(subObj);
    }

    return { title: titleObj, subtitle: subObj };
  }

  /* ── Buttons ────────────────────────────────────────────── */

  /**
   * Creates a large menu-style button (main menu, start battle, etc.).
   * - Glowing border on hover, slight scale bump.
   * - Returns the interactive container.
   */
  protected createMenuButton(
    x: number, y: number,
    label: string,
    callback: () => void,
    color: number = UITheme.colors.primary,
    width: number = UITheme.sizes.buttonWidth,
    height: number = UITheme.sizes.buttonHeight,
  ): Phaser.GameObjects.Container {
    const { font, anim } = UITheme;
    const w = this.s(width);
    const h = this.s(height);

    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, w, h, 0x000000, 0.7)
      .setStrokeStyle(2, color)
      .setInteractive({ useHandCursor: true });

    const glow = this.add.rectangle(0, 0, w, h, color, 0)
      .setStrokeStyle(4, color);

    const text = this.add.text(0, 0, label, {
      fontSize:     font.size(28, this.scaleFactor),
      fontFamily:   font.family,
      fontStyle:    'bold',
      color:        '#ffffff',
      letterSpacing: this.s(4),
    }).setOrigin(0.5);

    container.add([bg, glow, text]);

    bg.on('pointerdown', callback);

    bg.on('pointerover', () => {
      bg.setFillStyle(color, 0.15);
      this.tweens.add({ targets: container, scale: 1.05, duration: anim.fast, ease: anim.ease.out });
      this.tweens.add({ targets: glow, alpha: 0.5, duration: anim.fast });
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(0x000000, 0.7);
      this.tweens.add({ targets: container, scale: 1, duration: anim.fast, ease: anim.ease.out });
      this.tweens.add({ targets: glow, alpha: 0, duration: anim.fast });
    });

    return container;
  }

  /**
   * Creates a compact utility button (Back, Next, etc.).
   * Consistent across Lobby and Loadout.
   */
  protected createCompactButton(
    x: number, y: number,
    label: string,
    callback: () => void,
    color: number = UITheme.colors.primary,
    width: number = UITheme.sizes.buttonWidthSmall,
  ): Phaser.GameObjects.Container {
    const { font, anim } = UITheme;
    const w = this.s(width);
    const h = this.s(UITheme.sizes.buttonHeightSmall);

    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, w, h, color, 0.8)
      .setStrokeStyle(1, color)
      .setInteractive({ useHandCursor: true });

    const text = this.add.text(0, 0, label, {
      fontSize:   font.size(18, this.scaleFactor),
      fontFamily: font.family,
      fontStyle:  'bold',
      color:      '#ffffff',
    }).setOrigin(0.5);

    container.add([bg, text]);

    bg.on('pointerdown', callback);
    bg.on('pointerover', () => {
      bg.setAlpha(1);
      this.tweens.add({ targets: container, scale: 1.05, duration: anim.fast });
    });
    bg.on('pointerout', () => {
      bg.setAlpha(0.8);
      this.tweens.add({ targets: container, scale: 1, duration: anim.fast });
    });

    return container;
  }

  /* ── Panel / Card ───────────────────────────────────────── */

  /**
   * Draws a dark translucent panel rectangle.
   * Returns the Graphics object for layering.
   */
  protected createPanel(
    x: number, y: number,
    w: number, h: number,
    opts: {
      fillColor?:   number;
      fillAlpha?:   number;
      strokeColor?: number;
      strokeAlpha?: number;
      strokeWidth?: number;
      radius?:      number;
    } = {},
  ): Phaser.GameObjects.Graphics {
    const gfx = this.add.graphics();
    const fill   = opts.fillColor   ?? UITheme.colors.bgOverlay;
    const fAlpha = opts.fillAlpha   ?? 0.6;
    const sColor = opts.strokeColor ?? UITheme.colors.border;
    const sAlpha = opts.strokeAlpha ?? 0.5;
    const sWidth = opts.strokeWidth ?? 2;
    const radius = opts.radius      ?? UITheme.radius.lg;

    gfx.fillStyle(fill, fAlpha);
    gfx.fillRoundedRect(x, y, w, h, radius);
    if (sWidth > 0) {
      gfx.lineStyle(sWidth, sColor, sAlpha);
      gfx.strokeRoundedRect(x, y, w, h, radius);
    }
    return gfx;
  }

  /* ── Progress Bar ───────────────────────────────────────── */

  /**
   * Draws (or redraws) a progress bar into the given Graphics object.
   * The bar features a subtle gradient feel and rounded caps.
   */
  protected drawProgressBar(
    gfx: Phaser.GameObjects.Graphics,
    ratio: number,
    color: number,
    barWidth: number,
    yPos: number,
    xPos: number = this.s(15),
    height: number = this.s(UITheme.sizes.barHeight),
  ): void {
    const clampedRatio = Phaser.Math.Clamp(ratio, 0, 1);
    const radius = height / 2;

    gfx.clear();

    // Track background
    gfx.fillStyle(0x1a1a2e, 0.8);
    gfx.fillRoundedRect(xPos, yPos, barWidth, height, radius);

    // Filled portion
    if (clampedRatio > 0.01) {
      const fillWidth = Math.max(height, barWidth * clampedRatio);
      gfx.fillStyle(color, 1);
      gfx.fillRoundedRect(xPos, yPos, fillWidth, height, radius);

      // Highlight sheen
      gfx.fillStyle(0xffffff, 0.15);
      gfx.fillRoundedRect(xPos + 2, yPos + 2, fillWidth - 4, height * 0.4, radius);
    }
  }

  /* ── Stat Row ───────────────────────────────────────────── */

  /**
   * Renders a horizontal row of stat chips: STR 12 | END 8 | PWR 6 …
   * Returns the container for positioning.
   */
  protected createStatRow(
    stats: { label: string; value: number }[],
    opts: {
      x?: number; y?: number;
      spacing?: number;
      labelSize?: number;
      valueSize?: number;
    } = {},
  ): Phaser.GameObjects.Container {
    const { font, colors } = UITheme;
    const spacing   = this.s(opts.spacing  ?? 68);
    const labelSize = opts.labelSize ?? 14;
    const valueSize = opts.valueSize ?? 14;

    const container = this.add.container(opts.x ?? 0, opts.y ?? 0);

    stats.forEach((stat, i) => {
      const sx = i * spacing;
      container.add(this.add.text(sx, 0, `${stat.label}:`, {
        fontSize:   font.size(labelSize, this.scaleFactor),
        fontFamily: font.family,
        color:      colors.textMuted,
      }));
      container.add(this.add.text(sx + this.s(26), 0, stat.value.toString(), {
        fontSize:   font.size(valueSize, this.scaleFactor),
        fontFamily: font.family,
        fontStyle:  'bold',
        color:      colors.textPrimary,
      }));
    });

    return container;
  }

  /* ── Entrance Animations ────────────────────────────────── */

  /** Fade + slide up an element from below. */
  protected animateEntrance(
    target: Phaser.GameObjects.GameObject & { y: number; setAlpha: Function },
    delay: number = 0,
    distance: number = 50,
  ): void {
    const { anim } = UITheme;
    const originalY = target.y;
    target.setAlpha(0);
    target.y += distance;
    this.tweens.add({
      targets: target,
      alpha: 1,
      y: originalY,
      duration: anim.slow,
      delay,
      ease: anim.ease.back,
    });
  }

  /** Fade + slide from left an element. */
  protected animateSlideIn(
    target: Phaser.GameObjects.GameObject & { x: number; setAlpha: Function },
    delay: number = 0,
    distance: number = 50,
  ): void {
    const { anim } = UITheme;
    const originalX = target.x;
    target.setAlpha(0);
    target.x -= distance;
    this.tweens.add({
      targets: target,
      alpha: 1,
      x: originalX,
      duration: anim.entrance,
      delay,
      ease: anim.ease.back,
    });
  }
}
