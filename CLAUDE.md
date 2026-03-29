# CLAUDE.md — Genesis Puzzle Quest

AI assistant reference for the Genesis Puzzle Quest codebase.

---

## Project Overview

**Genesis Puzzle Quest (GPQ)** is a puzzle-combat RPG that combines Match-3 gameplay with turn-based combat. Players match 3+ gems on a 10×10 grid to deal damage and charge skills, then spend that charge to trigger powerful abilities.

**Game flow:** Main Menu → Hero Selection → Skill Loadout → Puzzle Combat → Victory/Defeat

**Status:** v0.1 Alpha — Core engine is functional; all UI scenes are being rebuilt per `docs/UI-Design.md`.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Game Engine | Phaser 3 | 3.90.0 |
| UI Framework | React | 19.0.0 |
| Language | TypeScript | 5.8.2 |
| Build Tool | Vite | 6.2.0 |
| CSS | Tailwind CSS | 4.1.14 |
| Animations | Motion (Framer Motion) | 12.23.24 |
| Debug UI | lil-gui | 0.21.0 |
| Backend | Express.js + better-sqlite3 | 4.21.2 / 12.4.1 |
| AI Integration | Google Gemini (`@google/genai`) | 1.29.0 |

---

## Development Commands

```bash
npm run dev      # Vite dev server on port 3000 (host 0.0.0.0)
npm run build    # Production build → dist/
npm run preview  # Preview production build
npm run clean    # Remove dist/
npm run lint     # TypeScript type-check (tsc --noEmit)
```

No test runner is configured. Verification is manual in-browser.

---

## Repository Structure

```
GPQ/
├── src/
│   ├── components/        # React components (DebugPanel)
│   ├── editor/            # Level editor (inactive)
│   ├── engine/            # Core game systems (see below)
│   ├── entities/          # Data model classes
│   ├── scenes/            # Phaser scenes
│   ├── App.tsx            # React root, Phaser init
│   └── main.tsx           # React entry point
├── public/
│   └── data/
│       ├── characters/    # Character JSON definitions (one dir per character)
│       └── gems/          # Gem type definitions
├── data/
│   └── balance.json       # Game balance constants
├── docs/
│   ├── UI-Design.md       # Scene rebuild specifications (400+ lines)
│   └── Gameplay.md        # (empty template)
├── .github/workflows/     # GitHub Pages deploy (manual trigger)
├── .env.example           # Required environment variables
├── vite.config.ts
├── tsconfig.json
├── TODO.md                # Scene rebuild checklist
└── README.md
```

---

## Architecture

### Engine Layer (`src/engine/`)

Singleton-based game systems. Most are accessed as `ClassName.getInstance()`.

| File | Responsibility |
|------|---------------|
| `GameConfig.ts` | Phaser game configuration (WebGL, RESIZE scale mode, 4 pointers) |
| `GameState.ts` | Game lifecycle state machine |
| `CombatManager.ts` | Turn-based combat state (HP, charge, turn tracking) |
| `CombatRegistry.ts` | Singleton registry for loaded character/skill data |
| `GameLogic.ts` | 10×10 grid matching, cascade, and gem destruction logic |
| `SkillProcessor.ts` | Skill effect execution |
| `OpponentAI.ts` | Enemy turn decision logic |
| `EffectManager.ts` | Visual effect delegation via `IEffectDelegate` |
| `SwipeHandler.ts` | Touch/swipe input |
| `InputManager.ts` | Keyboard input |
| `GlobalInputManager.ts` | Centralized input dispatch |
| `SoundManager.ts` | Audio effects |
| `GemRegistry.ts` | Gem type registry |
| `ActionProcessor.ts` | Action queue processing |

### Entity Layer (`src/entities/`)

Pure data models — no Phaser dependencies.

- `Character.ts` — Stats, loadout, skill references
- `Skill.ts` — Skill definition, type, cost, effect descriptor
- `Player.ts`, `BaseEntity.ts` — Shared base

**Key enums:**
- `CharacterClass`: `WARRIOR | GUARDIAN | RANGER | HUNTER | CASTER | DUMMY`
- `SkillType`: `PASSIVE | ACTIVE | STACK`
- `DamageType`: `PHYSICAL | ENERGY | HYBRID | TRUE | NONE`

### Scene Layer (`src/scenes/`)

All scenes extend `BaseScene`.

| File | Description |
|------|-------------|
| `BaseScene.ts` | Foundation: responsive `s()` scaling, layout helpers, reusable UI primitives |
| `UITheme.ts` | Design system: colors, fonts, spacing, animation constants, depth layers |
| `MainMenuScene.ts` | Boot/title scene |
| `LobbyScene.ts` | Hero selection (WIP rebuild) |
| `LoadoutScene.ts` | Skill configuration (WIP rebuild) |
| `Game_Scene.ts` | Puzzle combat (WIP rebuild) |
| `DebugPanel.ts` | Dev scene navigation overlay |

**Scene navigation:** `this.scene.start('SceneKey', dataObject)`

### Data-Driven Content

Characters, skills, and gems are loaded from JSON at boot and registered into singletons.

Character files live at: `public/data/characters/{id}/main.json`

```json
{
  "id": "warrior",
  "name": "Warrior",
  "classType": "WARRIOR",
  "maxHp": 500,
  "stats": { "strength": 40, "endurance": 35 },
  "unlockedSkills": ["slash", "fury", "resilience"],
  "loadout": {
    "passive": "resilience",
    "active": "slash",
    "stacks": ["fury"]
  }
}
```

---

## Key Design Patterns

### Responsive Scaling

All layout uses a **1080×1920 design space** as the base. The `s()` method in `BaseScene` scales any pixel value to the current viewport:

```typescript
const scaleFactor = Math.min(gameWidth / 1080, gameHeight / 1920);
this.s(40) // → 40 * scaleFactor
```

Never hardcode pixel coordinates. Always use `this.s(value)`.

### Singleton Access

Singletons are accessed via `getInstance()`. Do not instantiate directly.

```typescript
const combat = CombatManager.getInstance();
const registry = CombatRegistry.getInstance();
```

### Phaser Event Bus

Game-wide events are emitted on the Phaser game's event emitter:

```typescript
this.game.events.emit('HP_UPDATED', { who: 'user', hp: 420 });
this.game.events.on('TURN_SWITCHED', (data) => { ... });
```

**Standard events:** `HP_UPDATED`, `CHARGE_UPDATED`, `POWER_UPDATE`, `TURN_SWITCHED`, `GEMS_DESTROYED`, `GAME_OVER`, `COMBAT_INIT`, `SCENE_READY`

### Effect Delegation

Visual effects are decoupled via `IEffectDelegate`. Pass an implementation to `EffectManager` — do not call scene methods directly from engine classes.

---

## Environment Variables

Defined in `.env.example`. Copy to `.env` locally (never commit `.env`).

```
GEMINI_API_KEY=   # Google Gemini API key
APP_URL=          # Application URL
```

`GEMINI_API_KEY` is exposed to the client via `vite.config.ts` (`define: { 'process.env.GEMINI_API_KEY': ... }`).

---

## UI Design Specification

**`docs/UI-Design.md` is the primary implementation reference** for all four scenes. Before modifying any scene, read the relevant section there.

Key notes from the spec:
- `CombatRegistry` needs an `updateCharacterLoadout(id, loadout)` method before LoadoutScene can work
- Scene builds should follow the order: design system → MainMenuScene → LobbyScene → LoadoutScene → Game_Scene
- All scenes must use `UITheme` constants — no hardcoded colors or font sizes
- Glass-morphism styling is used for panels (see `UITheme.ts` for exact values)

---

## Coding Conventions

- **File naming:** PascalCase for class files (`CombatManager.ts`), matching the class name
- **Constants:** SCREAMING_SNAKE_CASE
- **Imports:** Use `@/` path alias for project-root imports (e.g., `@/engine/CombatManager`)
- **Error handling:** Try-catch in constructors that parse external JSON; log with `console.error`
- **No magic numbers:** Use `UITheme` for all design values; use `s()` for all pixel values
- **TypeScript:** Prefer interfaces over `any`; use enums for finite value sets
- **Comments:** Inline `// FIX:` comments document known bugs and their solutions — preserve these
- **Scenes are rendering-only:** Scenes implement `IEffectDelegate` for visual callbacks (animations, particles, camera effects). No game logic — match detection, damage calculation, charge management, turn flow, skill execution, or AI — may live in a scene file. All such logic belongs exclusively in `src/engine/`. If you find logic in a scene, move it to the appropriate engine class.

---

## CI/CD

- **Deployment:** GitHub Pages via `.github/workflows/deploy.yml`
- **Trigger:** Manual (`workflow_dispatch`)
- **Steps:** `npm ci` → `npm run build` → upload `dist/` → deploy to Pages
- **Node version:** 20

---

## Current Development Focus

See `docs/TODO.md` for the full implementation checklist (authoritative). Root `TODO.md` is a quick-glance summary. Active work areas:

1. **Special gem engine changes** — T/L → BOMB, exact 2×2 → MISSILE; `hasBranchingShape()` helper; `getColorForShape()` in GemRegistry
2. **Scene UI rebuilds** — All four scenes are cleared shells awaiting implementation per `docs/UI-Design.md`
3. **CombatRegistry fix** — Add `updateCharacterLoadout` method (prerequisite for LoadoutScene)
4. **Special gem rendering** — Color tinting + overlay glyphs + activation glow (post-scene-rebuild)
5. **Content balance** — `data/balance.json` needs tuning once scenes are functional

---

## Branch Conventions

- `main` — production-ready code
- `claude/*` — AI assistant feature branches
- Feature branches are merged via pull requests

Current working branch: `claude/add-claude-documentation-AejA6`
