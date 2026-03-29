import { CharacterData, Character, CharacterLoadout } from '../entities/Character';
import { SkillData, Skill } from '../entities/Skill';

export class CombatRegistry {
    private static instance: CombatRegistry;
    private characters: Map<string, CharacterData> = new Map();
    private skills: Map<string, SkillData> = new Map();

    private constructor() {}

    public static getInstance(): CombatRegistry {
        if (!CombatRegistry.instance) {
            CombatRegistry.instance = new CombatRegistry();
        }
        return CombatRegistry.instance;
    }

    public registerCharacter(data: CharacterData): void {
        this.characters.set(data.id, data);
    }

    public getCharacter(id: string): Character | null {
        const data = this.characters.get(id);
        if (data) {
            return new Character(data);
        }
        return null;
    }

    public getCharacterData(id: string): CharacterData | null {
        return this.characters.get(id) || null;
    }

    public getAllCharactersData(): CharacterData[] {
        return Array.from(this.characters.values());
    }

    public registerSkill(data: SkillData): void {
        this.skills.set(data.id, data);
    }

    public getSkill(id: string): Skill | null {
        const data = this.skills.get(id);
        if (data) {
            return new Skill(data);
        }
        return null;
    }

    public getSkillData(id: string): SkillData | null {
        return this.skills.get(id) || null;
    }

    public getAllSkillsData(): SkillData[] {
        return Array.from(this.skills.values());
    }

    public updateCharacterLoadout(charId: string, loadout: CharacterLoadout): void {
        const data = this.characters.get(charId);
        if (data) data.loadout = loadout;
    }
}
