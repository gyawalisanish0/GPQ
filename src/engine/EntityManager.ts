import { BaseEntity } from '../entities/BaseEntity';

export class EntityManager {
  private entities: Map<string, BaseEntity> = new Map();

  public add(entity: BaseEntity) {
    try {
      this.entities.set(entity.id, entity);
    } catch (error) {
      console.error('EntityManager add failed:', error);
    }
  }

  public remove(id: string) {
    try {
      const entity = this.entities.get(id);
      if (entity) {
        entity.destroy();
        this.entities.delete(id);
      }
    } catch (error) {
      console.error(`EntityManager remove failed for ${id}:`, error);
    }
  }

  public update(time: number, delta: number) {
    try {
      this.entities.forEach(entity => entity.update(time, delta));
    } catch (error) {
      console.error('EntityManager update loop error:', error);
    }
  }

  public clear() {
    this.entities.forEach(entity => entity.destroy());
    this.entities.clear();
  }
}
