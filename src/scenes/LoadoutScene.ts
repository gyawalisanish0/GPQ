import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';

/**
 * LoadoutScene — Skill loadout configuration before battle.
 *
 * TODO: Rebuild with pro-level loadout UI.
 * See docs/UI-LAYOUT.md for schematic.
 */
export class LoadoutScene extends BaseScene {

  constructor() {
    super('LoadoutScene');
  }

  create() {
    const { colors, font } = UITheme;

    const bg = this.add.graphics();
    bg.fillStyle(0x030712, 1);
    bg.fillRect(0, 0, this.gameWidth, this.gameHeight);

    this.add.text(this.centerX, this.centerY, '[ LoadoutScene — pending rebuild ]', {
      fontSize: font.size(18, this.scaleFactor),
      fontFamily: font.family,
      color: colors.textDim,
    }).setOrigin(0.5);
  }
}
