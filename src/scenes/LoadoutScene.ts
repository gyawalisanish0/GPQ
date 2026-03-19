import Phaser from 'phaser';
import { CombatRegistry } from '../engine/CombatRegistry';
import { SkillData, SkillType } from '../entities/Skill';
import { CharacterData } from '../entities/Character';
import { BaseScene } from './BaseScene';

export class LoadoutScene extends BaseScene {
    private charId!: string;
    private charData!: CharacterData;
    private availableSkills: SkillData[] = [];
    private loadout: {
        passive: string | null;
        active: string | null;
        stacks: string[];
    } = { passive: null, active: null, stacks: [] };

    private uiContainer!: Phaser.GameObjects.Container;
    private leftPane!: Phaser.GameObjects.Container;
    private rightPane!: Phaser.GameObjects.Container;
    private scrollContainer!: Phaser.GameObjects.Container;
    
    private skillCards: Map<string, Phaser.GameObjects.Container> = new Map();
    private slotContainers: Map<string, Phaser.GameObjects.Container> = new Map();

    private targetScrollY: number = 0;
    private currentScrollY: number = 0;
    private maxScroll: number = 0;

    // FIX: Store the initial Y offset of scrollContainer so update() can apply
    // scrolling on top of it. Without this, removing scrollViewport would collapse
    // all content to y=0 inside rightPane.
    private scrollBaseY: number = 0;

    // FIX: Drag scroll state — wheel-only scroll breaks on touch devices.
    private isDraggingScroll: boolean = false;
    private dragLastY: number = 0;
    // Bounds of the scrollable area in screen space so drag only activates inside it.
    private scrollAreaLeft: number = 0;
    private scrollAreaTop: number = 0;

    constructor() {
        super('LoadoutScene');
    }

    protected onInit(data: { charId: string }) {
        this.charId = data.charId;
        const registry = CombatRegistry.getInstance();
        const char = registry.getCharacterData(this.charId);
        if (char) {
            this.charData = char;
            this.availableSkills = char.unlockedSkills
                .map(id => registry.getSkillData(id))
                .filter((s): s is SkillData => s !== null);
            
            const passives = this.availableSkills.filter(s => s.type === SkillType.PASSIVE);
            const defaultPassive = passives.length > 0 ? passives[0].id : null;

            this.loadout = {
                passive: char.loadout.passive || defaultPassive,
                active: char.loadout.active || null,
                stacks: char.loadout.stacks ? [...char.loadout.stacks] : []
            };
        }
    }

    create() {
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.input.off('wheel');
            this.input.off('pointerdown');
            this.input.off('pointermove');
            this.input.off('pointerup');
        });

        // FIX: Normalise wheel deltaY across the three deltaMode values browsers can report:
        //   DOM_DELTA_PIXEL = 0  → raw pixels, use as-is with a small multiplier
        //   DOM_DELTA_LINE  = 1  → line units (~20px each), multiply by 20
        //   DOM_DELTA_PAGE  = 2  → page units (~600px each), multiply by 600
        // The original code used a flat 0.8 multiplier which made line-mode scroll
        // imperceptibly slow and page-mode scroll impossibly fast.
        this.input.on('wheel',
            (pointer: Phaser.Input.Pointer, _gameObjects: any, _deltaX: number, deltaY: number) => {
                const nativeEvent = pointer.event as WheelEvent;
                let normalised = deltaY;
                if (nativeEvent && nativeEvent.deltaMode !== undefined) {
                    if (nativeEvent.deltaMode === 1) normalised = deltaY * 20;   // DOM_DELTA_LINE
                    else if (nativeEvent.deltaMode === 2) normalised = deltaY * 600; // DOM_DELTA_PAGE
                }
                this.targetScrollY -= normalised * 0.8;
                this.targetScrollY = Phaser.Math.Clamp(this.targetScrollY, -this.maxScroll, 0);
            }
        );

        // FIX: Add drag/touch scrolling. The scene's pointerdown fires before any
        // child interactive objects consume the event, so we track start Y here and
        // apply delta in pointermove. We only activate drag when the pointer is
        // inside the right-pane scroll area (set in buildRightPane).
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.x >= this.scrollAreaLeft && pointer.y >= this.scrollAreaTop) {
                this.isDraggingScroll = true;
                this.dragLastY = pointer.y;
            }
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!this.isDraggingScroll || !pointer.isDown) return;
            const delta = pointer.y - this.dragLastY;
            this.dragLastY = pointer.y;
            // Only treat as scroll drag if the pointer moved more than 4px
            // (avoids fighting with skill card click handlers on subtle jitter).
            if (Math.abs(delta) > 4) {
                this.targetScrollY += delta;
                this.targetScrollY = Phaser.Math.Clamp(this.targetScrollY, -this.maxScroll, 0);
            }
        });

        this.input.on('pointerup', () => {
            this.isDraggingScroll = false;
        });

        this.buildUI();
    }

    update(_time: number, _delta: number) {
        if (this.scrollContainer) {
            this.currentScrollY += (this.targetScrollY - this.currentScrollY) * 0.15;
            // FIX: Add scrollBaseY so the container sits at the correct initial vertical
            // position within rightPane. The original code only used currentScrollY which
            // meant the container started at y=0 after scrollViewport was removed.
            this.scrollContainer.y = this.scrollBaseY + this.currentScrollY;
        }
    }

    protected onResize() {
        this.buildUI();
    }

    private buildUI() {
        if (this.uiContainer) this.uiContainer.destroy();
        this.skillCards.clear();
        this.slotContainers.clear();
        this.targetScrollY = 0;
        this.currentScrollY = 0;
        this.scrollBaseY = 0;
        this.isDraggingScroll = false;

        this.uiContainer = this.add.container(0, 0);

        const bg = this.add.graphics();
        bg.fillGradientStyle(0x0a0a2a, 0x1a0a3a, 0x0a1a3a, 0x050515, 1, 1, 1, 1);
        bg.fillRect(0, 0, this.gameWidth, this.gameHeight);
        this.uiContainer.add(bg);

        const particles = this.add.particles(0, 0, 'star_particle', {
            x: { min: 0, max: this.gameWidth },
            y: { min: this.gameHeight, max: this.gameHeight + 100 },
            lifespan: 10000,
            speedY: { min: -10, max: -30 },
            scale: { start: 0.5 * this.scaleFactor, end: 0 },
            alpha: { start: 0.3, end: 0 },
            quantity: 1,
            frequency: 200
        });
        this.uiContainer.add(particles);

        const maxUiWidth = 1200 * this.scaleFactor;
        const uiWidth = Math.min(this.gameWidth, maxUiWidth);
        const offsetX = this.getCenteredX(uiWidth);

        const leftWidth = uiWidth * 0.35;
        const rightWidth = uiWidth - leftWidth;
        const portraitSize = Math.min(180 * this.scaleFactor, leftWidth * 0.6);
        const contentHeight = portraitSize + 30 * this.scaleFactor + 35 * this.scaleFactor + 45 * this.scaleFactor + 110 * this.scaleFactor + 30 * this.scaleFactor + 144 * this.scaleFactor + 45 * this.scaleFactor + 100 * this.scaleFactor;
        const padding = 40 * this.scaleFactor;
        const paneHeight = contentHeight + padding * 2;
        const topMargin = (this.gameHeight - paneHeight) / 2;

        this.leftPane = this.add.container(offsetX, 0);
        this.rightPane = this.add.container(offsetX + leftWidth, 0);
        this.uiContainer.add([this.leftPane, this.rightPane]);

        this.buildLeftPane(leftWidth, this.gameHeight, topMargin, paneHeight, this.scaleFactor);
        this.buildRightPane(rightWidth, paneHeight, topMargin, offsetX, leftWidth, this.scaleFactor);

        const backBtn = this.createButton(100 * this.scaleFactor, 50 * this.scaleFactor, 'BACK', () => {
            this.scene.start('LobbyScene', { selectedCharId: this.charId });
        }, 0xef4444, 120 * this.scaleFactor, this.scaleFactor);
        
        const startBtn = this.createButton(this.gameWidth - 120 * this.scaleFactor, this.gameHeight - 50 * this.scaleFactor, 'START BATTLE', () => {
            this.startBattle();
        }, 0x10b981, 200 * this.scaleFactor, this.scaleFactor);

        this.uiContainer.add([backBtn, startBtn]);
        
        this.updateVisuals();
    }

    private buildLeftPane(width: number, _height: number, topMargin: number, paneHeight: number, scaleFactor: number = 1) {
        const portraitSize = Math.min(180 * scaleFactor, width * 0.6);
        const bg = this.add.rectangle(0, topMargin, width, paneHeight, 0x050b14, 0.85)
            .setOrigin(0, 0)
            .setStrokeStyle(2, 0x1e3a8a, 0.5);
        this.leftPane.add(bg);

        const centerX = width / 2;
        const padding = 40 * scaleFactor;
        let currentY = topMargin + padding;

        const frame = this.add.circle(centerX, currentY + portraitSize/2, portraitSize/2 + 4 * scaleFactor, 0x000000, 0.5)
            .setStrokeStyle(3, 0x3b82f6, 0.8);
        this.leftPane.add(frame);

        const portrait = this.add.image(centerX, currentY + portraitSize/2, this.charData.portrait)
            .setDisplaySize(portraitSize, portraitSize * 1.2);
        
        const maskShape = this.make.graphics({ x: 0, y: 0 });
        maskShape.fillStyle(0xffffff);
        maskShape.fillCircle(centerX, currentY + portraitSize/2, portraitSize/2);
        portrait.setMask(maskShape.createGeometryMask());
        
        this.leftPane.add(portrait);
        currentY += portraitSize + 30 * scaleFactor;

        const nameText = this.add.text(centerX, currentY, this.charData.name.toUpperCase(), {
            fontSize: `${Math.floor(36 * scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setShadow(0, 2, '#000000', 4, false, true);
        currentY += 35 * scaleFactor;

        const classText = this.add.text(centerX, currentY, this.charData.classType, {
            fontSize: `${Math.floor(18 * scaleFactor)}px`, fontFamily: 'monospace', color: '#3b82f6', fontStyle: 'bold', letterSpacing: 3 * scaleFactor
        }).setOrigin(0.5).setShadow(0, 1, '#000000', 2, false, true);
        currentY += 45 * scaleFactor;

        const statsBg = this.add.rectangle(centerX, currentY + 30 * scaleFactor, width * 0.85, 80 * scaleFactor, 0x0f172a, 0.8)
            .setStrokeStyle(1, 0x1e293b);
        this.leftPane.add(statsBg);

        const statStyle = { fontSize: `${Math.floor(12 * scaleFactor)}px`, fontFamily: 'monospace', color: '#94a3b8' };
        const valStyle = { fontSize: `${Math.floor(16 * scaleFactor)}px`, fontFamily: 'monospace', color: '#f8fafc', fontStyle: 'bold' };
        
        const stats = [
            { label: 'STR', val: this.charData.stats.strength, x: centerX - 80 * scaleFactor, y: currentY + 10 * scaleFactor },
            { label: 'END', val: this.charData.stats.endurance, x: centerX, y: currentY + 10 * scaleFactor },
            { label: 'PWR', val: this.charData.stats.power, x: centerX + 80 * scaleFactor, y: currentY + 10 * scaleFactor },
            { label: 'RES', val: this.charData.stats.resistance, x: centerX - 80 * scaleFactor, y: currentY + 40 * scaleFactor },
            { label: 'SPD', val: this.charData.stats.speed, x: centerX, y: currentY + 40 * scaleFactor },
            { label: 'ACC', val: this.charData.stats.accuracy, x: centerX + 80 * scaleFactor, y: currentY + 40 * scaleFactor },
        ];

        stats.forEach(s => {
            this.leftPane.add(this.add.text(s.x - 15 * scaleFactor, s.y, s.label, statStyle).setOrigin(1, 0.5));
            this.leftPane.add(this.add.text(s.x - 5 * scaleFactor, s.y, s.val.toString(), valStyle).setOrigin(0, 0.5));
        });
        
        this.leftPane.add([nameText, classText]);
        currentY += 100 * scaleFactor;

        const loadoutTitle = this.add.text(centerX, currentY, 'CURRENT LOADOUT', {
            fontSize: `${Math.floor(14 * scaleFactor)}px`, fontFamily: 'monospace', color: '#94a3b8', fontStyle: 'bold', letterSpacing: 2 * scaleFactor
        }).setOrigin(0.5);
        this.leftPane.add(loadoutTitle);
        currentY += 30 * scaleFactor;

        this.createSlot(centerX, currentY, 'PASSIVE', 'passive', width * 0.8, scaleFactor);
        currentY += 72 * scaleFactor;
        this.createSlot(centerX, currentY, 'ULTIMATE', 'active', width * 0.8, scaleFactor);
        currentY += 72 * scaleFactor;
        
        const stackWidth = (width * 0.8 - 20 * scaleFactor) / 3;
        const stackSpacing = stackWidth + 10 * scaleFactor;
        this.createSlot(centerX - stackSpacing, currentY, 'STACK 1', 'stack_0', stackWidth, scaleFactor);
        this.createSlot(centerX, currentY, 'STACK 2', 'stack_1', stackWidth, scaleFactor);
        this.createSlot(centerX + stackSpacing, currentY, 'STACK 3', 'stack_2', stackWidth, scaleFactor);
    }

    private createSlot(x: number, y: number, label: string, id: string, width: number, scaleFactor: number = 1) {
        const container = this.add.container(x, y);
        
        const bg = this.add.rectangle(0, 0, width, 45 * scaleFactor, 0x0f172a, 1)
            .setStrokeStyle(1, 0x1e293b);
        
        const titleText = this.add.text(0, -32 * scaleFactor, label, {
            fontSize: `${Math.floor(11 * scaleFactor)}px`, fontFamily: 'monospace', color: '#64748b', fontStyle: 'bold', letterSpacing: 1 * scaleFactor
        }).setOrigin(0.5);

        const valueText = this.add.text(0, 0, 'EMPTY', {
            fontSize: `${Math.floor(13 * scaleFactor)}px`, fontFamily: 'monospace', color: '#475569', fontStyle: 'bold'
        }).setOrigin(0.5);

        container.add([bg, titleText, valueText]);
        this.leftPane.add(container);
        this.slotContainers.set(id, container);
    }

    private buildRightPane(width: number, paneHeight: number, topMargin: number, offsetX: number, leftWidth: number, scaleFactor: number = 1) {
        const headerHeight = 80 * scaleFactor;
        const footerHeight = 20 * scaleFactor;
        
        const title = this.add.text(40 * scaleFactor, topMargin + 50 * scaleFactor, 'ARMORY', {
            fontSize: `${Math.floor(32 * scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold', letterSpacing: 4 * scaleFactor
        }).setOrigin(0, 0.5).setShadow(0, 2, '#3b82f6', 10, false, true);
        
        const titleUnderline = this.add.rectangle(40 * scaleFactor, topMargin + 70 * scaleFactor, 120 * scaleFactor, 2 * scaleFactor, 0x3b82f6).setOrigin(0, 0.5);
        this.rightPane.add([title, titleUnderline]);

        // FIX: Remove the scrollViewport middleman. scrollContainer is now placed
        // directly in rightPane at the correct initial Y position (topMargin + headerHeight).
        // Previously: rightPane → scrollViewport (mask here) → scrollContainer (moves)
        // Now:        rightPane → scrollContainer (mask here, also moves)
        //
        // Applying the GeometryMask to a nested child Container in Phaser 3 is unreliable
        // — the mask may not propagate through two container levels. Placing the mask on
        // the SAME object whose children we want clipped (scrollContainer) guarantees it works.
        this.scrollBaseY = topMargin + headerHeight;
        this.scrollContainer = this.add.container(0, this.scrollBaseY);
        this.rightPane.add(this.scrollContainer);

        // Store the left edge and top edge of the scrollable area in SCENE space
        // (not container-local) so the drag handler knows when the pointer is inside it.
        this.scrollAreaLeft = offsetX + leftWidth;
        this.scrollAreaTop  = topMargin + headerHeight;

        let currentY = 10 * scaleFactor;

        const passives = this.availableSkills.filter(s => s.type === SkillType.PASSIVE);
        const actives  = this.availableSkills.filter(s => s.type === SkillType.ACTIVE);
        const stacks   = this.availableSkills.filter(s => s.type === SkillType.STACK);

        currentY = this.renderSkillSection(currentY, width, 'PASSIVE ABILITIES', passives, scaleFactor);
        currentY = this.renderSkillSection(currentY, width, 'ULTIMATE PROTOCOLS', actives, scaleFactor);
        currentY = this.renderSkillSection(currentY, width, 'TACTICAL STACKS', stacks, scaleFactor);

        const maskHeight = paneHeight - headerHeight - footerHeight;
        this.maxScroll = Math.max(0, currentY - maskHeight);

        // FIX: Apply the geometry mask DIRECTLY to scrollContainer (not to a parent wrapper).
        // The mask rect is drawn at the world-space position of the scrollable area so it
        // clips content that travels outside the viewport when scrollContainer.y changes.
        // Because GeometryMask coordinates are in screen/world space (not container-local),
        // we use: offsetX + leftWidth = world X where rightPane starts.
        const maskShape = this.make.graphics({ x: 0, y: 0 });
        maskShape.fillStyle(0xffffff);
        maskShape.fillRect(offsetX + leftWidth, topMargin + headerHeight, width, maskHeight);
        this.scrollContainer.setMask(maskShape.createGeometryMask());
    }

    private renderSkillSection(y: number, paneWidth: number, title: string, skills: SkillData[], scaleFactor: number = 1): number {
        if (skills.length === 0) return y;

        const sectionTitle = this.add.text(40 * scaleFactor, y, title, {
            fontSize: `${Math.floor(16 * scaleFactor)}px`, fontFamily: 'monospace', color: '#3b82f6', fontStyle: 'bold', letterSpacing: 2 * scaleFactor
        }).setShadow(0, 1, '#000000', 2, false, true);
        this.scrollContainer.add(sectionTitle);

        const cardWidth  = 240 * scaleFactor;
        const cardHeight = 140 * scaleFactor;
        const spacing    = 25 * scaleFactor;
        const maxCols    = 2;

        const gridWidth = (cardWidth * maxCols) + (spacing * (maxCols - 1));
        const startX    = (paneWidth - gridWidth) / 2 + (cardWidth / 2);
        
        let maxRow = -1;

        skills.forEach((skill, i) => {
            const col = i % maxCols;
            const row = Math.floor(i / maxCols);
            maxRow = Math.max(maxRow, row);

            const cardX = startX + col * (cardWidth + spacing);
            const cardY = y + 30 * scaleFactor + row * (cardHeight + spacing) + cardHeight / 2;

            const container = this.add.container(cardX, cardY);
            this.scrollContainer.add(container);
            container.setData('skill', skill);
            container.setData('hovered', false);

            const bg = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x0f172a, 0.9)
                .setStrokeStyle(1, 0x1e293b);
                
            const glow = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x3b82f6, 0)
                .setStrokeStyle(3, 0x3b82f6);
            glow.setAlpha(0);

            if (skill.type !== SkillType.PASSIVE) {
                bg.setInteractive({ useHandCursor: true });
                bg.on('pointerdown', () => this.toggleSkill(skill));
                bg.on('pointerover', () => {
                    container.setData('hovered', true);
                    this.updateVisuals();
                });
                bg.on('pointerout', () => {
                    container.setData('hovered', false);
                    this.updateVisuals();
                });
            }

            const iconSize = 40 * scaleFactor;
            const icon = this.add.image(-cardWidth/2 + 30 * scaleFactor, -cardHeight/2 + 30 * scaleFactor, skill.icon)
                .setDisplaySize(iconSize, iconSize);
            
            const name = this.add.text(-cardWidth/2 + 60 * scaleFactor, -cardHeight/2 + 30 * scaleFactor, skill.name, {
                fontSize: `${Math.floor(15 * scaleFactor)}px`, fontFamily: 'monospace', color: '#f8fafc', fontStyle: 'bold'
            }).setOrigin(0, 0.5);

            const costBg = this.add.rectangle(cardWidth/2 - 25 * scaleFactor, -cardHeight/2 + 30 * scaleFactor, 30 * scaleFactor, 20 * scaleFactor, 0x000000, 0.6).setStrokeStyle(1, 0x333333);
            const cost = this.add.text(cardWidth/2 - 25 * scaleFactor, -cardHeight/2 + 30 * scaleFactor, `${skill.chargeCost}`, {
                fontSize: `${Math.floor(12 * scaleFactor)}px`, fontFamily: 'monospace', color: '#fbbf24', fontStyle: 'bold'
            }).setOrigin(0.5);

            const desc = this.add.text(0, 15 * scaleFactor, skill.description, {
                fontSize: `${Math.floor(11 * scaleFactor)}px`, fontFamily: 'monospace', color: '#94a3b8', align: 'left', wordWrap: { width: cardWidth - 40 * scaleFactor }
            }).setOrigin(0.5, 0);

            const equippedBg   = this.add.rectangle(0, cardHeight/2 - 12 * scaleFactor, 80 * scaleFactor, 16 * scaleFactor, 0x10b981, 1);
            const equippedText = this.add.text(0, cardHeight/2 - 12 * scaleFactor, 'EQUIPPED', {
                fontSize: `${Math.floor(10 * scaleFactor)}px`, fontFamily: 'monospace', color: '#000000', fontStyle: 'bold'
            }).setOrigin(0.5);
            const equippedBadge = this.add.container(0, 0, [equippedBg, equippedText]).setAlpha(0);
            container.setData('equippedBadge', equippedBadge);

            container.add([bg, glow, icon, name, costBg, cost, desc, equippedBadge]);
            this.skillCards.set(skill.id, container);
        });

        return y + 50 * scaleFactor + (maxRow + 1) * (cardHeight + spacing) + 30 * scaleFactor;
    }

    private toggleSkill(skill: SkillData) {
        if (skill.type === SkillType.PASSIVE) return;
        
        if (skill.type === SkillType.ACTIVE) {
            this.loadout.active = this.loadout.active === skill.id ? null : skill.id;
        } else if (skill.type === SkillType.STACK) {
            if (this.loadout.stacks.includes(skill.id)) {
                this.loadout.stacks = this.loadout.stacks.filter(id => id !== skill.id);
            } else if (this.loadout.stacks.length < 3) {
                this.loadout.stacks.push(skill.id);
            } else {
                this.flashStackSlots();
                return;
            }
        }
        this.updateVisuals();
    }

    private flashStackSlots() {
        this.cameras.main.shake(100, 0.005);
        ['stack_0', 'stack_1', 'stack_2'].forEach(id => {
            const container = this.slotContainers.get(id);
            if (container) {
                const bg = container.list[0] as Phaser.GameObjects.Rectangle;
                this.tweens.add({
                    targets: bg,
                    fillColor: 0xef4444,
                    duration: 100,
                    yoyo: true,
                    repeat: 1,
                    onComplete: () => bg.setFillStyle(0x1a1a1a, 1)
                });
            }
        });
    }

    private isSkillSelected(id: string): boolean {
        return this.loadout.passive === id || this.loadout.active === id || this.loadout.stacks.includes(id);
    }

    private updateVisuals() {
        this.skillCards.forEach((container, id) => {
            const bg   = container.list[0] as Phaser.GameObjects.Rectangle;
            const glow = container.list[1] as Phaser.GameObjects.Rectangle;
            const equippedBadge = container.getData('equippedBadge') as Phaser.GameObjects.Container;
            const isSelected = this.isSkillSelected(id);
            const isHovered  = container.getData('hovered');

            const tweens = this.tweens.getTweensOf(container);
            tweens.forEach(t => {
                if (t.data && t.data.some((d: any) => d.key === 'scaleX' || d.key === 'scaleY' || d.key === 'scale')) {
                    t.stop();
                }
            });

            let targetGlowAlpha = 0;
            if (isSelected) {
                bg.setStrokeStyle(2, 0x10b981);
                bg.setFillStyle(0x064e3b, 0.4);
                targetGlowAlpha = 0.8;
                equippedBadge.setAlpha(1);
            } else if (isHovered) {
                bg.setStrokeStyle(2, 0x3b82f6);
                bg.setFillStyle(0x1e293b, 1);
                targetGlowAlpha = 0.4;
                equippedBadge.setAlpha(0);
            } else {
                bg.setStrokeStyle(1, 0x1e293b);
                bg.setFillStyle(0x0f172a, 0.9);
                targetGlowAlpha = 0;
                equippedBadge.setAlpha(0);
            }

            this.tweens.add({ targets: glow, alpha: targetGlowAlpha, duration: 200 });
            const targetScale = (isSelected || isHovered) ? 1.03 : 1;
            this.tweens.add({ targets: container, scaleX: targetScale, scaleY: targetScale, duration: 200 });
        });

        const updateSlot = (id: string, skillId: string | null) => {
            const container = this.slotContainers.get(id);
            if (!container) return;
            const bg   = container.list[0] as Phaser.GameObjects.Rectangle;
            const text = container.list[2] as Phaser.GameObjects.Text;
            
            if (skillId) {
                const skill = this.availableSkills.find(s => s.id === skillId);
                text.setText(skill ? skill.name.toUpperCase() : 'UNKNOWN');
                text.setColor('#10b981');
                bg.setStrokeStyle(1, 0x10b981);
                bg.setFillStyle(0x064e3b, 0.3);
            } else {
                text.setText('EMPTY');
                text.setColor('#475569');
                bg.setStrokeStyle(1, 0x1e293b);
                bg.setFillStyle(0x0f172a, 1);
            }
        };

        updateSlot('passive', this.loadout.passive);
        updateSlot('active',  this.loadout.active);
        updateSlot('stack_0', this.loadout.stacks[0] || null);
        updateSlot('stack_1', this.loadout.stacks[1] || null);
        updateSlot('stack_2', this.loadout.stacks[2] || null);
    }

    private startBattle() {
        if (!this.loadout.active) {
            this.cameras.main.shake(100, 0.01);
            const activeSlot = this.slotContainers.get('active');
            if (activeSlot) {
                const bg = activeSlot.list[0] as Phaser.GameObjects.Rectangle;
                this.tweens.add({
                    targets: bg,
                    fillColor: 0xef4444,
                    duration: 100,
                    yoyo: true,
                    repeat: 2,
                    onComplete: () => this.updateVisuals()
                });
            }
            return;
        }

        const registry = CombatRegistry.getInstance();
        const char = registry.getCharacterData(this.charId);
        if (char) {
            char.loadout = {
                passive: this.loadout.passive,
                active:  this.loadout.active,
                stacks:  this.loadout.stacks
            };
        }

        const opponents = ['warrior', 'mage', 'rogue', 'paladin'];
        const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
        this.scene.start('Game_Scene', { userCharId: this.charId, opponentCharId: randomOpponent });
    }

    private createButton(x: number, y: number, label: string, callback: () => void, color: number, width: number = 160, scaleFactor: number = 1) {
        const container = this.add.container(x, y);
        
        const bg = this.add.rectangle(0, 0, width, 50 * scaleFactor, color, 0.9)
            .setStrokeStyle(2, 0xffffff, 0.5)
            .setInteractive({ useHandCursor: true });
            
        const glow = this.add.rectangle(0, 0, width, 50 * scaleFactor, color, 0)
            .setStrokeStyle(4, color, 0.8);
        glow.setAlpha(0);

        const text = this.add.text(0, 0, label, {
            fontSize: `${Math.floor(18 * scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold', letterSpacing: 2 * scaleFactor
        }).setOrigin(0.5).setShadow(0, 2, '#000000', 4, false, true);

        container.add([bg, glow, text]);

        bg.on('pointerdown', () => {
            this.tweens.add({ targets: container, scaleX: 0.95, scaleY: 0.95, duration: 50, yoyo: true });
            callback();
        });
        bg.on('pointerover', () => {
            bg.setFillStyle(color, 1);
            this.tweens.add({ targets: glow, alpha: 1, duration: 200 });
            this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 200 });
        });
        bg.on('pointerout', () => {
            bg.setFillStyle(color, 0.9);
            this.tweens.add({ targets: glow, alpha: 0, duration: 200 });
            this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 200 });
        });

        return container;
    }
}
