import Phaser from 'phaser';
import { GemRegistry, GemDefinition } from '../engine/GemRegistry';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData } from '../entities/Character';
import { SkillData } from '../entities/Skill';
import { BaseScene } from './BaseScene';
import { GlobalInputManager } from '../engine/GlobalInputManager';

export class MainMenuScene extends BaseScene {
  private uiContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('MainMenuScene');
  }

  preload() {
    this.load.image('menu_bg', 'https://picsum.photos/seed/genesis/1080/1920?blur=4');
    this.load.image('portrait_warrior', 'https://picsum.photos/seed/warrior/400/600');
    this.load.image('portrait_mage',    'https://picsum.photos/seed/mage/400/600');
    this.load.image('portrait_rogue',   'https://picsum.photos/seed/rogue/400/600');
    this.load.image('portrait_paladin', 'https://picsum.photos/seed/paladin/400/600');

    this.load.json('gem_triangle', 'data/gems/triangle.json');
    this.load.json('gem_square',   'data/gems/square.json');
    this.load.json('gem_pentagon', 'data/gems/pentagon.json');
    this.load.json('gem_hexagon',  'data/gems/hexagon.json');
    this.load.json('gem_star',     'data/gems/star.json');
    this.load.json('gem_none',     'data/gems/none.json');
    this.load.json('gem_pulsar',   'data/gems/pulsar.json');
    this.load.json('gem_missile',  'data/gems/missile.json');
    this.load.json('gem_bomb',     'data/gems/bomb.json');
    this.load.json('gem_parasite', 'data/gems/parasite.json');

    this.load.json('character_index', 'data/characters/index.json');
    this.load.on('filecomplete-json-character_index', (_key: string, _type: string, data: string[]) => {
      data.forEach(charId => {
        this.load.json(`char_${charId}`,   `data/characters/${charId}/main.json`);
        this.load.json(`skills_${charId}`, `data/characters/${charId}/skills.json`);
      });
    });
  }

  create() {
    try {
      /*
       * TEXTURE FIX
       * ──────────
       * 'particle' and 'star_particle' are generated inside Game_Scene.createTextures()
       * which runs only after the player enters a battle.  MainMenuScene and LoadoutScene
       * use particles for cosmetic effects and call this.add.particles() with those keys
       * BEFORE Game_Scene has ever run — Phaser emits a warning and falls back to the
       * missing-texture placeholder, but this can also cause a visible flash or error
       * on some builds.
       *
       * We create tiny 1-colour circle textures here (and in LoadoutScene) so every
       * scene that needs them has them available regardless of execution order.
       */
      if (!this.textures.exists('particle')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillCircle(4, 4, 4);
        g.generateTexture('particle', 8, 8);
        g.destroy();
      }
      if (!this.textures.exists('star_particle')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(2, 2, 2);
        g.generateTexture('star_particle', 4, 4);
        g.destroy();
      }

      // Register gems
      const registry = GemRegistry.getInstance();
      ['triangle', 'square', 'pentagon', 'hexagon', 'star', 'none', 'pulsar', 'missile', 'bomb', 'parasite'].forEach(key => {
        const data = this.cache.json.get(`gem_${key}`) as GemDefinition;
        if (data) registry.registerGem(data);
      });

      // Register characters and skills
      const combatRegistry = CombatRegistry.getInstance();
      const charIndex = this.cache.json.get('character_index') as string[];
      if (charIndex) {
        charIndex.forEach(charId => {
          const charData   = this.cache.json.get(`char_${charId}`)    as CharacterData;
          const skillsData = this.cache.json.get(`skills_${charId}`) as SkillData[];
          if (charData) combatRegistry.registerCharacter(charData);
          if (skillsData && Array.isArray(skillsData)) {
            skillsData.forEach(skill => combatRegistry.registerSkill(skill));
          }
        });
      }

      this.buildUI();
      this.game.events.emit('SCENE_READY', 'MainMenuScene');
    } catch (error) {
      console.error('MainMenuScene creation failed:', error);
    }
  }

  protected onResize() { this.buildUI(); }

  private buildUI() {
    if (this.uiContainer) this.uiContainer.destroy();
    this.uiContainer = this.add.container(0, 0);

    const bg = this.add.image(this.centerX, this.centerY, 'menu_bg').setDisplaySize(this.gameWidth, this.gameHeight);
    this.uiContainer.add(bg);

    const overlay = this.add.rectangle(this.centerX, this.centerY, this.gameWidth, this.gameHeight, 0x000000, 0.5);
    this.uiContainer.add(overlay);

    /*
     * The 'particle' texture is guaranteed to exist now (created in create() above).
     * Using 'star_particle' here would also work but the emerald tint looks better
     * with the plain white circle.
     */
    const particles = this.add.particles(0, 0, 'particle', {
      x: { min: 0, max: this.gameWidth },
      y: { min: 0, max: this.gameHeight },
      speed: { min: 10 * this.scaleFactor, max: 50 * this.scaleFactor },
      scale: { start: 0.4 * this.scaleFactor, end: 0 },
      alpha: { start: 0.3, end: 0 },
      lifespan: 3000,
      frequency: 50,
      blendMode: 'ADD',
      tint: 0x10b981
    });
    this.uiContainer.add(particles);

    const title = this.add.text(this.centerX, this.gameHeight * 0.25, 'GENESIS', {
      fontSize: `${Math.floor(140 * this.scaleFactor)}px`,
      fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold', letterSpacing: 25 * this.scaleFactor
    }).setOrigin(0.5).setAlpha(0).setScale(0.8);
    this.uiContainer.add(title);

    const subtitle = this.add.text(this.centerX, this.gameHeight * 0.35, 'PUZZLE QUEST', {
      fontSize: `${Math.floor(36 * this.scaleFactor)}px`,
      fontFamily: 'monospace', color: '#10b981', fontStyle: 'bold', letterSpacing: 15 * this.scaleFactor
    }).setOrigin(0.5).setAlpha(0);
    this.uiContainer.add(subtitle);

    this.tweens.add({ targets: title,    alpha: 1, scale: 1, duration: 1500, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: subtitle, alpha: 1, y: this.gameHeight * 0.38, duration: 1000, delay: 500, ease: 'Cubic.easeOut' });

    const buttonY = this.gameHeight * 0.65;
    const spacing = 90 * this.scaleFactor;

    const startBtn   = this.createMenuButton(this.centerX, buttonY,             'START GAME', () => { this.scene.start('LobbyScene'); }, 0x10b981);
    const optionsBtn = this.createMenuButton(this.centerX, buttonY + spacing,   'OPTIONS',    () => { console.log('Options'); }, 0x3b82f6);
    const exitBtn    = this.createMenuButton(this.centerX, buttonY + spacing*2, 'EXIT',       () => { console.log('Exit'); }, 0xef4444);

    [startBtn, optionsBtn, exitBtn].forEach((btn, i) => {
      this.uiContainer.add(btn);
      btn.setAlpha(0);
      btn.x -= 50;
      this.tweens.add({ targets: btn, alpha: 1, x: this.centerX, duration: 800, delay: 1000 + i * 200, ease: 'Back.easeOut' });
    });
  }

  private createMenuButton(x: number, y: number, label: string, callback: () => void, color: number) {
    const container = this.add.container(x, y);

    const bg   = this.add.rectangle(0, 0, 360 * this.scaleFactor, 70 * this.scaleFactor, 0x000000, 0.7)
      .setStrokeStyle(2, color)
      .setInteractive({ useHandCursor: true });
    const glow = this.add.rectangle(0, 0, 360 * this.scaleFactor, 70 * this.scaleFactor, color, 0).setStrokeStyle(4, color);
    const text = this.add.text(0, 0, label, {
      fontSize: `${Math.floor(28 * this.scaleFactor)}px`, fontFamily: 'monospace',
      color: '#ffffff', fontStyle: 'bold', letterSpacing: 4 * this.scaleFactor
    }).setOrigin(0.5);

    container.add([bg, glow, text]);

    /*
     * Use GlobalInputManager.makeTappable so that the callback fires on pointerup
     * only when the pointer hasn't moved (tap, not drag).  This prevents accidental
     * scene transitions when the user scrolls through the menu on a touch screen.
     */
    GlobalInputManager.getInstance().makeTappable(bg, callback);

    bg.on('pointerover', () => {
      bg.setFillStyle(color, 0.15);
      this.tweens.add({ targets: container, scale: 1.05, duration: 200, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: 0.5, duration: 200 });
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x000000, 0.7);
      this.tweens.add({ targets: container, scale: 1, duration: 200, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: 0, duration: 200 });
    });

    return container;
  }
}
