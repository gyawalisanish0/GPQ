/**
 * UITheme — Pro-level design system for Genesis Puzzle Quest.
 *
 * Every visual constant lives here so scenes share one palette,
 * one typographic scale, and one spacing rhythm. Changing a single
 * value propagates everywhere.
 *
 * Design philosophy: Dark glassmorphism with neon accents,
 * layered depth via subtle gradients, and cinematic polish.
 */

export const UITheme = {

  /* ── Palette ──────────────────────────────────────────────── */
  colors: {
    // Brand — Emerald core with cyan highlights
    primary:        0x10b981,   // emerald-500
    primaryLight:   0x34d399,   // emerald-400
    primaryDark:    0x059669,   // emerald-600
    primaryGlow:    0x10b981,   // for neon glow effects

    // Accents
    accent:         0x3b82f6,   // blue-500
    accentLight:    0x60a5fa,   // blue-400
    accentDark:     0x2563eb,   // blue-600
    danger:         0xef4444,   // red-500
    dangerLight:    0xf87171,   // red-400
    dangerDark:     0xdc2626,   // red-600
    warning:        0xeab308,   // yellow-500
    warningLight:   0xfbbf24,   // yellow-400
    warningDark:    0xca8a04,   // yellow-600

    // Cyan/Teal accents for sci-fi feel
    cyan:           0x06b6d4,
    cyanLight:      0x22d3ee,
    cyanGlow:       0x00ffff,

    // Purple for rare/special elements
    purple:         0x8b5cf6,
    purpleLight:    0xa78bfa,
    purpleDark:     0x7c3aed,

    // Gold for premium elements
    gold:           0xf59e0b,
    goldLight:      0xfbbf24,

    // Surfaces — Deep space blacks with blue undertones
    bgDeep:         0x030712,   // near-black with blue
    bgPanel:        0x0a1628,   // dark navy panel
    bgCard:         0x111827,   // slate-900
    bgCardHover:    0x1e293b,   // slate-800
    bgCardSelected: 0x172554,   // blue-950
    bgOverlay:      0x000000,
    bgGlass:        0x0f172a,   // glass panel base

    // Borders
    border:         0x1e293b,   // slate-800
    borderSubtle:   0x1e3a5f,   // blue-tinted
    borderActive:   0x10b981,
    borderGlow:     0x06b6d4,   // cyan glow border

    // Text (hex strings for Phaser text styles)
    textPrimary:    '#f8fafc',  // slate-50
    textSecondary:  '#94a3b8',  // slate-400
    textMuted:      '#64748b',  // slate-500
    textDim:        '#475569',  // slate-600
    textAccent:     '#34d399',  // emerald-400
    textCyan:       '#22d3ee',  // cyan-400
    textCharge:     '#60a5fa',  // blue-400
    textDamage:     '#fbbf24',  // amber-400
    textHeal:       '#4ade80',  // green-400
    textCrit:       '#f87171',  // red-400
    textGold:       '#fbbf24',  // gold

    // HUD-specific
    hpUser:         0x22c55e,   // green-500
    hpOpponent:     0xef4444,   // red-500
    chargeUser:     0x3b82f6,   // blue-500
    chargeOpponent: 0xeab308,   // yellow-500

    // Glow / FX
    glowPurple:     0x7c3aed,
    glowCyan:       0x06b6d4,
    glowEmerald:    0x10b981,
    particleTint:   0x06b6d4,   // cyan particles
    particleAlt:    0x8b5cf6,   // purple particles

    // Gradient stops (for multi-color effects)
    gradientTop:    0x0f172a,
    gradientBottom: 0x030712,
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
    padding:  24,
    /** Micro gap (labels, inline items) */
    micro:    8,
    /** Nano gap (tight elements) */
    nano:     4,
  },

  /* ── Component Sizes (at 1× scale, multiply by scaleFactor) */
  sizes: {
    buttonWidth:        380,
    buttonHeight:       72,
    buttonWidthSmall:   170,
    buttonHeightSmall:  48,
    cardWidth:          260,
    cardHeight:         360,
    cardSpacing:        36,
    barHeight:          22,
    barHeightLarge:     28,
    skillCardWidth:     150,
    skillCardHeight:    200,
    portraitRadius:     90,
    iconSize:           32,
  },

  /* ── Animation Presets ────────────────────────────────────── */
  anim: {
    fast:       120,
    normal:     250,
    slow:       500,
    entrance:   700,
    cinematic:  1200,
    stagger:    100,
    pulse:      1500,
    ease: {
      out:      'Cubic.easeOut',
      in:       'Cubic.easeIn',
      inOut:    'Cubic.easeInOut',
      back:     'Back.easeOut',
      bounce:   'Bounce.easeOut',
      sine:     'Sine.easeInOut',
      expo:     'Expo.easeOut',
      elastic:  'Elastic.easeOut',
    },
  },

  /* ── Border Radius (Phaser rounded-rect radius) ──────────── */
  radius: {
    xs:   4,
    sm:   8,
    md:  12,
    lg:  16,
    xl:  20,
    xxl: 28,
    pill: 100,
  },

  /* ── Glass / Surface Effects ─────────────────────────────── */
  glass: {
    /** Panel fill alpha for glassmorphism */
    fillAlpha:      0.45,
    /** Inner highlight alpha */
    highlightAlpha: 0.08,
    /** Border alpha for glass edges */
    borderAlpha:    0.25,
    /** Backdrop blur simulation alpha */
    backdropAlpha:  0.6,
  },

  /* ── Depth Layers ────────────────────────────────────────── */
  depth: {
    background:  0,
    particles:   1,
    panels:      2,
    cards:       3,
    hud:         4,
    overlay:     5,
    modal:       6,
    fx:          7,
    tooltip:     8,
  },

} as const;

/** Shorthand type for the full theme object. */
export type Theme = typeof UITheme;
