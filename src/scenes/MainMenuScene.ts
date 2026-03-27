import Phaser from 'phaser';
import { GemRegistry, GemDefinition } from '../engine/GemRegistry';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData } from '../entities/Character';
import { SkillData } from '../entities/Skill';
import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';

/**
 * MainMenuScene — Cinematic title screen.
 *
 * Pro-level design:
 *   • Layered particle nebula background
 *   • Animated glitch/reveal title with glow
 *   • Premium glass buttons with staggered entrance
 *   • Decorative corner brackets and scan lines
 *   • Floating version badge
 */
export class MainMenuScene extends BaseScene {

  private uiContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('MainMenuScene');
  }

  /* ══════════════════════════════════════════════════════════
   *  PRELOAD — Load every shared asset the game needs.
   * ══════════════════════════════════════════════════════════ */

  preload() {
    this.load.image('menu_bg',           'https://picsum.photos/seed/genesis/1080/1920?blur=4');
    this.load.image('portrait_warrior',  'https://picsum.photos/seed/warrior/400/600');
    this.load.image('portrait_mage',     'https://picsum.photos/seed/mage/400/600');
    this.load.image('portrait_rogue',    'https://picsum.photos/seed/rogue/400/600');
    this.load.image('portrait_paladin',  'https://picsum.photos/seed/paladin/400/600');

    const gemIds = [
      'triangle', 'square', 'pentagon', 'hexagon', 'star',
      'none', 'pulsar', 'missile', 'bomb', 'parasite',
    ];
    gemIds.forEach(id => this.load.json(`gem_${id}`, `data/gems/${id}.json`));

    this.load.json('character_index', 'data/characters/index.json');
    this.load.on('filecomplete-json-character_index', (_k: string, _t: string, data: string[]) => {
      if (Array.isArray(data)) {
        data.forEach(charId => {
          this.load.json(`char_${charId}`,   `data/characters/${charId}/main.json`);
          this.load.json(`skills_${charId}`, `data/characters/${charId}/skills.json`);
        });
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
   *  CREATE — Register data, build UI, signal ready.
   * ══════════════════════════════════════════════════════════ */

  create() {
    try {
      this.registerGameData();
      this.buildUI();
      this.game.events.emit('SCENE_READY', 'MainMenuScene');
    } catch (error) {
      console.error('MainMenuScene creation failed:', error);
      this.game.events.emit('SCENE_READY', 'MainMenuScene');
    }
  }

  protected onResize() {
    this.buildUI();
  }

  /* ── Data Registration ──────────────────────────────────── */

  private registerGameData(): void {
    const gemRegistry = GemRegistry.getInstance();
    const gemIds = [
      'triangle', 'square', 'pentagon', 'hexagon', 'star',
      'none', 'pulsar', 'missile', 'bomb', 'parasite',
    ];
    gemIds.forEach(key => {
      const data = this.cache.json.get(`gem_${key}`) as GemDefinition;
      if (data) gemRegistry.registerGem(data);
    });

    const combatRegistry = CombatRegistry.getInstance();
    const charIndex = this.cache.json.get('character_index') as string[];
    if (charIndex && Array.isArray(charIndex)) {
      charIndex.forEach(charId => {
        const charData = this.cache.json.get(`char_${charId}`) as CharacterData;
        if (charData) combatRegistry.registerCharacter(charData);

        const skillsData = this.cache.json.get(`skills_${charId}`) as SkillData[];
        if (skillsData && Array.isArray(skillsData)) {
          skillsData.forEach(skill => combatRegistry.registerSkill(skill));
        }
      });
    }
  }

  /* ── Build UI ───────────────────────────────────────────── */

  private buildUI(): void {
    if (this.uiContainer) this.uiContainer.destroy();
    this.uiContainer = this.add.container(0, 0);

    const { colors, font, anim } = UITheme;

    // ── Background
    this.createSceneBackground(this.uiContainer);

    // ── Ambient particles
    const particleKey = this.textures.exists('star_particle') ? 'star_particle'
                      : this.textures.exists('particle')      ? 'particle'
                      : null;
    if (particleKey) {
      this.createAmbientParticles(this.uiContainer, colors.particleTint);
    }

    // ── Decorative corner brackets
    this.drawCornerBrackets(this.uiContainer);

    // ── Horizontal scan lines (subtle)
    this.drawScanLines(this.uiContainer);

    // ── Title Block ──────────────────────────────────────
    const titleY = this.gameHeight * 0.22;

    // Title glow (behind text)
    const titleGlow = this.add.graphics();
    titleGlow.fillStyle(colors.primary, 0.08);
    titleGlow.fillCircle(this.centerX, titleY + this.s(20), this.s(200));
    this.uiContainer.add(titleGlow);
    this.tweens.add({
      targets: titleGlow,
      alpha: 0.4,
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: anim.ease.sine,
    });

    // Main title
    const title = this.add.text(this.centerX, titleY, 'GENESIS', {
      fontSize:      font.size(120, this.scaleFactor),
      fontFamily:    font.family,
      fontStyle:     'bold',
      color:         colors.textPrimary,
      letterSpacing: this.s(30),
    }).setOrigin(0.5).setAlpha(0).setScale(0.9);
    this.uiContainer.add(title);

    // Subtitle
    const subtitle = this.add.text(this.centerX, titleY + this.s(100), 'PUZZLE QUEST', {
      fontSize:      font.size(32, this.scaleFactor),
      fontFamily:    font.family,
      fontStyle:     'bold',
      color:         colors.textAccent,
      letterSpacing: this.s(18),
    }).setOrigin(0.5).setAlpha(0);
    this.uiContainer.add(subtitle);

    // Decorative line under subtitle
    const lineY = titleY + this.s(140);
    const lineWidth = this.s(300);
    const lineGfx = this.add.graphics();
    lineGfx.setAlpha(0);
    this.uiContainer.add(lineGfx);

    // Draw the separator manually (since we need to animate it)
    const drawLine = () => {
      lineGfx.clear();
      const segments = 20;
      const segW = lineWidth / segments;
      for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const edgeFade = Math.sin(t * Math.PI);
        lineGfx.lineStyle(1, colors.primary, 0.5 * edgeFade);
        lineGfx.moveTo(this.centerX - lineWidth / 2 + i * segW, 0);
        lineGfx.lineTo(this.centerX - lineWidth / 2 + (i + 1) * segW, 0);
      }
      lineGfx.strokePath();
      // Center diamond
      const d = this.s(5);
      lineGfx.fillStyle(colors.primary, 0.6);
      lineGfx.beginPath();
      lineGfx.moveTo(this.centerX, -d);
      lineGfx.lineTo(this.centerX + d, 0);
      lineGfx.lineTo(this.centerX, d);
      lineGfx.lineTo(this.centerX - d, 0);
      lineGfx.closePath();
      lineGfx.fillPath();
    };
    drawLine();
    lineGfx.setPosition(0, lineY);

    // ── Title Animations
    this.tweens.add({
      targets: title,
      alpha: 1, scale: 1,
      duration: 1500,
      ease: anim.ease.out,
    });
    this.tweens.add({
      targets: subtitle,
      alpha: 1,
      y: titleY + this.s(105),
      duration: 1000,
      delay: 400,
      ease: anim.ease.out,
    });
    this.tweens.add({
      targets: lineGfx,
      alpha: 1,
      duration: 800,
      delay: 800,
      ease: anim.ease.out,
    });

    // ── Buttons ──────────────────────────────────────────
    const buttonY = this.gameHeight * 0.58;
    const spacing = this.s(95);

    const buttons = [
      { label: 'START GAME', color: colors.primary,  cb: () => this.scene.start('LobbyScene') },
      { label: 'OPTIONS',    color: colors.accent,   cb: () => console.log('Options') },
      { label: 'EXIT',       color: colors.danger,   cb: () => console.log('Exit') },
    ];
    buttons.forEach((def, i) => {
      const btn = this.createMenuButton(
        this.centerX, buttonY + i * spacing,
        def.label, def.cb, def.color,
      );
      this.uiContainer.add(btn);
      this.animateSlideIn(btn, 900 + i * anim.stagger);
    });

    // ── Bottom info bar ──────────────────────────────────
    const bottomY = this.gameHeight - this.s(50);

    // Version badge
    const version = this.add.text(this.centerX, bottomY, 'v0.1 ALPHA', {
      fontSize:      font.size(12, this.scaleFactor),
      fontFamily:    font.family,
      color:         colors.textDim,
      letterSpacing: this.s(3),
    }).setOrigin(0.5).setAlpha(0);
    this.uiContainer.add(version);
    this.tweens.add({ targets: version, alpha: 0.6, duration: 2000, delay: 1600 });

    // Status dots (decorative)
    const dotY = bottomY - this.s(20);
    for (let i = 0; i < 3; i++) {
      const dot = this.add.circle(
        this.centerX + (i - 1) * this.s(16),
        dotY,
        this.s(3),
        colors.primary,
        i === 0 ? 0.8 : 0.2,
      );
      this.uiContainer.add(dot);
      this.tweens.add({ targets: dot, alpha: dot.alpha, duration: 1500, delay: 1800 });
    }
  }

  /* ── Decorative Corner Brackets ─────────────────────────── */

  private drawCornerBrackets(container: Phaser.GameObjects.Container): void {
    const { colors } = UITheme;
    const gfx = this.add.graphics();
    const len = this.s(40);
    const margin = this.s(20);
    const alpha = 0.2;
    const lineW = 2;

    gfx.lineStyle(lineW, colors.primary, alpha);

    // Top-left
    gfx.moveTo(margin, margin + len);
    gfx.lineTo(margin, margin);
    gfx.lineTo(margin + len, margin);

    // Top-right
    gfx.moveTo(this.gameWidth - margin - len, margin);
    gfx.lineTo(this.gameWidth - margin, margin);
    gfx.lineTo(this.gameWidth - margin, margin + len);

    // Bottom-left
    gfx.moveTo(margin, this.gameHeight - margin - len);
    gfx.lineTo(margin, this.gameHeight - margin);
    gfx.lineTo(margin + len, this.gameHeight - margin);

    // Bottom-right
    gfx.moveTo(this.gameWidth - margin - len, this.gameHeight - margin);
    gfx.lineTo(this.gameWidth - margin, this.gameHeight - margin);
    gfx.lineTo(this.gameWidth - margin, this.gameHeight - margin - len);

    gfx.strokePath();
    container.add(gfx);
  }

  /* ── Scan Lines ─────────────────────────────────────────── */

  private drawScanLines(container: Phaser.GameObjects.Container): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0xffffff, 0.01);
    const step = this.s(4);
    for (let y = 0; y < this.gameHeight; y += step * 2) {
      gfx.fillRect(0, y, this.gameWidth, step);
    }
    container.add(gfx);
  }
}
