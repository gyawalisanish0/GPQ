import Phaser from 'phaser';

export class SwipeHandler {
  private scene: Phaser.Scene;
  private dragStartPos: { x: number; y: number } | null = null;
  private selectedCell: { r: number; c: number } | null = null;
  private onSwipe: (start: { r: number; c: number }, end: { r: number; c: number }) => void;
  private onPointerMove?: (r: number, c: number) => void;
  private onPointerDown?: (r: number, c: number) => void;
  private onPointerUp?: () => void;
  private cellSize: number;
  private offsetX: number;
  private offsetY: number;
  private gridSize: number;

  constructor(
    scene: Phaser.Scene,
    cellSize: number,
    offsetX: number,
    offsetY: number,
    gridSize: number,
    onSwipe: (start: { r: number; c: number }, end: { r: number; c: number }) => void,
    onPointerMove?: (r: number, c: number) => void,
    onPointerDown?: (r: number, c: number) => void,
    onPointerUp?: () => void
  ) {
    this.scene = scene;
    this.cellSize = cellSize;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.gridSize = gridSize;
    this.onSwipe = onSwipe;
    this.onPointerMove = onPointerMove;
    this.onPointerDown = onPointerDown;
    this.onPointerUp = onPointerUp;

    this.scene.input.on('pointerdown', this.handlePointerDown, this);
    this.scene.input.on('pointerup', this.handlePointerUp, this);
    this.scene.input.on('pointermove', this.handlePointerMove, this);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (pointer.isDown && this.onPointerMove) {
      const c = Math.floor((pointer.worldX - this.offsetX) / this.cellSize);
      const r = Math.floor((pointer.worldY - this.offsetY) / this.cellSize);
      if (r >= 0 && r < this.gridSize && c >= 0 && c < this.gridSize) {
        this.onPointerMove(r, c);
      }
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    const c = Math.floor((pointer.worldX - this.offsetX) / this.cellSize);
    const r = Math.floor((pointer.worldY - this.offsetY) / this.cellSize);

    if (r >= 0 && r < this.gridSize && c >= 0 && c < this.gridSize) {
      // Check for Tap-to-Swap
      if (this.selectedCell && (this.selectedCell.r !== r || this.selectedCell.c !== c)) {
        const dr = Math.abs(this.selectedCell.r - r);
        const dc = Math.abs(this.selectedCell.c - c);
        
        // If adjacent
        if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
          this.onSwipe(this.selectedCell, { r, c });
          this.selectedCell = null;
          this.dragStartPos = null;
          return;
        }
      }

      this.dragStartPos = { x: pointer.worldX, y: pointer.worldY };
      this.selectedCell = { r, c };
      if (this.onPointerDown) {
        this.onPointerDown(r, c);
      }
    } else {
      // If clicked outside the grid, clear selection
      this.dragStartPos = null;
      this.selectedCell = null;
      if (this.onPointerUp) {
        this.onPointerUp();
      }
    }
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    if (this.onPointerUp) {
      this.onPointerUp();
    }
    
    if (!this.dragStartPos || !this.selectedCell) return;

    const dx = pointer.worldX - this.dragStartPos.x;
    const dy = pointer.worldY - this.dragStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 30) {
      let targetR = this.selectedCell.r;
      let targetC = this.selectedCell.c;

      if (Math.abs(dx) > Math.abs(dy)) {
        targetC += dx > 0 ? 1 : -1;
      } else {
        targetR += dy > 0 ? 1 : -1;
      }

      if (targetR >= 0 && targetR < this.gridSize && targetC >= 0 && targetC < this.gridSize) {
        this.onSwipe(this.selectedCell, { r: targetR, c: targetC });
        this.dragStartPos = null;
        this.selectedCell = null;
      }
    } else {
      // If it's a short tap, we keep the selection for tap-to-swap
      // We don't clear dragStartPos/selectedCell here if it was a tap
      // because handlePointerDown uses them for tap-to-swap logic.
      // However, we should clear them if they were already set and we tapped the SAME cell.
      if (distance < 5) {
         // Keep selection
      } else {
        this.dragStartPos = null;
        this.selectedCell = null;
      }
    }
  }
}
