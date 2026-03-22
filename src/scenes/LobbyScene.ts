import Phaser from 'phaser';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData } from '../entities/Character';
import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';

/**
 * LobbyScene — Hero selection screen.
 *
 * Layout zones (1080×1920 design space):
 *   ┌─────────────────────────────┐
 *   │  [BACK]    SELECT HERO      │  ← Header row
 *   │                             │
 *   │   ┌────┐  ┌────┐  ┌────┐   │
 *   │   │ ▓▓ │  │ ▓▓ │  │ ▓▓ │   │  ← Character cards (3-col grid)
 *   │   │name│  │name│  │name│   │
 *   │   │stat│  │stat│  │stat│   │
 *   │   └────┘  └────┘  └────┘   │
 *   │                             │
 *   │                    [NEXT]   │  ← Footer nav
 *   └─────────────────────────────┘
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

    // ── Background ───────────────────────────────────────
    this.createSceneBackground(this.uiContainer);

    // ── Header ───────────────────────────────────────────
    this.createHeader(this.uiContainer, 'SELECT YOUR HERO');

    // ── Navigation Buttons ───────────────────────────────
    const backBtn = this.createCompactButton(
      this.s(100), this.s(50),
      'BACK',
      () => this.scene.start('MainMenuScene'),
      colors.danger,
    );
    this.uiContainer.add(backBtn);

    this.nextBtn = this.createCompactButton(
      this.gameWidth - this.s(100), this.gameHeight - this.s(80),
      'NEXT',
      () => {
        if (this.selectedCharId) {
          this.scene.start('LoadoutScene', { charId: this.selectedCharId });
        }
      },
      colors.primary,
    );
    this.nextBtn.setVisible(this.selectedCharId !== null);
    this.uiContainer.add(this.nextBtn);

    // ── Character Grid ───────────────────────────────────
    this.buildCharacterGrid();
  }

  /* ── Character Grid ─────────────────────────────────────── */

  private buildCharacterGrid(): void {
    const { sizes, colors, font, anim, radius } = UITheme;

    const maxCols        = 3;
    const baseCardW      = sizes.cardWidth;
    const baseCardH      = sizes.cardHeight;
    const baseSpacing    = sizes.cardSpacing;
    const actualCols     = Math.min(maxCols, this.characters.length);
    const totalBaseWidth = actualCols * baseCardW + (actualCols - 1) * baseSpacing;

    // Scale cards to fit 80% of screen width
    const maxAvailW = this.gameWidth * 0.8;
    let cardScale   = this.scaleFactor;
    if (totalBaseWidth * this.scaleFactor > maxAvailW) {
      cardScale = maxAvailW / totalBaseWidth;
    }

    const sw = baseCardW  * cardScale;
    const sh = baseCardH  * cardScale;
    const ss = baseSpacing * cardScale;

    const totalW = actualCols * sw + (actualCols - 1) * ss;
    const startX = (this.gameWidth - totalW) / 2 + sw / 2;
    const startY = this.gameHeight * 0.4;

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
    const { colors, font, radius } = UITheme;

    const card = this.add.container(0, 0);
    card.setScale(cardScale);
    card.setData('baseScale', cardScale);
    card.setData('charId', char.id);

    // ── Card background
    const bg = this.add.rectangle(0, 0, baseW, baseH, colors.bgCard, 1)
      .setStrokeStyle(2, colors.border)
      .setInteractive({ useHandCursor: true });

    // ── Selection glow
    const glow = this.add.rectangle(0, 0, baseW + 8, baseH + 8, colors.primary, 0);

    // ── Portrait
    const portraitKey = `char_${char.id}`;
    const portrait = this.textures.exists(portraitKey)
      ? this.add.image(0, -baseH * 0.15, portraitKey)
          .setDisplaySize(baseW * 0.5, baseW * 0.5)
      : this.add.circle(0, -baseH * 0.15, baseW * 0.2, colors.accent, 0.3)
          .setStrokeStyle(2, colors.accent);

    // ── Name
    const name = this.add.text(0, baseH * 0.15, char.name.toUpperCase(), {
      fontSize:   font.size(20, 1),
      fontFamily: font.family,
      fontStyle:  'bold',
      color:      colors.textPrimary,
    }).setOrigin(0.5);

    // ── Class label
    const classLabel = this.add.text(0, baseH * 0.22, char.characterClass?.toUpperCase() ?? '', {
      fontSize:   font.size(14, 1),
      fontFamily: font.family,
      color:      colors.textAccent,
    }).setOrigin(0.5);

    // ── Mini stat row
    const stats = [
      { label: 'STR', value: char.stats.strength },
      { label: 'END', value: char.stats.endurance },
      { label: 'PWR', value: char.stats.power },
    ];
    const statsContainer = this.add.container(-60, baseH * 0.30);
    stats.forEach((s, j) => {
      const sx = j * 65;
      statsContainer.add(this.add.text(sx, 0, `${s.label}:`, {
        fontSize: font.size(11, 1), fontFamily: font.family, color: colors.textMuted,
      }));
      statsContainer.add(this.add.text(sx + 25, 0, s.value.toString(), {
        fontSize: font.size(11, 1), fontFamily: font.family, fontStyle: 'bold', color: colors.textPrimary,
      }));
    });
    const stats2 = [
      { label: 'RES', value: char.stats.resistance },
      { label: 'SPD', value: char.stats.speed },
      { label: 'ACC', value: char.stats.accuracy },
    ];
    stats2.forEach((s, j) => {
      const sx = j * 65;
      statsContainer.add(this.add.text(sx, 20, `${s.label}:`, {
        fontSize: font.size(11, 1), fontFamily: font.family, color: colors.textMuted,
      }));
      statsContainer.add(this.add.text(sx + 25, 20, s.value.toString(), {
        fontSize: font.size(11, 1), fontFamily: font.family, fontStyle: 'bold', color: colors.textPrimary,
      }));
    });

    card.add([bg, glow, portrait, name, classLabel, statsContainer]);

    // ── Interaction
    bg.on('pointerover', () => {
      if (this.selectedCharId !== char.id) {
        bg.setStrokeStyle(2, colors.primary);
        this.tweens.add({ targets: card, scale: cardScale * 1.05, duration: 200 });
        this.tweens.add({ targets: glow, alpha: 0.3, duration: 200 });
      }
    });

    bg.on('pointerout', () => {
      if (this.selectedCharId !== char.id) {
        bg.setStrokeStyle(2, colors.border);
        this.tweens.add({ targets: card, scale: cardScale, duration: 200 });
        this.tweens.add({ targets: glow, alpha: 0, duration: 200 });
      }
    });

    bg.on('pointerdown', () => {
      this.selectCharacter(char.id);
    });

    return card;
  }

  /* ── Selection Logic ────────────────────────────────────── */

  private selectCharacter(id: string): void {
    const { colors } = UITheme;
    this.selectedCharId = id;

    // Reset all cards to default
    this.charCards.forEach(card => {
      const baseScale = card.getData('baseScale') || 1;
      const bg   = card.list[0] as Phaser.GameObjects.Rectangle;
      const glow = card.list[1] as Phaser.GameObjects.Rectangle;
      if (bg?.setStrokeStyle) {
        bg.setStrokeStyle(2, colors.border);
        bg.setFillStyle(colors.bgCard, 1);
      }
      if (glow?.setAlpha) glow.setAlpha(0);
      this.tweens.add({ targets: card, scale: baseScale, duration: 200 });
    });

    // Apply selected style to the chosen card
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
    const { colors } = UITheme;
    const bg   = card.list[0] as Phaser.GameObjects.Rectangle;
    const glow = card.list[1] as Phaser.GameObjects.Rectangle;

    if (bg?.setStrokeStyle) {
      bg.setStrokeStyle(4, colors.borderActive);
      bg.setFillStyle(colors.primary, 0.1);
    }
    if (glow?.setAlpha) glow.setAlpha(0.5);
    this.tweens.add({ targets: card, scale: baseScale * 1.05, duration: 200 });
  }
}
