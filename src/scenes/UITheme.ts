/**
 * UITheme — Centralized design tokens for Genesis Puzzle Quest.
 *
 * Every visual constant lives here so scenes share one palette,
 * one typographic scale, and one spacing rhythm. Changing a single
 * value propagates everywhere.
 */

export const UITheme = {

  /* ── Palette ──────────────────────────────────────────────── */
  colors: {
    // Brand
    primary:        0x10b981,   // emerald-500
    primaryLight:   0x34d399,   // emerald-400
    primaryDark:    0x059669,   // emerald-600

    // Accents
    accent:         0x3b82f6,   // blue-500
    accentLight:    0x60a5fa,   // blue-400
    danger:         0xef4444,   // red-500
    dangerLight:    0xf87171,   // red-400
    warning:        0xeab308,   // yellow-500
    warningLight:   0xfbbf24,   // yellow-400

    // Surfaces
    bgDeep:         0x0a0a0a,
    bgPanel:        0x050b14,
    bgCard:         0x1a1a1a,
    bgCardHover:    0x252525,
    bgOverlay:      0x000000,

    // Borders
    border:         0x333333,
    borderSubtle:   0x1e3a8a,
    borderActive:   0x10b981,

    // Text (hex strings for Phaser text styles)
    textPrimary:    '#ffffff',
    textSecondary:  '#94a3b8',
    textMuted:      '#6b7280',
    textAccent:     '#10b981',
    textCharge:     '#3b82f6',
    textDamage:     '#fbbf24',

    // HUD-specific
    hpUser:         0x10b981,
    hpOpponent:     0xef4444,
    chargeUser:     0x3b82f6,
    chargeOpponent: 0xeab308,

    // Glow / FX
    glowPurple:     0x4a00e0,
    particleTint:   0x10b981,
  },

  /* ── Typography ───────────────────────────────────────────── */
  font: {
    family: 'monospace',
    // Returns a scaled pixel string for fontSize
    size: (base: number, scale: number) => `${Math.floor(base * scale)}px`,
  },

  /* ── Spacing ──────────────────────────────────────────────── */
  spacing: {
    /** Scene-edge inset (used by headers, nav buttons) */
    edge:     50,
    /** Standard gap between stacked UI sections */
    section:  40,
    /** Gap between grouped elements (e.g. stat rows) */
    group:    20,
    /** Inner padding of panels / cards */
    padding:  20,
    /** Micro gap (labels, inline items) */
    micro:    8,
  },

  /* ── Component Sizes (at 1× scale, multiply by scaleFactor) */
  sizes: {
    buttonWidth:        360,
    buttonHeight:       70,
    buttonWidthSmall:   160,
    buttonHeightSmall:  50,
    cardWidth:          240,
    cardHeight:         320,
    cardSpacing:        40,
    barHeight:          21,
    skillCardWidth:     140,
    skillCardHeight:    180,
    portraitRadius:     90,
  },

  /* ── Animation Presets ────────────────────────────────────── */
  anim: {
    fast:       150,
    normal:     300,
    slow:       600,
    entrance:   800,
    stagger:    120,
    ease: {
      out:      'Cubic.easeOut',
      back:     'Back.easeOut',
      bounce:   'Bounce.easeOut',
      sine:     'Sine.easeInOut',
    },
  },

  /* ── Border Radius (Phaser rounded-rect radius) ──────────── */
  radius: {
    sm:  8,
    md:  12,
    lg:  16,
    xl:  20,
  },

} as const;

/** Shorthand type for the full theme object. */
export type Theme = typeof UITheme;
