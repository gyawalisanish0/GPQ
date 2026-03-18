import Phaser from 'phaser';

export abstract class BaseEntity extends Phaser.GameObjects.Container {
  public id: string;

  constructor(scene: Phaser.Scene, x: number, y: number, id: string) {
    super(scene, x, y);
    this.id = id;
    scene.add.existing(this);
  }

  public abstract update(time: number, delta: number): void;

  public destroy(fromScene?: boolean) {
    try {
      super.destroy(fromScene);
    } catch (error) {
      console.error(`Failed to destroy entity ${this.id}:`, error);
    }
  }
}
