export enum SkillType {
    ACTIVE = 'ACTIVE',
    PASSIVE = 'PASSIVE',
    STACK = 'STACK'
}

export enum DamageType {
    PHYSICAL = 'PHYSICAL',
    ENERGY = 'ENERGY',
    HYBRID = 'HYBRID',
    TRUE = 'TRUE',
    NONE = 'NONE'
}

export interface SkillData {
    id: string;
    name: string;
    type: SkillType;
    chargeCost: number;
    description: string;
    actions: any[];
    icon: string;
    baseDamage?: number;
    damageType?: DamageType;
    accuracy?: number;
    includeMoveDamage?: boolean;
}

export class Skill {
    public id: string;
    public name: string;
    public type: SkillType;
    public chargeCost: number;
    public description: string;
    public actions: any[];
    public icon: string;
    public baseDamage: number;
    public damageType: DamageType;
    public accuracy: number;
    public includeMoveDamage: boolean;

    constructor(data: SkillData) {
        try {
            this.id = data.id;
            this.name = data.name;
            this.type = data.type;
            this.chargeCost = data.chargeCost;
            this.description = data.description;
            this.actions = data.actions;
            this.icon = data.icon;
            this.baseDamage = data.baseDamage || 0;
            this.damageType = data.damageType || DamageType.NONE;
            this.accuracy = data.accuracy !== undefined ? data.accuracy : 100;
            this.includeMoveDamage = data.includeMoveDamage !== undefined ? data.includeMoveDamage : (this.type === SkillType.STACK);

            if (this.chargeCost < 0) {
                throw new Error(`Charge cost cannot be negative for skill: ${this.name}`);
            }
        } catch (error) {
            console.error(`[Skill] Failed to initialize Skill ${data?.name}:`, error);
            throw error;
        }
    }
}
