
> Quick-glance checklist. Full implementation details with context are in `docs/TODO.md`.

## Engine — Special Gem Rules

- [ ] Add `hasBranchingShape(cells)` private method to `GameLogic.ts` — detects T/L/cross patterns (cell with ≥3 group-neighbors, or 2 non-collinear group-neighbors)
- [ ] Update `scoreGroup()` in `GameLogic.ts`: T/L/cross → BOMB (replaces old cross-cell check), exact 2×2 → MISSILE (replaces old `w>=2 && h>=2`)
- [ ] Add `getColorForShape(shape: ShapeType): number` to `GemRegistry.ts` — returns hex color for a shape; NONE → `0x8b5cf6` (parasite purple)

## Rendering — Special Gem Visuals (implement during Game_Scene rebuild)

- [ ] Color tinting: special gem sprites use `GemRegistry.getColorForShape(cell.shape)` as tint
- [ ] Overlay glyph: MISSILE→`→`, PULSAR→`✛`, BOMB→`✦`, PARASITE→`◎` (white, ~40% cell size, depth +1)
- [ ] Activation glow: pulsing outer glow ring on all special gems (tint color, 0.6 alpha, 2s yoyo)

## Scene Rebuilds (Pro-Level UI)

All scenes have been cleared and need to be rebuilt from scratch with the new design system (`UITheme.ts` + `BaseScene.ts`).

### MainMenuScene
- [ ] Cinematic title with glow and particle nebula
- [ ] Staggered glass button entrance (Start, Options, Exit)
- [ ] Decorative corner brackets + scan lines
- [ ] Ambient dual-layer particles (cyan + purple)
- [ ] Version badge footer
- [ ] Asset preloading (gems, characters, portraits) — logic preserved, just needs UI

### LobbyScene (Hero Selection)
- [ ] Glass-panel character cards with class-colored accent borders
- [ ] Stat mini-bars inside each card (STR/END/PWR/RES/SPD/ACC)
- [ ] Class badge (Warrior=red, Mage=purple, Rogue=yellow, Paladin=blue)
- [ ] Selection glow ring with pulse animation
- [ ] Staggered card entrance
- [ ] Back / Next navigation buttons
- [ ] Subtitle under header ("Choose a warrior to enter the Genesis")

### LoadoutScene (Skill Configuration)
- [ ] Two-pane glass layout (30% left / 70% right)
- [ ] Left: Portrait ring with class color, name, class badge, stat bars, equipped slots summary
- [ ] Right: Scrollable skill grid grouped by type (Passive / Active / Stack)
- [ ] Skill cards with glass background, type accent line, charge cost badge, equipped badge
- [ ] Smooth inertial scroll (wheel + touch drag)
- [ ] Start Battle button with slide-in animation

### Game_Scene (Puzzle Combat)
- [ ] 10x10 puzzle grid with board glow and grid lines
- [ ] Glass HUD panels for user and opponent (HP bar, Charge bar, name, stats)
- [ ] Turn indicator panel (YOUR TURN / ENEMY TURN) with glow swap
- [ ] Power surge display
- [ ] Active skill button (circular, with charge cost)
- [ ] Stack skill row inside user HUD
- [ ] Queued skill icons
- [ ] Game over overlay (Victory/Defeat) with return-to-menu button
- [ ] Gem textures (procedural shape drawing)
- [ ] Selection rect with pulse animation
- [ ] Swipe input handling
- [ ] Cascade animations (match -> destroy -> gravity -> refill)
- [ ] Combat event listeners (HP, Charge, Turn, GameOver)
- [ ] Opponent AI integration
- [ ] Particle FX on gem destruction

## Design System

- [x] `UITheme.ts` — Pro-level tokens (glassmorphism, neon accents, depth layers, extended palette)
- [x] `BaseScene.ts` — Premium primitives (glass panels, gradient buttons, animated bars, separators, badges, particles)
- [ ] Custom font loading (replace monospace with a proper sci-fi font)
- [ ] Sound design integration (UI feedback sounds)
- [ ] Screen transition effects between scenes

## Engine / Core

- [ ] Review `EffectManager` interface after Game_Scene rebuild
- [ ] Review `DebugPanel.ts` scene navigation after all scenes are rebuilt
- [ ] Add settings persistence (localStorage)
- [ ] Add difficulty scaling
- [ ] Add match history / stats tracking

## Content

- [ ] Balance character stats across classes
- [ ] Add more skills per character
- [ ] Add opponent variety (not just mage)
- [ ] Add campaign / level progression
- [ ] Add loot / reward system

## Polish

- [ ] Loading screen redesign (matches new aesthetic)
- [ ] Mobile touch optimization audit
- [ ] Performance profiling (particle count, draw calls)
- [ ] Accessibility (color-blind gem shapes, font sizing)
