import Phaser from 'phaser';
import { BaseEntity } from './BaseEntity';
import { InputManager, InputType } from '../engine/InputManager';
import balance from '../../data/balance.json';

export class Player extends BaseEntity {
  private sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private inputManager: InputManager;

  constructor(scene: Phaser.Scene, x: number, y: number, inputManager: InputManager) {
    super(scene, x, y, 'player-entity');
    this.inputManager = inputManager;

    try {
      this.sprite = this.scene.physics.add.sprite(0, 0, 'player');
      this.add(this.sprite);
      
      const body = this.sprite.body as Phaser.Physics.Arcade.Body;
      body.setDrag(balance.player.drag);
      body.setCollideWorldBounds(true);
    } catch (error) {
      console.error('Player initialization failed:', error);
      throw error;
    }
  }

  public update(time: number, delta: number) {
    try {
      const vector = this.inputManager.getVector();
      const body = this.sprite.body as Phaser.Physics.Arcade.Body;
      
      if (vector.length() > 0) {
        body.setAcceleration(
          vector.x * balance.player.acceleration,
          vector.y * balance.player.acceleration
        );
        body.setMaxVelocity(balance.player.speed);
      } else {
        body.setAcceleration(0, 0);
      }
    } catch (error) {
      console.error('Player update loop error:', error);
    }
  }

  public getPosition() {
    return { x: this.x + this.sprite.x, y: this.y + this.sprite.y };
  }
}
