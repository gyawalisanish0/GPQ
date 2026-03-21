// ─── BaseScene ────────────────────────────────────────────────────────────────
// All game scenes extend this class. Provides:
//   - Viewport dimension helpers (gameWidth, gameHeight, centerX, centerY, scaleFactor)
//   - Auto-loading of a saved <SceneKey>_layout.json when useLayoutFile = true

import Phaser from 'phaser';
import type { SceneLayout } from '../editor/types';
import { LayoutManager }    from '../editor/LayoutManager';

export class BaseScene extends Phaser.Scene {
  protected gameWidth:   number = 0;
  protected gameHeight:  number = 0;
  protected centerX:     number = 0;
  protected centerY:     number = 0;
  protected scaleFactor: number = 1;

  /**
   * Set to true in a subclass to attempt loading a saved layout on startup.
   * The layout file must be placed at /public/<SceneKey.toLowerCase()>_layout.json
   */
  protected useLayoutFile = false;

  // ──────────────────────────────────────────────────────────────────────────
  // Phaser lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  init(data?: unknown): void {
    this.updateDimensions();
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
    });
    this.onInit(data);
  }

  /** Call this at the END of your subclass's create() to apply the saved layout. */
  protected postCreate(): void {
    if (this.useLayoutFile) {
      void this.tryApplySavedLayout();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Hooks for subclasses
  // ──────────────────────────────────────────────────────────────────────────

  protected onInit(_data?: unknown): void {
    // override in subclasses
  }

  protected onResize(): void {
    // override in subclasses to rebuild layout on resize
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Dimension helpers
  // ──────────────────────────────────────────────────────────────────────────

  protected updateDimensions(): void {
    this.gameWidth   = this.cameras.main.width;
    this.gameHeight  = this.cameras.main.height;
    this.centerX     = this.gameWidth  / 2;
    this.centerY     = this.gameHeight / 2;
    this.scaleFactor = Math.min(
      this.gameWidth  / 1080,
      this.gameHeight / 1920
    );
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.resize(gameSize.width, gameSize.height);
    this.updateDimensions();
    this.onResize();
  }

  /** X offset to horizontally center a block of contentWidth inside the canvas. */
  protected getCenteredX(contentWidth: number): number {
    return (this.gameWidth - contentWidth) / 2;
  }

  /** Y offset to vertically center a block of contentHeight with an optional scaled bias. */
  protected getCenteredY(contentHeight: number, yOffset = 0): number {
    return (this.gameHeight - contentHeight) / 2 + yOffset * this.scaleFactor;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Saved-layout loading
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Fetches /<sceneKey>_layout.json from the public folder and applies any
   * saved object positions. Silently no-ops if the file is absent.
   */
  private async tryApplySavedLayout(): Promise<void> {
    const filename = `/${this.scene.key.toLowerCase()}_layout.json`;
    try {
      const res = await fetch(filename);
      if (!res.ok) return;

      const text   = await res.text();
      const layout: SceneLayout | null = LayoutManager.parseLayout(text);
      if (!layout) return;

      // Defer one tick so every game-object is fully registered.
      this.time.delayedCall(0, () => {
        LayoutManager.applyLayout(this, layout);
        console.info(`[BaseScene] Applied saved layout for "${this.scene.key}".`);
      });
    } catch {
      // Network error or JSON error — silently ignore in production.
    }
  }
}
