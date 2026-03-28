import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';

/**
 * LobbyScene — Hero selection screen.
 *
 * TODO: Rebuild with pro-level hero selection UI.
 * See docs/UI-LAYOUT.md for schematic.
 */
export class LobbyScene extends BaseScene {

  constructor() {
    super('LobbyScene');
  }

  create() {
    const { colors, font } = UITheme;

    const bg = this.add.graphics();
    bg.fillStyle(0x030712, 1);
    bg.fillRect(0, 0, this.gameWidth, this.gameHeight);

    this.add.text(this.centerX, this.centerY, '[ LobbyScene — pending rebuild ]', {
      fontSize: font.size(18, this.scaleFactor),
      fontFamily: font.family,
      color: colors.textDim,
    }).setOrigin(0.5);
  }
}
