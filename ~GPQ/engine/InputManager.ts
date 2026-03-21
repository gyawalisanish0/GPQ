import Phaser from 'phaser';

export enum InputType {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  ACTION = 'ACTION',
}

export interface GestureData {
  startPos: Phaser.Math.Vector2;
  currentPos: Phaser.Math.Vector2;
  isDragging: boolean;
}

export class InputManager {
  private scene: Phaser.Scene;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private keys: { [key: string]: Phaser.Input.Keyboard.Key } = {};
  private virtualInputs: { [key in InputType]: boolean } = {
    [InputType.UP]: false,
    [InputType.DOWN]: false,
    [InputType.LEFT]: false,
    [InputType.RIGHT]: false,
    [InputType.ACTION]: false,
  };

  private gesture: GestureData = {
    startPos: new Phaser.Math.Vector2(0, 0),
    currentPos: new Phaser.Math.Vector2(0, 0),
    isDragging: false,
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    if (this.scene.input.keyboard) {
      this.cursors = this.scene.input.keyboard.createCursorKeys();
      this.keys = this.scene.input.keyboard.addKeys({
        W: Phaser.Input.Keyboard.KeyCodes.W,
        A: Phaser.Input.Keyboard.KeyCodes.A,
        S: Phaser.Input.Keyboard.KeyCodes.S,
        D: Phaser.Input.Keyboard.KeyCodes.D,
        SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
      }) as any;
    }

    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.gesture.startPos.set(pointer.x, pointer.y);
      this.gesture.currentPos.set(pointer.x, pointer.y);
      this.gesture.isDragging = true;
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.gesture.isDragging) {
        this.gesture.currentPos.set(pointer.x, pointer.y);
      }
    });

    this.scene.input.on('pointerup', () => {
      this.gesture.isDragging = false;
    });
  }

  public getGesture(): GestureData {
    return this.gesture;
  }

  public setVirtualInput(type: InputType, value: boolean) {
    this.virtualInputs[type] = value;
  }

  public isDown(type: InputType): boolean {
    const virtual = this.virtualInputs[type];
    
    if (!this.cursors) return virtual;

    switch (type) {
      case InputType.UP:
        return this.cursors.up.isDown || this.keys.W.isDown || virtual;
      case InputType.DOWN:
        return this.cursors.down.isDown || this.keys.S.isDown || virtual;
      case InputType.LEFT:
        return this.cursors.left.isDown || this.keys.A.isDown || virtual;
      case InputType.RIGHT:
        return this.cursors.right.isDown || this.keys.D.isDown || virtual;
      case InputType.ACTION:
        return this.cursors.space.isDown || this.keys.SPACE.isDown || virtual;
      default:
        return false;
    }
  }

  public getVector(): Phaser.Math.Vector2 {
    const vector = new Phaser.Math.Vector2(0, 0);
    if (this.isDown(InputType.LEFT)) vector.x -= 1;
    if (this.isDown(InputType.RIGHT)) vector.x += 1;
    if (this.isDown(InputType.UP)) vector.y -= 1;
    if (this.isDown(InputType.DOWN)) vector.y += 1;
    return vector.normalize();
  }
}
