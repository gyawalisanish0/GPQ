import Phaser from 'phaser';

export const GameConfig: Phaser.Types.Core.GameConfig = {
  /*
   * Use AUTO so Phaser picks WebGL when available and falls back to Canvas.
   * Forcing CANVAS in all cases loses GPU acceleration and, more importantly,
   * some browser/iframe combinations refuse to fire pointer events on a Canvas
   * element that was explicitly told not to use the GPU.
   */
  type: Phaser.AUTO,

  /*
   * Start at the actual window size.  Scale.RESIZE will keep this in sync, but
   * giving a sensible initial value avoids a frame where the game world is the
   * hard-coded 1080×1920 before the first resize event fires.
   */
  width: window.innerWidth,
  height: window.innerHeight,

  parent: 'game-container',
  backgroundColor: '#0a0a0a',
  pixelArt: true,

  /*
   * Input configuration
   * ───────────────────
   * activePointers: 4  → support up to 4 simultaneous touch points (default is 2)
   * smoothFactor: 0    → raw coordinates with no smoothing lag; critical for
   *                       swipe-based gameplay where latency is noticeable
   * windowEvents: true → capture pointer events on the window, not just the
   *                       canvas; prevents drags from "escaping" the game when
   *                       the finger/cursor briefly moves off the canvas
   */
  input: {
    activePointers: 4,
    smoothFactor: 0,
    windowEvents: true,
  },

  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },

  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true,
    /*
     * Tell Phaser which element to watch for fullscreen changes.
     * In AI Studio's iframe wrapper the document root may be different from
     * what Phaser expects, so anchoring it explicitly avoids "no fullscreen
     * target" console warnings that can mask real errors.
     */
    fullscreenTarget: 'game-container',
  },

  render: {
    /*
     * antialias: false keeps pixel-art textures crisp (same as pixelArt: true).
     * roundPixels: true snaps sprites to integer positions — prevents sub-pixel
     * jitter that can make touch hit-boxes feel inaccurate at non-integer scales.
     */
    antialias: false,
    roundPixels: true,
    transparent: false,
  },
};
