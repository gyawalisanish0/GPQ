import { Game } from 'phaser';
import { Character } from '../entities/Character';
import { ShapeType } from './GameLogic';
import { SkillProcessor } from './SkillProcessor';
import { CombatRegistry } from './CombatRegistry';
import { SoundManager, SoundType } from './SoundManager';
import { DamageType } from '../entities/Skill';

export type TurnType = 'USER' | 'OPPONENT';

export class CombatManager {
    private static instance: CombatManager;
    private game: Game | null = null;
    public skillProcessor: SkillProcessor;
    
    public user: Character | null = null;
    public opponent: Character | null = null;
    public currentTurn: TurnType = 'USER';
    public turnCount: number = 1;
    public isGameOver: boolean = false;
    
    // Skill queues and modifiers
    public stackQueue: any[] = [];

    // FIX: Track freeze state per side to support ice_lance's freeze_opponent effect
    public frozenTurns: { USER: number; OPPONENT: number } = { USER: 0, OPPONENT: 0 };
    
    private constructor() {
        this.skillProcessor = new SkillProcessor(this);
    }

    public static getInstance(): CombatManager {
        if (!CombatManager.instance) {
            CombatManager.instance = new CombatManager();
        }
        return CombatManager.instance;
    }

    public setGame(game: Game) {
        this.game = game;
        this.skillProcessor.setGame(game);
        this.setupListeners();
    }

    public init(user: Character, opponent: Character): void {
        try {
            this.user = user;
            this.opponent = opponent;
            this.currentTurn = 'USER';
            this.turnCount = 1;
            this.isGameOver = false;
            this.stackQueue = [];
            this.frozenTurns = { USER: 0, OPPONENT: 0 };
            console.log(`[CombatManager] Initialized with User: ${user.name} vs Opponent: ${opponent.name}`);
            
            this.initializePassives(user, 'USER');
            this.initializePassives(opponent, 'OPPONENT');

            if (this.game) {
                this.game.events.emit('COMBAT_INIT', { user, opponent });
            }
        } catch (error) {
            console.error('[CombatManager] Failed to initialize state:', error);
        }
    }

    private initializePassives(char: Character, turnType: TurnType): void {
        if (!char.loadout.passive) return;
        
        const skill = CombatRegistry.getInstance().getSkill(char.loadout.passive!);
        if (skill) {
            // FIX: Set currentTurn BEFORE calling executeSkill so that
            // getActiveCharacter() inside executeSkill returns the correct character.
            // Previously the turn was swapped after the call, meaning the character
            // executing the passive was whoever happened to be currentTurn at that moment.
            const prevTurn = this.currentTurn;
            this.currentTurn = turnType;
            this.skillProcessor.executeSkill(skill);
            this.currentTurn = prevTurn;
        }
    }

    private setupListeners(): void {
        if (!this.game) return;
        
        this.game.events.on('GEMS_DESTROYED', this.handleGemsDestroyed, this);
        this.game.events.on('SKILL_ACTIVATED', this.handleSkillActivated, this);
    }

    public handleSkillActivated(data: { character: TurnType, skillId: string, moveScore?: number, comboNumber?: number, powerSurge?: number }): void {
        try {
            const char = data.character === 'USER' ? this.user : this.opponent;
            if (!char) return;

            if (this.currentTurn !== data.character) {
                console.log(`[CombatManager] Cannot use skill out of turn.`);
                return;
            }

            const skill = CombatRegistry.getInstance().getSkill(data.skillId);
            if (skill) {
                this.skillProcessor.executeSkill(skill, data.moveScore || 0, data.comboNumber || 1, data.powerSurge || 0);
            } else {
                console.error(`[CombatManager] Skill ${data.skillId} not found.`);
            }

        } catch (error) {
            console.error('[CombatManager] Error handling SKILL_ACTIVATED:', error);
        }
    }

    private handleGemsDestroyed(data: { shape: ShapeType, count: number, moveScore: number, comboNumber: number, powerSurge: number }): void {
        try {
            const activeChar = this.getActiveCharacter();
            const targetChar = this.getInactiveCharacter();

            if (!activeChar || !targetChar) return;

            const primaryStat = activeChar.getPrimaryStat();
            const cascadeMultiplier = Math.pow(1.15, data.comboNumber - 1);
            let matchDamage = (0.4 * primaryStat) + (0.25 * data.moveScore * cascadeMultiplier);
            let damageType = activeChar.damageType;

            const stackResult = this.processStackQueue(data.shape, data.count, matchDamage, damageType, data.moveScore, data.comboNumber, data.powerSurge);
            matchDamage = stackResult.damage;
            damageType = stackResult.damageType;

            if (damageType === 'PHYSICAL') {
                const mitigation = 100 / (100 + targetChar.stats.endurance);
                matchDamage = Math.max(1, Math.round(matchDamage * mitigation));
            } else if (damageType === 'ENERGY') {
                const mitigation = 100 / (100 + targetChar.stats.resistance);
                matchDamage = Math.max(1, Math.round(matchDamage * mitigation));
            }

            if (matchDamage > 0) {
                targetChar.takeDamage(matchDamage);
                console.log(`[CombatManager] Match dealt ${matchDamage} damage to ${targetChar.name}`);
                if (this.game) {
                    this.game.events.emit('HP_UPDATED', { 
                        character: this.currentTurn === 'USER' ? 'OPPONENT' : 'USER',
                        hp: targetChar.currentHp,
                        maxHp: targetChar.maxHp
                    });
                }
                this.checkGameOver();
            }

            if (data.shape === activeChar.linkedGem) {
                activeChar.addCharge(data.count);
                SoundManager.getInstance().play(SoundType.CHARGE);
                
                if (this.game) {
                    this.game.events.emit('CHARGE_UPDATED', { 
                        character: this.currentTurn, 
                        charge: activeChar.currentCharge,
                        maxCharge: activeChar.maxCharge
                    });
                }
            }
        } catch (error) {
            console.error('[CombatManager] Error handling GEMS_DESTROYED:', error);
        }
    }

    private processStackQueue(shape: ShapeType, count: number, currentDamage: number, damageType: DamageType, moveScore: number, comboNumber: number, powerSurge: number): { damage: number, damageType: DamageType } {
        let finalDamage = currentDamage;
        let finalDamageType = damageType;

        for (let i = this.stackQueue.length - 1; i >= 0; i--) {
            const stack = this.stackQueue[i];
            
            if (stack.owner !== this.currentTurn) continue;

            const triggerShape = stack.trigger.split('_')[1];
            if (triggerShape.toLowerCase() === 'any' || shape.toLowerCase() === triggerShape.toLowerCase()) {
                console.log(`[CombatManager] Stack triggered: ${stack.effect} by ${stack.owner}`);
                
                const skill = CombatRegistry.getInstance().getSkill(stack.skillId);
                const activeChar = this.getActiveCharacter();

                if (skill && activeChar) {
                    switch (stack.effect) {
                        case 'bonus_damage': {
                            const primaryStat = activeChar.getPrimaryStat();
                            const cascadeMultiplier = Math.pow(1.15, comboNumber - 1);
                            let bonus = skill.baseDamage;
                            bonus += 0.4 * primaryStat;
                            bonus += 0.25 * moveScore;
                            bonus += (0.1 * powerSurge) * cascadeMultiplier;
                            finalDamage += bonus;
                            finalDamageType = skill.damageType;
                            break;
                        }
                        case 'double_damage':
                            finalDamage *= 2;
                            break;
                        case 'triple_damage':
                            finalDamage *= 3;
                            break;
                        case 'heal_on_match': {
                            const healAmount = Math.round(activeChar.maxHp * 0.05);
                            activeChar.heal(healAmount);
                            if (this.game) {
                                this.game.events.emit('HP_UPDATED', {
                                    character: this.currentTurn,
                                    hp: activeChar.currentHp,
                                    maxHp: activeChar.maxHp
                                });
                            }
                            break;
                        }
                        // FIX: freeze_opponent was silently ignored, causing ice_lance to do nothing.
                        // Now it sets frozenTurns on the inactive side so switchTurn can skip their turn.
                        case 'freeze_opponent': {
                            const opponentSide: TurnType = this.currentTurn === 'USER' ? 'OPPONENT' : 'USER';
                            this.frozenTurns[opponentSide] = (this.frozenTurns[opponentSide] || 0) + 1;
                            console.log(`[CombatManager] ${opponentSide} is frozen for ${this.frozenTurns[opponentSide]} turn(s).`);
                            if (this.game) {
                                this.game.events.emit('STATUS_APPLIED', { character: opponentSide, status: 'freeze' });
                            }
                            break;
                        }
                        // FIX: shield was silently ignored, causing holy_shield to do nothing.
                        // Placeholder implementation: grant a small HP buffer via a temporary heal.
                        // A full implementation would track a shield value separately.
                        case 'shield': {
                            const shieldAmount = Math.round(activeChar.maxHp * 0.03);
                            activeChar.heal(shieldAmount);
                            console.log(`[CombatManager] ${activeChar.name} gained a ${shieldAmount} HP shield.`);
                            if (this.game) {
                                this.game.events.emit('HP_UPDATED', {
                                    character: this.currentTurn,
                                    hp: activeChar.currentHp,
                                    maxHp: activeChar.maxHp
                                });
                                this.game.events.emit('STATUS_APPLIED', { character: this.currentTurn, status: 'shield' });
                            }
                            break;
                        }
                        // FIX: poison was silently ignored. Basic implementation: deal a small DoT
                        // at the end of each subsequent turn. For now, apply immediate flat damage
                        // to the opponent to at least make the skill functional.
                        case 'poison': {
                            const targetChar = this.getInactiveCharacter();
                            if (targetChar) {
                                const poisonDamage = Math.round(targetChar.maxHp * 0.04);
                                targetChar.takeDamage(poisonDamage);
                                console.log(`[CombatManager] ${targetChar.name} took ${poisonDamage} poison damage.`);
                                const opponentSide: TurnType = this.currentTurn === 'USER' ? 'OPPONENT' : 'USER';
                                if (this.game) {
                                    this.game.events.emit('HP_UPDATED', {
                                        character: opponentSide,
                                        hp: targetChar.currentHp,
                                        maxHp: targetChar.maxHp
                                    });
                                    this.game.events.emit('STATUS_APPLIED', { character: opponentSide, status: 'poison' });
                                }
                                this.checkGameOver();
                            }
                            break;
                        }
                        default:
                            console.warn(`[CombatManager] Unhandled stack effect: "${stack.effect}"`);
                            break;
                    }
                }
                
                if (this.game && skill) {
                    this.game.events.emit('SKILL_EXECUTED', { skill, character: stack.owner });
                }

                stack.charges -= 1;
                if (stack.charges <= 0) {
                    this.stackQueue.splice(i, 1);
                    if (this.game) {
                        this.game.events.emit('SKILL_DEACTIVATED', {
                            character: stack.owner,
                            icon: stack.icon,
                            skillId: stack.skillId
                        });
                    }
                    console.log(`[CombatManager] Stack ${stack.effect} depleted.`);
                }
            }
        }
        return { damage: finalDamage, damageType: finalDamageType };
    }

    public switchTurn(): void {
        try {
            const nextTurn: TurnType = this.currentTurn === 'USER' ? 'OPPONENT' : 'USER';

            // FIX: Check if the next side is frozen. If so, consume a freeze turn and
            // switch again (skip that player's turn) instead of handing control to them.
            if (this.frozenTurns[nextTurn] > 0) {
                this.frozenTurns[nextTurn]--;
                this.turnCount++;
                console.log(`[CombatManager] ${nextTurn} is frozen, skipping their turn. Remaining: ${this.frozenTurns[nextTurn]}`);
                SoundManager.getInstance().play(SoundType.TURN_CHANGE);
                if (this.game) {
                    this.game.events.emit('TURN_SWITCHED', this.currentTurn);
                }
                return;
            }

            this.currentTurn = nextTurn;
            this.turnCount++;
            console.log(`[CombatManager] Turn switched to: ${this.currentTurn}, Turn Count: ${this.turnCount}`);
            
            SoundManager.getInstance().play(SoundType.TURN_CHANGE);

            if (this.game) {
                this.game.events.emit('TURN_SWITCHED', this.currentTurn);
            }
        } catch (error) {
            console.error('[CombatManager] Error switching turns:', error);
        }
    }

    public removeQueuedSkill(skillId: string, character: TurnType): void {
        const char = character === 'USER' ? this.user : this.opponent;
        if (!char) return;

        const index = this.stackQueue.findIndex(s => s.skillId === skillId && s.owner === character);
        if (index !== -1) {
            const stack = this.stackQueue[index];
            char.addCharge(stack.chargeCost);
            this.stackQueue.splice(index, 1);
            
            if (this.game) {
                this.game.events.emit('SKILL_DEACTIVATED', {
                    character: character,
                    icon: stack.icon,
                    skillId: stack.skillId
                });
                this.game.events.emit('CHARGE_UPDATED', { 
                    character: character, 
                    charge: char.currentCharge,
                    maxCharge: char.maxCharge
                });
            }
            console.log(`[CombatManager] Skill ${skillId} removed and charge refunded.`);
        }
    }

    public getActiveCharacter(): Character | null {
        return this.currentTurn === 'USER' ? this.user : this.opponent;
    }

    public getInactiveCharacter(): Character | null {
        return this.currentTurn === 'USER' ? this.opponent : this.user;
    }

    public checkGameOver(): void {
        if (this.isGameOver || !this.user || !this.opponent) return;

        if (this.user.currentHp <= 0 || this.opponent.currentHp <= 0) {
            this.isGameOver = true;
            const winner = this.user.currentHp > 0 ? 'USER' : 'OPPONENT';
            console.log(`[CombatManager] Game Over! Winner: ${winner}`);
            if (this.game) {
                this.game.events.emit('GAME_OVER', { winner });
            }
        }
    }
}
