// ─── DragHandler ─────────────────────────────────────────────────────────────
// Provides click-and-drag manipulation of any Phaser.GameObjects.GameObject
// inside any active scene.  Runs inside the GenesisEditorScene so it doesn't
// interfere with normal game input.

import Phaser from 'phaser';
import type { DragState } from './types';

export type SelectionCallback = (obj: Phaser.GameObjects.GameObject | null) => void;

export class DragHandler {
  private state: DragState = { isDragging: false, object: null, offsetX: 0, offsetY: 0 };
  private readonly highlightGraphics: Phaser.GameObjects.Graphics;
  private readonly editorScene: Phaser.Scene;
  private readonly onSelect: SelectionCallback;

  constructor(editorScene: Phaser.Scene, onSelect: SelectionCallback) {
    this.editorScene       = editorScene;
    this.onSelect          = onSelect;
    this.highlightGraphics = editorScene.add.graphics().setDepth(9998);

    this.editorScene.input.on('pointerdown', this.onPointerDown, this);
    this.editorScene.input.on('pointermove', this.onPointerMove, this);
    this.editorScene.input.on('pointerup',   this.onPointerUp,   this);
  }

  get selectedObject(): Phaser.GameObjects.GameObject | null {
    return this.state.object;
  }

  clearSelection(): void {
    this.state.object = null;
    this.highlightGraphics.clear();
    this.onSelect(null);
  }

  destroy(): void {
    this.editorScene.input.off('pointerdown', this.onPointerDown, this);
    this.editorScene.input.off('pointermove', this.onPointerMove, this);
    this.editorScene.input.off('pointerup',   this.onPointerUp,   this);
    this.highlightGraphics.destroy();
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const obj = this.findObjectAtPointer(pointer);
    if (obj) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = obj as any;
      this.state = {
        isDragging: true,
        object:     obj,
        offsetX:    pointer.worldX - (o.x ?? 0),
        offsetY:    pointer.worldY - (o.y ?? 0),
      };
      this.onSelect(obj);
      this.drawHighlight(obj);
    } else {
      this.clearSelection();
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.state.isDragging || !this.state.object || !pointer.isDown) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = this.state.object as any;
    o.x     = pointer.worldX - this.state.offsetX;
    o.y     = pointer.worldY - this.state.offsetY;
    this.drawHighlight(this.state.object);
  }

  private onPointerUp(): void {
    this.state.isDragging = false;
  }

  private findObjectAtPointer(
    pointer: Phaser.Input.Pointer
  ): Phaser.GameObjects.GameObject | null {
    const px         = pointer.worldX;
    const py         = pointer.worldY;
    const SKIP_TYPES = new Set(['Graphics', 'Text', 'Rectangle', 'Circle', 'Container']);

    for (const scene of this.editorScene.game.scene.scenes) {
      if (scene === this.editorScene || !scene.sys.isActive()) continue;

      const children = [
        ...scene.sys.displayList.getChildren(),
      ].reverse() as Phaser.GameObjects.GameObject[];

      for (const child of children) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = child as any;
        if (!c.visible) continue;
        if (SKIP_TYPES.has(c.type as string)) continue;

        if (typeof c.getBounds === 'function') {
          const b = c.getBounds() as Phaser.Geom.Rectangle;
          if (b.contains(px, py)) return child;
        } else if (c.x !== undefined) {
          if (Math.abs(c.x - px) < 32 && Math.abs(c.y - py) < 32) return child;
        }
      }
    }
    return null;
  }

  private drawHighlight(obj: Phaser.GameObjects.GameObject): void {
    this.highlightGraphics.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = obj as any;

    let bounds: Phaser.Geom.Rectangle;
    if (typeof c.getBounds === 'function') {
      bounds = c.getBounds() as Phaser.Geom.Rectangle;
    } else {
      bounds = new Phaser.Geom.Rectangle((c.x ?? 0) - 16, (c.y ?? 0) - 16, 32, 32);
    }

    const pad = 4;
    const bx  = bounds.x - pad;
    const by  = bounds.y - pad;
    const bw  = bounds.width  + pad * 2;
    const bh  = bounds.height + pad * 2;

    this.highlightGraphics.lineStyle(2, 0x00ffff, 0.9);
    this.highlightGraphics.strokeRect(bx, by, bw, bh);

    const s = 8;
    this.highlightGraphics.fillStyle(0x00ffff, 1);
    (
      [
        [bx,          by],
        [bx + bw - s, by],
        [bx,          by + bh - s],
        [bx + bw - s, by + bh - s],
      ] as [number, number][]
    ).forEach(([cx, cy]) => this.highlightGraphics.fillRect(cx, cy, s, s));
  }
}
