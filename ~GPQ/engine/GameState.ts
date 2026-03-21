import { Game } from 'phaser';

export interface GameStateData {
  score: number;
  health: number;
  isGameOver: boolean;
  level: number;
}

export class GameState {
  private static instance: GameState;
  private data: GameStateData;
  private game: Game | null = null;

  private constructor() {
    this.data = {
      score: 0,
      health: 100,
      isGameOver: false,
      level: 1,
    };
  }

  public static getInstance(): GameState {
    if (!GameState.instance) {
      GameState.instance = new GameState();
    }
    return GameState.instance;
  }

  public setGame(game: Game) {
    this.game = game;
  }

  public update(newData: Partial<GameStateData>) {
    try {
      this.data = { ...this.data, ...newData };
      if (this.game) {
        this.game.events.emit('STATE_UPDATE', this.data);
      }
    } catch (error) {
      console.error('GameState update failed:', error);
    }
  }

  public getData(): GameStateData {
    return { ...this.data };
  }

  public reset() {
    this.data = {
      score: 0,
      health: 100,
      isGameOver: false,
      level: 1,
    };
    if (this.game) {
      this.game.events.emit('STATE_UPDATE', this.data);
    }
  }
}
