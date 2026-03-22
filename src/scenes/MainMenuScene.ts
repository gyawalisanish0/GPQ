import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';

/**
 * MainMenuScene — Title screen with animated entrance sequence.
 *
 * Layout zones (1080×1920 design space):
 *   ┌─────────────────────────────┐
 *   │       ambient particles     │
 *   │                             │
 *   │        G E N E S I S        │  ← 25% height
 *   │       PUZZLE  QUEST         │  ← 35% height
 *   │                             │
 *   │      [ START  GAME ]        │  ← 60% height
 *   │      [  OPTIONS   ]         │
 *   │      [   EXIT     ]         │
 *   │                             │
 *   │         v0.1 alpha          │
 *   └─────────────────────────────┘
 */
export class MainMenuScene extends BaseScene {

  private uiContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('MainMenuScene');
  }

  create() {
    this.buildUI();
  }

  protected onResize() {
    this.buildUI();
  }

  /* ── Build ──────────────────────────────────────────────── */

  private buildUI(): void {
    if (this.uiContainer) this.uiContainer.destroy();
    this.uiContainer = this.add.container(0, 0);

    const { colors, font, anim } = UITheme;

    // ── Background + Particles ───────────────────────────
    this.createSceneBackground(this.uiContainer);

    if (this.textures.exists('star_particle')) {
      const particles = this.add.particles(this.centerX, this.gameHeight * 0.4, 'star_particle', {
        x: { min: -this.gameWidth / 2, max: this.gameWidth / 2 },
        y: { min: -200 * this.scaleFactor, max: 200 * this.scaleFactor },
        speed: { min: 5 * this.scaleFactor, max: 50 * this.scaleFactor },
        scale: { start: 0.4 * this.scaleFactor, end: 0 },
        alpha: { start: 0.3, end: 0 },
        lifespan: 3000,
        frequency: 50,
        blendMode: 'ADD',
        tint: colors.particleTint,
      });
      this.uiContainer.add(particles);
    }

    // ── Title Block ──────────────────────────────────────
    const titleY = this.gameHeight * 0.25;
    const title = this.add.text(this.centerX, titleY, 'GENESIS', {
      fontSize:      font.size(140, this.scaleFactor),
      fontFamily:    font.family,
      fontStyle:     'bold',
      color:         colors.textPrimary,
      letterSpacing: this.s(25),
    }).setOrigin(0.5).setAlpha(0).setScale(0.8);
    this.uiContainer.add(title);

    const subtitleY = this.gameHeight * 0.35;
    const subtitle = this.add.text(this.centerX, subtitleY, 'PUZZLE QUEST', {
      fontSize:      font.size(36, this.scaleFactor),
      fontFamily:    font.family,
      fontStyle:     'bold',
      color:         colors.textAccent,
      letterSpacing: this.s(15),
    }).setOrigin(0.5).setAlpha(0);
    this.uiContainer.add(subtitle);

    // Title entrance
    this.tweens.add({
      targets: title,
      alpha: 1,
      scale: 1,
      duration: 1500,
      ease: anim.ease.out,
    });

    this.tweens.add({
      targets: subtitle,
      alpha: 1,
      y: this.gameHeight * 0.38,
      duration: 1000,
      delay: 500,
      ease: anim.ease.out,
    });

    // ── Menu Buttons ─────────────────────────────────────
    const buttonY       = this.gameHeight * 0.60;
    const buttonSpacing = this.s(90);

    const buttons = [
      { label: 'START GAME', color: colors.primary, cb: () => this.scene.start('LobbyScene') },
      { label: 'OPTIONS',    color: colors.accent,  cb: () => console.log('Options clicked') },
      { label: 'EXIT',       color: colors.danger,  cb: () => console.log('Exit clicked') },
    ];

    buttons.forEach((def, i) => {
      const y = buttonY + i * buttonSpacing;
      const btn = this.createMenuButton(this.centerX, y, def.label, def.cb, def.color);
      this.uiContainer.add(btn);

      // Staggered slide-in from left
      this.animateSlideIn(btn, 1000 + i * anim.stagger);
    });

    // ── Version Tag ──────────────────────────────────────
    const version = this.add.text(
      this.centerX,
      this.gameHeight - this.s(40),
      'v0.1 ALPHA',
      {
        fontSize:   font.size(14, this.scaleFactor),
        fontFamily: font.family,
        color:      colors.textMuted,
      },
    ).setOrigin(0.5).setAlpha(0);
    this.uiContainer.add(version);

    this.tweens.add({
      targets: version,
      alpha: 0.5,
      duration: 2000,
      delay: 1800,
    });
  }
}
