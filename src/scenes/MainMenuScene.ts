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
 * Handles:
 *   1. preload() — loads ALL shared game assets (images, JSON data)
 *   2. create()  — registers gems/characters into singletons, builds pro UI, emits SCENE_READY
 */
export class MainMenuScene extends BaseScene {

  constructor() {
    super('MainMenuScene');
  }

  /* ══════════════════════════════════════════════════════════
   *  PRELOAD
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
   *  CREATE
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

  /* ── Build UI ───────────────────────────────────────────── */

  private buildUI(): void {
    const { colors, font, anim, radius } = UITheme;
    const root = this.add.container(0, 0);

    // 1. Background
    this.createSceneBackground(root);

    // 2. Ambient particles
    this.createAmbientParticles(root);

    // 3. Scan lines
    const scanLines = this.add.graphics();
    for (let y = 0; y < this.gameHeight; y += 4) {
      scanLines.lineStyle(1, 0xffffff, 0.01);
      scanLines.moveTo(0, y);
      scanLines.lineTo(this.gameWidth, y);
    }
    scanLines.strokePath();
    root.add(scanLines);

    // 4. Corner brackets
    const bracketLen = this.s(40);
    const bracketMargin = this.s(20);
    const bracketThick = 2;
    const bColor = colors.primary;
    const bAlpha = 0.4;
    const brackets = this.add.graphics();
    brackets.lineStyle(bracketThick, bColor, bAlpha);
    // Top-left
    brackets.moveTo(bracketMargin + bracketLen, bracketMargin);
    brackets.lineTo(bracketMargin, bracketMargin);
    brackets.lineTo(bracketMargin, bracketMargin + bracketLen);
    // Top-right
    brackets.moveTo(this.gameWidth - bracketMargin - bracketLen, bracketMargin);
    brackets.lineTo(this.gameWidth - bracketMargin, bracketMargin);
    brackets.lineTo(this.gameWidth - bracketMargin, bracketMargin + bracketLen);
    // Bottom-left
    brackets.moveTo(bracketMargin + bracketLen, this.gameHeight - bracketMargin);
    brackets.lineTo(bracketMargin, this.gameHeight - bracketMargin);
    brackets.lineTo(bracketMargin, this.gameHeight - bracketMargin - bracketLen);
    // Bottom-right
    brackets.moveTo(this.gameWidth - bracketMargin - bracketLen, this.gameHeight - bracketMargin);
    brackets.lineTo(this.gameWidth - bracketMargin, this.gameHeight - bracketMargin);
    brackets.lineTo(this.gameWidth - bracketMargin, this.gameHeight - bracketMargin - bracketLen);
    brackets.strokePath();
    root.add(brackets);

    // 5. Title glow circle
    const glowY = this.gameHeight * 0.22;
    const glowCircle = this.add.graphics();
    glowCircle.fillStyle(colors.primaryGlow, 0.06);
    glowCircle.fillCircle(this.centerX, glowY, this.s(200));
    root.add(glowCircle);
    this.tweens.add({
      targets: glowCircle,
      alpha: { from: 0.5, to: 1 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: anim.ease.sine,
    });

    // 6. Title text
    const titleY = glowY - this.s(20);
    const titleText = this.add.text(this.centerX, titleY, 'GENESIS', {
      fontSize: font.size(100, this.scaleFactor),
      fontFamily: font.family,
      fontStyle: 'bold',
      color: colors.textPrimary,
      letterSpacing: this.s(30),
    }).setOrigin(0.5);
    root.add(titleText);

    const subtitleText = this.add.text(this.centerX, titleY + this.s(90), 'PUZZLE  QUEST', {
      fontSize: font.size(32, this.scaleFactor),
      fontFamily: font.family,
      fontStyle: 'bold',
      color: colors.textAccent,
      letterSpacing: this.s(18),
    }).setOrigin(0.5);
    root.add(subtitleText);

    // Separator under subtitle
    const sepY = titleY + this.s(130);
    this.createSeparator(root, this.centerX - this.s(160), sepY, this.s(320), colors.primary, 0.5);

    // 7. Buttons
    const btnY = this.gameHeight * 0.58;
    const btnSpacing = this.s(95);

    const startBtn = this.createMenuButton(
      this.centerX, btnY,
      'START GAME',
      () => this.scene.start('LobbyScene'),
      colors.primary,
    );
    root.add(startBtn);

    const optBtn = this.createMenuButton(
      this.centerX, btnY + btnSpacing,
      'OPTIONS',
      () => console.log('Options placeholder'),
      colors.accent,
    );
    root.add(optBtn);

    const exitBtn = this.createMenuButton(
      this.centerX, btnY + btnSpacing * 2,
      'EXIT',
      () => console.log('Exit placeholder'),
      colors.danger,
    );
    root.add(exitBtn);

    // Staggered slide-in
    this.animateSlideIn(startBtn, 0);
    this.animateSlideIn(optBtn, anim.stagger * 2);
    this.animateSlideIn(exitBtn, anim.stagger * 4);

    // 8. Version badge + status dots
    const versionY = this.gameHeight - this.s(50);
    const dotSpacing = this.s(16);
    const dotColors = [colors.primary, colors.textDim, colors.textDim];
    dotColors.forEach((c, i) => {
      const dot = this.add.circle(
        this.centerX + (i - 1) * dotSpacing,
        versionY - this.s(18),
        this.s(3),
        c, c === colors.primary ? 1 : 0.3,
      );
      root.add(dot);
    });

    const version = this.add.text(this.centerX, versionY, 'v0.1 ALPHA', {
      fontSize: font.size(13, this.scaleFactor),
      fontFamily: font.family,
      color: colors.textMuted,
      letterSpacing: this.s(4),
    }).setOrigin(0.5);
    root.add(version);
  }
}
