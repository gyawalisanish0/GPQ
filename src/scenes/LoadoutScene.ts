import Phaser from 'phaser';
import { CombatRegistry } from '../engine/CombatRegistry';
import { SkillData, SkillType } from '../entities/Skill';
import { CharacterData } from '../entities/Character';
import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';

/**
 * LoadoutScene — Skill loadout configuration before battle.
 *
 * Layout (landscape-friendly two-pane):
 *   ┌──────────────┬───────────────────────────────┐
 *   │  [BACK]      │                               │
 *   │              │   LOADOUT CONFIGURATION        │
 *   │  ┌────────┐  │                               │
 *   │  │portrait│  │   ── Equipped Slots ──        │
 *   │  └────────┘  │   [Passive] [Active]          │
 *   │  HERO NAME   │   [Stack1] [Stack2] [Stack3]  │
 *   │  Class       │                               │
 *   │              │   ── Active Skills ──          │
 *   │  STR:12      │   ┌─────┐ ┌─────┐ ┌─────┐    │
 *   │  END:8       │   │skill│ │skill│ │skill│    │
 *   │  PWR:6       │   └─────┘ └─────┘ └─────┘    │
 *   │              │                               │
 *   │              │   ── Stack Skills ──           │
 *   │              │   ┌─────┐ ┌─────┐             │
 *   │              │   │skill│ │skill│  [BATTLE]   │
 *   └──────────────┴───────────────────────────────┘
 */
export class LoadoutScene extends BaseScene {

  // ── Data ────────────────────────────────────────────────
  private charId!: string;
  private charData!: CharacterData;
  private availableSkills: SkillData[] = [];
  private loadout: {
    passive: string | null;
    active:  string | null;
    stacks:  string[];
  } = { passive: null, active: null, stacks: [] };

  // ── UI containers ───────────────────────────────────────
  private uiContainer!:      Phaser.GameObjects.Container;
  private leftPane!:         Phaser.GameObjects.Container;
  private rightPane!:        Phaser.GameObjects.Container;
  private scrollContainer!:  Phaser.GameObjects.Container;

  private skillCards:     Map<string, Phaser.GameObjects.Container> = new Map();
  private slotContainers: Map<string, Phaser.GameObjects.Container> = new Map();

  // ── Scroll state ────────────────────────────────────────
  private targetScrollY:  number = 0;
  private currentScrollY: number = 0;
  private maxScroll:      number = 0;
  private scrollBaseY:    number = 0;
  private isDraggingScroll: boolean = false;
  private dragLastY:      number = 0;
  private scrollAreaLeft: number = 0;
  private scrollAreaTop:  number = 0;

  constructor() {
    super('LoadoutScene');
  }

  /* ── Init ───────────────────────────────────────────────── */

  protected onInit(data: { charId: string }) {
    this.charId = data.charId;
    const registry = CombatRegistry.getInstance();
    const char = registry.getCharacterData(this.charId);

    if (!char) return;

    this.charData = char;
    this.availableSkills = char.unlockedSkills
      .map(id => registry.getSkillData(id))
      .filter((s): s is SkillData => s !== null);

    const passives = this.availableSkills.filter(s => s.type === SkillType.PASSIVE);
    const defaultPassive = passives.length > 0 ? passives[0].id : null;

    this.loadout = {
      passive: char.loadout.passive || defaultPassive,
      active:  char.loadout.active  || null,
      stacks:  char.loadout.stacks ? [...char.loadout.stacks] : [],
    };
  }

  create() {
    this.buildUI();
  }

  protected onResize() {
    this.buildUI();
  }

  /* ── Main Build ─────────────────────────────────────────── */

  private buildUI(): void {
    if (this.uiContainer) this.uiContainer.destroy();
    this.uiContainer = this.add.container(0, 0);
    this.skillCards.clear();
    this.slotContainers.clear();
    this.targetScrollY  = 0;
    this.currentScrollY = 0;

    if (!this.charData) return;

    const { colors, anim } = UITheme;

    // ── Background
    this.createSceneBackground(this.uiContainer);

    // ── Two-pane layout
    const totalWidth = Math.min(this.gameWidth * 0.95, this.s(1000));
    const leftRatio  = 0.3;
    const leftWidth  = totalWidth * leftRatio;
    const rightWidth = totalWidth * (1 - leftRatio);
    const offsetX    = (this.gameWidth - totalWidth) / 2;
    const paneHeight = this.gameHeight * 0.78;
    const topMargin  = (this.gameHeight - paneHeight) / 2;

    this.leftPane  = this.add.container(offsetX, 0);
    this.rightPane = this.add.container(offsetX + leftWidth, 0);
    this.uiContainer.add([this.leftPane, this.rightPane]);

    this.buildLeftPane(leftWidth, paneHeight, topMargin);
    this.buildRightPane(rightWidth, paneHeight, topMargin, offsetX, leftWidth);

    // ── Nav buttons
    const backBtn = this.createCompactButton(
      this.s(100), this.s(50),
      'BACK',
      () => this.scene.start('LobbyScene', { selectedCharId: this.charId }),
      colors.danger, 120,
    );

    const startBtn = this.createCompactButton(
      this.gameWidth - this.s(120), this.gameHeight - this.s(50),
      'START BATTLE',
      () => this.startBattle(),
      colors.primary, 200,
    );

    this.uiContainer.add([backBtn, startBtn]);
    this.updateVisuals();
  }

  /* ── Left Pane: Character Preview ───────────────────────── */

  private buildLeftPane(width: number, paneHeight: number, topMargin: number): void {
    const { colors, font } = UITheme;
    const sf = this.scaleFactor;

    // Panel background
    const bg = this.add.rectangle(0, topMargin, width, paneHeight, colors.bgPanel, 0.85)
      .setOrigin(0, 0)
      .setStrokeStyle(2, colors.borderSubtle, 0.5);
    this.leftPane.add(bg);

    const cx      = width / 2;
    const padding = this.s(40);
    let y         = topMargin + padding;

    // ── Portrait frame
    const portraitSize = Math.min(this.s(180), width * 0.6);
    const frame = this.add.circle(cx, y + portraitSize / 2, portraitSize / 2 + this.s(4), 0x000000, 0.5)
      .setStrokeStyle(3, colors.accent, 0.8);
    this.leftPane.add(frame);

    const portraitKey = `char_${this.charId}`;
    if (this.textures.exists(portraitKey)) {
      const portrait = this.add.image(cx, y + portraitSize / 2, portraitKey)
        .setDisplaySize(portraitSize, portraitSize);
      this.leftPane.add(portrait);
    } else {
      const placeholder = this.add.text(cx, y + portraitSize / 2, this.charData.name[0], {
        fontSize: font.size(60, sf), fontFamily: font.family, fontStyle: 'bold', color: colors.textPrimary,
      }).setOrigin(0.5);
      this.leftPane.add(placeholder);
    }
    y += portraitSize + this.s(20);

    // ── Name + Class
    const name = this.add.text(cx, y, this.charData.name.toUpperCase(), {
      fontSize: font.size(24, sf), fontFamily: font.family, fontStyle: 'bold', color: colors.textPrimary,
    }).setOrigin(0.5);
    this.leftPane.add(name);
    y += this.s(30);

    const cls = this.add.text(cx, y, this.charData.characterClass?.toUpperCase() ?? '', {
      fontSize: font.size(14, sf), fontFamily: font.family, color: colors.textAccent,
    }).setOrigin(0.5);
    this.leftPane.add(cls);
    y += this.s(40);

    // ── Stats (two-column vertical layout for the narrow pane)
    const allStats = [
      { label: 'STR', value: this.charData.stats.strength },
      { label: 'END', value: this.charData.stats.endurance },
      { label: 'PWR', value: this.charData.stats.power },
      { label: 'RES', value: this.charData.stats.resistance },
      { label: 'SPD', value: this.charData.stats.speed },
      { label: 'ACC', value: this.charData.stats.accuracy },
    ];

    const colW  = (width - padding * 2) / 2;
    const rowH  = this.s(24);
    allStats.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx  = padding + col * colW;
      const sy  = y + row * rowH;

      this.leftPane.add(this.add.text(sx, sy, `${s.label}:`, {
        fontSize: font.size(13, sf), fontFamily: font.family, color: colors.textMuted,
      }));
      this.leftPane.add(this.add.text(sx + this.s(32), sy, s.value.toString(), {
        fontSize: font.size(13, sf), fontFamily: font.family, fontStyle: 'bold', color: colors.textPrimary,
      }));
    });
    y += Math.ceil(allStats.length / 2) * rowH + this.s(30);

    // ── Equipped Slots Summary
    this.leftPane.add(this.add.text(cx, y, '── EQUIPPED ──', {
      fontSize: font.size(12, sf), fontFamily: font.family, color: colors.textMuted,
    }).setOrigin(0.5));
    y += this.s(24);

    const slotNames = ['PASSIVE', 'ACTIVE', 'STACK 1', 'STACK 2', 'STACK 3'];
    slotNames.forEach((slotLabel, i) => {
      const slotKey   = i === 0 ? 'passive' : i === 1 ? 'active' : `stack_${i - 2}`;
      const equipped  = this.getEquippedSkillForSlot(slotKey);
      const labelText = `${slotLabel}:`;
      const valueText = equipped ? equipped.name : '—';

      this.leftPane.add(this.add.text(padding, y, labelText, {
        fontSize: font.size(11, sf), fontFamily: font.family, color: colors.textMuted,
      }));
      const valObj = this.add.text(padding + this.s(70), y, valueText, {
        fontSize: font.size(11, sf), fontFamily: font.family, fontStyle: 'bold',
        color: equipped ? colors.textPrimary : colors.textMuted,
      });
      this.leftPane.add(valObj);
      this.slotContainers.set(slotKey, this.add.container(0, 0, [valObj]));
      y += this.s(20);
    });
  }

  /* ── Right Pane: Skill Cards (Scrollable) ───────────────── */

  private buildRightPane(
    width: number, paneHeight: number, topMargin: number,
    _offsetX: number, leftWidth: number,
  ): void {
    const { colors, font, sizes } = UITheme;
    const sf = this.scaleFactor;

    // Panel background
    const bg = this.add.rectangle(0, topMargin, width, paneHeight, colors.bgPanel, 0.75)
      .setOrigin(0, 0)
      .setStrokeStyle(1, colors.border, 0.3);
    this.rightPane.add(bg);

    // Section title
    const padding  = this.s(30);
    const headerY  = topMargin + padding;
    this.rightPane.add(this.add.text(padding, headerY, 'LOADOUT CONFIGURATION', {
      fontSize: font.size(22, sf), fontFamily: font.family, fontStyle: 'bold', color: colors.textAccent,
    }));

    // Scrollable content container
    const scrollStartY = headerY + this.s(50);
    this.scrollBaseY   = scrollStartY;
    this.scrollContainer = this.add.container(0, scrollStartY);
    this.rightPane.add(this.scrollContainer);

    // Store scroll area bounds for drag detection
    this.scrollAreaLeft = _offsetX + leftWidth;
    this.scrollAreaTop  = topMargin;

    // Build skill sections
    let contentY = 0;
    contentY = this.buildSkillSection('PASSIVE SKILLS', SkillType.PASSIVE, width, contentY, padding);
    contentY = this.buildSkillSection('ACTIVE SKILLS',  SkillType.ACTIVE,  width, contentY, padding);
    contentY = this.buildSkillSection('STACK SKILLS',   SkillType.STACK,   width, contentY, padding);

    // Calculate scroll limits
    const visibleHeight = paneHeight - (scrollStartY - topMargin) - padding;
    this.maxScroll = Math.max(0, contentY - visibleHeight);

    // ── Scroll input
    this.input.on('wheel', (_p: any, _gos: any, _dx: number, dy: number) => {
      this.targetScrollY = Phaser.Math.Clamp(
        this.targetScrollY + dy * 0.5,
        0, this.maxScroll,
      );
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x >= this.scrollAreaLeft && p.y >= this.scrollAreaTop) {
        this.isDraggingScroll = true;
        this.dragLastY = p.y;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.isDraggingScroll) {
        const dy = this.dragLastY - p.y;
        this.targetScrollY = Phaser.Math.Clamp(this.targetScrollY + dy, 0, this.maxScroll);
        this.dragLastY = p.y;
      }
    });
    this.input.on('pointerup', () => { this.isDraggingScroll = false; });
  }

  /* ── Skill Section Builder ──────────────────────────────── */

  private buildSkillSection(
    title: string, type: SkillType,
    containerWidth: number, startY: number, padding: number,
  ): number {
    const { colors, font, sizes } = UITheme;
    const sf = this.scaleFactor;
    const skills = this.availableSkills.filter(s => s.type === type);

    if (skills.length === 0) return startY;

    // Section header
    this.scrollContainer.add(this.add.text(padding, startY, title, {
      fontSize: font.size(16, sf), fontFamily: font.family, fontStyle: 'bold', color: colors.textSecondary,
    }));

    const cardW    = this.s(sizes.skillCardWidth);
    const cardH    = this.s(sizes.skillCardHeight);
    const spacing  = this.s(15);
    const cols     = Math.max(1, Math.floor((containerWidth - padding * 2 + spacing) / (cardW + spacing)));
    let y          = startY + this.s(35);

    skills.forEach((skill, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx  = padding + col * (cardW + spacing) + cardW / 2;
      const cy  = y + row * (cardH + spacing) + cardH / 2;

      const card = this.createSkillCard(skill, cardW, cardH);
      card.setPosition(cx, cy);
      this.scrollContainer.add(card);
      this.skillCards.set(skill.id, card);
    });

    const totalRows = Math.ceil(skills.length / cols);
    return y + totalRows * (cardH + spacing) + this.s(20);
  }

  /* ── Skill Card Factory ─────────────────────────────────── */

  private createSkillCard(skill: SkillData, w: number, h: number): Phaser.GameObjects.Container {
    const { colors, font, radius } = UITheme;
    const sf = this.scaleFactor;

    const container = this.add.container(0, 0);

    // Background
    const bg = this.add.rectangle(0, 0, w, h, colors.bgCard, 0.9)
      .setStrokeStyle(2, colors.border)
      .setInteractive({ useHandCursor: true });

    // Glow overlay
    const glow = this.add.rectangle(0, 0, w, h, this.getSkillColor(skill.type), 0);

    // Type icon (emoji placeholder)
    const icon = this.add.text(0, -h / 2 + this.s(22), this.getSkillIcon(skill.type), {
      fontSize: font.size(20, sf), fontFamily: font.family,
    }).setOrigin(0.5);

    // Name
    const name = this.add.text(0, -h / 2 + this.s(45), skill.name.toUpperCase(), {
      fontSize: font.size(12, sf), fontFamily: font.family, fontStyle: 'bold', color: colors.textPrimary,
    }).setOrigin(0.5);

    // Charge cost badge
    const costBg = this.add.rectangle(w / 2 - this.s(20), -h / 2 + this.s(15), this.s(30), this.s(18), 0x000000, 0.6);
    const cost = this.add.text(w / 2 - this.s(20), -h / 2 + this.s(15), `${skill.chargeCost}`, {
      fontSize: font.size(12, sf), fontFamily: font.family, fontStyle: 'bold', color: colors.textDamage,
    }).setOrigin(0.5);

    // Description
    const desc = this.add.text(0, this.s(10), skill.description, {
      fontSize:   font.size(10, sf),
      fontFamily: font.family,
      color:      colors.textSecondary,
      align:      'center',
      wordWrap:   { width: w - this.s(20) },
    }).setOrigin(0.5, 0);

    // Equipped badge (hidden by default)
    const equippedBg   = this.add.rectangle(0, h / 2 - this.s(12), this.s(80), this.s(16), colors.primary, 1);
    const equippedText = this.add.text(0, h / 2 - this.s(12), 'EQUIPPED', {
      fontSize: font.size(10, sf), fontFamily: font.family, fontStyle: 'bold', color: '#000000',
    }).setOrigin(0.5);
    const equippedBadge = this.add.container(0, 0, [equippedBg, equippedText]).setAlpha(0);
    container.setData('equippedBadge', equippedBadge);

    container.add([bg, glow, icon, name, costBg, cost, desc, equippedBadge]);

    // ── Interaction
    bg.on('pointerover', () => {
      this.tweens.add({ targets: glow, alpha: 0.15, duration: 150 });
      this.tweens.add({ targets: container, scale: 1.05, duration: 150 });
    });
    bg.on('pointerout', () => {
      this.tweens.add({ targets: glow, alpha: 0, duration: 150 });
      this.tweens.add({ targets: container, scale: 1, duration: 150 });
    });
    bg.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const dist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
      if (dist > 10) return; // Ignore drags
      this.toggleSkill(skill);
    });

    return container;
  }

  /* ── Skill Toggle Logic ─────────────────────────────────── */

  private toggleSkill(skill: SkillData): void {
    if (skill.type === SkillType.PASSIVE) return; // Auto-equipped

    if (skill.type === SkillType.ACTIVE) {
      this.loadout.active = this.loadout.active === skill.id ? null : skill.id;
    } else if (skill.type === SkillType.STACK) {
      const idx = this.loadout.stacks.indexOf(skill.id);
      if (idx >= 0) {
        this.loadout.stacks.splice(idx, 1);
      } else if (this.loadout.stacks.length < 3) {
        this.loadout.stacks.push(skill.id);
      }
    }

    this.updateVisuals();
  }

  /* ── Visual State Sync ──────────────────────────────────── */

  private updateVisuals(): void {
    const { colors } = UITheme;

    this.skillCards.forEach((card, skillId) => {
      const isEquipped = this.isSkillEquipped(skillId);
      const bg    = card.list[0] as Phaser.GameObjects.Rectangle;
      const badge = card.getData('equippedBadge') as Phaser.GameObjects.Container;

      if (bg?.setStrokeStyle) {
        bg.setStrokeStyle(2, isEquipped ? colors.borderActive : colors.border);
      }
      if (badge) {
        this.tweens.add({ targets: badge, alpha: isEquipped ? 1 : 0, duration: 200 });
      }
    });
  }

  private isSkillEquipped(id: string): boolean {
    return (
      this.loadout.passive === id ||
      this.loadout.active  === id ||
      this.loadout.stacks.includes(id)
    );
  }

  private getEquippedSkillForSlot(slotKey: string): SkillData | null {
    const registry = CombatRegistry.getInstance();
    let skillId: string | null = null;

    if (slotKey === 'passive')     skillId = this.loadout.passive;
    else if (slotKey === 'active') skillId = this.loadout.active;
    else {
      const idx = parseInt(slotKey.replace('stack_', ''), 10);
      skillId = this.loadout.stacks[idx] ?? null;
    }

    return skillId ? registry.getSkillData(skillId) ?? null : null;
  }

  /* ── Helpers ────────────────────────────────────────────── */

  private getSkillColor(type: SkillType): number {
    switch (type) {
      case SkillType.PASSIVE: return UITheme.colors.accent;
      case SkillType.ACTIVE:  return UITheme.colors.primary;
      case SkillType.STACK:   return UITheme.colors.warning;
      default:                return UITheme.colors.border;
    }
  }

  private getSkillIcon(type: SkillType): string {
    switch (type) {
      case SkillType.PASSIVE: return '🛡';
      case SkillType.ACTIVE:  return '⚡';
      case SkillType.STACK:   return '🔥';
      default:                return '◆';
    }
  }

  /* ── Start Battle ───────────────────────────────────────── */

  private startBattle(): void {
    const registry = CombatRegistry.getInstance();
    registry.updateCharacterLoadout(this.charId, {
      passive: this.loadout.passive,
      active:  this.loadout.active,
      stacks:  this.loadout.stacks,
    });

    this.scene.start('Game_Scene', {
      userCharId:     this.charId,
      opponentCharId: 'mage',
    });
  }

  /* ── Update Loop (smooth scroll) ────────────────────────── */

  update() {
    if (!this.scrollContainer) return;
    this.currentScrollY += (this.targetScrollY - this.currentScrollY) * 0.15;
    this.scrollContainer.y = this.scrollBaseY - this.currentScrollY;
  }
}
