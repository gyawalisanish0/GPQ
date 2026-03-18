import Phaser from 'phaser';
import { CombatRegistry } from '../engine/CombatRegistry';
import { SkillData, SkillType } from '../entities/Skill';
import { CharacterData } from '../entities/Character';

export class LoadoutScene extends Phaser.Scene {
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

    constructor() {
        super('LoadoutScene');
    }

    init(data: { charId: string }) {
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
        this.scale.on('resize', this.handleResize, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off('resize', this.handleResize, this);
            this.input.off('wheel');
        });

        this.input.on('wheel', (pointer: Phaser.Input.Pointer, gameObjects: any, deltaX: number, deltaY: number) => {
            this.targetScrollY -= deltaY * 0.8;
            this.targetScrollY = Phaser.Math.Clamp(this.targetScrollY, -this.maxScroll, 0);
        });

        this.buildUI();
    }

    update(time: number, delta: number) {
        // Momentum scrolling
        if (this.scrollContainer) {
            this.currentScrollY += (this.targetScrollY - this.currentScrollY) * 0.15;
            this.scrollContainer.y = this.currentScrollY;
        }
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        this.cameras.resize(gameSize.width, gameSize.height);
        this.buildUI();
    }

    private buildUI() {
        if (this.uiContainer) this.uiContainer.destroy();
        this.skillCards.clear();
        this.slotContainers.clear();
        this.targetScrollY = 0;
        this.currentScrollY = 0;

        const { width, height } = this.cameras.main;
        const scaleFactor = Math.min(width / 1080, height / 1920);
        this.uiContainer = this.add.container(0, 0);

        // Background
        const bg = this.add.image(width / 2, height / 2, 'menu_bg').setDisplaySize(width, height).setAlpha(0.15);
        this.uiContainer.add(bg);

        // Layout Dimensions
        const leftWidth = Math.max(350 * scaleFactor, width * 0.35);
        const rightWidth = width - leftWidth;

        this.leftPane = this.add.container(0, 0);
        this.rightPane = this.add.container(leftWidth, 0);
        this.uiContainer.add([this.leftPane, this.rightPane]);

        this.buildLeftPane(leftWidth, height, scaleFactor);
        this.buildRightPane(rightWidth, height, scaleFactor);

        // Global Buttons
        const backBtn = this.createButton(100 * scaleFactor, 50 * scaleFactor, 'BACK', () => {
            this.scene.start('LobbyScene', { selectedCharId: this.charId });
        }, 0xef4444, 120 * scaleFactor, scaleFactor);
        
        const startBtn = this.createButton(width - 120 * scaleFactor, height - 50 * scaleFactor, 'START BATTLE', () => {
            this.startBattle();
        }, 0x10b981, 200 * scaleFactor, scaleFactor);

        this.uiContainer.add([backBtn, startBtn]);
        
        this.updateVisuals();
    }

    private buildLeftPane(width: number, height: number, scaleFactor: number = 1) {
        const topMargin = 240 * scaleFactor;
        const bottomMargin = 540 * scaleFactor;
        const paneHeight = height - topMargin - bottomMargin;

        // Left Pane Background with margins
        const bg = this.add.rectangle(0, topMargin, width, paneHeight, 0x000000, 0.6)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0x333333, 0.3);
        this.leftPane.add(bg);

        const centerX = width / 2;
        let currentY = topMargin + 70 * scaleFactor;

        // Portrait
        const portraitSize = Math.min(180 * scaleFactor, width * 0.6);
        const portrait = this.add.image(centerX, currentY + portraitSize/2, this.charData.portrait)
            .setDisplaySize(portraitSize, portraitSize * 1.2);
        
        // Soft gradient mask for portrait
        const maskShape = this.make.graphics({ x: 0, y: 0 });
        maskShape.fillStyle(0xffffff);
        maskShape.fillRoundedRect(centerX - portraitSize/2, currentY, portraitSize, portraitSize * 1.2, 16 * scaleFactor);
        portrait.setMask(maskShape.createGeometryMask());
        
        this.leftPane.add(portrait);
        currentY += portraitSize * 1.2 + 20 * scaleFactor;

        // Name & Class
        const nameText = this.add.text(centerX, currentY, this.charData.name.toUpperCase(), {
            fontSize: `${Math.floor(32 * scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        currentY += 30 * scaleFactor;

        const classText = this.add.text(centerX, currentY, this.charData.classType, {
            fontSize: `${Math.floor(16 * scaleFactor)}px`, fontFamily: 'monospace', color: '#10b981', fontStyle: 'bold', letterSpacing: 2 * scaleFactor
        }).setOrigin(0.5);
        currentY += 40 * scaleFactor;

        // Stats Grid
        const statsBg = this.add.rectangle(centerX, currentY + 30 * scaleFactor, width * 0.8, 80 * scaleFactor, 0x111111, 0.8).setStrokeStyle(1, 0x333333);
        this.leftPane.add(statsBg);

        const statStyle = { fontSize: `${Math.floor(12 * scaleFactor)}px`, fontFamily: 'monospace', color: '#888888' };
        const valStyle = { fontSize: `${Math.floor(14 * scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' };
        
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

        // Loadout Visualizer
        const loadoutTitle = this.add.text(centerX, currentY, 'CURRENT LOADOUT', {
            fontSize: `${Math.floor(14 * scaleFactor)}px`, fontFamily: 'monospace', color: '#666666', fontStyle: 'bold', letterSpacing: 2 * scaleFactor
        }).setOrigin(0.5);
        this.leftPane.add(loadoutTitle);
        currentY += 30 * scaleFactor;

        // Create Slots
        this.createSlot(centerX, currentY, 'PASSIVE', 'passive', width * 0.8, scaleFactor);
        currentY += 72 * scaleFactor;
        this.createSlot(centerX, currentY, 'ULTIMATE', 'active', width * 0.8, scaleFactor);
        currentY += 72 * scaleFactor;
        
        // 3 Stack Slots in a row
        const stackWidth = (width * 0.8 - 20 * scaleFactor) / 3;
        const stackSpacing = stackWidth + 10 * scaleFactor;
        this.createSlot(centerX - stackSpacing, currentY, 'STACK 1', 'stack_0', stackWidth, scaleFactor);
        this.createSlot(centerX, currentY, 'STACK 2', 'stack_1', stackWidth, scaleFactor);
        this.createSlot(centerX + stackSpacing, currentY, 'STACK 3', 'stack_2', stackWidth, scaleFactor);
    }

    private createSlot(x: number, y: number, label: string, id: string, width: number, scaleFactor: number = 1) {
        const container = this.add.container(x, y);
        
        const bg = this.add.rectangle(0, 0, width, 45 * scaleFactor, 0x1a1a1a, 1)
            .setStrokeStyle(1, 0x333333);
        
        const titleText = this.add.text(0, -32 * scaleFactor, label, {
            fontSize: `${Math.floor(10 * scaleFactor)}px`, fontFamily: 'monospace', color: '#555555'
        }).setOrigin(0.5);

        const valueText = this.add.text(0, 0, 'EMPTY', {
            fontSize: `${Math.floor(12 * scaleFactor)}px`, fontFamily: 'monospace', color: '#444444', fontStyle: 'bold'
        }).setOrigin(0.5);

        container.add([bg, titleText, valueText]);
        this.leftPane.add(container);
        this.slotContainers.set(id, container);
    }

    private buildRightPane(width: number, height: number, scaleFactor: number = 1) {
        const headerHeight = 100 * scaleFactor;
        const footerHeight = 100 * scaleFactor;
        
        // Header Title
        const title = this.add.text(40 * scaleFactor, 50 * scaleFactor, 'ARMORY', {
            fontSize: `${Math.floor(28 * scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold', letterSpacing: 4 * scaleFactor
        }).setOrigin(0, 0.5);
        this.rightPane.add(title);

        this.scrollContainer = this.add.container(0, headerHeight);
        this.rightPane.add(this.scrollContainer);

        // Mask
        const maskShape = this.make.graphics({ x: 0, y: 0 });
        maskShape.fillStyle(0xffffff);
        // The mask needs absolute coordinates
        const leftWidth = this.cameras.main.width - width;
        maskShape.fillRect(leftWidth, headerHeight, width, height - headerHeight - footerHeight);
        this.scrollContainer.setMask(maskShape.createGeometryMask());

        let currentY = 20 * scaleFactor;

        const passives = this.availableSkills.filter(s => s.type === SkillType.PASSIVE);
        const actives = this.availableSkills.filter(s => s.type === SkillType.ACTIVE);
        const stacks = this.availableSkills.filter(s => s.type === SkillType.STACK);

        currentY = this.renderSkillSection(currentY, width, 'PASSIVE ABILITIES', passives, scaleFactor);
        currentY = this.renderSkillSection(currentY, width, 'ULTIMATE PROTOCOLS', actives, scaleFactor);
        currentY = this.renderSkillSection(currentY, width, 'TACTICAL STACKS', stacks, scaleFactor);

        this.maxScroll = Math.max(0, currentY - (height - headerHeight - footerHeight));
    }

    private renderSkillSection(y: number, paneWidth: number, title: string, skills: SkillData[], scaleFactor: number = 1): number {
        if (skills.length === 0) return y;

        const sectionTitle = this.add.text(40 * scaleFactor, y, title, {
            fontSize: `${Math.floor(14 * scaleFactor)}px`, fontFamily: 'monospace', color: '#10b981', fontStyle: 'bold', letterSpacing: 1 * scaleFactor
        });
        this.scrollContainer.add(sectionTitle);

        const cardWidth = 220 * scaleFactor;
        const cardHeight = 130 * scaleFactor;
        const spacing = 20 * scaleFactor;
        const startX = 40 * scaleFactor + cardWidth / 2;
        
        const maxCols = Math.max(1, Math.floor((paneWidth - 80 * scaleFactor) / (cardWidth + spacing)));
        let maxRow = -1;

        skills.forEach((skill, i) => {
            const col = i % maxCols;
            const row = Math.floor(i / maxCols);
            maxRow = Math.max(maxRow, row);

            const cardX = startX + col * (cardWidth + spacing);
            const cardY = y + 50 * scaleFactor + row * (cardHeight + spacing) + cardHeight / 2;

            const container = this.add.container(cardX, cardY);
            this.scrollContainer.add(container);
            container.setData('skill', skill);
            container.setData('hovered', false);

            const bg = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x1a1a1a, 1)
                .setStrokeStyle(2, 0x333333);
                
            const glow = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x10b981, 0)
                .setStrokeStyle(4, 0x10b981);
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

            const name = this.add.text(0, -35 * scaleFactor, skill.name, {
                fontSize: `${Math.floor(16 * scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
            }).setOrigin(0.5);

            const costBg = this.add.rectangle(cardWidth/2 - 25 * scaleFactor, -cardHeight/2 + 15 * scaleFactor, 30 * scaleFactor, 20 * scaleFactor, 0x000000, 0.6).setStrokeStyle(1, 0x333333);
            const cost = this.add.text(cardWidth/2 - 25 * scaleFactor, -cardHeight/2 + 15 * scaleFactor, `${skill.chargeCost}`, {
                fontSize: `${Math.floor(12 * scaleFactor)}px`, fontFamily: 'monospace', color: '#fbbf24', fontStyle: 'bold'
            }).setOrigin(0.5);

            const desc = this.add.text(0, 15 * scaleFactor, skill.description, {
                fontSize: `${Math.floor(11 * scaleFactor)}px`, fontFamily: 'monospace', color: '#aaaaaa', align: 'center', wordWrap: { width: cardWidth - 30 * scaleFactor }
            }).setOrigin(0.5);

            container.add([bg, glow, name, costBg, cost, desc]);
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
        // Update Cards
        this.skillCards.forEach((container, id) => {
            const bg = container.list[0] as Phaser.GameObjects.Rectangle;
            const glow = container.list[1] as Phaser.GameObjects.Rectangle;
            const isSelected = this.isSkillSelected(id);
            const isHovered = container.getData('hovered');

            // Stop scale tweens
            const tweens = this.tweens.getTweensOf(container);
            tweens.forEach(t => {
                if (t.data && t.data.some(d => d.key === 'scaleX' || d.key === 'scaleY' || d.key === 'scale')) {
                    t.stop();
                }
            });

            let targetGlowAlpha = 0;
            if (isSelected) {
                bg.setStrokeStyle(2, 0x10b981);
                bg.setFillStyle(0x10b981, 0.15);
                targetGlowAlpha = 0.6;
            } else if (isHovered) {
                bg.setStrokeStyle(2, 0x10b981);
                bg.setFillStyle(0x1a1a1a, 1);
                targetGlowAlpha = 0.3;
            } else {
                bg.setStrokeStyle(2, 0x333333);
                bg.setFillStyle(0x1a1a1a, 1);
                targetGlowAlpha = 0;
            }

            this.tweens.add({ targets: glow, alpha: targetGlowAlpha, duration: 200 });
            const targetScale = (isSelected || isHovered) ? 1.02 : 1;
            this.tweens.add({ targets: container, scaleX: targetScale, scaleY: targetScale, duration: 200 });
        });

        // Update Slots
        const updateSlot = (id: string, skillId: string | null) => {
            const container = this.slotContainers.get(id);
            if (!container) return;
            const bg = container.list[0] as Phaser.GameObjects.Rectangle;
            const text = container.list[2] as Phaser.GameObjects.Text;
            
            if (skillId) {
                const skill = this.availableSkills.find(s => s.id === skillId);
                text.setText(skill ? skill.name.toUpperCase() : 'UNKNOWN');
                text.setColor('#10b981');
                bg.setStrokeStyle(1, 0x10b981);
                bg.setFillStyle(0x10b981, 0.1);
            } else {
                text.setText('EMPTY');
                text.setColor('#444444');
                bg.setStrokeStyle(1, 0x333333);
                bg.setFillStyle(0x1a1a1a, 1);
            }
        };

        updateSlot('passive', this.loadout.passive);
        updateSlot('active', this.loadout.active);
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
                active: this.loadout.active,
                stacks: this.loadout.stacks
            };
        }

        const opponents = ['warrior', 'mage', 'rogue', 'paladin'];
        const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
        this.scene.start('Game_Scene', { userCharId: this.charId, opponentCharId: randomOpponent });
    }

    private createButton(x: number, y: number, label: string, callback: () => void, color: number, width: number = 160, scaleFactor: number = 1) {
        const container = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, width, 50 * scaleFactor, color, 0.8)
            .setInteractive({ useHandCursor: true });
        const text = this.add.text(0, 0, label, {
            fontSize: `${Math.floor(18 * scaleFactor)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);

        container.add([bg, text]);

        bg.on('pointerdown', callback);
        bg.on('pointerover', () => bg.setAlpha(1));
        bg.on('pointerout', () => bg.setAlpha(0.8));

        return container;
    }
}
