# Gameplay.md — Genesis Puzzle Quest

Complete reference for all gameplay mechanics as implemented in the codebase.

---

## Table of Contents

1. [Game Flow](#1-game-flow)
2. [The Grid](#2-the-grid)
3. [Gems](#3-gems)
4. [Matching Rules](#4-matching-rules)
5. [Special Gems](#5-special-gems)
6. [Special Gem Color & Visual Identity](#6-special-gem-color--visual-identity)
7. [Damage & Combat](#7-damage--combat)
8. [Charge System](#8-charge-system)
9. [Skills](#9-skills)
10. [Characters & Classes](#10-characters--classes)
11. [Opponent AI](#11-opponent-ai)
12. [Input Handling](#12-input-handling)
13. [Known Bugs & Fixes](#13-known-bugs--fixes)

---

## 1. Game Flow

```
Main Menu
  └─► Hero Selection (LobbyScene)
        └─► Skill Loadout (LoadoutScene)
              └─► Puzzle Combat (Game_Scene)
                    └─► Victory / Defeat → Main Menu
```

### Combat Turn Loop

```
CombatManager.init(user, opponent)
  ├─ Initialize HP and charge (both start at 0 charge)
  ├─ Execute user PASSIVE skill
  └─ Execute opponent PASSIVE skill

USER TURN:
  ├─ Player swaps gems on grid
  └─ On gem destruction (GEMS_DESTROYED event):
        ├─ Process active STACK effects
        ├─ Apply match damage (with mitigation)
        ├─ Grant charge if linked gem was matched
        └─ Check win/loss condition

switchTurn():
  ├─ If next side is frozen → decrement frozenTurns, stay on current turn
  └─ Otherwise → flip currentTurn, increment turnCount, emit TURN_SWITCHED

OPPONENT TURN (OpponentAI):
  ├─ 1-second delay
  ├─ Try to cast STACK skills (all that are affordable)
  ├─ Try to cast ACTIVE skill (if charge sufficient)
  ├─ Find and execute best swap
  └─ → back to switchTurn()

Game ends when either character's HP reaches 0 → GAME_OVER event
```

---

## 2. The Grid

- **Size:** 10 × 10 cells
- **Coordinate system:** `{ r: row, c: column }` (0-indexed, row 0 = top)
- **Cell structure:** `LogicCell { r, c, shape: ShapeType, special: SpecialType }`

### Grid Initialization

Each cell is assigned a random gem shape. Up to 20 attempts are made per cell to avoid placing gems that would form a 3-in-a-row at startup. If the gem registry is empty, all five shape types are used as the fallback pool.

### Gravity

After any gems are destroyed:
1. Remaining gems fall downward to fill gaps.
2. New random gems are spawned at the top to fill empty cells.
3. The engine returns a list of `drops` (falling cells) and `newCells` (spawned gems) for animation.

### Move Validation

The engine caches all valid swaps. The cache is invalidated (dirty flag) whenever the grid changes. Valid swaps include:
- Any adjacent swap that results in a 3+ match.
- Swaps involving a PARASITE gem (always valid regardless of outcome).
- Swaps between any two special gems.

---

## 3. Gems

### Normal Gem Shapes (`ShapeType` enum)

| Shape | Class | Color |
|-------|-------|-------|
| STAR | WARRIOR | `0xef4444` (red) |
| HEXAGON | GUARDIAN | `0xeab308` (yellow) |
| TRIANGLE | RANGER | `0x3b82f6` (blue) |
| SQUARE | HUNTER / DUMMY | `0x22c55e` (green) |
| PENTAGON | CASTER | `0xec4899` (pink) |

Each character class has a **linked gem** — the shape they match to generate charge.

### Special Gem Types (`SpecialType` enum)

| Type | Created By | Color | Effect |
|------|-----------|-------|--------|
| MISSILE | Exact 2×2 square match | Inherits creation gem color | Fires 3 projectiles, each destroying one cell |
| PULSAR | Exactly 4 in a line | Inherits creation gem color | Clears one full row + one full column |
| BOMB | T-shape / L-shape / cross match | Inherits creation gem color | Destroys all gems in radius 2 |
| PARASITE | 5+ in a row/column | Fixed purple `0x8b5cf6` | Targets all gems of a chosen shape on the board |

**Color inheritance:** MISSILE, PULSAR, and BOMB take the color of the gem shape that formed them. The `shape` field on `LogicCell` stores the creation gem's `ShapeType`; rendering derives the display color via `GemRegistry.getColorForShape(cell.shape)`. PARASITE always uses purple because it has no single creation shape (`ShapeType.NONE`).

Gem data is loaded from `public/data/gems/` JSON files and registered into `GemRegistry` at boot.

---

## 4. Matching Rules

### Basic Matching

- **Minimum match:** 3 adjacent gems of the same shape (horizontal or vertical).
- **2×2 squares:** Four gems of the same shape in a 2×2 block also count as a match.
- **Overlapping matches** are merged into a single group via a Union-Find algorithm (flat `Int32Array` parent array for performance).

### Match Scoring

Base score = `10 × cell count`

| Bonus condition | Points added |
|----------------|-------------|
| PARASITE created | +40 |
| BOMB created | +30 |
| PULSAR created | +20 |
| MISSILE created | +20 |

### Special Gem Creation Rules

Special gems are created at the junction/center of a qualifying match and replace the normal gem at that position. Rules are checked in priority order — the first match wins.

| Priority | Match pattern | Condition | Special created |
|----------|---------------|-----------|----------------|
| 1 | 5+ in any direction | `w ≥ 5` or `h ≥ 5` | **PARASITE** |
| 2 | T-shape / L-shape / cross | Any cell has ≥ 3 neighbors in the group, OR any cell has exactly 2 non-collinear neighbors (one horizontal + one vertical) | **BOMB** |
| 3 | Exactly 4 in a line | `w === 4` or `h === 4` | **PULSAR** |
| 4 | Exact 2×2 square | `w === 2`, `h === 2`, 4 cells total | **MISSILE** |

**Detection detail for T/L/cross (BOMB):** After a match group is formed, each cell's orthogonal neighbors within the group are counted. A junction cell is one where ≥ 3 neighbors are present (T or cross) or exactly 2 perpendicular-axis neighbors are present (L-corner). The junction cell is used as the special gem's spawn position.

**What does NOT create a special:** A plain 3-in-a-row or 3-in-a-column with no branching and no 2×2 box.

---

## 5. Special Gems

### MISSILE

- **Trigger:** Activated when swapped.
- **Effect:** Fires 3 projectiles, each destroying a single target cell.
- **Combo — MISSILE + BOMB:** 3 projectiles, each with an explosion radius of 2.
- **Combo — MISSILE + PULSAR:** 3 projectiles, each firing a cross beam.
- **Combo — MISSILE + MISSILE:** 7 projectiles.

### PULSAR

- **Trigger:** Activated when swapped.
- **Effect:** Clears the entire row and column it occupies (cross pattern, width 1).
- **Combo — PULSAR + BOMB:** Cross pattern, width 3, double damage.
- **Combo — PULSAR + PULSAR:** Cross pattern, width 1.

### BOMB

- **Trigger:** Activated when swapped.
- **Effect:** Destroys all gems within radius 2 (circular area). Triggers camera shake (300ms, 0.03 intensity).
- **Combo — BOMB + BOMB:** Radius 4 explosion.

### PARASITE

- **Trigger:** Activated when swapped.
- **Effect:** Targets and destroys all gems of a specific shape across the entire board.
- **Combo — PARASITE + PARASITE:** 1000ms vortex visual, wave destruction from center, effectively clears the entire board.
- **Combo — PARASITE + any other special:** Finds all gems matching its chosen shape, then applies the other special's effect to each.
- **Combo — PARASITE + normal gem:** Destroys all gems matching that normal gem's shape.

---

## 6. Special Gem Color & Visual Identity

### Color Inheritance

Special gems (MISSILE, PULSAR, BOMB) inherit the color of the gem type that created them. This is stored in `cell.shape` (`ShapeType`) on the `LogicCell` and resolved to a hex color at render time:

```typescript
// Render-side (Game_Scene.ts):
const color = GemRegistry.getInstance().getColorForShape(cell.shape);
sprite.setTint(color);
```

| `cell.shape` | Inherited color | Example: BOMB made of STARs |
|---|---|---|
| STAR | `0xef4444` (red) | Red BOMB |
| HEXAGON | `0xeab308` (yellow) | Yellow BOMB |
| TRIANGLE | `0x3b82f6` (blue) | Blue BOMB |
| SQUARE | `0x22c55e` (green) | Green BOMB |
| PENTAGON | `0xec4899` (pink) | Pink BOMB |
| NONE (PARASITE) | `0x8b5cf6` (purple) | Always purple |

### Visual Distinguishability

Because special gems share colors with normal gems, they must carry a secondary visual cue so the player always knows they are activatable (by swap or by being destroyed as part of another effect).

Each special type has an **overlay glyph** rendered on top of the colored sprite:

| Special | Overlay glyph | Meaning |
|---------|--------------|---------|
| MISSILE | `→` | Projectile direction |
| PULSAR | `✛` | Cross-beam pattern |
| BOMB | `✦` | Explosion burst |
| PARASITE | `◎` | Target all of a shape |

All glyphs render in white (`#ffffff`) at ~40% of cell size, centered, at depth = gem depth + 1. An additional pulsing outer glow (tint color, 0.6 alpha, 2s yoyo) further separates them from normal gems.

---

## 7. Damage & Combat

### Match Damage Formula

Triggered whenever gems are destroyed (`GEMS_DESTROYED` event). Damage is dealt to the **inactive** (defending) character.

```
matchDamage = (0.4 × activePrimaryStat) + (0.25 × moveScore × cascadeMultiplier)
cascadeMultiplier = 1.15 ^ (comboNumber - 1)
```

- `activePrimaryStat` = attacker's strength (PHYSICAL), power (ENERGY), or max(strength, power) (HYBRID).
- `moveScore` = total score of all matched gems in this move.
- `comboNumber` = cascade chain count (starts at 1, increments each cascade).

### Damage Mitigation

Applied after the raw damage is calculated.

| Damage type | Mitigation formula |
|-------------|-------------------|
| PHYSICAL | `damage × (100 / (100 + targetEndurance))` |
| ENERGY | `damage × (100 / (100 + targetResistance))` |
| HYBRID | Uses the lower of the two mitigations |
| TRUE | No mitigation |
| NONE | No damage dealt |

Minimum result after mitigation: **1 damage**.

### Active Skill Damage Formula

```
skillDamage = baseDamage + (0.4 × attackerPrimaryStat) + (0.2 × powerSurge)
```

- `baseDamage` = value defined in skill JSON.
- `powerSurge` = current power surge bonus on the attacker.
- Same mitigation rules apply as match damage.

### Critical Hits (Active Skills)

- **Crit chance:** `attackerAccuracy × 0.5%`
- **Crit multiplier:** `1.5×`

### Accuracy & Hit Chance

Active skills can miss based on an accuracy check:

```
hitChance = clamp(baseHitChance + (attackerAccuracy × 2) - (targetSpeed × 1.5), 15, 100)
```

- Range: **15% – 100%** (always at least a 15% chance to hit).
- A random roll 0–100 is made; if the roll exceeds `hitChance`, the skill misses.

### Win/Loss Condition

The game ends immediately when any character's `currentHp` reaches ≤ 0. The surviving character wins. A `GAME_OVER` event is broadcast with the winner.

---

## 8. Charge System

- Characters start each combat with **0 charge**.
- Charge is gained by matching the character's **linked gem shape** (see Classes table above).
- Each gem of the linked shape destroyed in a match = **+1 charge**.
- Charge is consumed when a skill is cast.
- Passives can grant starting charge via `ON_COMBAT_START` → `add_charge` action.

---

## 9. Skills

### Skill Types

| Type | Description |
|------|-------------|
| **PASSIVE** | Executes automatically at combat start. No charge cost. |
| **ACTIVE** | Manually triggered by the player/AI. Costs charge. Immediate effect. |
| **STACK** | Queued to the `stackQueue`. Triggers on gem matches for a set number of activations. |

### Skill Data Structure

```typescript
{
  id: string,
  name: string,
  type: SkillType,           // PASSIVE | ACTIVE | STACK
  chargeCost: number,
  baseDamage?: number,
  damageType?: DamageType,   // PHYSICAL | ENERGY | HYBRID | TRUE | NONE
  accuracy?: number,         // defaults to 100
  description: string,
  actions: SkillAction[],    // ordered list of effects
  icon: string,
  includeMoveDamage?: boolean // default true for STACK, false otherwise
}
```

### Skill Actions

Actions are executed in order when a skill fires.

| Action type | Effect |
|-------------|--------|
| `DAMAGE_TARGET` | Deal damage to the opponent (with accuracy check, crit, mitigation) |
| `HEAL_SELF` | Restore a fixed amount of HP to the caster |
| `REGISTER_HOOK` | Registers a passive hook (placeholder, not fully implemented) |
| `ON_COMBAT_START` + `add_charge` | Add charge to the character at combat start |

### STACK Skill Effects

STACK skills add an entry to `stackQueue` with a trigger shape, an effect type, a charge count, and an owner. They trigger on matching gem destructions.

| Effect type | Description |
|-------------|-------------|
| `bonus_damage` | `(0.4 × primaryStat) + (0.25 × moveScore) + (0.1 × powerSurge × cascadeMultiplier)` extra damage |
| `double_damage` | Match damage × 2 |
| `triple_damage` | Match damage × 3 |
| `heal_on_match` | Heals attacker for `5% of their maxHp` per triggered match |
| `freeze_opponent` | Increments opponent's `frozenTurns` counter by 1 |
| `shield` | Grants attacker temporary HP (`3% of maxHp`) |
| `poison` | Deals flat damage to opponent (`4% of target's maxHp`) |

**Stack trigger shapes:** `match_[shape]` (e.g. `match_STAR`) or `match_any`.
**Limitation:** Only one STACK skill per side can be queued at a time.

---

## 10. Characters & Classes

### Character Stats

| Stat | Role |
|------|------|
| `strength` | Primary stat for PHYSICAL damage; used in match & skill damage formulas |
| `endurance` | Reduces incoming PHYSICAL damage |
| `power` | Primary stat for ENERGY damage |
| `resistance` | Reduces incoming ENERGY damage |
| `speed` | Reduces enemy hit chance (each point reduces enemy hitChance by 1.5) |
| `accuracy` | Increases hit chance (each point adds 2 to hitChance); also increases crit chance |

### Character Classes & Linked Gems

| Class | Linked Gem | Color |
|-------|-----------|-------|
| WARRIOR | STAR | Red |
| GUARDIAN | HEXAGON | Yellow |
| RANGER | TRIANGLE | Blue |
| HUNTER | SQUARE | Green |
| CASTER | PENTAGON | Pink |
| DUMMY | SQUARE | Green (fallback) |

### Character JSON Format

Located at `public/data/characters/{id}/main.json`:

```json
{
  "id": "warrior",
  "name": "Warrior",
  "classType": "WARRIOR",
  "maxHp": 500,
  "initialHp": 500,
  "maxCharge": 100,
  "initialCharge": 0,
  "stats": {
    "strength": 40,
    "endurance": 35,
    "power": 15,
    "resistance": 20,
    "speed": 25,
    "accuracy": 90
  },
  "damageType": "PHYSICAL",
  "unlockedSkills": ["slash", "fury", "resilience"],
  "loadout": {
    "passive": "resilience",
    "active": "slash",
    "stacks": ["fury"]
  }
}
```

---

## 11. Opponent AI

The AI runs on the opponent's turn with a 1-second delay before acting.

### Turn Priority Order

1. **Cast STACK skills** — tries each STACK skill in loadout order if charge is sufficient.
2. **Cast ACTIVE skill** — if charge is sufficient.
3. **Execute best swap** — evaluates all valid swaps and picks the highest-scoring one.

### Move Scoring (AI Heuristic)

| Condition | Score |
|-----------|-------|
| Special + Special combo | 500 |
| Parasite swap (adjacent to any gem) | 300 |
| Parasite swap (preferred gem adjacent) | +100 bonus |
| Normal match per cell | 10 |
| Match includes opponent's linked gem | +50 |
| Would create PARASITE | +150 |
| Would create BOMB | +100 |
| Would create PULSAR | +80 |
| Would create MISSILE | +50 |
| Swap involves existing special gem | +100 |

---

## 12. Input Handling

### Swipe / Drag Swap

- Player presses down and drags a gem at least **30px**.
- The dominant axis (`|dx| vs |dy|`) determines the swap direction.
- Target cell must be within grid bounds.

### Tap-to-Swap

- **First tap** (< 5px movement): Selects the gem.
- **Second tap on adjacent cell:** Executes the swap.
- **Second tap on same cell:** Deselects.

---

## 13. Known Bugs & Fixes

These bugs have been fixed in the current codebase. Notes are preserved here for context.

| Bug | Location | Fix |
|-----|----------|-----|
| `freeze_opponent` stack effect was silently ignored | `CombatManager.ts` ~line 215 | Now increments `frozenTurns[opponentSide]` |
| `shield` stack effect was silently ignored | `CombatManager.ts` ~line 227 | Now grants `3% maxHp` temporary heal |
| `poison` stack effect was silently ignored | `CombatManager.ts` ~line 244 | Now deals `4% targetMaxHp` immediate damage |
| DUMMY class missing from enum and gem map | `Character.ts` lines 12–34 | Added DUMMY to `CharacterClass` enum and `ClassGemMap` |
| Passive init used wrong active character | `CombatManager.ts` ~line 76 | `currentTurn` must be set before `executeSkill()` so `getActiveCharacter()` resolves correctly |

---

## Source File Reference

| System | File |
|--------|------|
| Grid matching & gravity | `src/engine/GameLogic.ts` |
| Combat state & turn flow | `src/engine/CombatManager.ts` |
| Skill execution | `src/engine/SkillProcessor.ts` |
| Opponent AI | `src/engine/OpponentAI.ts` |
| Action queue | `src/engine/ActionProcessor.ts` |
| Special gem effects | `src/engine/EffectManager.ts` |
| Touch/swipe input | `src/engine/SwipeHandler.ts` |
| Gem registry | `src/engine/GemRegistry.ts` |
| Character & skill registry | `src/engine/CombatRegistry.ts` |
| Character model | `src/entities/Character.ts` |
| Skill model | `src/entities/Skill.ts` |
| Character JSON definitions | `public/data/characters/{id}/main.json` |
| Gem JSON definitions | `public/data/gems/*.json` |
| Balance constants | `data/balance.json` |
