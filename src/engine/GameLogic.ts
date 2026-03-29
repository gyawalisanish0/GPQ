import { GemRegistry } from './GemRegistry';

// ─── Enums ────────────────────────────────────────────────────────────────────
export enum ShapeType {
  TRIANGLE = 'triangle',
  SQUARE   = 'square',
  PENTAGON = 'pentagon',
  HEXAGON  = 'hexagon',
  STAR     = 'star',
  NONE     = 'none',
}

export enum SpecialType {
  NONE     = 'none',
  MISSILE  = 'missile',
  PULSAR   = 'pulsar',
  BOMB     = 'bomb',
  PARASITE = 'parasite',
}

export interface LogicCell {
  r:       number;
  c:       number;
  shape:   ShapeType;
  special: SpecialType;
}

export interface MatchResult {
  cells:          { r: number; c: number }[];
  specialCreation?: { r: number; c: number; type: SpecialType; shape: ShapeType };
  score:          number;
}

// ─── GameLogic ────────────────────────────────────────────────────────────────
export class GameLogic {
  public  grid:     (LogicCell | null)[][];
  public  gridSize: number;

  // Cache available shape keys — rebuilt lazily when registry changes
  private _shapes:     ShapeType[] = [];
  private _shapesDirty = true;

  // Dirty flag: set true whenever the grid changes so hasPossibleMoves re-runs
  private _movesDirty  = true;
  private _hasMoves    = true;

  constructor(gridSize: number) {
    this.gridSize = gridSize;
    this.grid = Array.from({ length: gridSize }, (_, r) =>
      Array.from({ length: gridSize }, (_, c): null => null)
    );
  }

  // ─── Shape list (cached) ─────────────────────────────────────────────────────
  private getShapes(): ShapeType[] {
    if (!this._shapesDirty) return this._shapes;
    const reg  = GemRegistry.getInstance();
    const gems = reg.getNormalGems();
    this._shapes = gems.length
      ? gems.map(g => ShapeType[g.shape as keyof typeof ShapeType]).filter(Boolean)
      : (Object.values(ShapeType).filter(s => s !== ShapeType.NONE) as ShapeType[]);
    this._shapesDirty = false;
    return this._shapes;
  }

  private randomShape(): ShapeType {
    const s = this.getShapes();
    return s[Math.floor(Math.random() * s.length)];
  }

  // ─── Initialise ──────────────────────────────────────────────────────────────
  public initializeGrid() {
    const shapes = this.getShapes();
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        let shape: ShapeType;
        let attempts = 0;
        do {
          shape = shapes[Math.floor(Math.random() * shapes.length)];
          attempts++;
        } while (
          attempts < 20 && (
            (c >= 2 && this.grid[r][c-1]?.shape === shape && this.grid[r][c-2]?.shape === shape) ||
            (r >= 2 && this.grid[r-1]?.[c]?.shape === shape && this.grid[r-2]?.[c]?.shape === shape)
          )
        );
        this.grid[r][c] = { r, c, shape, special: SpecialType.NONE };
      }
    }
    this._movesDirty = true;
  }

  // ─── Swap ─────────────────────────────────────────────────────────────────────
  public swap(r1: number, c1: number, r2: number, c2: number) {
    const tmp = this.grid[r1][c1];
    this.grid[r1][c1] = this.grid[r2][c2];
    this.grid[r2][c2] = tmp;
    if (this.grid[r1][c1]) { this.grid[r1][c1]!.r = r1; this.grid[r1][c1]!.c = c1; }
    if (this.grid[r2][c2]) { this.grid[r2][c2]!.r = r2; this.grid[r2][c2]!.c = c2; }
    this._movesDirty = true;
  }

  // ─── findMatches (optimised) ──────────────────────────────────────────────────
  /**
   * Single-pass horizontal + vertical scan, then 2×2 squares.
   * Uses a flat Union-Find over cell indices to merge intersecting runs.
   */
  public findMatches(): MatchResult[] {
    const G = this.gridSize;
    const raw: { r: number; c: number }[][] = [];

    // Horizontal
    for (let r = 0; r < G; r++) {
      let run = 1;
      for (let c = 1; c <= G; c++) {
        const curr = c < G ? this.grid[r][c]   : null;
        const prev =         this.grid[r][c-1];
        if (curr && prev && curr.shape !== ShapeType.NONE && curr.shape === prev.shape) {
          run++;
        } else {
          if (run >= 3) {
            const cells: { r:number; c:number }[] = [];
            for (let i = 0; i < run; i++) cells.push({ r, c: c-1-i });
            raw.push(cells);
          }
          run = 1;
        }
      }
    }

    // Vertical
    for (let c = 0; c < G; c++) {
      let run = 1;
      for (let r = 1; r <= G; r++) {
        const curr = r < G ? this.grid[r][c]   : null;
        const prev =         this.grid[r-1]?.[c];
        if (curr && prev && curr.shape !== ShapeType.NONE && curr.shape === prev.shape) {
          run++;
        } else {
          if (run >= 3) {
            const cells: { r:number; c:number }[] = [];
            for (let i = 0; i < run; i++) cells.push({ r: r-1-i, c });
            raw.push(cells);
          }
          run = 1;
        }
      }
    }

    // 2×2 squares
    for (let r = 0; r < G-1; r++) {
      for (let c = 0; c < G-1; c++) {
        const shape = this.grid[r][c]?.shape;
        if (shape && shape !== ShapeType.NONE &&
            this.grid[r][c+1]?.shape === shape &&
            this.grid[r+1][c]?.shape === shape &&
            this.grid[r+1][c+1]?.shape === shape) {
          raw.push([{ r, c }, { r, c:c+1 }, { r:r+1, c }, { r:r+1, c:c+1 }]);
        }
      }
    }

    if (!raw.length) return [];
    return this.mergeAndScore(raw);
  }

  // ─── Union-Find merge ─────────────────────────────────────────────────────────
  private mergeAndScore(raw: { r:number; c:number }[][]): MatchResult[] {
    const G = this.gridSize;
    const idx = (r: number, c: number) => r * G + c;

    // Flat UF parent array — index = r*G+c
    const parent = new Int32Array(G * G);
    for (let i = 0; i < parent.length; i++) parent[i] = i;

    const find = (i: number): number => {
      while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
      return i;
    };
    const union = (a: number, b: number) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    // Mark cells and union within each run
    const inMatch = new Uint8Array(G * G);
    for (const cells of raw) {
      for (let i = 0; i < cells.length; i++) {
        inMatch[idx(cells[i].r, cells[i].c)] = 1;
        if (i > 0) union(idx(cells[i].r, cells[i].c), idx(cells[i-1].r, cells[i-1].c));
      }
    }

    // Group by root
    const groups = new Map<number, { r:number; c:number }[]>();
    for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        const i = idx(r, c);
        if (!inMatch[i]) continue;
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root)!.push({ r, c });
      }
    }

    const results: MatchResult[] = [];
    groups.forEach(cells => {
      results.push(this.scoreGroup(cells));
    });
    return results;
  }

  /**
   * Returns true if the cell group forms a T-shape, L-shape, or cross pattern.
   * Detection: any cell with ≥3 orthogonal neighbors in the group (T/cross junction),
   * OR any cell with exactly 2 non-collinear neighbors (L-corner: one horizontal + one vertical).
   * The junction cell (most neighbors) is also returned as the preferred spawn position.
   */
  private hasBranchingShape(cells: { r:number; c:number }[]): { branching: boolean; junction: { r:number; c:number } | null } {
    const cellSet = new Set(cells.map(({ r, c }) => `${r},${c}`));
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]] as const;
    let bestNeighborCount = 0;
    let junction: { r:number; c:number } | null = null;

    for (const cell of cells) {
      const neighbors = dirs.filter(([dr, dc]) => cellSet.has(`${cell.r+dr},${cell.c+dc}`));
      const count = neighbors.length;

      if (count >= 3) {
        // T-junction or cross: qualifies immediately
        if (count > bestNeighborCount) { bestNeighborCount = count; junction = cell; }
      } else if (count === 2) {
        // Check for non-collinear: one neighbor on a different axis than the other
        const axes = neighbors.map(([dr]) => dr !== 0 ? 'v' : 'h');
        if (axes[0] !== axes[1]) {
          // L-corner
          if (count > bestNeighborCount) { bestNeighborCount = count; junction = cell; }
        }
      }
    }

    return { branching: junction !== null, junction };
  }

  private scoreGroup(cells: { r:number; c:number }[]): MatchResult {
    let score = cells.length * 10;
    let minR = this.gridSize, maxR = -1, minC = this.gridSize, maxC = -1;

    for (const { r, c } of cells) {
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    }

    const w = maxC - minC + 1, h = maxR - minR + 1;
    const shape = this.grid[cells[0].r][cells[0].c]?.shape ?? ShapeType.NONE;
    let specialCreation: MatchResult['specialCreation'];
    let target = cells[0];

    if (w >= 5 || h >= 5) {
      // 5+ in any direction → PARASITE
      target = cells.find(c => w >= 5 ? c.c === minC + 2 : c.r === minR + 2) ?? cells[0];
      specialCreation = { r: target.r, c: target.c, type: SpecialType.PARASITE, shape: ShapeType.NONE };
      score += 40;
    } else {
      const { branching, junction } = this.hasBranchingShape(cells);
      if (branching && junction) {
        // T-shape / L-shape / cross → BOMB (spawns at junction cell)
        specialCreation = { r: junction.r, c: junction.c, type: SpecialType.BOMB, shape };
        score += 30;
      } else if (w === 4 || h === 4) {
        // Exactly 4 in a line → PULSAR
        target = cells.find(c => w === 4 ? (c.c === minC+1||c.c === minC+2) : (c.r === minR+1||c.r === minR+2)) ?? cells[0];
        specialCreation = { r: target.r, c: target.c, type: SpecialType.PULSAR, shape };
        score += 20;
      } else if (w === 2 && h === 2 && cells.length === 4) {
        // Exact 2×2 square → MISSILE
        specialCreation = { r: target.r, c: target.c, type: SpecialType.MISSILE, shape };
        score += 20;
      }
    }

    return { cells, specialCreation, score };
  }

  // ─── Gravity ──────────────────────────────────────────────────────────────────
  public applyGravity(): {
    drops:    { r:number; c:number; newR:number }[];
    newCells: { r:number; c:number; shape:ShapeType }[];
  } {
    const drops:    { r:number; c:number; newR:number }[] = [];
    const newCells: { r:number; c:number; shape:ShapeType }[] = [];
    const G = this.gridSize;

    for (let c = 0; c < G; c++) {
      let empty = 0;
      for (let r = G-1; r >= 0; r--) {
        if (!this.grid[r][c]) { empty++; }
        else if (empty > 0) {
          const nr = r + empty;
          this.grid[nr][c] = this.grid[r][c];
          this.grid[nr][c]!.r = nr;
          this.grid[r][c]  = null;
          drops.push({ r, c, newR: nr });
        }
      }
      for (let i = 0; i < empty; i++) {
        const r = empty - 1 - i;
        const shape = this.randomShape();
        this.grid[r][c] = { r, c, shape, special: SpecialType.NONE };
        newCells.push({ r, c, shape });
      }
    }
    this._movesDirty = true;
    return { drops, newCells };
  }

  // ─── hasPossibleMoves (cached, dirty-flag) ────────────────────────────────────
  public hasPossibleMoves(): boolean {
    if (!this._movesDirty) return this._hasMoves;
    this._movesDirty = false;
    this._hasMoves   = this._computeHasMoves();
    return this._hasMoves;
  }

  private _computeHasMoves(): boolean {
    const G = this.gridSize;
    for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        const cell = this.grid[r][c];
        // Parasite can always be swapped
        if (cell?.special === SpecialType.PARASITE) return true;

        if (c < G-1) {
          const right = this.grid[r][c+1];
          if (cell && right && cell.special !== SpecialType.NONE && right.special !== SpecialType.NONE) return true;
          this.swap(r, c, r, c+1);
          const mH = this.findMatches().length > 0;
          this.swap(r, c, r, c+1);
          if (mH) return true;
        }
        if (r < G-1) {
          const down = this.grid[r+1]?.[c];
          if (cell && down && cell.special !== SpecialType.NONE && down.special !== SpecialType.NONE) return true;
          this.swap(r, c, r+1, c);
          const mV = this.findMatches().length > 0;
          this.swap(r, c, r+1, c);
          if (mV) return true;
        }
      }
    }
    return false;
  }

  // ─── Shuffle ──────────────────────────────────────────────────────────────────
  public shuffleBoard(): { r:number; c:number; shape:ShapeType; special:SpecialType }[] {
    // Collect all existing cells
    const flat: { shape:ShapeType; special:SpecialType }[] = [];
    for (let r = 0; r < this.gridSize; r++)
      for (let c = 0; c < this.gridSize; c++)
        if (this.grid[r][c]) flat.push({ shape: this.grid[r][c]!.shape, special: this.grid[r][c]!.special });

    let found = false;
    for (let attempt = 0; attempt < 100 && !found; attempt++) {
      // Fisher-Yates
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1));
        [flat[i], flat[j]] = [flat[j], flat[i]];
      }

      let idx = 0;
      for (let r = 0; r < this.gridSize; r++)
        for (let c = 0; c < this.gridSize; c++)
          this.grid[r][c] = { r, c, shape: flat[idx].shape, special: flat[idx++].special };

      // Resolve any accidental initial matches
      let resolved = 0;
      let ms = this.findMatches();
      while (ms.length && ++resolved < 50) {
        for (const m of ms)
          for (const cell of m.cells)
            if (this.grid[cell.r][cell.c]?.special === SpecialType.NONE)
              this.grid[cell.r][cell.c]!.shape = this.randomShape();
        ms = this.findMatches();
      }

      this._movesDirty = true;
      if (this.hasPossibleMoves()) found = true;
    }

    if (!found) this.initializeGrid();

    const out: { r:number; c:number; shape:ShapeType; special:SpecialType }[] = [];
    for (let r = 0; r < this.gridSize; r++)
      for (let c = 0; c < this.gridSize; c++)
        out.push({ r, c, shape: this.grid[r][c]!.shape, special: this.grid[r][c]!.special });
    return out;
  }

  public removeCells(cells: { r:number; c:number }[]) {
    cells.forEach(({ r, c }) => { this.grid[r][c] = null; });
    this._movesDirty = true;
  }
}
