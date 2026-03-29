import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData, CharacterLoadout } from '../entities/Character';
import { SkillData, SkillType } from '../entities/Skill';

const CLASS_COLOR: Record<string, number> = {
  WARRIOR:  0xef4444,
  GUARDIAN: 0xeab308,
  RANGER:   0x3b82f6,
  HUNTER:   0x22c55e,
  CASTER:   0xec4899,
  DUMMY:    0x22c55e,
};

const CLASS_ICON: Record<string, string> = {
  WARRIOR:  '★',
  CASTER:   '⬠',
  RANGER:   '▲',
  GUARDIAN: '⬡',
  HUNTER:   '■',
  DUMMY:    '■',
};

const SKILL_TYPE_COLOR: Record<string, number> = {
  PASSIVE: 0x3b82f6,
  ACTIVE:  0x10b981,
  STACK:   0xeab308,
};

const SKILL_TYPE_ICON: Record<string, string> = {
  PASSIVE: '🛡',
  ACTIVE:  '⚡',
  STACK:   '🔥',
};

/**
 * LoadoutScene — Skill loadout configuration.
 * Two-pane glass layout: 30% left (character) / 70% right (scrollable skills).
 * Navigation: BACK → LobbyScene { selectedCharId } | START → Game_Scene { userCharId, opponentCharId }
 */
export class LoadoutScene extends BaseScene {
  private charId: string = 'warrior';
  private charData: CharacterData | null = null;
  private loadout: CharacterLoadout = { passive: null, active: null, stacks: [] };
  private skills: SkillData[] = [];

  // Scroll state
  private scrollY: number = 0;
  private targetScrollY: number = 0;
  private maxScrollY: number = 0;
  private skillsContainer: Phaser.GameObjects.Container | null = null;
  private rightPaneMask: Phaser.GameObjects.Graphics | null = null;

  // Card refs for badge toggling
  private cardRefs: Map<string, {
    equippedBadge: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Graphics;
    equipped: boolean;
  }> = new Map();

  // Loadout display refs
  private equippedTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private startBtn: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('LoadoutScene');
  }

  protected onInit(data?: any) {
    this.charId = data?.charId ?? 'warrior';
  }

  create() {
    const registry = CombatRegistry.getInstance();
    this.charData  = registry.getCharacterData(this.charId);
    if (!this.charData) {
      this.scene.start('LobbyScene');
      return;
    }

    // Build initial loadout from character default
    this.loadout = {
      passive: this.charData.loadout.passive ?? null,
      active:  this.charData.loadout.active  ?? null,
      stacks:  [...(this.charData.loadout.stacks ?? [])],
    };

    // Collect all skills
    this.skills = (this.charData.unlockedSkills ?? [])
      .map(id => registry.getSkillData(id))
      .filter((s): s is SkillData => s !== null);

    const root = this.add.container(0, 0);
    this.createSceneBackground(root);

    const { colors, font, anim } = UITheme;
    const classKey   = this.charData.classType.toString();
    const classColor = CLASS_COLOR[classKey] ?? colors.primary;

    // Layout dimensions
    const totalW  = Math.min(this.gameWidth * 0.95, this.s(1020));
    const totalH  = this.gameHeight * 0.78;
    const leftX   = (this.gameWidth - totalW) / 2;
    const topY    = (this.gameHeight - totalH) / 2;
    const gap     = this.s(12);
    const leftW   = totalW * 0.3;
    const rightW  = totalW * 0.7 - gap;
    const rightX  = leftX + leftW + gap;

    // BACK button (top left, outside panes)
    const backBtn = this.createCompactButton(
      leftX + this.s(UITheme.sizes.buttonWidthSmall) / 2,
      topY - this.s(36),
      '● BACK',
      () => this.scene.start('LobbyScene', { selectedCharId: this.charId }),
      colors.accent,
    );
    root.add(backBtn);

    // Left pane
    const leftPanel = this.createPanel(leftX, topY, leftW, totalH, {
      fillColor: colors.bgPanel,
      fillAlpha: 0.7,
      strokeColor: classColor,
      strokeAlpha: 0.3,
    });
    root.add(leftPanel);

    this.buildLeftPane(root, leftX, topY, leftW, totalH, classColor, classKey);

    // Right pane
    const rightPanel = this.createPanel(rightX, topY, rightW, totalH, {
      fillColor: colors.bgGlass,
      fillAlpha: 0.5,
      strokeColor: colors.border,
      strokeAlpha: 0.3,
    });
    root.add(rightPanel);

    // Right pane header
    root.add(this.add.text(rightX + rightW / 2, topY + this.s(28), 'LOADOUT CONFIGURATION', {
      fontSize: font.size(18, this.scaleFactor),
      fontFamily: font.family,
      fontStyle: 'bold',
      color: colors.textPrimary,
      letterSpacing: this.s(5),
    }).setOrigin(0.5, 0));

    const subText = `Select skills for ${this.charData.name}`;
    root.add(this.add.text(rightX + rightW / 2, topY + this.s(58), subText, {
      fontSize: font.size(14, this.scaleFactor),
      fontFamily: font.family,
      color: colors.textSecondary,
    }).setOrigin(0.5, 0));

    this.createSeparator(root, rightX + this.s(10), topY + this.s(82), rightW - this.s(20), colors.primary, 0.3);

    // Scrollable skill area
    const scrollAreaY    = topY + this.s(95);
    const scrollAreaH    = totalH - this.s(95) - this.s(70);
    const startBtnY      = topY + totalH - this.s(45);

    this.buildSkillScroll(root, rightX, scrollAreaY, rightW, scrollAreaH, classColor);

    // START BATTLE button
    this.startBtn = this.createMenuButton(
      rightX + rightW / 2,
      startBtnY,
      'START BATTLE',
      () => this.onStartBattle(),
      classColor,
      240, 56,
    );
    root.add(this.startBtn);

    // Scroll wheel + touch drag on right pane
    this.input.on('wheel', (_p: any, _go: any, _dx: number, dy: number) => {
      this.targetScrollY = Phaser.Math.Clamp(this.targetScrollY + dy, 0, this.maxScrollY);
    });
  }

  /* ── Left Pane ──────────────────────────────────────────── */

  private buildLeftPane(
    root: Phaser.GameObjects.Container,
    leftX: number, topY: number,
    leftW: number, totalH: number,
    classColor: number, classKey: string,
  ): void {
    const { colors, font } = UITheme;
    const cx = leftX + leftW / 2;
    let yOff = topY + this.s(30);

    // Portrait circle
    const portraitRadius = this.s(52);
    const portrait = this.add.graphics();
    portrait.lineStyle(3, classColor, 0.8);
    portrait.strokeCircle(cx, yOff + portraitRadius, portraitRadius);
    portrait.fillStyle(classColor, 0.15);
    portrait.fillCircle(cx, yOff + portraitRadius, portraitRadius);
    root.add(portrait);
    root.add(this.add.text(cx, yOff + portraitRadius, CLASS_ICON[classKey] ?? '?', {
      fontSize: font.size(28, this.scaleFactor),
      fontFamily: font.family,
      color: '#ffffff',
    }).setOrigin(0.5));
    yOff += portraitRadius * 2 + this.s(16);

    // Name
    root.add(this.add.text(cx, yOff, this.charData!.name.toUpperCase(), {
      fontSize: font.size(16, this.scaleFactor),
      fontFamily: font.family,
      fontStyle: 'bold',
      color: colors.textPrimary,
      letterSpacing: this.s(3),
    }).setOrigin(0.5));
    yOff += this.s(22);

    // Class badge
    const classBadge = this.createBadge(CLASS_ICON[classKey] + ' ' + classKey, classColor, { fontSize: 9 });
    classBadge.setPosition(cx, yOff);
    root.add(classBadge);
    yOff += this.s(32);

    // Stats bars
    const statsList: { label: string; key: keyof NonNullable<typeof this.charData>['stats'] }[] = [
      { label: 'STR', key: 'strength' },
      { label: 'END', key: 'endurance' },
      { label: 'PWR', key: 'power' },
      { label: 'RES', key: 'resistance' },
      { label: 'SPD', key: 'speed' },
      { label: 'ACC', key: 'accuracy' },
    ];
    const barW     = leftW - this.s(44);
    const barH     = this.s(10);
    const statSpacing = this.s(22);
    const barX     = leftX + this.s(38);

    statsList.forEach((stat) => {
      root.add(this.add.text(leftX + this.s(12), yOff, stat.label, {
        fontSize: font.size(12, this.scaleFactor),
        fontFamily: font.family,
        color: colors.textSecondary,
      }));
      const val = this.charData!.stats[stat.key] ?? 0;
      const ratio = Math.min(1, val / 100);
      const barGfx = this.add.graphics();
      this.drawProgressBar(barGfx, ratio, classColor, barW, yOff, barX - leftX, barH);
      // Offset barGfx to align with pane
      barGfx.setPosition(leftX, 0);
      root.add(barGfx);
      root.add(this.add.text(leftX + leftW - this.s(8), yOff, val.toString(), {
        fontSize: font.size(11, this.scaleFactor),
        fontFamily: font.family,
        color: colors.textCyan,
        fontStyle: 'bold',
      }).setOrigin(1, 0));
      yOff += statSpacing;
    });

    // Separator
    yOff += this.s(8);
    this.createSeparator(root, leftX + this.s(10), yOff, leftW - this.s(20), classColor, 0.3);
    yOff += this.s(16);

    // Equipped slots
    root.add(this.add.text(cx, yOff, 'EQUIPPED', {
      fontSize: font.size(13, this.scaleFactor),
      fontFamily: font.family,
      fontStyle: 'bold',
      color: colors.textAccent,
      letterSpacing: this.s(4),
    }).setOrigin(0.5));
    yOff += this.s(20);

    const slots: { label: string; key: string }[] = [
      { label: 'PASSIVE', key: 'passive' },
      { label: 'ACTIVE',  key: 'active' },
      { label: 'STACK 1', key: 'stack0' },
      { label: 'STACK 2', key: 'stack1' },
      { label: 'STACK 3', key: 'stack2' },
    ];

    slots.forEach(({ label, key }) => {
      const dot = this.add.circle(leftX + this.s(14), yOff + this.s(7), this.s(3), classColor, 0.7);
      root.add(dot);
      root.add(this.add.text(leftX + this.s(24), yOff, label + ': ', {
        fontSize: font.size(11, this.scaleFactor),
        fontFamily: font.family,
        color: colors.textSecondary,
      }));
      const valText = this.add.text(leftX + this.s(80), yOff, this.getSlotLabel(key), {
        fontSize: font.size(11, this.scaleFactor),
        fontFamily: font.family,
        color: colors.textCyan,
      });
      root.add(valText);
      this.equippedTexts.set(key, valText);
      yOff += this.s(19);
    });
  }

  private getSlotLabel(key: string): string {
    if (key === 'passive') return this.loadout.passive ?? '—';
    if (key === 'active')  return this.loadout.active  ?? '—';
    const idx = parseInt(key.replace('stack', ''));
    return this.loadout.stacks[idx] ?? '—';
  }

  /* ── Scrollable Skills ──────────────────────────────────── */

  private buildSkillScroll(
    root: Phaser.GameObjects.Container,
    rightX: number, scrollAreaY: number,
    rightW: number, scrollAreaH: number,
    classColor: number,
  ): void {
    const { colors, font, anim, sizes } = UITheme;

    // Mask for clipping scrollable content
    const maskGfx = this.add.graphics();
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(rightX, scrollAreaY, rightW, scrollAreaH);
    const mask = maskGfx.createGeometryMask();

    this.skillsContainer = this.add.container(rightX, scrollAreaY);
    this.skillsContainer.setMask(mask);
    root.add(this.skillsContainer);

    const cardW    = this.s(sizes.skillCardWidth);
    const cardH    = this.s(sizes.skillCardHeight);
    const cardGap  = this.s(16);
    const cols     = Math.floor((rightW - this.s(20)) / (cardW + cardGap));
    const paddingX = (rightW - cols * cardW - (cols - 1) * cardGap) / 2;

    let contentY = this.s(10);
    const groups: SkillType[] = [SkillType.PASSIVE, SkillType.ACTIVE, SkillType.STACK];

    groups.forEach(type => {
      const typedSkills = this.skills.filter(s => s.type === type);
      if (typedSkills.length === 0) return;

      // Section header
      const typeColor = SKILL_TYPE_COLOR[type] ?? colors.primary;
      const dot = this.add.circle(paddingX + this.s(8), contentY + this.s(8), this.s(4), typeColor, 0.9);
      this.skillsContainer!.add(dot);
      this.skillsContainer!.add(this.add.text(paddingX + this.s(20), contentY, type + ' SKILLS', {
        fontSize: font.size(14, this.scaleFactor),
        fontFamily: font.family,
        fontStyle: 'bold',
        color: colors.textPrimary,
        letterSpacing: this.s(4),
      }));
      contentY += this.s(28);

      // Cards in a row
      typedSkills.forEach((skill, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx  = paddingX + col * (cardW + cardGap);
        const cy  = contentY + row * (cardH + cardGap);
        const skillCard = this.buildSkillCard(skill, cx, cy, cardW, cardH, classColor);
        this.skillsContainer!.add(skillCard);
      });

      const rows = Math.ceil(typedSkills.length / cols);
      contentY  += rows * (cardH + cardGap) + this.s(16);
    });

    this.maxScrollY = Math.max(0, contentY - scrollAreaH);
  }

  private buildSkillCard(
    skill: SkillData,
    x: number, y: number,
    cardW: number, cardH: number,
    classColor: number,
  ): Phaser.GameObjects.Container {
    const { colors, font, glass, radius, anim } = UITheme;
    const typeColor = SKILL_TYPE_COLOR[skill.type] ?? colors.primary;
    const isEquipped = this.isEquipped(skill.id);

    const card = this.add.container(x, y);

    // Background
    const bg = this.add.graphics();
    this.drawSkillCardBg(bg, cardW, cardH, typeColor, isEquipped);
    card.add(bg);

    // Type accent line (top 3px)
    const accent = this.add.graphics();
    accent.fillStyle(typeColor, 0.9);
    accent.fillRoundedRect(0, 0, cardW, this.s(3), { tl: this.s(radius.md), tr: this.s(radius.md), bl: 0, br: 0 });
    card.add(accent);

    // Type icon
    card.add(this.add.text(cardW / 2, this.s(22), SKILL_TYPE_ICON[skill.type] ?? '', {
      fontSize: font.size(22, this.scaleFactor),
      fontFamily: font.family,
    }).setOrigin(0.5));

    // Name
    card.add(this.add.text(cardW / 2, this.s(50), skill.name.toUpperCase(), {
      fontSize: font.size(10, this.scaleFactor),
      fontFamily: font.family,
      fontStyle: 'bold',
      color: colors.textPrimary,
      letterSpacing: this.s(2),
      wordWrap: { width: cardW - this.s(8) },
      align: 'center',
    }).setOrigin(0.5, 0));

    // Charge cost badge (top-right)
    if (skill.chargeCost > 0) {
      const costBadge = this.createBadge(skill.chargeCost + ' EP', colors.warning, { fontSize: 9 });
      costBadge.setPosition(cardW - this.s(20), this.s(8));
      card.add(costBadge);
    }

    // Description
    card.add(this.add.text(cardW / 2, this.s(78), skill.description ?? '', {
      fontSize: font.size(9, this.scaleFactor),
      fontFamily: font.family,
      color: colors.textSecondary,
      wordWrap: { width: cardW - this.s(12) },
      align: 'center',
    }).setOrigin(0.5, 0));

    // Equipped badge
    const equippedBadge = this.createBadge('EQUIPPED', typeColor, { fontSize: 9 });
    equippedBadge.setPosition(cardW / 2, cardH - this.s(14));
    equippedBadge.setAlpha(isEquipped ? 1 : 0);
    card.add(equippedBadge);

    // Store ref
    this.cardRefs.set(skill.id, { equippedBadge, bg, equipped: isEquipped });

    // Hit area
    const hit = this.add.rectangle(cardW / 2, cardH / 2, cardW, cardH, 0, 0)
      .setInteractive({ useHandCursor: true });
    card.add(hit);

    hit.on('pointerover', () => {
      if (!this.cardRefs.get(skill.id)?.equipped) {
        bg.clear();
        this.drawSkillCardBg(bg, cardW, cardH, typeColor, false, true);
        this.tweens.add({ targets: card, scaleX: 1.04, scaleY: 1.04, duration: anim.fast });
      }
    });
    hit.on('pointerout', () => {
      bg.clear();
      const ref = this.cardRefs.get(skill.id);
      this.drawSkillCardBg(bg, cardW, cardH, typeColor, ref?.equipped ?? false);
      this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: anim.fast });
    });
    hit.on('pointerdown', () => this.toggleSkill(skill));

    return card;
  }

  private drawSkillCardBg(
    bg: Phaser.GameObjects.Graphics,
    cardW: number, cardH: number,
    typeColor: number,
    equipped: boolean,
    hover: boolean = false,
  ): void {
    const { colors, glass, radius } = UITheme;
    const r = this.s(radius.md);
    bg.fillStyle(equipped ? typeColor : colors.bgCard, equipped ? 0.15 : glass.fillAlpha);
    bg.fillRoundedRect(0, 0, cardW, cardH, r);
    bg.lineStyle(equipped ? 2 : 1, equipped ? typeColor : (hover ? typeColor : colors.border), equipped ? 0.7 : (hover ? 0.5 : glass.borderAlpha));
    bg.strokeRoundedRect(0, 0, cardW, cardH, r);
    bg.fillStyle(0xffffff, glass.highlightAlpha);
    bg.fillRoundedRect(2, 2, cardW - 4, cardH * 0.25, { tl: r, tr: r, bl: 0, br: 0 });
  }

  /* ── Loadout Logic ──────────────────────────────────────── */

  private isEquipped(id: string): boolean {
    return (
      this.loadout.passive === id ||
      this.loadout.active  === id ||
      this.loadout.stacks.includes(id)
    );
  }

  private toggleSkill(skill: SkillData): void {
    const ref = this.cardRefs.get(skill.id);
    if (!ref) return;

    if (skill.type === SkillType.PASSIVE) {
      // Auto-equipped, not toggleable
      return;
    }

    if (ref.equipped) {
      // Unequip
      if (skill.type === SkillType.ACTIVE && this.loadout.active === skill.id) {
        this.loadout.active = null;
      } else if (skill.type === SkillType.STACK) {
        this.loadout.stacks = this.loadout.stacks.filter(id => id !== skill.id);
      }
      ref.equipped = false;
      ref.equippedBadge.setAlpha(0);
      ref.bg.clear();
      this.drawSkillCardBg(ref.bg, this.s(UITheme.sizes.skillCardWidth), this.s(UITheme.sizes.skillCardHeight), SKILL_TYPE_COLOR[skill.type] ?? UITheme.colors.primary, false);
    } else {
      // Equip
      if (skill.type === SkillType.ACTIVE) {
        // Unequip previous active
        if (this.loadout.active) {
          const prevRef = this.cardRefs.get(this.loadout.active);
          if (prevRef) {
            prevRef.equipped = false;
            prevRef.equippedBadge.setAlpha(0);
            prevRef.bg.clear();
            this.drawSkillCardBg(prevRef.bg, this.s(UITheme.sizes.skillCardWidth), this.s(UITheme.sizes.skillCardHeight), SKILL_TYPE_COLOR[SkillType.ACTIVE], false);
          }
        }
        this.loadout.active = skill.id;
      } else if (skill.type === SkillType.STACK && this.loadout.stacks.length < 3) {
        this.loadout.stacks.push(skill.id);
      } else if (skill.type === SkillType.STACK) {
        return; // Max stacks reached
      }
      ref.equipped = true;
      ref.equippedBadge.setAlpha(1);
      ref.bg.clear();
      this.drawSkillCardBg(ref.bg, this.s(UITheme.sizes.skillCardWidth), this.s(UITheme.sizes.skillCardHeight), SKILL_TYPE_COLOR[skill.type] ?? UITheme.colors.primary, true);
    }

    this.refreshEquippedDisplay();
  }

  private refreshEquippedDisplay(): void {
    const slots = ['passive', 'active', 'stack0', 'stack1', 'stack2'];
    slots.forEach(key => {
      const text = this.equippedTexts.get(key);
      if (text) text.setText(this.getSlotLabel(key));
    });
  }

  /* ── Start Battle ───────────────────────────────────────── */

  private onStartBattle(): void {
    if (!this.loadout.active || this.loadout.stacks.length === 0) {
      // Flash start button red to indicate missing loadout
      if (this.startBtn) {
        this.tweens.add({
          targets: this.startBtn,
          alpha: 0.3,
          duration: 120,
          yoyo: true,
          repeat: 2,
        });
      }
      return;
    }

    CombatRegistry.getInstance().updateCharacterLoadout(this.charId, this.loadout);
    this.scene.start('Game_Scene', {
      userCharId:     this.charId,
      opponentCharId: 'mage',
    });
  }

  /* ── Update (scroll lerp) ───────────────────────────────── */

  update() {
    if (!this.skillsContainer) return;
    const diff = this.targetScrollY - this.scrollY;
    if (Math.abs(diff) > 0.5) {
      this.scrollY += diff * 0.15;
      this.skillsContainer.setY(this.skillsContainer.y - diff * 0.15);
    }
  }
}
