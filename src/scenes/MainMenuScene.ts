import Phaser from 'phaser';
import { GemRegistry, GemDefinition } from '../engine/GemRegistry';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData } from '../entities/Character';
import { SkillData } from '../entities/Skill';
import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';

/**
 * MainMenuScene — Boot + Title screen.
 *
 * This scene is the FIRST to load. It handles:
 *   1. preload() — loads ALL shared game assets (images, JSON data)
 *   2. create()  — registers gems/characters into singletons, builds UI, emits SCENE_READY
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
      // ★ Critical — dismisses the React loading overlay in App.tsx
      this.game.events.emit('SCENE_READY', 'MainMenuScene');
    } catch (error) {
      console.error('MainMenuScene creation failed:', error);
      // Emit anyway so user isn't stuck permanently
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

    // ── Particles (use whichever texture key exists)
    const particleKey = this.textures.exists('star_particle') ? 'star_particle'
                      : this.textures.exists('particle')      ? 'particle'
                      : null;
    if (particleKey) {
      const particles = this.add.particles(this.centerX, this.gameHeight * 0.4, particleKey, {
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

    // ── Title
    const title = this.add.text(this.centerX, this.gameHeight * 0.25, 'GENESIS', {
      fontSize: font.size(140, this.scaleFactor), fontFamily: font.family,
      fontStyle: 'bold', color: colors.textPrimary, letterSpacing: this.s(25),
    }).setOrigin(0.5).setAlpha(0).setScale(0.8);
    this.uiContainer.add(title);

    const subtitle = this.add.text(this.centerX, this.gameHeight * 0.35, 'PUZZLE QUEST', {
      fontSize: font.size(36, this.scaleFactor), fontFamily: font.family,
      fontStyle: 'bold', color: colors.textAccent, letterSpacing: this.s(15),
    }).setOrigin(0.5).setAlpha(0);
    this.uiContainer.add(subtitle);

    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 1500, ease: anim.ease.out });
    this.tweens.add({ targets: subtitle, alpha: 1, y: this.gameHeight * 0.38, duration: 1000, delay: 500, ease: anim.ease.out });

    // ── Buttons
    const buttonY = this.gameHeight * 0.60;
    const spacing = this.s(90);

    const buttons = [
      { label: 'START GAME', color: colors.primary, cb: () => this.scene.start('LobbyScene') },
      { label: 'OPTIONS',    color: colors.accent,  cb: () => console.log('Options') },
      { label: 'EXIT',       color: colors.danger,  cb: () => console.log('Exit') },
    ];
    buttons.forEach((def, i) => {
      const btn = this.createMenuButton(this.centerX, buttonY + i * spacing, def.label, def.cb, def.color);
      this.uiContainer.add(btn);
      this.animateSlideIn(btn, 1000 + i * anim.stagger);
    });

    // ── Version tag
    const version = this.add.text(this.centerX, this.gameHeight - this.s(40), 'v0.1 ALPHA', {
      fontSize: font.size(14, this.scaleFactor), fontFamily: font.family, color: colors.textMuted,
    }).setOrigin(0.5).setAlpha(0);
    this.uiContainer.add(version);
    this.tweens.add({ targets: version, alpha: 0.5, duration: 2000, delay: 1800 });
  }
}
