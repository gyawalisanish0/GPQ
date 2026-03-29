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

  /**
   * Returns the hex color number for a given shape string (ShapeType value).
   * Special gems store their creation shape in LogicCell.shape; pass that value here
   * to get the correct tint color for rendering.
   * 'none' (used by PARASITE, ShapeType.NONE) returns the fixed parasite purple 0x8b5cf6.
   */
  public getColorForShape(shape: string): number {
    if (!shape || shape === 'none') return 0x8b5cf6;
    const gem = this.getNormalGems().find(
      g => g.shape?.toLowerCase() === shape.toLowerCase()
    );
    if (!gem?.color) return 0xffffff;
    return parseInt(gem.color.replace('0x', ''), 16);
  }
}
