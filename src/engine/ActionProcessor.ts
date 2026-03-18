import { IEffectDelegate } from './EffectManager';
import { ShapeType, SpecialType } from './GameLogic';
import { GemRegistry } from './GemRegistry';

export interface GameAction {
    action: string;
    [key: string]: any;
}

export class ActionProcessor {
    constructor(private delegate: IEffectDelegate) {}

    public async process(actions: GameAction[], r: number, c: number, context: any = {}) {
        const promises: Promise<void>[] = [];
        for (const action of actions) {
            promises.push(this.executeAction(action, r, c, context));
        }
        await Promise.all(promises);
    }

    private async executeAction(action: GameAction, r: number, c: number, context: any): Promise<void> {
        const gridSize = this.delegate.getGridSize();
        
        switch (action.action) {
            case 'DAMAGE_AREA': {
                const radius = action.radius || 0;
                const promises: Promise<void>[] = [];
                for (let i = r - radius; i <= r + radius; i++) {
                    for (let j = c - radius; j <= c + radius; j++) {
                        if (i >= 0 && i < gridSize && j >= 0 && j < gridSize) {
                            const dist = Math.sqrt(Math.pow(i - r, 2) + Math.pow(j - c, 2));
                            if (dist <= radius) {
                                promises.push(this.delegate.destroyCell(i, j, true));
                            }
                        }
                    }
                }
                await Promise.all(promises);
                break;
            }
            case 'PLAY_VFX': {
                if (action.id === 'explosion') {
                    const radius = action.radius || 2;
                    this.delegate.playBombVisual(r, c, radius);
                    this.delegate.shakeCamera(300, 0.015 * radius);
                } else if (action.id === 'pulsar_beam') {
                    const isCross = action.isCross || false;
                    const width = action.width || 1;
                    const isHorizontal = context.isHorizontal !== undefined ? context.isHorizontal : Math.random() > 0.5;
                    context.isHorizontal = isHorizontal;
                    this.delegate.playPulsarVisual(r, c, isCross || isHorizontal, isCross || !isHorizontal, width);
                    this.delegate.shakeCamera(200, 0.02 * width);
                } else if (action.id === 'parasite_infect') {
                    if (context.targetCells && context.targetShape) {
                        await this.delegate.playParasiteVisual(r, c, context.targetShape, context.targetCells);
                    }
                }
                break;
            }
            case 'DAMAGE_LINE': {
                const isCross = action.isCross || false;
                const width = action.width || 1;
                const isHorizontal = context.isHorizontal !== undefined ? context.isHorizontal : Math.random() > 0.5;
                context.isHorizontal = isHorizontal;
                const promises: Promise<void>[] = [];
                const startOffset = Math.floor(width / 2);

                const clearRow = (row: number) => {
                    if (row < 0 || row >= gridSize) return;
                    for (let j = 0; j < gridSize; j++) {
                        promises.push(this.delegate.destroyCell(row, j, true));
                    }
                };

                const clearCol = (col: number) => {
                    if (col < 0 || col >= gridSize) return;
                    for (let i = 0; i < gridSize; i++) {
                        promises.push(this.delegate.destroyCell(i, col, true));
                    }
                };

                if (isCross || isHorizontal) {
                    for (let w = 0; w < width; w++) {
                        clearRow(r - startOffset + w);
                    }
                }
                if (isCross || !isHorizontal) {
                    for (let w = 0; w < width; w++) {
                        clearCol(c - startOffset + w);
                    }
                }
                await Promise.all(promises);
                break;
            }
            case 'SPAWN_PROJECTILES': {
                const count = action.count || 3;
                const impactActions = action.impactActions || [];
                const targets: { r: number; c: number }[] = [];
                for (let i = 0; i < count; i++) {
                    targets.push({
                        r: Math.floor(Math.random() * gridSize),
                        c: Math.floor(Math.random() * gridSize)
                    });
                }
                const promises = targets.map(async (t) => {
                    await this.delegate.playMissileVisual(r, c, t.r, t.c);
                    await this.process(impactActions, t.r, t.c, context);
                });
                await Promise.all(promises);
                break;
            }
            case 'TARGET_SHAPE': {
                let targetShape = context.targetShape || action.shape;
                if (targetShape === 'random' || targetShape === ShapeType.NONE) {
                    const registry = GemRegistry.getInstance();
                    const normalGems = registry.getNormalGems();
                    let shapes: ShapeType[] = [];
                    if (normalGems.length > 0) {
                        shapes = normalGems.map(g => ShapeType[g.shape as keyof typeof ShapeType]).filter(s => s !== undefined);
                    } else {
                        shapes = Object.values(ShapeType).filter(s => s !== ShapeType.NONE);
                    }
                    targetShape = shapes[Math.floor(Math.random() * shapes.length)];
                }

                const grid = this.delegate.getGrid();
                const targetCells: {r: number, c: number}[] = [];
                for (let i = 0; i < gridSize; i++) {
                    for (let j = 0; j < gridSize; j++) {
                        const cell = grid[i][j];
                        if (cell && cell.shape === targetShape && cell.special === SpecialType.NONE) {
                            targetCells.push({r: i, c: j});
                        }
                    }
                }

                // Play visual first
                await this.delegate.playParasiteVisual(r, c, targetShape as ShapeType, targetCells);

                // Then apply impact actions to all targets
                const impactActions = action.impactActions || [];
                const promises = targetCells.map(t => this.process(impactActions, t.r, t.c, context));
                await Promise.all(promises);
                break;
            }
            case 'TRANSFORM_AND_ACTIVATE': {
                const specialType = action.specialType;
                const grid = this.delegate.getGrid();
                const cell = grid[r][c];
                if (cell) {
                    cell.special = specialType as SpecialType;
                    const registry = GemRegistry.getInstance();
                    const specialGems = registry.getSpecialGems();
                    const gemDef = specialGems.find(g => g.specialType?.toLowerCase() === specialType.toLowerCase());
                    if (gemDef && gemDef.actions) {
                        await this.process(gemDef.actions, r, c, context);
                    }
                }
                break;
            }
        }
    }
}
