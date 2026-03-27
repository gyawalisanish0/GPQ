import Phaser from 'phaser';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData } from '../entities/Character';
import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';

/**
 * LobbyScene — Premium hero selection screen.
 *
 * Pro-level design:
 *   • Glass-panel character cards with class-colored accent borders
 *   • Animated stat mini-bars within each card
 *   • Selection glow ring with pulse animation
 *   • Staggered card entrance with scale-pop
 *   • Footer navigation with glass buttons
 *   • Particle ambience + decorative elements
 */
export class LobbyScene extends BaseScene {

  private characters:    CharacterData[] = [];
  private selectedCharId: string | null  = null;
  private charCards:     Phaser.GameObjects.Container[] = [];
  private uiContainer!:  Phaser.GameObjects.Container;
  private nextBtn!:      Phaser.GameObjects.Container;

  constructor() {
    super('LobbyScene');
  }

  protected onInit(data: { selectedCharId?: string }) {
    this.characters = CombatRegistry.getInstance().getAllCharactersData();
    this.charCards  = [];
    this.selectedCharId = data?.selectedCharId ?? null;
  }

  create() {
    this.buildUI();
  }

  protected onResize() {
    this.buildUI();
  }

  /* ── Build ──────────────────────────────────────────────── */

  private buildUI(): void {
    if (this.uiContainer) this.uiContainer.destroy();
    this.uiContainer = this.add.container(0, 0);
    this.charCards = [];

    const { colors, anim } = UITheme;

    // ── Background
    this.createSceneBackground(this.uiContainer);
    this.createAmbientParticles(this.uiContainer);

    // ── Header
    this.createHeader(this.uiContainer, 'SELECT YOUR HERO', 'Choose a warrior to enter the Genesis');

    // ── Navigation Buttons
    const backBtn = this.createCompactButton(
      this.s(100), this.s(50),
      '< BACK',
      () => this.scene.start('MainMenuScene'),
      colors.danger,
    );
    this.uiContainer.add(backBtn);

    this.nextBtn = this.createCompactButton(
      this.gameWidth - this.s(100), this.gameHeight - this.s(80),
      'NEXT >',
      () => {
        if (this.selectedCharId) {
          this.scene.start('LoadoutScene', { charId: this.selectedCharId });
        }
      },
      colors.primary, 180,
    );
    this.nextBtn.setVisible(this.selectedCharId !== null);
    this.uiContainer.add(this.nextBtn);

    // ── Character Grid
    this.buildCharacterGrid();
  }

  /* ── Character Grid ─────────────────────────────────────── */

  private buildCharacterGrid(): void {
    const { sizes, anim } = UITheme;

    const maxCols        = 3;
    const baseCardW      = sizes.cardWidth;
    const baseCardH      = sizes.cardHeight;
    const baseSpacing    = sizes.cardSpacing;
    const actualCols     = Math.min(maxCols, this.characters.length);
    const totalBaseWidth = actualCols * baseCardW + (actualCols - 1) * baseSpacing;

    // Scale cards to fit 85% of screen width
    const maxAvailW = this.gameWidth * 0.85;
    let cardScale   = this.scaleFactor;
    if (totalBaseWidth * this.scaleFactor > maxAvailW) {
      cardScale = maxAvailW / totalBaseWidth;
    }

    const sw = baseCardW  * cardScale;
    const sh = baseCardH  * cardScale;
    const ss = baseSpacing * cardScale;

    const totalW = actualCols * sw + (actualCols - 1) * ss;
    const startX = (this.gameWidth - totalW) / 2 + sw / 2;
    const startY = this.gameHeight * 0.42;

    this.characters.forEach((char, i) => {
      const col = i % maxCols;
      const row = Math.floor(i / maxCols);
      const x   = startX + col * (sw + ss);
      const y   = startY + row * (sh + ss);

      const card = this.createCharacterCard(char, baseCardW, baseCardH, cardScale);
      card.setPosition(x, y);
      this.charCards.push(card);
      this.uiContainer.add(card);

      // Staggered entrance
      this.animateEntrance(card, 200 + i * anim.stagger);

      // Pre-select if returning from LoadoutScene
      if (this.selectedCharId === char.id) {
        this.applySelectedStyle(card, cardScale);
      }
    });
  }

  /* ── Character Card Factory ─────────────────────────────── */

  private createCharacterCard(
    char: CharacterData,
    baseW: number, baseH: number,
    cardScale: number,
  ): Phaser.GameObjects.Container {
    const { colors, font, radius, glass } = UITheme;

    const card = this.add.container(0, 0);
    card.setScale(cardScale);
    card.setData('baseScale', cardScale);
    card.setData('charId', char.id);

    const classColor = this.getClassColor(char.characterClass);

    // ── Selection glow ring (behind card, hidden initially)
    const glowRing = this.add.graphics();
    glowRing.lineStyle(4, colors.primary, 0);
    glowRing.strokeRoundedRect(-baseW / 2 - 6, -baseH / 2 - 6, baseW + 12, baseH + 12, radius.xl + 4);
    card.add(glowRing);

    // ── Card background (glass panel)
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(colors.bgCard, 0.85);
    bgGfx.fillRoundedRect(-baseW / 2, -baseH / 2, baseW, baseH, radius.lg);
    // Top highlight
    bgGfx.fillStyle(0xffffff, 0.04);
    bgGfx.fillRoundedRect(-baseW / 2 + 2, -baseH / 2 + 2, baseW - 4, baseH * 0.25, { tl: radius.lg, tr: radius.lg, bl: 0, br: 0 });
    // Border
    bgGfx.lineStyle(1, colors.border, 0.4);
    bgGfx.strokeRoundedRect(-baseW / 2, -baseH / 2, baseW, baseH, radius.lg);
    card.add(bgGfx);

    // ── Class color accent bar (top edge)
    const accentBar = this.add.graphics();
    accentBar.fillStyle(classColor, 0.8);
    accentBar.fillRoundedRect(-baseW / 2 + 4, -baseH / 2, baseW - 8, 4, 2);
    card.add(accentBar);

    // ── Interactive hit area
    const hitArea = this.add.rectangle(0, 0, baseW, baseH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    card.add(hitArea);

    // ── Portrait
    const portraitY = -baseH * 0.18;
    const portraitSize = baseW * 0.35;
    const portraitKey = `char_${char.id}`;
    if (this.textures.exists(portraitKey)) {
      const portrait = this.add.image(0, portraitY, portraitKey)
        .setDisplaySize(portraitSize, portraitSize);
      card.add(portrait);
    } else {
      // Placeholder circle with initial
      const circle = this.add.circle(0, portraitY, portraitSize * 0.45, classColor, 0.15)
        .setStrokeStyle(2, classColor, 0.5);
      card.add(circle);
      const initial = this.add.text(0, portraitY, char.name[0].toUpperCase(), {
        fontSize: font.size(36, 1), fontFamily: font.family, fontStyle: 'bold',
        color: '#f8fafc',
      }).setOrigin(0.5);
      card.add(initial);
    }

    // ── Name
    const name = this.add.text(0, baseH * 0.1, char.name.toUpperCase(), {
      fontSize:      font.size(18, 1),
      fontFamily:    font.family,
      fontStyle:     'bold',
      color:         colors.textPrimary,
      letterSpacing: 2,
    }).setOrigin(0.5);
    card.add(name);

    // ── Class badge
    const classBadgeContainer = this.add.container(0, baseH * 0.18);
    const classText = this.add.text(0, 0, char.characterClass?.toUpperCase() ?? '', {
      fontSize: font.size(11, 1), fontFamily: font.family, fontStyle: 'bold', color: '#000000',
    }).setOrigin(0.5);
    const classBg = this.add.rectangle(0, 0, classText.width + 16, classText.height + 6, classColor, 0.8);
    classBadgeContainer.add([classBg, classText]);
    card.add(classBadgeContainer);

    // ── Stat mini-bars
    const allStats = [
      { label: 'STR', value: char.stats.strength,   max: 20 },
      { label: 'END', value: char.stats.endurance,   max: 20 },
      { label: 'PWR', value: char.stats.power,       max: 20 },
      { label: 'RES', value: char.stats.resistance,  max: 20 },
      { label: 'SPD', value: char.stats.speed,       max: 20 },
      { label: 'ACC', value: char.stats.accuracy,    max: 20 },
    ];

    const statStartY = baseH * 0.25;
    const statRowH = 16;
    const barWidth = baseW * 0.45;
    const statLabelX = -baseW / 2 + 14;
    const barX = statLabelX + 34;

    allStats.forEach((stat, j) => {
      const sy = statStartY + j * statRowH;

      // Label
      card.add(this.add.text(statLabelX, sy, stat.label, {
        fontSize: font.size(9, 1), fontFamily: font.family, color: colors.textDim,
      }).setOrigin(0, 0.5));

      // Bar track
      const trackGfx = this.add.graphics();
      trackGfx.fillStyle(0x1e293b, 0.6);
      trackGfx.fillRoundedRect(barX, sy - 3, barWidth, 6, 3);
      // Bar fill
      const ratio = Math.min(stat.value / stat.max, 1);
      trackGfx.fillStyle(classColor, 0.7);
      trackGfx.fillRoundedRect(barX, sy - 3, barWidth * ratio, 6, 3);
      card.add(trackGfx);

      // Value
      card.add(this.add.text(barX + barWidth + 6, sy, stat.value.toString(), {
        fontSize: font.size(9, 1), fontFamily: font.family, fontStyle: 'bold', color: colors.textPrimary,
      }).setOrigin(0, 0.5));
    });

    // ── Interaction
    hitArea.on('pointerover', () => {
      if (this.selectedCharId !== char.id) {
        bgGfx.clear();
        bgGfx.fillStyle(colors.bgCardHover, 0.9);
        bgGfx.fillRoundedRect(-baseW / 2, -baseH / 2, baseW, baseH, radius.lg);
        bgGfx.fillStyle(0xffffff, 0.06);
        bgGfx.fillRoundedRect(-baseW / 2 + 2, -baseH / 2 + 2, baseW - 4, baseH * 0.25, { tl: radius.lg, tr: radius.lg, bl: 0, br: 0 });
        bgGfx.lineStyle(1, classColor, 0.5);
        bgGfx.strokeRoundedRect(-baseW / 2, -baseH / 2, baseW, baseH, radius.lg);
        this.tweens.add({ targets: card, scale: cardScale * 1.05, duration: 150 });
      }
    });

    hitArea.on('pointerout', () => {
      if (this.selectedCharId !== char.id) {
        bgGfx.clear();
        bgGfx.fillStyle(colors.bgCard, 0.85);
        bgGfx.fillRoundedRect(-baseW / 2, -baseH / 2, baseW, baseH, radius.lg);
        bgGfx.fillStyle(0xffffff, 0.04);
        bgGfx.fillRoundedRect(-baseW / 2 + 2, -baseH / 2 + 2, baseW - 4, baseH * 0.25, { tl: radius.lg, tr: radius.lg, bl: 0, br: 0 });
        bgGfx.lineStyle(1, colors.border, 0.4);
        bgGfx.strokeRoundedRect(-baseW / 2, -baseH / 2, baseW, baseH, radius.lg);
        this.tweens.add({ targets: card, scale: cardScale, duration: 150 });
      }
    });

    hitArea.on('pointerdown', () => {
      this.selectCharacter(char.id);
    });

    return card;
  }

  /* ── Selection Logic ────────────────────────────────────── */

  private selectCharacter(id: string): void {
    const { colors, radius } = UITheme;
    this.selectedCharId = id;

    // Reset all cards
    this.charCards.forEach(card => {
      const baseScale = card.getData('baseScale') || 1;
      const charId    = card.getData('charId');
      const char      = this.characters.find(c => c.id === charId);

      // Reset glow ring
      const glowRing = card.list[0] as Phaser.GameObjects.Graphics;
      if (glowRing?.clear) {
        glowRing.clear();
        glowRing.lineStyle(4, colors.primary, 0);
        const w = UITheme.sizes.cardWidth;
        const h = UITheme.sizes.cardHeight;
        glowRing.strokeRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, radius.xl + 4);
      }

      // Reset background
      const bgGfx = card.list[1] as Phaser.GameObjects.Graphics;
      if (bgGfx?.clear) {
        const w = UITheme.sizes.cardWidth;
        const h = UITheme.sizes.cardHeight;
        bgGfx.clear();
        bgGfx.fillStyle(colors.bgCard, 0.85);
        bgGfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius.lg);
        bgGfx.fillStyle(0xffffff, 0.04);
        bgGfx.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.25, { tl: radius.lg, tr: radius.lg, bl: 0, br: 0 });
        bgGfx.lineStyle(1, colors.border, 0.4);
        bgGfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius.lg);
      }

      this.tweens.add({ targets: card, scale: baseScale, duration: 200 });
    });

    // Apply selected style
    const selected = this.charCards.find(c => c.getData('charId') === id);
    if (selected) {
      const baseScale = selected.getData('baseScale') || 1;
      this.applySelectedStyle(selected, baseScale);
    }

    // Reveal NEXT button
    if (this.nextBtn && !this.nextBtn.visible) {
      this.nextBtn.setVisible(true);
      this.nextBtn.setAlpha(0);
      this.tweens.add({
        targets: this.nextBtn,
        alpha: 1,
        y: { from: this.nextBtn.y + 20, to: this.nextBtn.y },
        duration: 400,
        ease: UITheme.anim.ease.back,
      });
    }
  }

  private applySelectedStyle(card: Phaser.GameObjects.Container, baseScale: number): void {
    const { colors, radius } = UITheme;
    const w = UITheme.sizes.cardWidth;
    const h = UITheme.sizes.cardHeight;

    // Glow ring
    const glowRing = card.list[0] as Phaser.GameObjects.Graphics;
    if (glowRing?.clear) {
      glowRing.clear();
      glowRing.lineStyle(3, colors.primary, 0.6);
      glowRing.strokeRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, radius.xl + 4);
    }

    // Selected background
    const bgGfx = card.list[1] as Phaser.GameObjects.Graphics;
    if (bgGfx?.clear) {
      bgGfx.clear();
      bgGfx.fillStyle(colors.bgCardSelected, 0.9);
      bgGfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius.lg);
      bgGfx.fillStyle(0xffffff, 0.06);
      bgGfx.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.25, { tl: radius.lg, tr: radius.lg, bl: 0, br: 0 });
      bgGfx.lineStyle(2, colors.borderActive, 0.7);
      bgGfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius.lg);
    }

    this.tweens.add({ targets: card, scale: baseScale * 1.06, duration: 200, ease: UITheme.anim.ease.back });
  }

  /* ── Helpers ────────────────────────────────────────────── */

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
}
