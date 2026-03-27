import Phaser from 'phaser';
import { UITheme } from './UITheme';

/**
 * BaseScene — Pro-level foundation for every scene in Genesis Puzzle Quest.
 *
 * Provides:
 *  • Responsive dimension tracking (gameWidth, gameHeight, scaleFactor)
 *  • Resize lifecycle (onResize)
 *  • Premium UI primitives: glass panels, gradient buttons, animated bars,
 *    decorative separators, scanline overlays, particle systems
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
   * Draws a premium deep-space gradient background with vignette overlay.
   */
  protected createSceneBackground(container: Phaser.GameObjects.Container): void {
    const { colors } = UITheme;

    // Deep space gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(
      colors.bgDeep, colors.bgDeep,
      colors.bgPanel, colors.bgGlass,
      1, 1, 1, 1,
    );
    bg.fillRect(0, 0, this.gameWidth, this.gameHeight);
    container.add(bg);

    // Subtle radial vignette overlay
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0.3);
    vignette.fillRect(0, 0, this.gameWidth, this.gameHeight * 0.15);
    vignette.fillStyle(0x000000, 0.4);
    vignette.fillRect(0, this.gameHeight * 0.85, this.gameWidth, this.gameHeight * 0.15);
    container.add(vignette);

    // Optional texture overlay (if loaded)
    if (this.textures.exists('menu_bg')) {
      const tex = this.add.image(this.centerX, this.centerY, 'menu_bg')
        .setDisplaySize(this.gameWidth, this.gameHeight)
        .setAlpha(0.12)
        .setTint(0x3b82f6);
      container.add(tex);
    }

    // Subtle grid pattern overlay for sci-fi feel
    const grid = this.add.graphics();
    grid.lineStyle(1, 0xffffff, 0.02);
    const gridStep = this.s(60);
    for (let x = 0; x < this.gameWidth; x += gridStep) {
      grid.moveTo(x, 0);
      grid.lineTo(x, this.gameHeight);
    }
    for (let y = 0; y < this.gameHeight; y += gridStep) {
      grid.moveTo(0, y);
      grid.lineTo(this.gameWidth, y);
    }
    grid.strokePath();
    container.add(grid);
  }

  /* ── Ambient Particles ──────────────────────────────────── */

  protected createAmbientParticles(
    container: Phaser.GameObjects.Container,
    tint: number = UITheme.colors.particleTint,
  ): void {
    if (!this.textures.exists('star_particle')) return;

    // Primary slow-rising particles
    const particles = this.add.particles(0, 0, 'star_particle', {
      x: { min: 0, max: this.gameWidth },
      y: { min: this.gameHeight, max: this.gameHeight + 100 },
      lifespan: 12000,
      speedY:   { min: -8, max: -25 },
      speedX:   { min: -5, max: 5 },
      scale:    { start: 0.3, end: 1.8 },
      alpha:    { start: 0, end: 0.4, ease: 'Sine.easeInOut' },
      quantity: 1,
      frequency: 250,
      blendMode: 'ADD',
      tint,
    });
    container.add(particles);

    // Secondary sparse purple particles for depth
    const particles2 = this.add.particles(0, 0, 'star_particle', {
      x: { min: 0, max: this.gameWidth },
      y: { min: this.gameHeight, max: this.gameHeight + 200 },
      lifespan: 15000,
      speedY:   { min: -5, max: -15 },
      speedX:   { min: -8, max: 8 },
      scale:    { start: 0.5, end: 2.5 },
      alpha:    { start: 0, end: 0.2, ease: 'Sine.easeInOut' },
      quantity: 1,
      frequency: 600,
      blendMode: 'ADD',
      tint: UITheme.colors.particleAlt,
    });
    container.add(particles2);
  }

  /* ── Decorative Separator Line ──────────────────────────── */

  /**
   * Draws a horizontal decorative separator with gradient fade on edges.
   */
  protected createSeparator(
    container: Phaser.GameObjects.Container,
    x: number, y: number,
    width: number,
    color: number = UITheme.colors.borderGlow,
    alpha: number = 0.3,
  ): Phaser.GameObjects.Graphics {
    const gfx = this.add.graphics();
    const segments = 20;
    const segW = width / segments;

    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const edgeFade = Math.sin(t * Math.PI);
      gfx.lineStyle(1, color, alpha * edgeFade);
      gfx.moveTo(x + i * segW, y);
      gfx.lineTo(x + (i + 1) * segW, y);
    }
    gfx.strokePath();

    // Center diamond accent
    const diamondSize = this.s(6);
    gfx.fillStyle(color, alpha * 0.8);
    gfx.beginPath();
    gfx.moveTo(x + width / 2, y - diamondSize);
    gfx.lineTo(x + width / 2 + diamondSize, y);
    gfx.lineTo(x + width / 2, y + diamondSize);
    gfx.lineTo(x + width / 2 - diamondSize, y);
    gfx.closePath();
    gfx.fillPath();

    container.add(gfx);
    return gfx;
  }

  /* ── Scene Header ───────────────────────────────────────── */

  /**
   * Renders a premium scene title with optional subtitle and decorative underline.
   */
  protected createHeader(
    container: Phaser.GameObjects.Container,
    title: string,
    subtitle?: string,
    opts: { titleSize?: number; subtitleSize?: number; y?: number; color?: string } = {},
  ): { title: Phaser.GameObjects.Text; subtitle?: Phaser.GameObjects.Text } {
    const { font, colors } = UITheme;
    const titleSize    = opts.titleSize    ?? 42;
    const subtitleSize = opts.subtitleSize ?? 20;
    const yPos         = opts.y            ?? UITheme.spacing.edge * 1.6;
    const color        = opts.color        ?? colors.textAccent;

    const titleObj = this.add.text(this.centerX, this.s(yPos), title, {
      fontSize:     font.size(titleSize, this.scaleFactor),
      fontFamily:   font.family,
      fontStyle:    'bold',
      color,
      letterSpacing: this.s(6),
    }).setOrigin(0.5);
    container.add(titleObj);

    // Decorative underline
    const lineWidth = Math.min(titleObj.width * 1.2, this.gameWidth * 0.6);
    this.createSeparator(
      container,
      this.centerX - lineWidth / 2,
      titleObj.y + this.s(titleSize / 2 + 12),
      lineWidth,
      UITheme.colors.primary,
      0.4,
    );

    let subObj: Phaser.GameObjects.Text | undefined;
    if (subtitle) {
      subObj = this.add.text(this.centerX, titleObj.y + this.s(titleSize + 20), subtitle, {
        fontSize:     font.size(subtitleSize, this.scaleFactor),
        fontFamily:   font.family,
        color:        colors.textSecondary,
        letterSpacing: this.s(3),
      }).setOrigin(0.5);
      container.add(subObj);
    }

    return { title: titleObj, subtitle: subObj };
  }

  /* ── Buttons ────────────────────────────────────────────── */

  /**
   * Creates a premium large menu button with glass background,
   * glowing border, and animated hover state.
   */
  protected createMenuButton(
    x: number, y: number,
    label: string,
    callback: () => void,
    color: number = UITheme.colors.primary,
    width: number = UITheme.sizes.buttonWidth,
    height: number = UITheme.sizes.buttonHeight,
  ): Phaser.GameObjects.Container {
    const { font, anim, radius, glass } = UITheme;
    const w = this.s(width);
    const h = this.s(height);

    const container = this.add.container(x, y);

    // Outer glow (behind everything)
    const outerGlow = this.add.rectangle(0, 0, w + 8, h + 8, color, 0)
      .setStrokeStyle(3, color, 0);

    // Glass background
    const bg = this.add.rectangle(0, 0, w, h, 0x0a1628, 0.7)
      .setStrokeStyle(1, color, 0.4)
      .setInteractive({ useHandCursor: true });

    // Inner highlight (top edge shine)
    const highlight = this.add.graphics();
    highlight.fillStyle(0xffffff, 0.05);
    highlight.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.4, { tl: radius.md, tr: radius.md, bl: 0, br: 0 });

    // Accent line on left edge
    const accentLine = this.add.graphics();
    accentLine.fillStyle(color, 0.8);
    accentLine.fillRect(-w / 2, -h / 2 + 4, 3, h - 8);

    const text = this.add.text(0, 0, label, {
      fontSize:      font.size(26, this.scaleFactor),
      fontFamily:    font.family,
      fontStyle:     'bold',
      color:         '#f8fafc',
      letterSpacing: this.s(5),
    }).setOrigin(0.5);

    container.add([outerGlow, bg, highlight, accentLine, text]);

    bg.on('pointerdown', callback);

    bg.on('pointerover', () => {
      bg.setFillStyle(color, 0.15);
      bg.setStrokeStyle(2, color, 0.8);
      this.tweens.add({ targets: container, scale: 1.04, duration: anim.fast, ease: anim.ease.out });
      this.tweens.add({ targets: outerGlow, alpha: 1, duration: anim.fast });
      outerGlow.setStrokeStyle(4, color, 0.3);
      accentLine.setAlpha(1);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(0x0a1628, 0.7);
      bg.setStrokeStyle(1, color, 0.4);
      this.tweens.add({ targets: container, scale: 1, duration: anim.fast, ease: anim.ease.out });
      this.tweens.add({ targets: outerGlow, alpha: 1, duration: anim.fast });
      outerGlow.setStrokeStyle(3, color, 0);
      accentLine.setAlpha(1);
    });

    return container;
  }

  /**
   * Creates a premium compact utility button with glass effect.
   */
  protected createCompactButton(
    x: number, y: number,
    label: string,
    callback: () => void,
    color: number = UITheme.colors.primary,
    width: number = UITheme.sizes.buttonWidthSmall,
  ): Phaser.GameObjects.Container {
    const { font, anim, glass } = UITheme;
    const w = this.s(width);
    const h = this.s(UITheme.sizes.buttonHeightSmall);

    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, w, h, color, 0.15)
      .setStrokeStyle(1, color, 0.6)
      .setInteractive({ useHandCursor: true });

    // Accent dot on left
    const dot = this.add.circle(-w / 2 + this.s(12), 0, this.s(3), color, 0.8);

    const text = this.add.text(this.s(4), 0, label, {
      fontSize:      font.size(16, this.scaleFactor),
      fontFamily:    font.family,
      fontStyle:     'bold',
      color:         '#f8fafc',
      letterSpacing: this.s(2),
    }).setOrigin(0.5);

    container.add([bg, dot, text]);

    bg.on('pointerdown', callback);
    bg.on('pointerover', () => {
      bg.setFillStyle(color, 0.3);
      bg.setStrokeStyle(2, color, 0.9);
      this.tweens.add({ targets: container, scale: 1.06, duration: anim.fast });
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(color, 0.15);
      bg.setStrokeStyle(1, color, 0.6);
      this.tweens.add({ targets: container, scale: 1, duration: anim.fast });
    });

    return container;
  }

  /* ── Glass Panel ───────────────────────────────────────── */

  /**
   * Draws a premium glass-morphism panel with layered depth:
   * - Dark fill with configurable alpha
   * - Subtle inner highlight on top edge
   * - Thin border with glow
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
      glowColor?:   number;
      glowAlpha?:   number;
    } = {},
  ): Phaser.GameObjects.Graphics {
    const gfx = this.add.graphics();
    const fill   = opts.fillColor   ?? UITheme.colors.bgGlass;
    const fAlpha = opts.fillAlpha   ?? UITheme.glass.fillAlpha;
    const sColor = opts.strokeColor ?? UITheme.colors.border;
    const sAlpha = opts.strokeAlpha ?? UITheme.glass.borderAlpha;
    const sWidth = opts.strokeWidth ?? 1;
    const r      = opts.radius      ?? UITheme.radius.lg;
    const gColor = opts.glowColor   ?? sColor;
    const gAlpha = opts.glowAlpha   ?? 0;

    // Outer glow (if specified)
    if (gAlpha > 0) {
      gfx.lineStyle(4, gColor, gAlpha);
      gfx.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, r + 2);
    }

    // Main fill
    gfx.fillStyle(fill, fAlpha);
    gfx.fillRoundedRect(x, y, w, h, r);

    // Border
    if (sWidth > 0) {
      gfx.lineStyle(sWidth, sColor, sAlpha);
      gfx.strokeRoundedRect(x, y, w, h, r);
    }

    // Inner top highlight (glass reflection)
    gfx.fillStyle(0xffffff, UITheme.glass.highlightAlpha);
    gfx.fillRoundedRect(x + 2, y + 2, w - 4, Math.min(h * 0.3, 30), { tl: r, tr: r, bl: 0, br: 0 });

    return gfx;
  }

  /* ── Progress Bar ───────────────────────────────────────── */

  /**
   * Draws a premium progress bar with:
   * - Dark rounded track
   * - Colored fill with highlight sheen
   * - Subtle inner shadow
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

    // Track background (darker, with inner shadow feel)
    gfx.fillStyle(0x0f172a, 0.9);
    gfx.fillRoundedRect(xPos, yPos, barWidth, height, radius);

    // Track inner shadow
    gfx.fillStyle(0x000000, 0.3);
    gfx.fillRoundedRect(xPos + 1, yPos + 1, barWidth - 2, height * 0.5, { tl: radius, tr: radius, bl: 0, br: 0 });

    // Filled portion
    if (clampedRatio > 0.01) {
      const fillWidth = Math.max(height, barWidth * clampedRatio);

      // Main fill
      gfx.fillStyle(color, 0.9);
      gfx.fillRoundedRect(xPos, yPos, fillWidth, height, radius);

      // Top highlight sheen
      gfx.fillStyle(0xffffff, 0.2);
      gfx.fillRoundedRect(xPos + 2, yPos + 2, fillWidth - 4, height * 0.35, { tl: radius, tr: radius, bl: 0, br: 0 });

      // Bright edge at the fill boundary (for liquid feel)
      if (clampedRatio < 0.99) {
        gfx.fillStyle(0xffffff, 0.15);
        gfx.fillRect(xPos + fillWidth - 3, yPos + 2, 2, height - 4);
      }
    }

    // Track border
    gfx.lineStyle(1, 0xffffff, 0.08);
    gfx.strokeRoundedRect(xPos, yPos, barWidth, height, radius);
  }

  /* ── Stat Row ───────────────────────────────────────────── */

  /**
   * Renders a horizontal row of stat chips with accent colors.
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
    const labelSize = opts.labelSize ?? 13;
    const valueSize = opts.valueSize ?? 14;

    const container = this.add.container(opts.x ?? 0, opts.y ?? 0);

    stats.forEach((stat, i) => {
      const sx = i * spacing;
      container.add(this.add.text(sx, 0, `${stat.label}`, {
        fontSize:   font.size(labelSize, this.scaleFactor),
        fontFamily: font.family,
        color:      colors.textDim,
      }));
      container.add(this.add.text(sx + this.s(28), 0, stat.value.toString(), {
        fontSize:   font.size(valueSize, this.scaleFactor),
        fontFamily: font.family,
        fontStyle:  'bold',
        color:      colors.textCyan,
      }));
    });

    return container;
  }

  /* ── Badge / Tag ─────────────────────────────────────────── */

  /**
   * Creates a small colored tag/badge (e.g., "EQUIPPED", "RARE", class labels).
   */
  protected createBadge(
    text: string,
    color: number = UITheme.colors.primary,
    opts: { fontSize?: number; paddingX?: number; paddingY?: number } = {},
  ): Phaser.GameObjects.Container {
    const { font } = UITheme;
    const fs  = opts.fontSize ?? 11;
    const px  = this.s(opts.paddingX ?? 12);
    const py  = this.s(opts.paddingY ?? 4);

    const container = this.add.container(0, 0);

    const label = this.add.text(0, 0, text, {
      fontSize:   font.size(fs, this.scaleFactor),
      fontFamily: font.family,
      fontStyle:  'bold',
      color:      '#000000',
    }).setOrigin(0.5);

    const bg = this.add.rectangle(0, 0, label.width + px * 2, label.height + py * 2, color, 0.9);
    bg.setStrokeStyle(1, color, 0.5);

    container.add([bg, label]);
    return container;
  }

  /* ── Entrance Animations ────────────────────────────────── */

  /** Fade + slide up an element from below with optional scale. */
  protected animateEntrance(
    target: Phaser.GameObjects.GameObject & { y: number; setAlpha: Function },
    delay: number = 0,
    distance: number = 40,
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

  /** Fade + slide from left. */
  protected animateSlideIn(
    target: Phaser.GameObjects.GameObject & { x: number; setAlpha: Function },
    delay: number = 0,
    distance: number = 60,
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

  /** Scale-pop entrance (from 0 to full scale). */
  protected animateScaleIn(
    target: Phaser.GameObjects.GameObject & { setAlpha: Function; setScale: Function },
    delay: number = 0,
  ): void {
    const { anim } = UITheme;
    target.setAlpha(0);
    target.setScale(0.6);
    this.tweens.add({
      targets: target,
      alpha: 1,
      scale: 1,
      duration: anim.slow,
      delay,
      ease: anim.ease.back,
    });
  }
}
