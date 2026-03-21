export interface GemDefinition {
  id: string;
  name: string;
  type: 'normal' | 'special';
  shape?: string;
  color?: string;
  specialType?: string;
  description?: string;
  actions?: any[];
}

export class GemRegistry {
  private static instance: GemRegistry;
  private gems: Map<string, GemDefinition> = new Map();

  private constructor() {}

  public static getInstance(): GemRegistry {
    if (!GemRegistry.instance) {
      GemRegistry.instance = new GemRegistry();
    }
    return GemRegistry.instance;
  }

  public registerGem(gem: GemDefinition) {
    this.gems.set(gem.id, gem);
  }

  public getGem(id: string): GemDefinition | undefined {
    return this.gems.get(id);
  }

  public getAllGems(): GemDefinition[] {
    return Array.from(this.gems.values());
  }

  public getNormalGems(): GemDefinition[] {
    return this.getAllGems().filter(g => g.type === 'normal' && g.id !== 'none');
  }

  public getSpecialGems(): GemDefinition[] {
    return this.getAllGems().filter(g => g.type === 'special');
  }
}
