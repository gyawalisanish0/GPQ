import { ShapeType } from '../engine/GameLogic';
import { SoundManager, SoundType } from '../engine/SoundManager';
import { DamageType } from './Skill';

export enum CharacterClass {
    WARRIOR = 'WARRIOR',
    GUARDIAN = 'GUARDIAN',
    RANGER = 'RANGER',
    HUNTER = 'HUNTER',
    CASTER = 'CASTER'
}

export interface CharacterStats {
    strength: number;
    endurance: number;
    power: number;
    resistance: number;
    speed: number;
    accuracy: number;
}

export const ClassGemMap: Record<CharacterClass, ShapeType> = {
    [CharacterClass.WARRIOR]: ShapeType.STAR,
    [CharacterClass.GUARDIAN]: ShapeType.HEXAGON,
    [CharacterClass.RANGER]: ShapeType.TRIANGLE,
    [CharacterClass.HUNTER]: ShapeType.SQUARE,
    [CharacterClass.CASTER]: ShapeType.PENTAGON
};

export interface CharacterLoadout {
    passive: string | null;
    active: string | null;
    stacks: string[];
}

export interface CharacterData {
    id: string;
    name: string;
    classType: CharacterClass;
    maxHp: number;
    initialHp: number;
    maxCharge: number;
    initialCharge: number;
    stats: CharacterStats;
    portrait: string;
    unlockedSkills: string[];
    loadout: CharacterLoadout;
    damageType?: DamageType;
}

export class Character {
    public id: string;
    public name: string;
    public classType: CharacterClass;
    public maxHp: number;
    public currentHp: number;
    public maxCharge: number;
    public currentCharge: number;
    public stats: CharacterStats;
    public portrait: string;
    public unlockedSkills: string[];
    public loadout: CharacterLoadout;
    public linkedGem: ShapeType;
    public damageType: DamageType;

    constructor(data: CharacterData) {
        try {
            this.id = data.id;
            this.name = data.name;
            this.classType = data.classType;
            this.maxHp = data.maxHp;
            this.currentHp = data.initialHp !== undefined ? data.initialHp : data.maxHp;
            this.maxCharge = data.maxCharge;
            this.currentCharge = data.initialCharge !== undefined ? data.initialCharge : 0;
            this.stats = data.stats || { strength: 10, endurance: 10, power: 10, resistance: 10, speed: 10, accuracy: 100 };
            this.portrait = data.portrait || '';
            this.unlockedSkills = data.unlockedSkills || [];
            this.loadout = data.loadout || { passive: null, active: null, stacks: [] };
            this.linkedGem = ClassGemMap[this.classType];
            this.damageType = data.damageType || DamageType.PHYSICAL; // Default to PHYSICAL
            
            if (!this.linkedGem) {
                throw new Error(`Invalid CharacterClass: ${this.classType}`);
            }
        } catch (error) {
            console.error(`[Character] Failed to initialize Character ${data?.name}:`, error);
            throw error;
        }
    }

    public getPrimaryStat(): number {
        if (this.damageType === DamageType.PHYSICAL) return this.stats.strength;
        if (this.damageType === DamageType.ENERGY) return this.stats.power;
        if (this.damageType === DamageType.HYBRID) return Math.max(this.stats.strength, this.stats.power);
        return this.stats.strength;
    }

    public takeDamage(amount: number): void {
        try {
            if (amount < 0) throw new Error("Damage cannot be negative.");
            if (amount > 0) SoundManager.getInstance().play(SoundType.DAMAGE);
            this.currentHp = Math.max(0, this.currentHp - amount);
            console.log(`[Character] ${this.name} took ${amount} damage. HP: ${this.currentHp}/${this.maxHp}`);
        } catch (error) {
            console.error(`[Character] Error applying damage to ${this.name}:`, error);
        }
    }

    public heal(amount: number): void {
        try {
            if (amount < 0) throw new Error("Heal amount cannot be negative.");
            if (amount > 0) SoundManager.getInstance().play(SoundType.HEAL);
            this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
            console.log(`[Character] ${this.name} healed for ${amount}. HP: ${this.currentHp}/${this.maxHp}`);
        } catch (error) {
            console.error(`[Character] Error applying heal to ${this.name}:`, error);
        }
    }

    public addCharge(amount: number): void {
        try {
            if (amount < 0) throw new Error("Charge amount cannot be negative.");
            this.currentCharge = Math.min(this.maxCharge, this.currentCharge + amount);
            console.log(`[Character] ${this.name} gained ${amount} charge. Charge: ${this.currentCharge}/${this.maxCharge}`);
        } catch (error) {
            console.error(`[Character] Error adding charge to ${this.name}:`, error);
        }
    }

    public consumeCharge(amount: number): boolean {
        try {
            if (amount < 0) throw new Error("Consume amount cannot be negative.");
            if (this.currentCharge >= amount) {
                this.currentCharge -= amount;
                console.log(`[Character] ${this.name} consumed ${amount} charge. Charge: ${this.currentCharge}/${this.maxCharge}`);
                return true;
            }
            console.error(`[Character] Skill failed. ${this.name} has insufficient charge (${this.currentCharge}/${amount}).`);
            return false;
        } catch (error) {
            console.error(`[Character] Error consuming charge for ${this.name}:`, error);
            return false;
        }
    }
}
