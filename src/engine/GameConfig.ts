import Phaser from 'phaser';

export const GameConfig: Phaser.Types.Core.GameConfig = {
  // ── Renderer ──────────────────────────────────────────────────────────────
  // AUTO tries WebGL first then falls back to Canvas — ideal for compatibility.
  // App.tsx will force CANVAS if AUTO throws on first attempt.
  type: Phaser.AUTO,

  // ── Design resolution ─────────────────────────────────────────────────────
  // The internal "canvas" the game is drawn at.  Phaser will scale this to
  // fill the physical container via the Scale Manager below.
  width:  1080,
  height: 1920,

  // ── Container ─────────────────────────────────────────────────────────────
  // Left as `undefined` here so App.tsx can inject the DOM ref after it mounts.
  parent: undefined,

  // ── Background ────────────────────────────────────────────────────────────
  backgroundColor: '#0a0a0a',

  // ── Pixel art rendering ───────────────────────────────────────────────────
  // pixelArt: true ⇒ image-rendering: pixelated on the canvas element
  pixelArt:  true,
  antialias: false,

  // ── Physics ───────────────────────────────────────────────────────────────
  physics: {
    default: 'arcade',
    arcade:  { gravity: { x: 0, y: 0 }, debug: false },
  },

  // ── Scale Manager ─────────────────────────────────────────────────────────
  scale: {
    /**
     * FIT: Scales the canvas up/down uniformly so that the entire design
     * resolution (1080×1920) fits inside the container while maintaining
     * the aspect ratio.  Letter-boxing / pillar-boxing appears when the
     * container aspect differs.
     *
     * Use ENVELOP instead if you want to fill the screen edge-to-edge
     * (crops the design canvas but removes bars).
     */
    mode:        Phaser.Scale.FIT,
    autoCenter:  Phaser.Scale.CENTER_BOTH,

    // When mode is RESIZE the canvas pixel dimensions match the container.
    // With FIT they remain at width/height above, just CSS-scaled.
    expandParent: false,

    // Minimum / maximum canvas size guard (physical pixels)
    min: { width: 240, height: 320 },
    max: { width: 2160, height: 3840 },
  },

  // ── Input ─────────────────────────────────────────────────────────────────
  input: {
    activePointers: 4,     // Support up to 4 simultaneous touch points
  },

  // ── Rendering tweaks ──────────────────────────────────────────────────────
  render: {
    pixelArt:      true,
    antialias:     false,
    roundPixels:   true,   // Eliminates sub-pixel shimmer on pixel art
    powerPreference: 'high-performance',
    // Transparent canvas background so the page background shows behind
    // any un-drawn areas (the #0a0a0a body colour fills those gaps).
    transparent:   false,
    clearBeforeRender: true,
  },

  // ── Audio ─────────────────────────────────────────────────────────────────
  audio: {
    disableWebAudio: false,
  },

  // ── FPS / loop ────────────────────────────────────────────────────────────
  fps: {
    target:       60,
    forceSetTimeOut: false,   // Prefer requestAnimationFrame
    deltaHistory: 10,
    panicMax:     120,
  },
};
