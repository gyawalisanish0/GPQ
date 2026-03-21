import Phaser from 'phaser';

/**
 * SwipeHandler
 * ────────────
 * Translates raw Phaser pointer events into grid-cell swipe / tap-to-swap
 * actions.
 *
 * Key fixes vs. the original:
 *  • destroy() explicitly removes the three bound handlers by reference —
 *    prevents stale listeners surviving scene restarts.
 *  • Bound method references are stored at construction time so off() can
 *    match them exactly (Phaser's off() requires the same function reference
 *    that was passed to on()).
 *  • Uses pointer.x / pointer.y rather than pointer.worldX / pointer.worldY.
 *    Both are identical when the camera has no scroll / zoom (which is always
 *    the case here), but .x/.y are the raw CSS-pixel coordinates that match
 *    the offsetX / offsetY values computed from cameras.main.width.  Using
 *    world coordinates can diverge if a camera effect ever nudges scrollX.
 *  • Drag threshold lowered from 30 px to 20 px — more responsive on small
 *    mobile screens where a "swipe" rarely travels 30 CSS pixels.
 */
export class SwipeHandler {
  private scene: Phaser.Scene;
  private cellSize: number;
  private offsetX: number;
  private offsetY: number;
  private gridSize: number;

  private onSwipe: (start: { r: number; c: number }, end: { r: number; c: number }) => void;
  private onPointerMove?: (r: number, c: number) => void;
  private onPointerDown?: (r: number, c: number) => void;
  private onPointerUp?: () => void;

  private dragStart: { x: number; y: number } | null = null;
  private selectedCell: { r: number; c: number } | null = null;

  // Stored bound references — required so destroy() can remove the exact
  // same function objects that were passed to scene.input.on().
  private readonly _onDown: (p: Phaser.Input.Pointer) => void;
  private readonly _onUp:   (p: Phaser.Input.Pointer) => void;
  private readonly _onMove: (p: Phaser.Input.Pointer) => void;

  /** Minimum CSS-pixel travel to be treated as a drag (not a tap). */
  private static readonly DRAG_THRESHOLD = 20;

  constructor(
    scene: Phaser.Scene,
    cellSize: number,
    offsetX: number,
    offsetY: number,
    gridSize: number,
    onSwipe: (start: { r: number; c: number }, end: { r: number; c: number }) => void,
    onPointerMove?: (r: number, c: number) => void,
    onPointerDown?: (r: number, c: number) => void,
    onPointerUp?: () => void,
  ) {
    this.scene       = scene;
    this.cellSize    = cellSize;
    this.offsetX     = offsetX;
    this.offsetY     = offsetY;
    this.gridSize    = gridSize;
    this.onSwipe     = onSwipe;
    this.onPointerMove = onPointerMove;
    this.onPointerDown = onPointerDown;
    this.onPointerUp   = onPointerUp;

    // Create bound references once
    this._onDown = this.handlePointerDown.bind(this);
    this._onUp   = this.handlePointerUp.bind(this);
    this._onMove = this.handlePointerMove.bind(this);

    scene.input.on('pointerdown',  this._onDown);
    scene.input.on('pointerup',    this._onUp);
    scene.input.on('pointermove',  this._onMove);
  }

  /**
   * Must be called when the owning scene shuts down.
   * Removes all three listeners so they cannot fire after the scene is gone.
   */
  public destroy(): void {
    if (this.scene?.input) {
      this.scene.input.off('pointerdown',  this._onDown);
      this.scene.input.off('pointerup',    this._onUp);
      this.scene.input.off('pointermove',  this._onMove);
    }
    this.dragStart    = null;
    this.selectedCell = null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Convert a pointer position to a grid cell, or null if outside the grid. */
  private cellAt(pointer: Phaser.Input.Pointer): { r: number; c: number } | null {
    // Use screen-space coordinates (pointer.x / pointer.y) — these are raw CSS
    // pixel values and directly match the offsetX / offsetY produced by
    // getCenteredX(), which is computed from cameras.main.width (also CSS px).
    const c = Math.floor((pointer.x - this.offsetX) / this.cellSize);
    const r = Math.floor((pointer.y - this.offsetY) / this.cellSize);
    if (r >= 0 && r < this.gridSize && c >= 0 && c < this.gridSize) {
      return { r, c };
    }
    return null;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const cell = this.cellAt(pointer);

    if (!cell) {
      // Outside the grid — deselect
      this.dragStart    = null;
      this.selectedCell = null;
      this.onPointerUp?.();
      return;
    }

    // Tap-to-swap: if we already have a selected cell, check adjacency
    if (
      this.selectedCell &&
      (this.selectedCell.r !== cell.r || this.selectedCell.c !== cell.c)
    ) {
      const dr = Math.abs(this.selectedCell.r - cell.r);
      const dc = Math.abs(this.selectedCell.c - cell.c);

      if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
        this.onSwipe(this.selectedCell, cell);
        this.selectedCell = null;
        this.dragStart    = null;
        return;
      }

      // Non-adjacent second tap — select new cell
    }

    this.dragStart    = { x: pointer.x, y: pointer.y };
    this.selectedCell = cell;
    this.onPointerDown?.(cell.r, cell.c);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    this.onPointerUp?.();

    if (!this.dragStart || !this.selectedCell) return;

    const dx = pointer.x - this.dragStart.x;
    const dy = pointer.y - this.dragStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > SwipeHandler.DRAG_THRESHOLD) {
      // Swipe gesture — determine direction
      let targetR = this.selectedCell.r;
      let targetC = this.selectedCell.c;

      if (Math.abs(dx) > Math.abs(dy)) {
        targetC += dx > 0 ? 1 : -1;
      } else {
        targetR += dy > 0 ? 1 : -1;
      }

      if (
        targetR >= 0 && targetR < this.gridSize &&
        targetC >= 0 && targetC < this.gridSize
      ) {
        this.onSwipe(this.selectedCell, { r: targetR, c: targetC });
        this.selectedCell = null;
      }

      this.dragStart = null;
    } else {
      // Short tap — keep selectedCell for tap-to-swap; clear dragStart
      this.dragStart = null;
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown || !this.onPointerMove) return;
    const cell = this.cellAt(pointer);
    if (cell) this.onPointerMove(cell.r, cell.c);
  }
}
