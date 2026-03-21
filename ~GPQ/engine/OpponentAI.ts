import { Game } from 'phaser';
import { CombatManager } from './CombatManager';
import { CombatRegistry } from './CombatRegistry';
import { GameLogic, ShapeType, SpecialType } from './GameLogic';

export class OpponentAI {
    private game: Game;
    private logic: GameLogic;
    private swapCallback: (r1: number, c1: number, r2: number, c2: number) => Promise<void>;
    private getPowerSurge: () => number;
    private isProcessing: boolean = false;

    constructor(game: Game, logic: GameLogic, swapCallback: (r1: number, c1: number, r2: number, c2: number) => Promise<void>, getPowerSurge: () => number) {
        this.game = game;
        this.logic = logic;
        this.swapCallback = swapCallback;
        this.getPowerSurge = getPowerSurge;

        this.game.events.on('TURN_SWITCHED', this.handleTurnSwitched, this);
    }

    public destroy() {
        this.game.events.off('TURN_SWITCHED', this.handleTurnSwitched, this);
    }

    private async handleTurnSwitched(turn: string) {
        if (turn === 'OPPONENT' && !this.isProcessing) {
            this.isProcessing = true;
            await this.takeTurn();
            this.isProcessing = false;
        }
    }

    private async takeTurn() {
        // Wait a bit for juice/feel
        await new Promise(resolve => setTimeout(resolve, 1000));

        const combat = CombatManager.getInstance();
        const registry = CombatRegistry.getInstance();
        const opponent = combat.opponent;
        if (!opponent) return;

        // 1. Try to cast skills
        // We will prioritize Stacks, then Active (in case Active destroys gems and triggers Stacks)
        for (const stackSkillId of opponent.loadout.stacks) {
            const skill = registry.getSkillData(stackSkillId);
            if (skill) {
                console.log(`[OpponentAI] Checking Stack Skill: ${skill.name}. Cost: ${skill.chargeCost}, Current: ${opponent.currentCharge}`);
                if (opponent.currentCharge >= skill.chargeCost) {
                    const alreadyQueued = combat.stackQueue.some(s => s.skillId === stackSkillId && s.owner === 'OPPONENT');
                    if (!alreadyQueued) {
                        console.log(`[OpponentAI] Casting Stack Skill: ${skill.name}`);
                        this.game.events.emit('SKILL_ACTIVATED', { character: 'OPPONENT', skillId: stackSkillId, powerSurge: this.getPowerSurge() });
                        console.log(`[OpponentAI] After Stack Skill cast, Charge: ${opponent.currentCharge}`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } else {
                        console.log(`[OpponentAI] Stack Skill: ${skill.name} is already queued.`);
                    }
                }
            }
        }

        const activeSkillId = opponent.loadout.active;
        if (activeSkillId) {
            const skill = registry.getSkillData(activeSkillId);
            if (skill) {
                console.log(`[OpponentAI] Checking Active Skill: ${skill.name}. Cost: ${skill.chargeCost}, Current: ${opponent.currentCharge}`);
                if (opponent.currentCharge >= skill.chargeCost) {
                    console.log(`[OpponentAI] Casting Active Skill: ${skill.name}`);
                    this.game.events.emit('SKILL_ACTIVATED', { character: 'OPPONENT', skillId: activeSkillId, powerSurge: this.getPowerSurge() });
                    console.log(`[OpponentAI] After Active Skill cast, Charge: ${opponent.currentCharge}`);
                    await new Promise(resolve => setTimeout(resolve, 800)); // Wait for skill animation
                }
            }
        }

        // 2. Find best move
        const bestMove = this.findBestMove(opponent.linkedGem);
        
        if (bestMove) {
            console.log(`[OpponentAI] Found move: (${bestMove.r1},${bestMove.c1}) to (${bestMove.r2},${bestMove.c2})`);
            await this.swapCallback(bestMove.r1, bestMove.c1, bestMove.r2, bestMove.c2);
        } else {
            console.log(`[OpponentAI] No valid moves found! Passing turn.`);
            combat.switchTurn();
        }
    }

    private findBestMove(preferredGem: ShapeType): { r1: number, c1: number, r2: number, c2: number, score: number } | null {
        let bestMove = null;
        let maxScore = -1;

        const size = this.logic.grid.length;

        // Helper to evaluate a swap
        const evaluateSwap = (r1: number, c1: number, r2: number, c2: number) => {
            const cell1 = this.logic.grid[r1][c1];
            const cell2 = this.logic.grid[r2][c2];
            
            if (!cell1 || !cell2) return;

            // Special + Special combo is the best move
            if (cell1.special !== SpecialType.NONE && cell2.special !== SpecialType.NONE) {
                let score = 500; // Huge bonus for special combo
                if (score > maxScore) {
                    maxScore = score;
                    bestMove = { r1, c1, r2, c2, score };
                }
                return;
            }

            // Parasite swap
            if (cell1.special === SpecialType.PARASITE || cell2.special === SpecialType.PARASITE) {
                const other = cell1.special === SpecialType.PARASITE ? cell2 : cell1;
                let score = 300; // High bonus for parasite
                if (other.shape === preferredGem) {
                    score += 100; // Bonus for targeting preferred gem
                }
                if (score > maxScore) {
                    maxScore = score;
                    bestMove = { r1, c1, r2, c2, score };
                }
                return;
            }

            // Swap
            this.logic.swap(r1, c1, r2, c2);
            
            // Check matches
            const matches = this.logic.findMatches();
            
            // Revert swap
            this.logic.swap(r1, c1, r2, c2);

            if (matches.length > 0) {
                let score = 0;
                for (const match of matches) {
                    score += match.cells.length * 10; // Base score for match size
                    
                    // Bonus for matching preferred gem
                    const matchShape = this.logic.grid[match.cells[0].r][match.cells[0].c]?.shape;
                    if (matchShape === preferredGem) {
                        score += 50;
                    }
                    
                    // Bonus for creating special gems
                    if (match.specialCreation) {
                        if (match.specialCreation.type === SpecialType.PARASITE) {
                            score += 150;
                        } else if (match.specialCreation.type === SpecialType.BOMB) {
                            score += 100;
                        } else if (match.specialCreation.type === SpecialType.PULSAR) {
                            score += 80;
                        } else if (match.specialCreation.type === SpecialType.MISSILE) {
                            score += 50;
                        }
                    } else if (match.cells.length >= 4) {
                        // Fallback bonus for larger matches if no special creation (shouldn't happen with current logic, but safe)
                        score += 30;
                    }
                }

                // Bonus if the swap involves a special gem matching its color
                if (cell1.special !== SpecialType.NONE || cell2.special !== SpecialType.NONE) {
                    score += 100;
                }

                if (score > maxScore) {
                    maxScore = score;
                    bestMove = { r1, c1, r2, c2, score };
                }
            }
        };

        // Check horizontal swaps
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size - 1; c++) {
                evaluateSwap(r, c, r, c + 1);
            }
        }

        // Check vertical swaps
        for (let r = 0; r < size - 1; r++) {
            for (let c = 0; c < size; c++) {
                evaluateSwap(r, c, r + 1, c);
            }
        }

        return bestMove;
    }
}
