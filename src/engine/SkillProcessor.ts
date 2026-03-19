import { CombatManager } from './CombatManager';
import { Skill, SkillType } from '../entities/Skill';
import { Game } from 'phaser';

export class SkillProcessor {
    private combatManager: CombatManager;
    private game: Game | null = null;

    constructor(combatManager: CombatManager) {
        this.combatManager = combatManager;
    }

    public setGame(game: Game) {
        this.game = game;
    }

    public executeSkill(skill: Skill, moveScore: number = 0, comboNumber: number = 1, powerSurge: number = 0): boolean {
        const activeChar = this.combatManager.getActiveCharacter();
        if (!activeChar) return false;

        // Prevent stacking the same skill
        if (skill.type === SkillType.STACK) {
            const alreadyQueued = this.combatManager.stackQueue.some(s => s.skillId === skill.id && s.owner === this.combatManager.currentTurn);
            if (alreadyQueued) {
                console.log(`[SkillProcessor] Skill ${skill.name} is already queued for ${this.combatManager.currentTurn}.`);
                return false;
            }
        }

        // Validate and consume charge
        if (!activeChar.consumeCharge(skill.chargeCost)) {
            console.error(`[SkillProcessor] Skill ${skill.name} failed for ${activeChar.name}. Current Turn: ${this.combatManager.currentTurn}, Charge: ${activeChar.currentCharge}/${skill.chargeCost}`);
            return false;
        }

        console.log(`[SkillProcessor] Executing skill: ${skill.name} (${skill.type})`);

        switch (skill.type) {
            case SkillType.ACTIVE:
                this.processActions(skill, moveScore, comboNumber, powerSurge);
                break;
            case SkillType.STACK:
                this.processStackActions(skill);
                break;
            case SkillType.PASSIVE:
                this.processPassiveActions(skill.actions);
                break;
        }

        if (this.game) {
            if (skill.type !== SkillType.STACK) {
                this.game.events.emit('SKILL_EXECUTED', { skill, character: this.combatManager.currentTurn });
            }
            this.game.events.emit('CHARGE_UPDATED', { 
                character: this.combatManager.currentTurn, 
                charge: activeChar.currentCharge,
                maxCharge: activeChar.maxCharge
            });
        }

        return true;
    }

    private processActions(skill: Skill, moveScore: number, comboNumber: number, powerSurge: number): void {
        const activeChar = this.combatManager.getActiveCharacter();
        const targetChar = this.combatManager.getInactiveCharacter();

        if (!activeChar || !targetChar) return;

        // Accuracy check
        const baseHitChance = skill.accuracy;
        const attackerAccuracy = activeChar.stats.accuracy;
        const targetSpeed = targetChar.stats.speed;
        
        // Formula: baseHitChance + (attackerAccuracy * 2) - (targetSpeed * 1.5)
        const hitChance = Math.max(15, Math.min(100, baseHitChance + (attackerAccuracy * 2) - (targetSpeed * 1.5)));
        const roll = Math.random() * 100;
        
        if (roll > hitChance) {
            console.log(`[SkillProcessor] ${activeChar.name}'s skill ${skill.name} missed! (Chance: ${hitChance.toFixed(1)}%, Roll: ${roll.toFixed(1)})`);
            if (this.game) {
                this.game.events.emit('SKILL_MISSED', { character: this.combatManager.currentTurn, skill });
            }
            return;
        }

        for (const action of skill.actions) {
            switch (action.action) {
                case 'DAMAGE_TARGET':
                    // Active skill formula: Total damage = skill's base damage + 40% of Primary Stat + 20% of power surge points
                    let damage = skill.baseDamage;
                    let damageType = skill.damageType;
                    
                    if (action.useStats) {
                        const primaryStat = activeChar.getPrimaryStat();
                        damage += 0.4 * primaryStat;
                    }
                    
                    // Add power surge bonus
                    damage += 0.2 * powerSurge;
                    
                    // Critical hit chance based on accuracy
                    const critChance = attackerAccuracy * 0.5;
                    const isCrit = Math.random() * 100 < critChance;
                    if (isCrit) {
                        damage *= 1.5;
                        console.log(`[SkillProcessor] CRITICAL HIT!`);
                    }

                    // Apply resistance/endurance
                    if (damageType === 'PHYSICAL') {
                        // Mitigation: damage * (100 / (100 + endurance))
                        const mitigation = 100 / (100 + targetChar.stats.endurance);
                        damage = Math.max(1, Math.round(damage * mitigation));
                    } else if (damageType === 'ENERGY') {
                        // Mitigation: damage * (100 / (100 + resistance))
                        const mitigation = 100 / (100 + targetChar.stats.resistance);
                        damage = Math.max(1, Math.round(damage * mitigation));
                    }

                    targetChar.takeDamage(damage);
                    console.log(`[SkillProcessor] ${activeChar.name} dealt ${damage} ${damageType} damage to ${targetChar.name} (Crit: ${isCrit})`);

                    if (this.game) {
                        this.game.events.emit('HP_UPDATED', { 
                            character: this.combatManager.currentTurn === 'USER' ? 'OPPONENT' : 'USER',
                            hp: targetChar.currentHp,
                            maxHp: targetChar.maxHp,
                            isCrit: isCrit
                        });
                    }
                    this.combatManager.checkGameOver();
                    break;
                case 'HEAL_SELF':
                    activeChar.heal(action.amount);
                    if (this.game) {
                        this.game.events.emit('HP_UPDATED', { 
                            character: this.combatManager.currentTurn,
                            hp: activeChar.currentHp,
                            maxHp: activeChar.maxHp
                        });
                    }
                    break;
                // Add more active actions here
            }
        }
    }

    private processStackActions(skill: Skill): void {
        for (const action of skill.actions) {
            if (action.action === 'ADD_STACK') {
                this.combatManager.stackQueue.push({
                    trigger: action.trigger,
                    effect: action.effect,
                    charges: action.charges,
                    owner: this.combatManager.currentTurn,
                    icon: skill.icon,
                    skillId: skill.id,
                    chargeCost: skill.chargeCost
                });
                
                if (this.game) {
                    this.game.events.emit('SKILL_QUEUED', {
                        character: this.combatManager.currentTurn,
                        icon: skill.icon,
                        skillId: skill.id
                    });
                }
                console.log(`[SkillProcessor] Added stack: ${action.effect} (${action.charges} charges)`);
            }
        }
    }

    private processPassiveActions(actions: any[]): void {
        const activeChar = this.combatManager.getActiveCharacter();
        if (!activeChar) return;

        for (const action of actions) {
            if (action.action === 'REGISTER_HOOK') {
                // Register hook logic here. For now, we will just log it.
                // A real implementation would tie into the EventBus.
                console.log(`[SkillProcessor] Registered passive hook: ${action.hook}`);
            } else if (action.action === 'ON_COMBAT_START') {
                if (action.effect === 'add_charge') {
                    activeChar.addCharge(action.amount);
                    console.log(`[SkillProcessor] Passive added ${action.amount} charge to ${activeChar.name}`);
                }
            }
        }
    }
}
