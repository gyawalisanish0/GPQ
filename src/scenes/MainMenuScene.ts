import Phaser from 'phaser';
import { GemRegistry, GemDefinition } from '../engine/GemRegistry';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData } from '../entities/Character';
import { SkillData } from '../entities/Skill';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  preload() {
    this.load.image('menu_bg', 'https://picsum.photos/seed/genesis/1080/1920?blur=4');
    this.load.image('portrait_warrior', 'https://picsum.photos/seed/warrior/400/600');
    this.load.image('portrait_mage', 'https://picsum.photos/seed/mage/400/600');
    this.load.image('portrait_rogue', 'https://picsum.photos/seed/rogue/400/600');
    this.load.image('portrait_paladin', 'https://picsum.photos/seed/paladin/400/600');
    
    this.load.json('gem_triangle', 'data/gems/triangle.json');
    this.load.json('gem_square', 'data/gems/square.json');
    this.load.json('gem_pentagon', 'data/gems/pentagon.json');
    this.load.json('gem_hexagon', 'data/gems/hexagon.json');
    this.load.json('gem_star', 'data/gems/star.json');
    this.load.json('gem_none', 'data/gems/none.json');
    this.load.json('gem_pulsar', 'data/gems/pulsar.json');
    this.load.json('gem_missile', 'data/gems/missile.json');
    this.load.json('gem_bomb', 'data/gems/bomb.json');
    this.load.json('gem_parasite', 'data/gems/parasite.json');

    // Load character index and dynamically load characters and skills
    this.load.json('character_index', 'data/characters/index.json');
    this.load.on('filecomplete-json-character_index', (key: string, type: string, data: string[]) => {
      data.forEach(charId => {
        this.load.json(`char_${charId}`, `data/characters/${charId}/main.json`);
        this.load.json(`skills_${charId}`, `data/characters/${charId}/skills.json`);
      });
    });
  }

  create() {
    try {
      // Register gems
      const registry = GemRegistry.getInstance();
      const gemKeys = ['triangle', 'square', 'pentagon', 'hexagon', 'star', 'none', 'pulsar', 'missile', 'bomb', 'parasite'];
      gemKeys.forEach(key => {
        const data = this.cache.json.get(`gem_${key}`) as GemDefinition;
        if (data) {
          registry.registerGem(data);
        }
      });

      // Register combat data
      const combatRegistry = CombatRegistry.getInstance();
      const charIndex = this.cache.json.get('character_index') as string[];
      
      if (charIndex) {
        charIndex.forEach(charId => {
          const charData = this.cache.json.get(`char_${charId}`) as CharacterData;
          if (charData) {
            combatRegistry.registerCharacter(charData);
          }

          const skillsData = this.cache.json.get(`skills_${charId}`) as SkillData[];
          if (skillsData && Array.isArray(skillsData)) {
            skillsData.forEach(skill => {
              combatRegistry.registerSkill(skill);
            });
          }
        });
      }

      const { width, height } = this.cameras.main;
      const scaleFactor = Math.min(width / 1080, height / 1920);

      // Background
      this.add.image(width / 2, height / 2, 'menu_bg').setDisplaySize(width, height);
      
      // Overlay
      this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);

      // Particle background
      const particles = this.add.particles(0, 0, 'particle', {
        x: { min: 0, max: width },
        y: { min: 0, max: height },
        speed: { min: 10 * scaleFactor, max: 50 * scaleFactor },
        scale: { start: 0.4 * scaleFactor, end: 0 },
        alpha: { start: 0.3, end: 0 },
        lifespan: 3000,
        frequency: 50,
        blendMode: 'ADD',
        tint: 0x10b981
      });

      // Title
      const title = this.add.text(width / 2, height * 0.25, 'GENESIS', {
        fontSize: `${Math.floor(140 * scaleFactor)}px`,
        fontFamily: 'monospace',
        color: '#ffffff',
        fontStyle: 'bold',
        letterSpacing: 25 * scaleFactor
      }).setOrigin(0.5).setAlpha(0).setScale(0.8);

      const subtitle = this.add.text(width / 2, height * 0.35, 'PUZZLE QUEST', {
        fontSize: `${Math.floor(36 * scaleFactor)}px`,
        fontFamily: 'monospace',
        color: '#10b981',
        fontStyle: 'bold',
        letterSpacing: 15 * scaleFactor
      }).setOrigin(0.5).setAlpha(0);

      this.tweens.add({
        targets: title,
        alpha: 1,
        scale: 1,
        duration: 1500,
        ease: 'Cubic.easeOut'
      });

      this.tweens.add({
        targets: subtitle,
        alpha: 1,
        y: height * 0.38,
        duration: 1000,
        delay: 500,
        ease: 'Cubic.easeOut'
      });

      // Buttons
      const buttonY = height * 0.65;
      const spacing = 90 * scaleFactor;

      const startBtn = this.createMenuButton(width / 2, buttonY, 'START GAME', () => {
        this.scene.start('LobbyScene');
      }, 0x10b981, scaleFactor);

      const optionsBtn = this.createMenuButton(width / 2, buttonY + spacing, 'OPTIONS', () => {
        console.log('Options clicked');
      }, 0x3b82f6, scaleFactor);

      const exitBtn = this.createMenuButton(width / 2, buttonY + spacing * 2, 'EXIT', () => {
        console.log('Exit clicked');
      }, 0xef4444, scaleFactor);

      [startBtn, optionsBtn, exitBtn].forEach((btn, i) => {
        btn.setAlpha(0);
        btn.x -= 50;
        this.tweens.add({
          targets: btn,
          alpha: 1,
          x: width / 2,
          duration: 800,
          delay: 1000 + i * 200,
          ease: 'Back.easeOut'
        });
      });

      this.game.events.emit('SCENE_READY', 'MainMenuScene');
    } catch (error) {
      console.error('MainMenuScene creation failed:', error);
    }
  }

  private createMenuButton(x: number, y: number, label: string, callback: () => void, color: number, scaleFactor: number = 1) {
    const container = this.add.container(x, y);
    
    const bg = this.add.rectangle(0, 0, 360 * scaleFactor, 70 * scaleFactor, 0x000000, 0.7)
        .setStrokeStyle(2, color)
        .setInteractive({ useHandCursor: true });
    
    const glow = this.add.rectangle(0, 0, 360 * scaleFactor, 70 * scaleFactor, color, 0)
        .setStrokeStyle(4, color);
    
    const text = this.add.text(0, 0, label, {
      fontSize: `${Math.floor(28 * scaleFactor)}px`,
      fontFamily: 'monospace',
      color: '#ffffff',
      fontStyle: 'bold',
      letterSpacing: 4 * scaleFactor
    }).setOrigin(0.5);

    container.add([bg, glow, text]);

    bg.on('pointerdown', callback);
    
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
