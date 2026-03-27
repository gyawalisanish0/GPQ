# Genesis Puzzle Quest

A puzzle-combat RPG built with **Phaser 3**, **React 19**, and **TypeScript**.

Match gems on a 10x10 grid to charge abilities, deal damage, and defeat opponents in strategic turn-based battles. Choose your hero, customize your skill loadout, and fight through increasingly challenging encounters.

## Core Gameplay

- **Match-3 Puzzle Grid** — Swap gems on a 10x10 board. Match 3+ of the same shape to score, build charge, and trigger effects.
- **5 Gem Shapes** — Triangle, Square, Pentagon, Hexagon, Star. Each tied to different combat stats.
- **Special Gems** — Missile, Pulsar, Bomb, Parasite. Created by matching 4+ gems, triggering devastating chain reactions.
- **Turn-Based Combat** — Matches deal damage and generate charge. Spend charge to activate powerful skills.
- **Skill Loadout System** — Equip a Passive, an Active, and up to 3 Stack skills before each battle.
- **4 Character Classes** — Warrior, Mage, Rogue, Paladin. Each with unique stats and skill trees.

## Game Flow

```
Main Menu  ->  Hero Selection  ->  Skill Loadout  ->  Puzzle Combat
                                                        |
                                                   Victory / Defeat
                                                        |
                                                   Back to Menu
```

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Game Engine | Phaser 3.90                       |
| UI Layer    | React 19 + Tailwind CSS 4         |
| Language    | TypeScript 5.8                    |
| Animations  | Motion (Framer Motion) 12         |
| Build       | Vite 6                            |
| Debug       | lil-gui (F3 / backtick to toggle) |

## Project Structure

```
src/
  engine/         Core game systems (grid logic, combat, AI, effects, input)
  entities/       Data models (Character, Skill, Player)
  scenes/         Phaser scenes (MainMenu, Lobby, Loadout, Game)
  components/     React UI components (DebugPanel)
public/
  data/
    characters/   Character JSON definitions + skill trees
    gems/         Gem type definitions
```

## Run Locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

## Architecture

- **Design System** — Centralized in `src/scenes/UITheme.ts`. All colors, spacing, typography, and animation presets.
- **Base Scene** — `src/scenes/BaseScene.ts` provides responsive scaling (1080x1920 design basis), shared UI primitives (panels, buttons, progress bars), and entrance animations.
- **Data-Driven** — Characters, skills, and gems loaded from JSON at boot. Registered into singleton registries (`GemRegistry`, `CombatRegistry`).
- **Combat Loop** — `CombatManager` handles turn state, HP/charge tracking. `SkillProcessor` executes skill effects. `OpponentAI` drives enemy turns.
- **Responsive** — Scales from mobile (375px) to ultrawide (2560px+) via a design-space scaling system.

## Status

**v0.1 Alpha** — Scenes are currently being rebuilt with a pro-level UI design. Core engine systems (grid logic, combat, effects, AI) are functional.

## License

Private — All rights reserved.
