# UI Layout — Genesis Puzzle Quest

All scenes use the design system from `UITheme.ts` + `BaseScene.ts` primitives.
Design basis: **1080×1920** portrait. All values scaled via `s()`. Use constraint layout mechanism for advance adaptive game.

---

## Pre-requisite: Fix CombatRegistry

**File:** `src/engine/CombatRegistry.ts`

Add `updateCharacterLoadout` method so LoadoutScene can persist loadout changes:

```ts
public updateCharacterLoadout(charId: string, loadout: CharacterLoadout): void {
    const data = this.characters.get(charId);
    if (data) data.loadout = loadout;
}
```

Also add the import for `CharacterLoadout` (already exported from Character.ts).

---
## Refine Logic
- `preload()` — loads required contextual data for next scene with new loading scene with Load on the go mechanism 
- Central data management module to store and manage data

## Scene 1: MainMenuScene

**File:** `src/scenes/Main_Menu_Scene.ts`
**Purpose:** Boot screen — preloads all assets, registers game data, shows title + nav buttons.

### Layout (1080×1920 design space)

```
┌──────────────────────────────────┐
│  ┌─┐                        ┌─┐ │  ← Corner brackets (decorative)
│                                  │
│         [title glow circle]      │  y = 22%
│           G E N E S I S          │  120px, bold, white, letterSpacing 30
│          PUZZLE  QUEST           │  32px, bold, accent green, letterSpacing 18
│      ────────◆────────           │  separator line
│                                  │
│                                  │
│       ┌──────────────────┐       │  y = 58%
│       │ ▎ START GAME     │       │  380×72 glass button, primary green
│       └──────────────────┘       │
│       ┌──────────────────┐       │  y = 58% + 95
│       │ ▎ OPTIONS        │       │  380×72 glass button, accent blue
│       └──────────────────┘       │
│       ┌──────────────────┐       │  y = 58% + 190
│       │ ▎ EXIT           │       │  380×72 glass button, danger red
│       └──────────────────┘       │
│                                  │
│            ● ○ ○                 │  status dots (decorative)
│          v0.1 ALPHA              │  y = bottom - 50
│  └─┘                        └─┘ │
└──────────────────────────────────┘
```

### Logic 
- Emits `SCENE_READY` event

### Build Steps
1. `createSceneBackground(container)` — gradient + vignette + grid pattern
2. `createAmbientParticles(container)` — dual-layer cyan/purple
3. Draw corner brackets (4 L-shapes at 20px margin, 40px length, primary color, 0.2 alpha)
4. Draw scan lines (horizontal stripes, 0.01 alpha, 4px step)
5. Title glow — graphics circle at centerX, 22%H, radius 200, primary color, 0.08 alpha, pulsing tween (3s yoyo)
6. Title text — "GENESIS" (120px) + "PUZZLE QUEST" (32px) + separator line below
7. 3 buttons via `createMenuButton()` at y=58%H, spaced 95px apart, staggered `animateSlideIn`
8. Version tag + 3 status dots at bottom

### Navigation
- START GAME → `this.scene.start('LobbyScene')`
- OPTIONS → console.log (placeholder)
- EXIT → console.log (placeholder)

---

## Scene 2: CharacterSelectionScene

**File:** `src/scenes/Character_Selection_Scene.ts`
**Purpose:** Hero selection — display character cards, select one, proceed to loadout.

### Init Data Contract
- Receives: `{ selectedCharId?: string }` (optional, for back-navigation)
- Sends to LoadoutScene: `{ charId: string }`

### Layout

```
┌──────────────────────────────────┐
│  [● BACK]    SELECT YOUR HERO   │  header + back button
│       Choose a warrior to...     │  subtitle
│      ────────◆────────           │
│                                  │
│    ┌────────┐ ┌────────┐ ┌────────┐    y = 42%
│    │▔▔▔▔▔▔▔▔│ │▔▔▔▔▔▔▔▔│ │▔▔▔▔▔▔▔▔│   260×360 glass cards
│    │  (W)   │ │  (M)   │ │  (R)   │   portrait placeholder
│    │WARRIOR │ │  MAGE  │ │ ROGUE  │   name (18px bold)
│    │WARRIOR │ │ CASTER │ │ RANGER │   class icon and card bg colour bind to rarity of character 
│    └────────┘ └────────┘ └────────┘ 
│                                  │
│                        [NEXT ●]  │  bottom-right, appears on select
└──────────────────────────────────┘
```

### Data Flow
- `CombatRegistry.getInstance().getAllCharactersData()` → array of CharacterData
- Use `char.classType` (NOT characterClass) for class display and color mapping

### Card Structure (per character)
1. Glow ring — graphics strokeRoundedRect, initially alpha 0
2. Background — graphics fillRoundedRect (bgCard, 0.85 alpha) + top highlight + border
3. Class accent bar — 4px colored bar at top edge bind to connected gem
4. Hit area — invisible interactive rectangle
5. Portrait — image if texture exists, else circle placeholder + initial letter
6. Name — 18px bold white, letter-spaced
7. Card background -- bg colour bind to rarity.

### Overlay - Character details 
 1. Semi transparent centered overlay top of lobby upon activation, blur the lobby for clean look and X button on top right corner for closing overlay with animation 
 2. Character portrait, Name, Class label and icon gems indicator, Card BG, Stats bar, Skills button and Story


### Class Icon
  1. WARRIOR  → STAR ICON 
  2. CASTER   → PENTAGON ICON 
  3. RANGER   → TRIANGLE ICON 
  4. GUARDIAN  → HEXAGON ICON 
  5. HUNTER  → SQUARE ICON

### Rarity and it's Colours
  1. Common = Grey
  2. Advance = Cyan
  3. Epic = Purple 
  4. Super = Silver
  5. Master = Gold
  6. Legendary = Fragmented Gold Glass
  7. Omega = Glass Purple Fragmented

### Interaction
- Hover: brighten card bg, add class-color border, scale 1.05
- Hold: Direct Holding on card Popup Overlay with Animation
- Click: set `selectedCharId`, reset all cards, apply selected style (glow ring visible, bgCardSelected, borderActive, scale 1.06)
- NEXT button appears with animateEntrance on first selection

### Interaction - Overlay
- Holding on SKILLS BUTTON show short description at hold point, Holding + Hovering logic applied to Stats, Class label and icon, Hovering and Holding doesn't work for STORY
- Hovering logic similar to lobby 
- Click on SKILLS, STORY for detailed description 

## Scene 3: LoadoutScene

**File:** `src/scenes/Loadout_Scene.ts`
**Purpose:** Configure skill loadout before battle.

### Init Data Contract
- Receives: `{ charId: string }`
- Sends to Game_Scene: `{ userCharId: string, opponentCharId: string }`
- Back nav sends: `{ selectedCharId: string }` to LobbyScene

### Layout

```
┌───────────────┬──────────────────────────┐
│ [● BACK]      │                          │
│               │  LOADOUT CONFIGURATION   │  y = topMargin + 28
│  ┌─────────┐  │  Select skills for...    │
│  │ portrait │  │                          │
│  │  ring    │  │  ● PASSIVE SKILLS       │  section headers
│  └─────────┘  │  ┌─────┐ ┌─────┐        │  150×200 skill cards
│   WARRIOR     │  │ 🛡  │ │     │        │
│  [WARRIOR]    │  │skill │ │     │        │
│               │  └─────┘ └─────┘        │
│  STR ████ 40  │                          │
│  END ████ 35  │  ● ACTIVE SKILLS        │
│  PWR █    10  │  ┌─────┐ ┌─────┐        │
│  RES ██   15  │  │ ⚡  │ │     │        │
│  SPD ██   20  │  │skill │ │     │        │
│  ACC ████ 90  │  └─────┘ └─────┘        │
│               │                          │
│ ──────◆────── │  ● STACK SKILLS          │
│   EQUIPPED    │  ┌─────┐ ┌─────┐        │
│ ● PASSIVE: X  │  │ 🔥  │ │     │        │
│ ● ACTIVE:  X  │  └─────┘ └─────┘        │
│ ● STACK 1: X  │                          │
│ ● STACK 2: —  │          [START BATTLE]  │
│ ● STACK 3: —  │                          │
└───────────────┴──────────────────────────┘

Left pane = 30% width | Right pane = 70% width | 12px gap
Total width = min(gameWidth * 0.95, s(1020))
Pane height = gameHeight * 0.78, vertically centered
```

### Data Flow
- `CombatRegistry.getInstance().getCharacterData(charId)` → CharacterData
- `char.unlockedSkills.map(id => registry.getSkillData(id))` → SkillData[]
- Filter by `skill.type === SkillType.PASSIVE/ACTIVE/STACK`
- Use `char.classType` for class color and display name
- Default loadout from `char.loadout`

### Loadout State
```ts
loadout = { passive: string|null, active: string|null, stacks: string[] }
```
- Passive: auto-equipped (first passive skill), not toggleable
- Active: click to equip/unequip (only 1)
- Stack: click to add (max 3), click again to remove

### Logic 
- Must equip one Active and Stack to proceed 

### Skill Card Structure
1. Glass background — fillRoundedRect (bgCard, 0.85) + highlight + border
2. Type accent line — 3px colored bar at top (PASSIVE→blue, ACTIVE→green, STACK→yellow)
3. Hit area — interactive rectangle
4. Type icon — emoji for now (🛡/⚡/🔥)
5. Name — 11px bold, letter-spaced
6. Charge cost badge — top-right corner, dark bg, yellow text
7. Description — 9px secondary, word-wrapped
8. Equipped badge — bottom center, pill shape, hidden by default

### Scroll System
- Right pane is scrollable (wheel + touch drag)
- `targetScrollY` + `currentScrollY` with 0.15 lerp in `update()`
- Max scroll calculated from content height vs visible height

### Saving Loadout
- On START BATTLE: call `CombatRegistry.getInstance().updateCharacterLoadout(charId, loadout)` (method we're adding)
- Then `this.scene.start('Game_Scene', { userCharId, opponentCharId: 'mage' })`

---

## Scene 4: Game_Scene (most complex)

**File:** `src/scenes/Game_Scene.ts`
**Purpose:** Main puzzle-combat gameplay.

### Init Data Contract
- Receives: `{ userCharId?: string, opponentCharId?: string }`
- Defaults: userCharId='warrior', opponentCharId='mage'

### Layout

```
┌──────────────────────────────────────────┐
│  ┌─────────────────┐      ┌───────────┐ │
│  │ MAGE             │      │ YOUR TURN │ │  Turn HUD (top-right)
│  │ HP  ██████████   │      └───────────┘ │
│  │ CHG ████████     │      ┌───────────┐ │
│  │ STR:10 END:15... │      │  ⚡ 0     │ │  Power HUD
│  └─────────────────┘      └───────────┘ │
│      [queued icons]                      │
│                                          │
│       ┌────────────────────────┐         │
│       │░░░░░░░░░░░░░░░░░░░░░░│         │
│       │░░ 10×10 PUZZLE GRID ░░│         │  centered
│       │░░░░░░░░░░░░░░░░░░░░░░│         │
│       │░░░░░░░░░░░░░░░░░░░░░░│         │
│       └────────────────────────┘         │
│                                          │
│      [queued icons]                      │
│  ┌───────────────────────────┐  ┌──────┐│
│  │ WARRIOR                   │  │SKILL ││  Active skill (circle)
│  │ HP  ████████████████      │  │20 EP ││
│  │ CHG ██████████            │  └──────┘│
│  │ STR:40 END:35 PWR:10...  │          │
│  │ [fury] [slot2] [slot3]   │          │  Stack skill buttons
│  └───────────────────────────┘          │
└──────────────────────────────────────────┘
```

### Grid Constants
- `GRID_SIZE = 10`
- `CELL_SIZE = s(88)` (scaled)
- `BASE_GRID_WIDTH = CELL_SIZE * GRID_SIZE`
- Grid centered: `offsetX = getCenteredX(gridWidth)`, `offsetY = getCenteredY(gridWidth, -77)`

### HUD Layout Constants (design-space, scaled via `s()`)
```ts
const BASE_HUD = {
  userWidth: 720, opponentWidth: 480,
  userHeight: 270, opponentHeight: 180,
  userBarWidth: 608, opponentBarWidth: 372,
  padding: 20, barHeight: 21, skillSize: 128,
  marginX: 24, marginY: 96,
};
```

### Build Order in `create()`
1. Init GameLogic, ensure valid grid (`initializeGrid` + `hasPossibleMoves` loop)
2. Create EffectManager with `this` as delegate
3. Draw background (gradient + ambient particles + optional texture)
4. Draw board background (outer glow + dark glass fill + grid lines)
5. Create selection rect (pulsing cyan border, depth 10)
6. Init visual grid (10×10 gem sprites)
7. Setup SwipeHandler
8. Init combat: get characters from registry → `CombatManager.init(user, opponent)`
9. Build HUD (opponent top-left, user bottom-left)
10. Build turn HUD, power HUD, active skill button
11. Setup combat event listeners
12. Init OpponentAI
13. Emit SCENE_READY

### Character HUD Panel (buildCharacterHUD)
For each side (user/opponent):
1. `createPanel()` — glass panel at correct position
2. Turn-indicator glow — graphics, toggled on TURN_SWITCHED
3. Character name — bold white
4. HP bar — `drawProgressBar()` with user=green / opponent=red
5. HP text — "current/max"
6. Charge bar — `drawProgressBar()` with user=blue / opponent=yellow
7. Charge text — "current/max"
8. Stat row — `createStatRow()` with 6 stats
9. Stack skill buttons (user only) — row of glass rectangles with name + cost

### Gem Rendering
- Procedural textures via `createTextures()` — draw shapes into graphics, generateTexture per ShapeType
- Each cell: container with image sprite (85% of cell size)
- Special type overlay: text glyph (━, ┃, ◉, ✦)
- Star particle texture for effects

### Shapes and Colours of Gems
- Red Star 
- Green Square 
- Blue Triangle 
- Pink Pentagon 
- Yellow Hexagon 

### Swap + Cascade Loop
```
swapCells(r1,c1,r2,c2):
  1. Animate visual swap (250ms)
  2. Logic swap
  3. Handle parasite/special combos → processBoard → switchTurn
  4. Find matches → if none, swap back
  5. If matches: processBoard → switchTurn

processBoard(giveScore, initialMatches?):
  while (matches || pendingSpecials || hasEmpty):
    1. Destroy matched cells (with particles + sound)
    2. Create special gems at designated positions (scale-pop entrance)
    3. Process pending specials via EffectManager
    4. Apply gravity (animate drops with bounce)
    5. Spawn new cells (drop from above)
    6. Find new matches, increment comboNumber
    7. Update HUD
  Ensure grid is playable (reshuffle if no moves)
```

### IEffectDelegate Implementations
- `playPulsarVisual` — draw horizontal/vertical beam lines, tween alpha, shake camera
- `playBombVisual` — draw expanding circle, flash, shake camera
- `playParasiteVisual` — tween lines from source to each target cell
- `playParasiteVortex` — spinning circle effect
- `playMissileVisual` — tween projectile from source to target
- `shakeCamera` — `this.cameras.main.shake(duration, intensity/1000)`
- `destroyCell` — scale-pop + fade + destroy sprite + spawn particles + emit GEMS_DESTROYED
- `getGridSize` — return GRID_SIZE
- `getGrid` — return `this.logic.grid`

### Combat Event Listeners
- `HP_UPDATED` → redraw progress bar + update text
- `CHARGE_UPDATED` → redraw progress bar + update text
- `POWER_UPDATE` → update power text
- `TURN_SWITCHED` → update turn text/color, toggle HUD glow, trigger AI on opponent turn (800ms delay)
- `GAME_OVER` → show overlay (dark fade + VICTORY/DEFEAT text + return button)

### Game Over Overlay
- Full-screen dark rectangle (alpha 0→0.8, depth 100)
- "VICTORY" (green) or "DEFEAT" (red) text (72px, animateEntrance, depth 101)
- `createMenuButton("RETURN TO MENU")` (depth 101)

### Shutdown Cleanup
- Remove all game event listeners
- Null out opponentAI

---

## Key Bug Fixes vs Old Code

| Bug | Old Code | Fix |
|-----|----------|-----|
| Wrong field | `char.characterClass` | Use `char.classType` |
| Missing method | `registry.updateCharacterLoadout()` | Add to CombatRegistry |
| Fragile indexing | `card.list[0] as Rectangle` | Use `setData()`/`getData()` for named references |
| Dummy filtering | Showed dummy1-5 in lobby | Filter `classType !== 'DUMMY'` |
| Hardcoded opponent | Always `'mage'` | Keep for now, note as TODO for opponent selection |

---

## Implementation Order

1. **CombatRegistry fix** — add `updateCharacterLoadout` method
2. **MainMenuScene** — simplest, establishes visual baseline
3. **CharacterSelectionScene** — character cards + selection logic
4. **LoadoutScene** — two-pane + scroll + loadout state
5. **Game_Scene** — most complex, do last (grid + HUD + combat + effects + AI)

---

## Verification

After each scene rebuild:
1. `npx tsc --noEmit` — no new errors (exclude pre-existing editor/debug errors)
2. `npm run dev` — visual check in browser
3. DebugPanel scene navigation — use backtick to jump between scenes
4. Full flow test: MainMenu → select warrior → configure loadout → start battle → play → game over → return

