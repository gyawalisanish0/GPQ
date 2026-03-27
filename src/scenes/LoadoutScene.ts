import Phaser from 'phaser';
import { CombatRegistry } from '../engine/CombatRegistry';
import { SkillData, SkillType } from '../entities/Skill';
import { CharacterData } from '../entities/Character';
import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';

/**
 * LoadoutScene — Premium skill loadout configuration.
 *
 * Pro-level design:
 *   • Glass-panel two-pane layout with blue-tinted depth
 *   • Character preview with ring portrait, stat bars, and equipped summary
 *   • Scrollable skill grid with color-coded glass cards
 *   • Equipped badge with glow animation
 *   • Smooth inertial scrolling with touch support
 *   • Section headers with decorative separators
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
    this.createAmbientParticles(this.uiContainer);

    // ── Two-pane layout
    const totalWidth = Math.min(this.gameWidth * 0.95, this.s(1020));
    const leftRatio  = 0.30;
    const leftWidth  = totalWidth * leftRatio;
    const rightWidth = totalWidth * (1 - leftRatio);
    const gapWidth   = this.s(12);
    const offsetX    = (this.gameWidth - totalWidth) / 2;
    const paneHeight = this.gameHeight * 0.78;
    const topMargin  = (this.gameHeight - paneHeight) / 2;

    this.leftPane  = this.add.container(offsetX, 0);
    this.rightPane = this.add.container(offsetX + leftWidth + gapWidth, 0);
    this.uiContainer.add([this.leftPane, this.rightPane]);

    this.buildLeftPane(leftWidth, paneHeight, topMargin);
    this.buildRightPane(rightWidth - gapWidth, paneHeight, topMargin, offsetX, leftWidth + gapWidth);

    // ── Nav buttons
    const backBtn = this.createCompactButton(
      this.s(100), this.s(50),
      '< BACK',
      () => this.scene.start('LobbyScene', { selectedCharId: this.charId }),
      colors.danger, 130,
    );

    const startBtn = this.createMenuButton(
      this.gameWidth - this.s(160), this.gameHeight - this.s(55),
      'START BATTLE',
      () => this.startBattle(),
      colors.primary, 260, 56,
    );

    this.uiContainer.add([backBtn, startBtn]);
    this.animateSlideIn(startBtn, 600);
    this.updateVisuals();
  }

  /* ── Left Pane: Character Preview ───────────────────────── */

  private buildLeftPane(width: number, paneHeight: number, topMargin: number): void {
    const { colors, font, radius, glass } = UITheme;
    const sf = this.scaleFactor;

    // Glass panel background
    const bg = this.createPanel(0, topMargin, width, paneHeight, {
      fillColor:   colors.bgGlass,
      fillAlpha:   glass.fillAlpha,
      strokeColor: colors.borderSubtle,
      strokeAlpha: glass.borderAlpha,
      radius:      radius.lg,
    });
    this.leftPane.add(bg);

    const cx      = width / 2;
    const padding = this.s(28);
    let y         = topMargin + padding;

    const classColor = this.getClassColor(this.charData.characterClass);

    // ── Portrait ring
    const portraitSize = Math.min(this.s(160), width * 0.55);
    const ringRadius = portraitSize / 2 + this.s(6);

    // Outer glow ring
    const outerRing = this.add.graphics();
    outerRing.lineStyle(2, classColor, 0.4);
    outerRing.strokeCircle(cx, y + portraitSize / 2, ringRadius + 4);
    this.leftPane.add(outerRing);

    // Main ring
    const frame = this.add.graphics();
    frame.fillStyle(0x000000, 0.5);
    frame.fillCircle(cx, y + portraitSize / 2, ringRadius);
    frame.lineStyle(2, classColor, 0.7);
    frame.strokeCircle(cx, y + portraitSize / 2, ringRadius);
    this.leftPane.add(frame);

    const portraitKey = `char_${this.charId}`;
    if (this.textures.exists(portraitKey)) {
      const portrait = this.add.image(cx, y + portraitSize / 2, portraitKey)
        .setDisplaySize(portraitSize, portraitSize);
      this.leftPane.add(portrait);
    } else {
      const placeholder = this.add.text(cx, y + portraitSize / 2, this.charData.name[0], {
        fontSize: font.size(52, sf), fontFamily: font.family, fontStyle: 'bold', color: colors.textPrimary,
      }).setOrigin(0.5);
      this.leftPane.add(placeholder);
    }
    y += portraitSize + this.s(20);

    // ── Name
    const name = this.add.text(cx, y, this.charData.name.toUpperCase(), {
      fontSize: font.size(22, sf), fontFamily: font.family, fontStyle: 'bold',
      color: colors.textPrimary, letterSpacing: this.s(3),
    }).setOrigin(0.5);
    this.leftPane.add(name);
    y += this.s(28);

    // ── Class badge
    const classText = this.charData.characterClass?.toUpperCase() ?? '';
    const clsLabel = this.add.text(cx, y, classText, {
      fontSize: font.size(11, sf), fontFamily: font.family, fontStyle: 'bold', color: '#000000',
    }).setOrigin(0.5);
    const clsBg = this.add.rectangle(cx, y, clsLabel.width + this.s(16), clsLabel.height + this.s(6), classColor, 0.8);
    this.leftPane.add(clsBg);
    this.leftPane.add(clsLabel);
    y += this.s(36);

    // ── Stats with mini-bars
    const allStats = [
      { label: 'STR', value: this.charData.stats.strength },
      { label: 'END', value: this.charData.stats.endurance },
      { label: 'PWR', value: this.charData.stats.power },
      { label: 'RES', value: this.charData.stats.resistance },
      { label: 'SPD', value: this.charData.stats.speed },
      { label: 'ACC', value: this.charData.stats.accuracy },
    ];

    const barW = width - padding * 2 - this.s(60);
    const rowH = this.s(22);

    allStats.forEach((s, i) => {
      const sy = y + i * rowH;

      this.leftPane.add(this.add.text(padding, sy, s.label, {
        fontSize: font.size(11, sf), fontFamily: font.family, color: colors.textDim,
      }).setOrigin(0, 0.5));

      // Mini bar
      const barGfx = this.add.graphics();
      const barX = padding + this.s(36);
      const barH = this.s(5);
      barGfx.fillStyle(0x1e293b, 0.5);
      barGfx.fillRoundedRect(barX, sy - barH / 2, barW, barH, 2);
      const ratio = Math.min(s.value / 20, 1);
      barGfx.fillStyle(classColor, 0.6);
      barGfx.fillRoundedRect(barX, sy - barH / 2, barW * ratio, barH, 2);
      this.leftPane.add(barGfx);

      this.leftPane.add(this.add.text(barX + barW + this.s(6), sy, s.value.toString(), {
        fontSize: font.size(11, sf), fontFamily: font.family, fontStyle: 'bold', color: colors.textCyan,
      }).setOrigin(0, 0.5));
    });
    y += allStats.length * rowH + this.s(20);

    // ── Separator
    this.createSeparator(this.leftPane, padding, y, width - padding * 2, classColor, 0.3);
    y += this.s(16);

    // ── Equipped Slots Summary
    this.leftPane.add(this.add.text(cx, y, 'EQUIPPED', {
      fontSize: font.size(11, sf), fontFamily: font.family, fontStyle: 'bold',
      color: colors.textDim, letterSpacing: this.s(4),
    }).setOrigin(0.5));
    y += this.s(22);

    const slotNames = ['PASSIVE', 'ACTIVE', 'STACK 1', 'STACK 2', 'STACK 3'];
    slotNames.forEach((slotLabel, i) => {
      const slotKey   = i === 0 ? 'passive' : i === 1 ? 'active' : `stack_${i - 2}`;
      const equipped  = this.getEquippedSkillForSlot(slotKey);
      const slotColor = i === 0 ? colors.accent : i === 1 ? colors.primary : colors.warning;

      // Slot dot
      this.leftPane.add(this.add.circle(padding + this.s(4), y, this.s(3), slotColor, equipped ? 0.8 : 0.2));

      this.leftPane.add(this.add.text(padding + this.s(14), y, slotLabel, {
        fontSize: font.size(10, sf), fontFamily: font.family, color: colors.textDim,
      }).setOrigin(0, 0.5));

      const valueText = equipped ? equipped.name : '—';
      const valObj = this.add.text(width - padding, y, valueText, {
        fontSize: font.size(10, sf), fontFamily: font.family, fontStyle: 'bold',
        color: equipped ? colors.textPrimary : colors.textDim,
      }).setOrigin(1, 0.5);
      this.leftPane.add(valObj);
      this.slotContainers.set(slotKey, this.add.container(0, 0, [valObj]));
      y += this.s(18);
    });
  }

  /* ── Right Pane: Skill Cards (Scrollable) ───────────────── */

  private buildRightPane(
    width: number, paneHeight: number, topMargin: number,
    _offsetX: number, leftWidth: number,
  ): void {
    const { colors, font, sizes, radius, glass } = UITheme;
    const sf = this.scaleFactor;

    // Glass panel background
    const bg = this.createPanel(0, topMargin, width, paneHeight, {
      fillColor:   colors.bgGlass,
      fillAlpha:   glass.fillAlpha * 0.8,
      strokeColor: colors.border,
      strokeAlpha: glass.borderAlpha * 0.6,
      radius:      radius.lg,
    });
    this.rightPane.add(bg);

    // Section title
    const padding  = this.s(28);
    const headerY  = topMargin + padding;
    this.rightPane.add(this.add.text(padding, headerY, 'LOADOUT CONFIGURATION', {
      fontSize: font.size(20, sf), fontFamily: font.family, fontStyle: 'bold',
      color: colors.textAccent, letterSpacing: this.s(3),
    }));

    // Subtitle
    this.rightPane.add(this.add.text(padding, headerY + this.s(28), 'Select skills for battle', {
      fontSize: font.size(12, sf), fontFamily: font.family, color: colors.textDim,
    }));

    // Scrollable content container
    const scrollStartY = headerY + this.s(55);
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

    const sectionColor = this.getSkillColor(type);

    // Section header with accent dot
    const dotSize = this.s(4);
    const dotGfx = this.add.graphics();
    dotGfx.fillStyle(sectionColor, 0.8);
    dotGfx.fillCircle(padding + dotSize, startY + this.s(8), dotSize);
    this.scrollContainer.add(dotGfx);

    this.scrollContainer.add(this.add.text(padding + this.s(14), startY, title, {
      fontSize: font.size(14, sf), fontFamily: font.family, fontStyle: 'bold',
      color: colors.textSecondary, letterSpacing: this.s(2),
    }));

    const cardW    = this.s(sizes.skillCardWidth);
    const cardH    = this.s(sizes.skillCardHeight);
    const spacing  = this.s(14);
    const cols     = Math.max(1, Math.floor((containerWidth - padding * 2 + spacing) / (cardW + spacing)));
    let y          = startY + this.s(32);

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
    return y + totalRows * (cardH + spacing) + this.s(16);
  }

  /* ── Skill Card Factory ─────────────────────────────────── */

  private createSkillCard(skill: SkillData, w: number, h: number): Phaser.GameObjects.Container {
    const { colors, font, radius, glass } = UITheme;
    const sf = this.scaleFactor;
    const skillColor = this.getSkillColor(skill.type);

    const container = this.add.container(0, 0);

    // ── Glass background
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(colors.bgCard, 0.85);
    bgGfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius.md);
    // Top highlight
    bgGfx.fillStyle(0xffffff, 0.03);
    bgGfx.fillRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h * 0.2, { tl: radius.md, tr: radius.md, bl: 0, br: 0 });
    // Border
    bgGfx.lineStyle(1, colors.border, 0.3);
    bgGfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius.md);
    container.add(bgGfx);

    // ── Top accent line
    const accentGfx = this.add.graphics();
    accentGfx.fillStyle(skillColor, 0.6);
    accentGfx.fillRoundedRect(-w / 2 + 3, -h / 2, w - 6, 3, 1);
    container.add(accentGfx);

    // ── Interactive hit area
    const hitArea = this.add.rectangle(0, 0, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    container.add(hitArea);

    // ── Type icon
    const icon = this.add.text(0, -h / 2 + this.s(20), this.getSkillIcon(skill.type), {
      fontSize: font.size(18, sf), fontFamily: font.family,
    }).setOrigin(0.5);
    container.add(icon);

    // ── Name
    const name = this.add.text(0, -h / 2 + this.s(42), skill.name.toUpperCase(), {
      fontSize: font.size(11, sf), fontFamily: font.family, fontStyle: 'bold',
      color: colors.textPrimary, letterSpacing: this.s(1),
    }).setOrigin(0.5);
    container.add(name);

    // ── Charge cost badge (top-right corner)
    const costBadgeX = w / 2 - this.s(18);
    const costBadgeY = -h / 2 + this.s(14);
    const costBg = this.add.graphics();
    costBg.fillStyle(0x000000, 0.6);
    costBg.fillRoundedRect(costBadgeX - this.s(14), costBadgeY - this.s(8), this.s(28), this.s(16), 4);
    container.add(costBg);
    const cost = this.add.text(costBadgeX, costBadgeY, `${skill.chargeCost}`, {
      fontSize: font.size(11, sf), fontFamily: font.family, fontStyle: 'bold', color: colors.textDamage,
    }).setOrigin(0.5);
    container.add(cost);

    // ── Description
    const desc = this.add.text(0, this.s(8), skill.description, {
      fontSize:   font.size(9, sf),
      fontFamily: font.family,
      color:      colors.textSecondary,
      align:      'center',
      wordWrap:   { width: w - this.s(18) },
      lineSpacing: 2,
    }).setOrigin(0.5, 0);
    container.add(desc);

    // ── Equipped badge (hidden by default)
    const equippedBg = this.add.graphics();
    equippedBg.fillStyle(skillColor, 0.9);
    equippedBg.fillRoundedRect(-this.s(38), -this.s(9), this.s(76), this.s(18), this.s(9));
    const equippedText = this.add.text(0, 0, 'EQUIPPED', {
      fontSize: font.size(9, sf), fontFamily: font.family, fontStyle: 'bold', color: '#000000',
    }).setOrigin(0.5);
    const equippedBadge = this.add.container(0, h / 2 - this.s(14), [equippedBg, equippedText]).setAlpha(0);
    container.setData('equippedBadge', equippedBadge);
    container.add(equippedBadge);

    // ── Interaction
    hitArea.on('pointerover', () => {
      bgGfx.clear();
      bgGfx.fillStyle(colors.bgCardHover, 0.9);
      bgGfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius.md);
      bgGfx.fillStyle(0xffffff, 0.05);
      bgGfx.fillRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h * 0.2, { tl: radius.md, tr: radius.md, bl: 0, br: 0 });
      bgGfx.lineStyle(1, skillColor, 0.5);
      bgGfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius.md);
      this.tweens.add({ targets: container, scale: 1.05, duration: 120 });
    });
    hitArea.on('pointerout', () => {
      const isEquipped = this.isSkillEquipped(skill.id);
      bgGfx.clear();
      bgGfx.fillStyle(isEquipped ? colors.bgCardSelected : colors.bgCard, 0.85);
      bgGfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius.md);
      bgGfx.fillStyle(0xffffff, 0.03);
      bgGfx.fillRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h * 0.2, { tl: radius.md, tr: radius.md, bl: 0, br: 0 });
      bgGfx.lineStyle(1, isEquipped ? skillColor : colors.border, isEquipped ? 0.5 : 0.3);
      bgGfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius.md);
      this.tweens.add({ targets: container, scale: 1, duration: 120 });
    });
    hitArea.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const dist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
      if (dist > 10) return;
      this.toggleSkill(skill);
    });

    return container;
  }

  /* ── Skill Toggle Logic ─────────────────────────────────── */

  private toggleSkill(skill: SkillData): void {
    if (skill.type === SkillType.PASSIVE) return;

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
    const { colors, radius } = UITheme;

    this.skillCards.forEach((card, skillId) => {
      const isEquipped = this.isSkillEquipped(skillId);
      const skill = this.availableSkills.find(s => s.id === skillId);
      const skillColor = skill ? this.getSkillColor(skill.type) : colors.border;
      const w = this.s(UITheme.sizes.skillCardWidth);
      const h = this.s(UITheme.sizes.skillCardHeight);

      // Update background
      const bgGfx = card.list[0] as Phaser.GameObjects.Graphics;
      if (bgGfx?.clear) {
        bgGfx.clear();
        bgGfx.fillStyle(isEquipped ? colors.bgCardSelected : colors.bgCard, 0.85);
        bgGfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius.md);
        bgGfx.fillStyle(0xffffff, isEquipped ? 0.05 : 0.03);
        bgGfx.fillRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h * 0.2, { tl: radius.md, tr: radius.md, bl: 0, br: 0 });
        bgGfx.lineStyle(1, isEquipped ? skillColor : colors.border, isEquipped ? 0.5 : 0.3);
        bgGfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius.md);
      }

      // Update equipped badge
      const badge = card.getData('equippedBadge') as Phaser.GameObjects.Container;
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

  private getClassColor(characterClass?: string): number {
    const { colors } = UITheme;
    switch (characterClass?.toLowerCase()) {
      case 'warrior':  return colors.danger;
      case 'mage':     return colors.purple;
      case 'rogue':    return colors.warning;
      case 'paladin':  return colors.accent;
      default:         return colors.cyan;
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
