import { SpecialType, ShapeType, LogicCell } from './GameLogic';
import { GemRegistry } from './GemRegistry';
import { ActionProcessor } from './ActionProcessor';

export interface IEffectDelegate {
    playPulsarVisual(r: number, c: number, isHorizontal: boolean, isVertical: boolean, width: number): void;
    playBombVisual(r: number, c: number, radius: number): void;
    playParasiteVisual(r: number, c: number, targetShape: ShapeType, targetCells: {r: number, c: number}[]): Promise<void>;
    playParasiteVortex(r: number, c: number, scale: number, duration: number): Promise<void>;
    playMissileVisual(r: number, c: number, targetR: number, targetC: number): Promise<void>;
    shakeCamera(duration: number, intensity: number): void;
    destroyCell(r: number, c: number, isSpecial: boolean, spawnParticles?: boolean): Promise<void>;
    getGridSize(): number;
    getGrid(): (LogicCell | null)[][];
}

export class EffectManager {
    private actionProcessor: ActionProcessor;

    constructor(private delegate: IEffectDelegate) {
        this.actionProcessor = new ActionProcessor(delegate);
    }

    public async activateSpecial(cell: LogicCell) {
        const registry = GemRegistry.getInstance();
        const specialGems = registry.getSpecialGems();
        
        // Find the gem definition for this special type
        const gemDef = specialGems.find(g => g.specialType?.toLowerCase() === cell.special.toLowerCase());
        
        if (gemDef && gemDef.actions) {
            let context: any = {};
            
            // For parasite, we need to determine the target shape if it's random
            if (cell.special === SpecialType.PARASITE) {
                let targetShape = cell.shape;
                if (targetShape === ShapeType.NONE) {
                    const normalGems = registry.getNormalGems();
                    let shapes: ShapeType[] = [];
                    if (normalGems.length > 0) {
                        shapes = normalGems.map(g => ShapeType[g.shape as keyof typeof ShapeType]).filter(s => s !== undefined);
                    } else {
                        shapes = Object.values(ShapeType).filter(s => s !== ShapeType.NONE);
                    }
                    targetShape = shapes[Math.floor(Math.random() * shapes.length)];
                }
                context.targetShape = targetShape;
            }

            await this.actionProcessor.process(gemDef.actions, cell.r, cell.c, context);
        }
    }

    public async handleSpecialCombination(cell1: LogicCell, cell2: LogicCell, targetR: number, targetC: number) {
        const types = [cell1.special, cell2.special];
        let actions: any[] = [];
        
        if (types.includes(SpecialType.PULSAR) && types.includes(SpecialType.BOMB)) {
            actions = [
                { action: 'PLAY_VFX', id: 'pulsar_beam', isCross: true, width: 3 },
                { action: 'DAMAGE_LINE', isCross: true, width: 3 }
            ];
        } else if (types[0] === SpecialType.BOMB && types[1] === SpecialType.BOMB) {
            actions = [
                { action: 'PLAY_VFX', id: 'explosion', radius: 4 },
                { action: 'DAMAGE_AREA', radius: 4 }
            ];
        } else if (types[0] === SpecialType.PULSAR && types[1] === SpecialType.PULSAR) {
            actions = [
                { action: 'PLAY_VFX', id: 'pulsar_beam', isCross: true, width: 1 },
                { action: 'DAMAGE_LINE', isCross: true, width: 1 }
            ];
        } else if (types[0] === SpecialType.MISSILE && types[1] === SpecialType.MISSILE) {
            actions = [
                { action: 'SPAWN_PROJECTILES', count: 7, impactActions: [
                    { action: 'DAMAGE_AREA', radius: 0 }
                ]}
            ];
        } else if (types.includes(SpecialType.MISSILE) && types.includes(SpecialType.BOMB)) {
            actions = [
                { action: 'SPAWN_PROJECTILES', count: 3, impactActions: [
                    { action: 'PLAY_VFX', id: 'explosion', radius: 2 },
                    { action: 'DAMAGE_AREA', radius: 2 }
                ]}
            ];
        } else if (types.includes(SpecialType.MISSILE) && types.includes(SpecialType.PULSAR)) {
            actions = [
                { action: 'SPAWN_PROJECTILES', count: 3, impactActions: [
                    { action: 'PLAY_VFX', id: 'pulsar_beam', isCross: true, width: 1 },
                    { action: 'DAMAGE_LINE', isCross: true, width: 1 }
                ]}
            ];
        }
        
        if (actions.length > 0) {
            await this.actionProcessor.process(actions, targetR, targetC);
        }
        
        await this.delegate.destroyCell(cell1.r, cell1.c, false);
        await this.delegate.destroyCell(cell2.r, cell2.c, false);
    }

    public async handleParasiteCombination(parasite: LogicCell, other: LogicCell, targetR: number, targetC: number) {
        if (other.special === SpecialType.PARASITE) {
            await this.delegate.playParasiteVortex(targetR, targetC, 10, 1000);
            this.delegate.shakeCamera(1000, 0.05);

            const gridSize = this.delegate.getGridSize();
            const maxDist = Math.ceil(Math.sqrt(gridSize * gridSize + gridSize * gridSize));
            
            // Group cells by distance from the target
            const cellsByDist: { r: number, c: number }[][] = Array.from({ length: maxDist + 1 }, () => []);
            
            for (let i = 0; i < gridSize; i++) {
                for (let j = 0; j < gridSize; j++) {
                    const dist = Math.round(Math.sqrt(Math.pow(i - targetR, 2) + Math.pow(j - targetC, 2)));
                    if (dist <= maxDist) {
                        cellsByDist[dist].push({ r: i, c: j });
                    }
                }
            }

            // Destroy cells in a wave
            for (let dist = 0; dist <= maxDist; dist++) {
                const cells = cellsByDist[dist];
                if (cells.length > 0) {
                    const promises = cells.map(cell => this.delegate.destroyCell(cell.r, cell.c, false, true));
                    await Promise.all(promises);
                    await new Promise(resolve => setTimeout(resolve, 50)); // Delay between waves
                }
            }
        } else if (other.special === SpecialType.MISSILE || other.special === SpecialType.PULSAR || other.special === SpecialType.BOMB) {
            const actions = [
                { action: 'TARGET_SHAPE', shape: other.shape, impactActions: [
                    { action: 'TRANSFORM_AND_ACTIVATE', specialType: other.special }
                ]}
            ];
            await this.actionProcessor.process(actions, targetR, targetC);
        } else {
            const actions = [
                { action: 'TARGET_SHAPE', shape: other.shape, impactActions: [
                    { action: 'DAMAGE_AREA', radius: 0 }
                ]}
            ];
            await this.actionProcessor.process(actions, targetR, targetC);
        }
        await this.delegate.destroyCell(parasite.r, parasite.c, false);
        await this.delegate.destroyCell(other.r, other.c, false);
    }
}
