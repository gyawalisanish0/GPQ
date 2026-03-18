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
            // Temporarily set turn to the character so the skill processor knows who is casting
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

            // Only allow skills on your turn for now
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

            // Calculate base match damage
            // Total Damage = 40% of Primary Stat + 25% of current move points × cascade count multiplier
            const primaryStat = activeChar.getPrimaryStat();
            const cascadeMultiplier = Math.pow(1.15, data.comboNumber - 1);
            let matchDamage = (0.4 * primaryStat) + (0.25 * data.moveScore * cascadeMultiplier);
            let damageType = activeChar.damageType;

            // Process stack queue for the active character
            const stackResult = this.processStackQueue(data.shape, data.count, matchDamage, damageType, data.moveScore, data.comboNumber, data.powerSurge);
            matchDamage = stackResult.damage;
            damageType = stackResult.damageType;

            // Apply resistance/endurance mitigation
            if (damageType === 'PHYSICAL') {
                const mitigation = 100 / (100 + targetChar.stats.endurance);
                matchDamage = Math.max(1, Math.round(matchDamage * mitigation));
            } else if (damageType === 'ENERGY') {
                const mitigation = 100 / (100 + targetChar.stats.resistance);
                matchDamage = Math.max(1, Math.round(matchDamage * mitigation));
            }

            // Apply damage
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

            // Charge gain: Only the active character gains energy if the destroyed gem matches their link
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

        // Iterate backwards to allow safe removal
        for (let i = this.stackQueue.length - 1; i >= 0; i--) {
            const stack = this.stackQueue[i];
            
            // Only process stacks for the character whose turn it is
            if (stack.owner !== this.currentTurn) continue;

            // Example trigger: "match_star" or "match_any"
            const triggerShape = stack.trigger.split('_')[1]; // 'star' or 'any'
            if (triggerShape.toLowerCase() === 'any' || shape.toLowerCase() === triggerShape.toLowerCase()) {
                console.log(`[CombatManager] Stack triggered: ${stack.effect} by ${stack.owner}`);
                
                const skill = CombatRegistry.getInstance().getSkill(stack.skillId);
                const activeChar = this.getActiveCharacter();

                if (skill && activeChar) {
                    // Apply effect based on skill data
                    if (stack.effect === 'bonus_damage') {
                        // Total damage = skill's base damage + 40% of Primary Stat + 25% of current move points + 10% of power surge points × cascade count multiplier
                        const primaryStat = activeChar.getPrimaryStat();
                        const cascadeMultiplier = Math.pow(1.15, comboNumber - 1);
                        
                        let bonus = skill.baseDamage;
                        bonus += 0.4 * primaryStat;
                        bonus += 0.25 * moveScore;
                        bonus += (0.1 * powerSurge) * cascadeMultiplier;
                        
                        finalDamage += bonus;
                        finalDamageType = skill.damageType;
                    } else if (stack.effect === 'double_damage') {
                        finalDamage *= 2;
                    } else if (stack.effect === 'triple_damage') {
                        finalDamage *= 3;
                    } else if (stack.effect === 'heal_on_match') {
                        const healAmount = Math.round(activeChar.maxHp * 0.05); // Heal 5%
                        activeChar.heal(healAmount);
                        if (this.game) {
                            this.game.events.emit('HP_UPDATED', {
                                character: this.currentTurn,
                                hp: activeChar.currentHp,
                                maxHp: activeChar.maxHp
                            });
                        }
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
            this.currentTurn = this.currentTurn === 'USER' ? 'OPPONENT' : 'USER';
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
