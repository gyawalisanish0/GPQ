import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData, CharacterClass } from '../entities/Character';

const CLASS_ICON: Record<string, string> = {
  WARRIOR:  '★',
  CASTER:   '⬠',
  RANGER:   '▲',
  GUARDIAN: '⬡',
  HUNTER:   '■',
  DUMMY:    '■',
};

const CLASS_COLOR: Record<string, number> = {
  WARRIOR:  0xef4444,
  GUARDIAN: 0xeab308,
  RANGER:   0x3b82f6,
  HUNTER:   0x22c55e,
  CASTER:   0xec4899,
  DUMMY:    0x22c55e,
};

const RARITY_COLOR: Record<string, number> = {
  Common:    0x6b7280,
  Advance:   0x06b6d4,
  Epic:      0x8b5cf6,
  Super:     0x94a3b8,
  Master:    0xf59e0b,
  Legendary: 0xd97706,
  Omega:     0x7c3aed,
};

/**
 * LobbyScene — Character Selection.
 * Navigation: BACK → MainMenuScene | NEXT → LoadoutScene { charId }
 */
export class LobbyScene extends BaseScene {
  private selectedCharId: string | null = null;
  private nextBtn: Phaser.GameObjects.Container | null = null;
  private overlayRoot: Phaser.GameObjects.Container | null = null;
  private characters: CharacterData[] = [];

  constructor() {
    super('LobbyScene');
  }

  protected onInit(data?: any) {
    this.selectedCharId = data?.selectedCharId ?? null;
  }

  create() {
    this.characters = CombatRegistry.getInstance()
      .getAllCharactersData()
      .filter(c => c.classType !== ('DUMMY' as CharacterClass));

    const root = this.add.container(0, 0);
    this.createSceneBackground(root);
    this.createAmbientParticles(root);

    // Header
    const { colors, font, anim } = UITheme;
    const headerY = this.s(UITheme.spacing.edge);

    const backBtn = this.createCompactButton(
      this.s(UITheme.spacing.edge) + this.s(UITheme.sizes.buttonWidthSmall) / 2,
      headerY + this.s(24),
      '● BACK',
      () => this.scene.start('MainMenuScene'),
      colors.accent,
    );
    root.add(backBtn);

    const titleText = this.add.text(this.centerX, headerY + this.s(24), 'SELECT YOUR HERO', {
      fontSize: font.size(36, this.scaleFactor),
      fontFamily: font.family,
      fontStyle: 'bold',
      color: colors.textPrimary,
      letterSpacing: this.s(8),
    }).setOrigin(0.5);
    root.add(titleText);

    const subtitle = this.add.text(this.centerX, headerY + this.s(70), 'Choose a warrior to enter the Genesis', {
      fontSize: font.size(16, this.scaleFactor),
      fontFamily: font.family,
      color: colors.textSecondary,
    }).setOrigin(0.5);
    root.add(subtitle);

    this.createSeparator(root, this.centerX - this.s(200), headerY + this.s(100), this.s(400), colors.primary, 0.4);

    // Cards
    this.buildCards(root);

    // NEXT button
    this.nextBtn = this.createMenuButton(
      this.gameWidth - this.s(UITheme.sizes.buttonWidth) / 2 - this.s(40),
      this.gameHeight - this.s(80),
      'NEXT ●',
      () => {
        if (this.selectedCharId) {
          this.scene.start('LoadoutScene', { charId: this.selectedCharId });
        }
      },
      colors.primary,
    );
    this.nextBtn.setAlpha(this.selectedCharId ? 1 : 0);
    root.add(this.nextBtn);
  }

  /* ── Cards ──────────────────────────────────────────────── */

  private buildCards(root: Phaser.GameObjects.Container): void {
    const { sizes, anim } = UITheme;
    const cardW = this.s(sizes.cardWidth);
    const cardH = this.s(sizes.cardHeight);
    const gap   = this.s(sizes.cardSpacing);
    const cols  = Math.min(3, this.characters.length);
    const totalWidth = cols * cardW + (cols - 1) * gap;
    const startX = (this.gameWidth - totalWidth) / 2 + cardW / 2;
    const cardY  = this.gameHeight * 0.54;

    this.characters.forEach((char, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gap);
      const y = cardY + row * (cardH + gap);
      const card = this.buildCard(char, x, y, cardW, cardH);
      root.add(card);
      this.animateScaleIn(card, i * anim.stagger * 1.5);
    });
  }

  private buildCard(
    char: CharacterData,
    x: number, y: number,
    cardW: number, cardH: number,
  ): Phaser.GameObjects.Container {
    const { colors, font, anim, radius, glass } = UITheme;
    const classKey   = char.classType.toString();
    const classColor = CLASS_COLOR[classKey] ?? colors.primary;
    const rarityColor = RARITY_COLOR[(char as any).rarity ?? 'Common'] ?? RARITY_COLOR.Common;
    const isSelected  = this.selectedCharId === char.id;

    const card = this.add.container(x, y);

    // Glow ring
    const glow = this.add.graphics();
    glow.lineStyle(3, classColor, 0.9);
    glow.strokeRoundedRect(-cardW / 2 - 3, -cardH / 2 - 3, cardW + 6, cardH + 6, this.s(radius.lg) + 3);
    glow.setAlpha(isSelected ? 1 : 0);
    card.add(glow);

    // Background
    const bg = this.add.graphics();
    this.drawCardBg(bg, cardW, cardH, rarityColor, classColor, isSelected);
    card.add(bg);

    // Class accent bar top
    const accentBar = this.add.graphics();
    accentBar.fillStyle(classColor, 0.9);
    accentBar.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, this.s(4), { tl: this.s(radius.lg), tr: this.s(radius.lg), bl: 0, br: 0 });
    card.add(accentBar);

    // Portrait
    const portraitY = -cardH / 2 + this.s(90);
    const portraitKey = `portrait_${char.id}`;
    if (this.textures.exists(portraitKey)) {
      const portrait = this.add.image(0, portraitY, portraitKey)
        .setDisplaySize(cardW - this.s(20), this.s(130))
        .setAlpha(0.85);
      card.add(portrait);
    } else {
      const ph = this.add.graphics();
      ph.fillStyle(classColor, 0.2);
      ph.fillCircle(0, portraitY, this.s(50));
      ph.lineStyle(2, classColor, 0.5);
      ph.strokeCircle(0, portraitY, this.s(50));
      card.add(ph);
      card.add(this.add.text(0, portraitY, CLASS_ICON[classKey] ?? '?', {
        fontSize: font.size(30, this.scaleFactor),
        fontFamily: font.family,
        color: '#ffffff',
      }).setOrigin(0.5));
    }

    // Name
    card.add(this.add.text(0, -cardH / 2 + this.s(188), char.name.toUpperCase(), {
      fontSize: font.size(15, this.scaleFactor),
      fontFamily: font.family,
      fontStyle: 'bold',
      color: '#f8fafc',
      letterSpacing: this.s(3),
    }).setOrigin(0.5));

    // Class badge
    const classBadge = this.createBadge(CLASS_ICON[classKey] + ' ' + classKey, classColor, { fontSize: 9 });
    classBadge.setPosition(0, -cardH / 2 + this.s(215));
    card.add(classBadge);

    // Hit area (invisible)
    const hit = this.add.rectangle(0, 0, cardW, cardH, 0, 0)
      .setInteractive({ useHandCursor: true });
    card.add(hit);

    // Hover
    hit.on('pointerover', () => {
      if (this.selectedCharId !== char.id) {
        this.tweens.add({ targets: card, scaleX: 1.05, scaleY: 1.05, duration: anim.fast, ease: anim.ease.out });
        bg.clear();
        this.drawCardBg(bg, cardW, cardH, rarityColor, classColor, true, true);
      }
    });
    hit.on('pointerout', () => {
      if (this.selectedCharId !== char.id) {
        this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: anim.fast, ease: anim.ease.out });
        bg.clear();
        this.drawCardBg(bg, cardW, cardH, rarityColor, classColor, false);
      }
    });

    // Click → select
    hit.on('pointerdown', () => this.selectCharacter(char.id));

    // Hold → overlay
    let holdTimer: ReturnType<typeof setTimeout>;
    hit.on('pointerdown', () => { holdTimer = setTimeout(() => this.showDetailOverlay(char), 600); });
    hit.on('pointerup',  () => clearTimeout(holdTimer));
    hit.on('pointerout', () => clearTimeout(holdTimer));

    // Scale pulse if selected
    if (isSelected) {
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.5, to: 1 },
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: UITheme.anim.ease.sine,
      });
    }

    return card;
  }

  private drawCardBg(
    bg: Phaser.GameObjects.Graphics,
    cardW: number, cardH: number,
    rarityColor: number, classColor: number,
    selected: boolean,
    hover: boolean = false,
  ): void {
    const { colors, glass, radius } = UITheme;
    const r = this.s(radius.lg);
    bg.fillStyle(rarityColor, selected ? 0.15 : 0.08);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, r);
    bg.fillStyle(selected ? colors.bgCardSelected : (hover ? colors.bgCardHover : colors.bgCard), selected ? 0.9 : 0.85);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, r);
    bg.lineStyle(selected ? 2 : 1, selected ? classColor : colors.border, selected ? 0.9 : glass.borderAlpha);
    bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, r);
    bg.fillStyle(0xffffff, glass.highlightAlpha);
    bg.fillRoundedRect(-cardW / 2 + 2, -cardH / 2 + 2, cardW - 4, cardH * 0.25, { tl: r, tr: r, bl: 0, br: 0 });
  }

  /* ── Selection ──────────────────────────────────────────── */

  private selectCharacter(id: string): void {
    this.scene.restart({ selectedCharId: id });
  }

  /* ── Detail Overlay ──────────────────────────────────────── */

  private showDetailOverlay(char: CharacterData): void {
    if (this.overlayRoot) return;
    const { colors, font, anim, radius } = UITheme;
    const classKey   = char.classType.toString();
    const classColor = CLASS_COLOR[classKey] ?? colors.primary;

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x000000, 0.65);
    backdrop.fillRect(0, 0, this.gameWidth, this.gameHeight);
    backdrop.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.gameWidth, this.gameHeight),
      Phaser.Geom.Rectangle.Contains,
    );

    const overlay = this.add.container(this.centerX, this.centerY);
    this.overlayRoot = this.add.container(0, 0);
    this.overlayRoot.add(backdrop);
    this.overlayRoot.add(overlay);

    const panelW = Math.min(this.gameWidth * 0.82, this.s(760));
    const panelH = Math.min(this.gameHeight * 0.72, this.s(860));

    const panel = this.createPanel(-panelW / 2, -panelH / 2, panelW, panelH, {
      fillColor: colors.bgPanel,
      fillAlpha: 0.97,
      strokeColor: classColor,
      strokeAlpha: 0.5,
      glowColor: classColor,
      glowAlpha: 0.15,
    });
    overlay.add(panel);

    // Close button
    const closeBtn = this.add.text(panelW / 2 - this.s(20), -panelH / 2 + this.s(20), '✕', {
      fontSize: font.size(22, this.scaleFactor),
      fontFamily: font.family,
      color: colors.textMuted,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor(colors.textPrimary));
    closeBtn.on('pointerout',  () => closeBtn.setColor(colors.textMuted));
    closeBtn.on('pointerdown', () => this.closeOverlay());
    overlay.add(closeBtn);

    // Portrait
    const portraitY = -panelH / 2 + this.s(120);
    const portraitKey = `portrait_${char.id}`;
    if (this.textures.exists(portraitKey)) {
      overlay.add(this.add.image(0, portraitY, portraitKey).setDisplaySize(this.s(110), this.s(130)));
    } else {
      const ph = this.add.graphics();
      ph.fillStyle(classColor, 0.2);
      ph.fillCircle(0, portraitY, this.s(52));
      ph.lineStyle(2, classColor, 0.6);
      ph.strokeCircle(0, portraitY, this.s(52));
      overlay.add(ph);
      overlay.add(this.add.text(0, portraitY, CLASS_ICON[classKey] ?? '?', {
        fontSize: font.size(28, this.scaleFactor),
        fontFamily: font.family,
        color: '#ffffff',
      }).setOrigin(0.5));
    }

    // Name
    overlay.add(this.add.text(0, -panelH / 2 + this.s(210), char.name.toUpperCase(), {
      fontSize: font.size(26, this.scaleFactor),
      fontFamily: font.family,
      fontStyle: 'bold',
      color: colors.textPrimary,
      letterSpacing: this.s(6),
    }).setOrigin(0.5));

    const classBadge = this.createBadge(CLASS_ICON[classKey] + ' ' + classKey, classColor, { fontSize: 11 });
    classBadge.setPosition(0, -panelH / 2 + this.s(250));
    overlay.add(classBadge);

    this.createSeparator(overlay as any, -panelW / 2 + this.s(20), -panelH / 2 + this.s(278), panelW - this.s(40), classColor, 0.3);

    // Stats
    const statsList: { label: string; key: keyof typeof char.stats }[] = [
      { label: 'STR', key: 'strength' },
      { label: 'END', key: 'endurance' },
      { label: 'PWR', key: 'power' },
      { label: 'RES', key: 'resistance' },
      { label: 'SPD', key: 'speed' },
      { label: 'ACC', key: 'accuracy' },
    ];
    const barW     = panelW - this.s(80);
    const barH     = this.s(12);
    const statsY   = -panelH / 2 + this.s(305);
    const statSpacing = this.s(28);

    statsList.forEach((stat, i) => {
      const sy = statsY + i * statSpacing;
      overlay.add(this.add.text(-panelW / 2 + this.s(28), sy, stat.label, {
        fontSize: font.size(13, this.scaleFactor),
        fontFamily: font.family,
        color: colors.textSecondary,
      }));
      const val   = char.stats[stat.key] ?? 0;
      const ratio = Math.min(1, val / 100);
      const barGfx = this.add.graphics();
      this.drawProgressBar(barGfx, ratio, classColor, barW, sy, -panelW / 2 + this.s(64), barH);
      overlay.add(barGfx);
      overlay.add(this.add.text(panelW / 2 - this.s(28), sy, val.toString(), {
        fontSize: font.size(13, this.scaleFactor),
        fontFamily: font.family,
        fontStyle: 'bold',
        color: colors.textCyan,
      }).setOrigin(1, 0));
    });

    // Select button
    const selectBtn = this.createMenuButton(0, panelH / 2 - this.s(56), 'SELECT', () => {
      this.closeOverlay();
      this.selectCharacter(char.id);
    }, classColor, 240, 54);
    overlay.add(selectBtn);

    overlay.setAlpha(0);
    overlay.setScale(0.85);
    this.tweens.add({
      targets: overlay,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: anim.normal,
      ease: anim.ease.back,
    });

    backdrop.on('pointerdown', () => this.closeOverlay());
  }

  private closeOverlay(): void {
    if (!this.overlayRoot) return;
    const { anim } = UITheme;
    const overlayContainer = this.overlayRoot.list[1] as Phaser.GameObjects.Container;
    this.tweens.add({
      targets: overlayContainer,
      alpha: 0,
      scaleX: 0.85,
      scaleY: 0.85,
      duration: anim.fast,
      ease: anim.ease.in,
      onComplete: () => {
        this.overlayRoot?.destroy();
        this.overlayRoot = null;
      },
    });
  }
}
