import Phaser from 'phaser';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData } from '../entities/Character';
import { BaseScene } from './BaseScene';

export class LobbyScene extends BaseScene {
    private characters: CharacterData[] = [];
    private selectedCharId: string | null = null;
    private charCards: Phaser.GameObjects.Container[] = [];
    private uiContainer!: Phaser.GameObjects.Container;

    constructor() {
        super('LobbyScene');
    }

    protected onInit(data: { selectedCharId?: string }) {
        this.characters = CombatRegistry.getInstance().getAllCharactersData();
        this.charCards = [];
        if (data && data.selectedCharId) {
            this.selectedCharId = data.selectedCharId;
        } else {
            this.selectedCharId = null;
        }
    }

    create() {
        this.buildUI();
    }

    protected onResize() {
        this.buildUI();
    }

    private buildUI() {
        if (this.uiContainer) {
            this.uiContainer.destroy();
        }
        this.uiContainer = this.add.container(0, 0);
        this.charCards = []; // Reset cards array on rebuild

        // Background
        const bg = this.add.image(this.centerX, this.centerY, 'menu_bg').setDisplaySize(this.gameWidth, this.gameHeight).setAlpha(0.3);
        this.uiContainer.add(bg);

        // Title
        const title = this.add.text(this.centerX, 80 * this.scaleFactor, 'SELECT YOUR HERO', {
            fontSize: `${Math.floor(42 * this.scaleFactor)}px`,
            fontFamily: 'monospace',
            color: '#10b981',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.uiContainer.add(title);

        this.createCharacterGrid();

        // Back Button
        const backBtn = this.createButton(100 * this.scaleFactor, 50 * this.scaleFactor, 'BACK', () => {
            this.scene.start('MainMenuScene');
        }, 0xef4444);
        this.uiContainer.add(backBtn);

        // Next Button (Initially hidden or disabled-looking)
        const nextBtn = this.createButton(this.gameWidth - 100 * this.scaleFactor, this.gameHeight - 80 * this.scaleFactor, 'NEXT', () => {
            if (this.selectedCharId) {
                this.scene.start('LoadoutScene', { charId: this.selectedCharId });
            }
        }, 0x10b981);
        nextBtn.setVisible(this.selectedCharId !== null);
        this.data.set('nextBtn', nextBtn);
        this.uiContainer.add(nextBtn);
    }

    private createCharacterGrid() {
        const maxCols = 3;
        const baseCardWidth = 240;
        const baseCardHeight = 320;
        const baseSpacing = 40;

        const actualCols = Math.min(maxCols, this.characters.length);
        const totalBaseWidth = (actualCols * baseCardWidth) + ((actualCols - 1) * baseSpacing);

        // Calculate scale to fit width with 10% padding on each side
        const maxAvailableWidth = this.gameWidth * 0.8;
        let scale = this.scaleFactor;
        if (totalBaseWidth * this.scaleFactor > maxAvailableWidth) {
            scale = maxAvailableWidth / totalBaseWidth;
        }

        const scaledCardWidth = baseCardWidth * scale;
        const scaledCardHeight = baseCardHeight * scale;
        const scaledSpacing = baseSpacing * scale;

        const totalScaledWidth = (actualCols * scaledCardWidth) + ((actualCols - 1) * scaledSpacing);
        const startX = (this.gameWidth - totalScaledWidth) / 2 + scaledCardWidth / 2;
        const startY = this.gameHeight * 0.4; // Center relative to height

        this.characters.forEach((char, i) => {
            const col = i % maxCols;
            const row = Math.floor(i / maxCols);

            const x = startX + col * (scaledCardWidth + scaledSpacing);
            const y = startY + row * (scaledCardHeight + scaledSpacing);

            const card = this.add.container(x, y);
            card.setScale(scale);
            card.setData('baseScale', scale);
            card.setAlpha(0);
            card.y += 50;
            
            const bg = this.add.rectangle(0, 0, baseCardWidth, baseCardHeight, 0x1a1a1a, 1)
                .setStrokeStyle(2, 0x333333)
                .setInteractive({ useHandCursor: true });
            
            const glow = this.add.rectangle(0, 0, baseCardWidth, baseCardHeight, 0x10b981, 0)
                .setStrokeStyle(4, 0x10b981);

            // Portrait
            const portrait = this.add.image(0, -40, char.portrait)
                .setDisplaySize(baseCardWidth - 20, 180);
            
            // Mask for portrait
            const maskShape = this.make.graphics({ x: 0, y: 0 });
            maskShape.fillStyle(0xffffff);
            maskShape.fillRoundedRect(x - (scaledCardWidth - 20 * scale) / 2, y - (40 * scale) - (90 * scale), scaledCardWidth - 20 * scale, 180 * scale, 10 * scale);
            const mask = maskShape.createGeometryMask();
            portrait.setMask(mask);
            
            const name = this.add.text(0, 60, char.name.toUpperCase(), {
                fontSize: '24px',
                fontFamily: 'monospace',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            const classLabel = this.add.text(0, 85, char.classType, {
                fontSize: '14px',
                fontFamily: 'monospace',
                color: '#10b981'
            }).setOrigin(0.5);

            // Stats Display
            const statsContainer = this.add.container(-100, 105);
            const statStyle = { fontSize: '10px', fontFamily: 'monospace', color: '#aaaaaa' };
            const valStyle = { fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' };
            
            const stats = [
                { label: 'STR', val: char.stats.strength, x: 0, y: 0 },
                { label: 'END', val: char.stats.endurance, x: 65, y: 0 },
                { label: 'PWR', val: char.stats.power, x: 130, y: 0 },
                { label: 'RES', val: char.stats.resistance, x: 0, y: 20 },
                { label: 'SPD', val: char.stats.speed, x: 65, y: 20 },
                { label: 'ACC', val: char.stats.accuracy, x: 130, y: 20 },
            ];

            stats.forEach(s => {
                statsContainer.add(this.add.text(s.x, s.y, `${s.label}:`, statStyle));
                statsContainer.add(this.add.text(s.x + 25, s.y, s.val.toString(), valStyle));
            });

            card.add([bg, glow, portrait, name, classLabel, statsContainer]);
            this.charCards.push(card);
            this.uiContainer.add(card);

            this.tweens.add({
                targets: card,
                alpha: 1,
                y: y,
                duration: 600,
                delay: 200 + i * 150,
                ease: 'Back.easeOut'
            });

            bg.on('pointerover', () => {
                if (this.selectedCharId !== char.id) {
                    bg.setStrokeStyle(2, 0x10b981);
                    this.tweens.add({ targets: card, scale: scale * 1.05, duration: 200 });
                    this.tweens.add({ targets: glow, alpha: 0.3, duration: 200 });
                }
            });

            bg.on('pointerout', () => {
                if (this.selectedCharId !== char.id) {
                    bg.setStrokeStyle(2, 0x333333);
                    this.tweens.add({ targets: card, scale: scale, duration: 200 });
                    this.tweens.add({ targets: glow, alpha: 0, duration: 200 });
                }
            });

            bg.on('pointerdown', () => {
                this.selectCharacter(char.id, card, bg, glow);
            });

            // If already selected (e.g. returning)
            if (this.selectedCharId === char.id) {
                bg.setStrokeStyle(4, 0x10b981);
                bg.setFillStyle(0x10b981, 0.1);
                glow.setAlpha(0.5);
                card.setScale(scale * 1.05);
            }
        });
    }

    private selectCharacter(id: string, card: Phaser.GameObjects.Container, bg: Phaser.GameObjects.Rectangle, glow: Phaser.GameObjects.Rectangle) {
        this.selectedCharId = id;
        
        // Reset all cards
        this.charCards.forEach(child => {
            const baseScale = child.getData('baseScale') || 1;
            if (child.list.length >= 2) {
                const otherBg = child.list[0] as Phaser.GameObjects.Rectangle;
                const otherGlow = child.list[1] as Phaser.GameObjects.Rectangle;
                if (otherBg && otherBg !== bg && otherBg.setStrokeStyle) {
                    otherBg.setStrokeStyle(2, 0x333333);
                    otherBg.setFillStyle(0x1a1a1a, 1);
                    if (otherGlow && otherGlow.setAlpha) otherGlow.setAlpha(0);
                    this.tweens.add({ targets: child, scale: baseScale, duration: 200 });
                }
            }
        });

        const baseScale = card.getData('baseScale') || 1;
        bg.setStrokeStyle(4, 0x10b981);
        bg.setFillStyle(0x10b981, 0.1);
        glow.setAlpha(0.5);
        this.tweens.add({ targets: card, scale: baseScale * 1.05, duration: 200 });

        const nextBtn = this.data.get('nextBtn') as Phaser.GameObjects.Container;
        if (nextBtn && !nextBtn.visible) {
            nextBtn.setVisible(true);
            nextBtn.setAlpha(0);
            this.tweens.add({
                targets: nextBtn,
                alpha: 1,
                y: { from: nextBtn.y + 20, to: nextBtn.y },
                duration: 400,
                ease: 'Back.easeOut'
            });
        }
    }

    private createButton(x: number, y: number, label: string, callback: () => void, color: number) {
        const container = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 160 * this.scaleFactor, 50 * this.scaleFactor, color, 0.8)
            .setInteractive({ useHandCursor: true });
        const text = this.add.text(0, 0, label, {
            fontSize: `${Math.floor(18 * this.scaleFactor)}px`,
            fontFamily: 'monospace',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        container.add([bg, text]);

        bg.on('pointerdown', callback);
        bg.on('pointerover', () => bg.setAlpha(1));
        bg.on('pointerout', () => bg.setAlpha(0.8));

        return container;
    }
}
