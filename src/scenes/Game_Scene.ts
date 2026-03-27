import { BaseScene } from './BaseScene';
import { UITheme } from './UITheme';
import { IEffectDelegate } from '../engine/EffectManager';
import { ShapeType, LogicCell } from '../engine/GameLogic';

/**
 * Game_Scene — Main puzzle-combat gameplay.
 *
 * TODO: Rebuild with pro-level combat UI.
 */
export class Game_Scene extends BaseScene implements IEffectDelegate {

  constructor() {
    super('Game_Scene');
  }

  create() {
    const { colors, font } = UITheme;

    const bg = this.add.graphics();
    bg.fillStyle(0x030712, 1);
    bg.fillRect(0, 0, this.gameWidth, this.gameHeight);

    this.add.text(this.centerX, this.centerY, '[ Game_Scene — pending rebuild ]', {
      fontSize: font.size(18, this.scaleFactor),
      fontFamily: font.family,
      color: colors.textDim,
    }).setOrigin(0.5);

    this.game.events.emit('SCENE_READY', 'Game_Scene');
  }

  /* ── IEffectDelegate stubs ──────────────────────────────── */
  playPulsarVisual(_r: number, _c: number, _isH: boolean, _isV: boolean, _w: number): void {}
  playBombVisual(_r: number, _c: number, _radius: number): void {}
  async playParasiteVisual(_r: number, _c: number, _shape: ShapeType, _cells: {r: number; c: number}[]): Promise<void> {}
  async playParasiteVortex(_r: number, _c: number, _scale: number, _duration: number): Promise<void> {}
  async playMissileVisual(_r: number, _c: number, _tR: number, _tC: number): Promise<void> {}
  shakeCamera(_duration: number, _intensity: number): void {}
  async destroyCell(_r: number, _c: number, _isSpecial: boolean, _spawnParticles?: boolean): Promise<void> {}
  getGridSize(): number { return 0; }
  getGrid(): (LogicCell | null)[][] { return []; }
}
