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
 *
 * TODO: Rebuild with pro-level cinematic title screen.
 * See docs/UI-LAYOUT.md for schematic.
 */
export class MainMenuScene extends BaseScene {

  constructor() {
    super('MainMenuScene');
  }

  /* ══════════════════════════════════════════════════════════
   *  PRELOAD — Load every shared asset the game needs.
   * ══════════════════════════════════════════════════════════ */

  preload() {
    this.load.image('menu_bg', 'https://picsum.photos/seed/genesis/1080/1920?blur=4');
    this.load.image('portrait_warrior', 'https://picsum.photos/seed/warrior/400/600');
    this.load.image('portrait_mage', 'https://picsum.photos/seed/mage/400/600');
    this.load.image('portrait_rogue', 'https://picsum.photos/seed/rogue/400/600');
    this.load.image('portrait_paladin', 'https://picsum.photos/seed/paladin/400/600');

    const gemIds = [
      'triangle', 'square', 'pentagon', 'hexagon', 'star',
      'none', 'pulsar', 'missile', 'bomb', 'parasite',
    ];
    gemIds.forEach(id => this.load.json(`gem_${id}`, `data/gems/${id}.json`));

    this.load.json('character_index', 'data/characters/index.json');
    this.load.on('filecomplete-json-character_index', (_k: string, _t: string, data: string[]) => {
      if (Array.isArray(data)) {
        data.forEach(charId => {
          this.load.json(`char_${charId}`, `data/characters/${charId}/main.json`);
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

  /* ── Build UI (placeholder) ─────────────────────────────── */

  private buildUI(): void {
    // Placeholder: simple title so the scene is not blank
    const { colors, font } = UITheme;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x030712, 0x030712, 0x0a1628, 0x0f172a, 1, 1, 1, 1);
    bg.fillRect(0, 0, this.gameWidth, this.gameHeight);

    this.add.text(this.centerX, this.centerY - this.s(60), 'GENESIS', {
      fontSize: font.size(80, this.scaleFactor),
      fontFamily: font.family,
      fontStyle: 'bold',
      color: colors.textPrimary,
    }).setOrigin(0.5);

    this.add.text(this.centerX, this.centerY, 'PUZZLE QUEST', {
      fontSize: font.size(28, this.scaleFactor),
      fontFamily: font.family,
      color: colors.textAccent,
    }).setOrigin(0.5);

    this.add.text(this.centerX, this.centerY + this.s(80), '[ Scene pending rebuild ]', {
      fontSize: font.size(14, this.scaleFactor),
      fontFamily: font.family,
      color: colors.textDim,
    }).setOrigin(0.5);
  }
}
