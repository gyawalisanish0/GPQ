import { GemRegistry } from './GemRegistry';

export enum ShapeType {
  TRIANGLE = 'triangle',
  SQUARE = 'square',
  PENTAGON = 'pentagon',
  HEXAGON = 'hexagon',
  STAR = 'star',
  NONE = 'none'
}

export enum SpecialType {
  NONE = 'none',
  MISSILE = 'missile',
  PULSAR = 'pulsar',
  BOMB = 'bomb',
  PARASITE = 'parasite'
}

export interface LogicCell {
  r: number;
  c: number;
  shape: ShapeType;
  special: SpecialType;
}

export interface MatchResult {
  cells: { r: number; c: number }[];
  specialCreation?: { r: number; c: number; type: SpecialType; shape: ShapeType };
  score: number;
}

export class GameLogic {
  public grid: (LogicCell | null)[][];
  public gridSize: number;
  
  constructor(gridSize: number) {
    this.gridSize = gridSize;
    this.grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
  }

  public initializeGrid() {
    const registry = GemRegistry.getInstance();
    const normalGems = registry.getNormalGems();
    let shapes: ShapeType[] = [];
    
    if (normalGems.length > 0) {
      shapes = normalGems.map(g => ShapeType[g.shape as keyof typeof ShapeType]).filter(s => s !== undefined);
    } else {
      shapes = Object.values(ShapeType).filter(s => s !== ShapeType.NONE);
    }

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        let shape: ShapeType;
        do {
          shape = shapes[Math.floor(Math.random() * shapes.length)];
        } while (
          (c >= 2 && this.grid[r][c - 1]?.shape === shape && this.grid[r][c - 2]?.shape === shape) ||
          (r >= 2 && this.grid[r - 1][c]?.shape === shape && this.grid[r - 2][c]?.shape === shape)
        );
        this.grid[r][c] = { r, c, shape, special: SpecialType.NONE };
      }
    }
  }

  public swap(r1: number, c1: number, r2: number, c2: number) {
    const temp = this.grid[r1][c1];
    this.grid[r1][c1] = this.grid[r2][c2];
    this.grid[r2][c2] = temp;
    
    if (this.grid[r1][c1]) {
      this.grid[r1][c1]!.r = r1;
      this.grid[r1][c1]!.c = c1;
    }
    if (this.grid[r2][c2]) {
      this.grid[r2][c2]!.r = r2;
      this.grid[r2][c2]!.c = c2;
    }
  }

  public findMatches(): MatchResult[] {
    const matches: MatchResult[] = [];
    const matchedCells = new Set<string>();

    // Find horizontal matches
    for (let r = 0; r < this.gridSize; r++) {
      let matchLength = 1;
      for (let c = 1; c <= this.gridSize; c++) {
        if (c < this.gridSize && this.grid[r][c] && this.grid[r][c - 1] && this.grid[r][c]!.shape !== ShapeType.NONE && this.grid[r][c]!.shape === this.grid[r][c - 1]!.shape) {
          matchLength++;
        } else {
          if (matchLength >= 3) {
            const match: { r: number; c: number }[] = [];
            for (let i = 0; i < matchLength; i++) {
              match.push({ r, c: c - 1 - i });
            }
            matches.push({ cells: match, score: matchLength * 10 });
          }
          matchLength = 1;
        }
      }
    }

    // Find vertical matches
    for (let c = 0; c < this.gridSize; c++) {
      let matchLength = 1;
      for (let r = 1; r <= this.gridSize; r++) {
        if (r < this.gridSize && this.grid[r][c] && this.grid[r - 1][c] && this.grid[r][c]!.shape !== ShapeType.NONE && this.grid[r][c]!.shape === this.grid[r - 1][c]!.shape) {
          matchLength++;
        } else {
          if (matchLength >= 3) {
            const match: { r: number; c: number }[] = [];
            for (let i = 0; i < matchLength; i++) {
              match.push({ r: r - 1 - i, c });
            }
            matches.push({ cells: match, score: matchLength * 10 });
          }
          matchLength = 1;
        }
      }
    }

    // Find 2x2 square matches
    for (let r = 0; r < this.gridSize - 1; r++) {
      for (let c = 0; c < this.gridSize - 1; c++) {
        const shape = this.grid[r][c]?.shape;
        if (shape && shape !== ShapeType.NONE &&
            this.grid[r][c+1]?.shape === shape &&
            this.grid[r+1][c]?.shape === shape &&
            this.grid[r+1][c+1]?.shape === shape) {
          matches.push({
            cells: [
              { r, c },
              { r, c: c + 1 },
              { r: r + 1, c },
              { r: r + 1, c: c + 1 }
            ],
            score: 40
          });
        }
      }
    }

    // Combine intersecting matches and determine specials
    return this.processMatchesForSpecials(matches);
  }

  private processMatchesForSpecials(rawMatches: MatchResult[]): MatchResult[] {
    const processedMatches: MatchResult[] = [];
    
    const uf = new Map<string, string>();
    const find = (i: string): string => {
      if (!uf.has(i)) uf.set(i, i);
      if (uf.get(i) !== i) uf.set(i, find(uf.get(i)!));
      return uf.get(i)!;
    };
    const union = (i: string, j: string) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) uf.set(rootI, rootJ);
    };

    const allMatchedCells = new Set<string>();
    rawMatches.forEach((match) => {
      match.cells.forEach(cell => {
        const key = `${cell.r},${cell.c}`;
        allMatchedCells.add(key);
        match.cells.forEach(otherCell => {
            union(key, `${otherCell.r},${otherCell.c}`);
        });
      });
    });

    const groups = new Map<string, { r: number, c: number }[]>();
    allMatchedCells.forEach(key => {
      const root = find(key);
      if (!groups.has(root)) groups.set(root, []);
      const [r, c] = key.split(',').map(Number);
      groups.get(root)!.push({ r, c });
    });

    groups.forEach(cells => {
      let specialCreation: MatchResult['specialCreation'] = undefined;
      const shape = this.grid[cells[0].r][cells[0].c]!.shape;
      
      // New Scoring: 10 points per gem
      let score = cells.length * 10;
      
      let minR = this.gridSize, maxR = -1, minC = this.gridSize, maxC = -1;
      const rowCounts = new Map<number, number>();
      const colCounts = new Map<number, number>();

      cells.forEach(c => {
        if (c.r < minR) minR = c.r;
        if (c.r > maxR) maxR = c.r;
        if (c.c < minC) minC = c.c;
        if (c.c > maxC) maxC = c.c;
        rowCounts.set(c.r, (rowCounts.get(c.r) || 0) + 1);
        colCounts.set(c.c, (colCounts.get(c.c) || 0) + 1);
      });
      
      const width = maxC - minC + 1;
      const height = maxR - minR + 1;
      let targetCell = cells[0];

      if (width >= 5 || height >= 5) {
        if (width >= 5) targetCell = cells.find(c => c.c === minC + 2) || cells[0];
        else targetCell = cells.find(c => c.r === minR + 2) || cells[0];
        specialCreation = { r: targetCell.r, c: targetCell.c, type: SpecialType.PARASITE, shape: ShapeType.NONE };
        score += 40; // Parasite Bonus
      } else if (width >= 3 && height >= 3) {
        const intersection = cells.find(c => (rowCounts.get(c.r) || 0) >= 3 && (colCounts.get(c.c) || 0) >= 3);
        if (intersection) targetCell = intersection;
        specialCreation = { r: targetCell.r, c: targetCell.c, type: SpecialType.BOMB, shape };
        score += 30; // Bomb Bonus
      } else if (width === 4 || height === 4) {
        if (width === 4) targetCell = cells.find(c => c.c === minC + 1 || c.c === minC + 2) || cells[0];
        else targetCell = cells.find(c => c.r === minR + 1 || c.r === minR + 2) || cells[0];
        specialCreation = { r: targetCell.r, c: targetCell.c, type: SpecialType.PULSAR, shape };
        score += 20; // Pulsar Bonus
      } else if (width >= 2 && height >= 2) {
        targetCell = cells[0];
        specialCreation = { r: targetCell.r, c: targetCell.c, type: SpecialType.MISSILE, shape };
        score += 20; // Missile Bonus
      }

      processedMatches.push({ cells, specialCreation, score });
    });

    return processedMatches;
  }

  public removeCells(cells: { r: number, c: number }[]) {
    cells.forEach(cell => {
      this.grid[cell.r][cell.c] = null;
    });
  }

  public applyGravity(): { drops: { r: number, c: number, newR: number }[], newCells: { r: number, c: number, shape: ShapeType }[] } {
    const drops: { r: number, c: number, newR: number }[] = [];
    const newCells: { r: number, c: number, shape: ShapeType }[] = [];
    
    const registry = GemRegistry.getInstance();
    const normalGems = registry.getNormalGems();
    let shapes: ShapeType[] = [];
    
    if (normalGems.length > 0) {
      shapes = normalGems.map(g => ShapeType[g.shape as keyof typeof ShapeType]).filter(s => s !== undefined);
    } else {
      shapes = Object.values(ShapeType).filter(s => s !== ShapeType.NONE);
    }

    for (let c = 0; c < this.gridSize; c++) {
      let emptyCount = 0;
      for (let r = this.gridSize - 1; r >= 0; r--) {
        if (this.grid[r][c] === null) {
          emptyCount++;
        } else if (emptyCount > 0) {
          const newR = r + emptyCount;
          this.grid[newR][c] = this.grid[r][c];
          this.grid[newR][c]!.r = newR;
          this.grid[r][c] = null;
          drops.push({ r, c, newR });
        }
      }

      for (let i = 0; i < emptyCount; i++) {
        const r = emptyCount - 1 - i;
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        this.grid[r][c] = { r, c, shape, special: SpecialType.NONE };
        newCells.push({ r, c, shape });
      }
    }

    return { drops, newCells };
  }

  public hasPossibleMoves(): boolean {
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const cell = this.grid[r][c];
        if (cell && cell.special === SpecialType.PARASITE) {
            // A parasite can be swapped with any adjacent gem, so there's always a move
            return true;
        }
        
        // Check horizontal swap
        if (c < this.gridSize - 1) {
          const rightCell = this.grid[r][c + 1];
          if (cell && rightCell && cell.special !== SpecialType.NONE && rightCell.special !== SpecialType.NONE) {
              return true; // Special + Special combo is always valid
          }
          this.swap(r, c, r, c + 1);
          const matches = this.findMatches();
          this.swap(r, c, r, c + 1);
          if (matches.length > 0) return true;
        }
        // Check vertical swap
        if (r < this.gridSize - 1) {
          const bottomCell = this.grid[r + 1][c];
          if (cell && bottomCell && cell.special !== SpecialType.NONE && bottomCell.special !== SpecialType.NONE) {
              return true; // Special + Special combo is always valid
          }
          this.swap(r, c, r + 1, c);
          const matches = this.findMatches();
          this.swap(r, c, r + 1, c);
          if (matches.length > 0) return true;
        }
      }
    }
    return false;
  }

  public shuffleBoard(): { r: number, c: number, shape: ShapeType, special: SpecialType }[] {
    let cells: { shape: ShapeType, special: SpecialType }[] = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.grid[r][c]) {
          cells.push({ shape: this.grid[r][c]!.shape, special: this.grid[r][c]!.special });
        }
      }
    }

    let validBoardFound = false;
    const maxAttempts = 100;
    let attempts = 0;

    while (!validBoardFound && attempts < maxAttempts) {
      attempts++;
      
      // Fisher-Yates shuffle
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = cells[i];
        cells[i] = cells[j];
        cells[j] = temp;
      }

      let i = 0;
      for (let r = 0; r < this.gridSize; r++) {
        for (let c = 0; c < this.gridSize; c++) {
          const cell = cells[i++];
          this.grid[r][c] = { r, c, shape: cell.shape, special: cell.special };
        }
      }

      // Resolve any matches created by shuffling
      let matches = this.findMatches();
      let resolveAttempts = 0;
      while (matches.length > 0 && resolveAttempts < 50) {
        resolveAttempts++;
        for (const match of matches) {
          for (const cell of match.cells) {
            if (this.grid[cell.r][cell.c]?.special === SpecialType.NONE) {
              const registry = GemRegistry.getInstance();
              const normalGems = registry.getNormalGems();
              let shapes: ShapeType[] = [];
              
              if (normalGems.length > 0) {
                shapes = normalGems.map(g => ShapeType[g.shape as keyof typeof ShapeType]).filter(s => s !== undefined);
              } else {
                shapes = Object.values(ShapeType).filter(s => s !== ShapeType.NONE);
              }
              this.grid[cell.r][cell.c]!.shape = shapes[Math.floor(Math.random() * shapes.length)];
            }
          }
        }
        matches = this.findMatches();
      }

      if (this.hasPossibleMoves()) {
        validBoardFound = true;
      }
    }

    // If we still couldn't find a valid board, just generate a completely new one
    if (!validBoardFound) {
      this.initializeGrid();
    }

    const updates: { r: number, c: number, shape: ShapeType, special: SpecialType }[] = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        updates.push({ r, c, shape: this.grid[r][c]!.shape, special: this.grid[r][c]!.special });
      }
    }

    return updates;
  }
}
