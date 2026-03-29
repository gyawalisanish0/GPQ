# GPQ — Implementation TODO

Canonical future-work tracking document. Each item is self-contained with enough context to execute without reading other files.

For scene layout specs see `docs/UI-Design.md`. For gameplay mechanic details see `docs/Gameplay.md`.

---

## Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done

---

## 1. Engine — Special Gem Creation Rules

Changes to `src/engine/GameLogic.ts` → `scoreGroup()` method (lines ~213–250).

**New priority order:**

| Priority | Condition | Special |
|----------|-----------|---------|
| 1 | `w >= 5` or `h >= 5` | PARASITE |
| 2 | `hasBranchingShape(cells)` — T, L, or cross pattern | BOMB |
| 3 | `w === 4` or `h === 4` (exact 4 in a line) | PULSAR |
| 4 | `w === 2 && h === 2 && cells.length === 4` (exact 2×2 box) | MISSILE |

- [ ] **Add `hasBranchingShape(cells)` private method** to `GameLogic.ts`
  - Build a `Set<string>` of `"r,c"` keys for O(1) neighbor lookup
  - For each cell, count orthogonal neighbors present in the group (up/down/left/right)
  - Return `true` if any cell has **≥ 3 neighbors** (T-junction or cross), OR has **exactly 2 non-collinear neighbors** (L-corner — one horizontal direction + one vertical direction)
  - Non-collinear check: neighbor directions are not both in the same axis

- [ ] **Update `scoreGroup()` branching order** — replace the current `w >= 3 && h >= 3` cross-cell check and `w >= 2 && h >= 2` MISSILE rule with the new table above

- [ ] **Preserve BOMB target cell selection** — for T/L shapes, pick the junction cell (the one with most neighbors) as `r,c` for `specialCreation`; fallback to `cells[0]`

- [ ] **Verify score bonuses** remain: PARASITE +40, BOMB +30, PULSAR +20, MISSILE +20

---

## 2. Engine — Special Gem Color System

Changes to `src/engine/GemRegistry.ts`.

`LogicCell` already stores `shape: ShapeType` on every special gem (set at creation time via `specialCreation.shape`). No changes needed to `LogicCell` or `MatchResult`.

- [ ] **Add `getColorForShape(shape: ShapeType): number` method** to `GemRegistry`
  - Import `ShapeType` from `GameLogic.ts`
  - Iterate normal gems, find matching `shape` field, parse `color` string to number (e.g. `parseInt(gem.color.replace('0x',''), 16)`)
  - If `shape === ShapeType.NONE` (PARASITE) → return `0x8b5cf6` (purple)
  - If no matching gem found → return `0xffffff` (fallback white)

---

## 3. Rendering — Special Gem Visuals

Changes to `src/scenes/Game_Scene.ts`, gem rendering logic (to be implemented during Game_Scene rebuild).

Scenes are **rendering-only** — never call engine logic from here; only read `cell.shape` and `cell.special` for visual decisions.

- [ ] **Color tinting** — when rendering a cell with `cell.special !== SpecialType.NONE`, use `GemRegistry.getInstance().getColorForShape(cell.shape)` as the sprite tint instead of the normal gem color
  - PARASITE (`cell.shape === ShapeType.NONE`) always renders purple (`0x8b5cf6`)

- [ ] **Overlay glyph** — render a white text/icon on top of each special gem sprite to distinguish it from a normal gem of the same color:
  - MISSILE → `→` (right arrow)
  - PULSAR → `✛` (cross)
  - BOMB → `✦` (burst star)
  - PARASITE → `◎` (target circle)
  - Glyph must be visible against any background. Use white (`#ffffff`), font size ~40% of cell size, centered, depth = gem depth + 1

- [ ] **Activation glow** — add a subtle pulsing outer glow or border to all special gems to reinforce that they are activatable (valid swap OR destruction by effect). Use the gem's tint color at ~0.6 alpha, pulsing 2s yoyo tween.

---

## 4. Scene Rebuilds

All scenes are cleared shells. Implement per `docs/UI-Design.md`.

**Architecture constraint:** Scenes implement `IEffectDelegate` for visual callbacks only. No damage calculations, match detection, charge management, turn flow, skill execution, or AI logic may live in a scene file.

### Pre-requisite
- [ ] Add `updateCharacterLoadout(charId: string, loadout: CharacterLoadout): void` to `src/engine/CombatRegistry.ts` (required by LoadoutScene)

### MainMenuScene (`src/scenes/MainMenuScene.ts`)
- [ ] Cinematic background: gradient + vignette + grid pattern + scan lines
- [ ] Ambient dual-layer particles (cyan + purple)
- [ ] Corner bracket decorations (4 L-shapes, 0.2 alpha)
- [ ] Title glow circle (radius 200, pulsing 3s yoyo)
- [ ] "GENESIS" text (120px bold white, letterSpacing 30) + "PUZZLE QUEST" (32px accent green)
- [ ] Separator line with diamond
- [ ] 3 glass buttons: START GAME (→ LobbyScene), OPTIONS (placeholder), EXIT (placeholder)
- [ ] Staggered `animateSlideIn` entrance on buttons
- [ ] Version badge + 3 status dots at bottom
- [ ] Emit `SCENE_READY` event

### CharacterSelectionScene (`src/scenes/Character_Selection_Scene.ts`)
- [ ] Header with BACK button + title + subtitle
- [ ] Character cards (260×360 glass panels): portrait placeholder, name, class accent bar (linked gem color), rarity bg color
- [ ] Class icons: WARRIOR→STAR, CASTER→PENTAGON, RANGER→TRIANGLE, GUARDIAN→HEXAGON, HUNTER→SQUARE
- [ ] Rarity colors: Common=Grey, Advance=Cyan, Epic=Purple, Super=Silver, Master=Gold, Legendary=Fragmented Gold Glass, Omega=Glass Purple Fragmented
- [ ] Card interactions: hover (scale 1.05 + border), hold (detail overlay), click (selection glow ring + scale 1.06)
- [ ] Detail overlay: semi-transparent centered panel, blur background, X button. Shows portrait, name, class label+icon, stats bars, Skills button, Story
- [ ] Overlay interactions: hover/hold on stats + class label; click Skills/Story for detailed view; hold Skills button → tooltip at hold point
- [ ] NEXT button (animateEntrance, appears on first card selection)
- [ ] Filter out `classType === 'DUMMY'` characters
- [ ] Navigate: BACK → MainMenuScene, NEXT → LoadoutScene `{ charId }`

### LoadoutScene (`src/scenes/Loadout_Scene.ts`)
- [ ] Two-pane layout: 30% left / 70% right glass panels
- [ ] Left pane: character portrait ring (class color), name, class badge, stat bars (STR/END/PWR/RES/SPD/ACC), equipped slots summary (PASSIVE / ACTIVE / STACK ×3)
- [ ] Right pane: scrollable skill grid grouped by type (PASSIVE → ACTIVE → STACK)
- [ ] Skill cards (150×200): glass bg, type accent line (PASSIVE=blue/ACTIVE=green/STACK=yellow), charge cost badge, description, equipped badge
- [ ] Loadout rules: PASSIVE auto-equipped, ACTIVE max 1, STACK max 3; must have ≥1 ACTIVE + ≥1 STACK to proceed
- [ ] Smooth inertial scroll: `targetScrollY` + `currentScrollY` lerp 0.15 in `update()`
- [ ] On START BATTLE: call `CombatRegistry.getInstance().updateCharacterLoadout(charId, loadout)`, then `scene.start('Game_Scene', { userCharId, opponentCharId: 'mage' })`
- [ ] Navigate: BACK → CharacterSelectionScene `{ selectedCharId }`

### Game_Scene (`src/scenes/Game_Scene.ts`) — most complex
- [ ] Init GameLogic (10×10), loop until `hasPossibleMoves()` is true
- [ ] Create EffectManager with `this` as IEffectDelegate
- [ ] Background: gradient + ambient particles + optional board texture
- [ ] Board background: outer glow + dark glass fill + grid lines
- [ ] Selection rectangle (pulsing cyan border, depth 10)
- [ ] Visual gem grid (10×10 sprites via `createTextures()`)
- [ ] Special gem color tinting + overlay glyphs (see Section 3 above)
- [ ] SwipeHandler setup
- [ ] CombatManager.init(user, opponent) from CombatRegistry
- [ ] HUD panels (opponent top-left, user bottom-left): HP bar, Charge bar, name, stats row
- [ ] Turn indicator panel (top-right): "YOUR TURN" / "ENEMY TURN" with glow swap
- [ ] Power surge HUD (top-right)
- [ ] Active skill button (circular, charge cost)
- [ ] Stack skill row inside user HUD
- [ ] IEffectDelegate implementations: pulsarVisual, bombVisual, parasiteVisual, parasiteVortex, missileVisual, shakeCamera, destroyCell, getGridSize, getGrid
- [ ] Combat event listeners: HP_UPDATED, CHARGE_UPDATED, POWER_UPDATE, TURN_SWITCHED, GAME_OVER
- [ ] Cascade loop: destroy → create specials → process specials → gravity → refill → re-match → increment comboNumber → update HUD
- [ ] Reshuffle grid if no valid moves after cascade
- [ ] OpponentAI integration (800ms delay after TURN_SWITCHED)
- [ ] Game over overlay: dark fade + VICTORY/DEFEAT text + RETURN button
- [ ] Shutdown: remove all game event listeners, null opponentAI
- [ ] Emit SCENE_READY

---

## 5. Architecture Enforcement Audit

Once all scenes are rebuilt, audit each file to confirm the boundary is respected.

- [ ] `MainMenuScene.ts` — no engine imports except reading `GameState`
- [ ] `Character_Selection_Scene.ts` — reads `CombatRegistry` (data only, no mutations except `updateCharacterLoadout` on save)
- [ ] `Loadout_Scene.ts` — calls only `CombatRegistry.updateCharacterLoadout()` and reads skill/character data
- [ ] `Game_Scene.ts` — calls `GameLogic`, `CombatManager`, `EffectManager`, `SwipeHandler`, `OpponentAI` via their public APIs. Zero direct HP/damage/skill math in the scene file.
- [ ] `DebugPanel.ts` — scene navigation only, no game state mutations

---

## 6. Data & Balance

- [ ] `data/balance.json` — populate with all tunable constants (once scenes are functional for testing)
- [ ] Balance character stats across all 5 classes (Warrior, Guardian, Ranger, Hunter, Caster)
- [ ] Add more skills per character (currently each has ~3)
- [ ] Add opponent variety beyond `mage` hardcode
- [ ] Add campaign / level progression structure

---

## 7. Engine & Core Improvements

- [ ] `DebugPanel.ts` — re-audit scene navigation after all scenes are renamed/rebuilt
- [ ] Add settings persistence (localStorage) for volume, difficulty, etc.
- [ ] Add difficulty scaling (opponent stat modifiers)
- [ ] Add match history / session stats tracking
- [ ] Populate `docs/Gameplay.md` with skill action reference (REGISTER_HOOK is a placeholder — design the real hook system)

---

## 8. Polish & Accessibility

- [ ] Custom font loading (replace system monospace with sci-fi font)
- [ ] Sound design integration (UI feedback, match SFX, skill SFX)
- [ ] Screen transition effects between scenes
- [ ] Loading screen redesign matching new aesthetic
- [ ] Mobile touch optimization audit (swipe latency, tap targets)
- [ ] Performance profiling (particle count, draw calls on low-end devices)
- [ ] Color-blind accessibility: gem shapes already differ; confirm shape labels are readable at small sizes
- [ ] Font size scaling for accessibility (respect device text size settings where possible)
