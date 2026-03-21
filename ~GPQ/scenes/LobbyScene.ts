import Phaser from 'phaser';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData } from '../entities/Character';
import { BaseScene } from './BaseScene';
import { GlobalInputManager } from '../engine/GlobalInputManager';

export class LobbyScene extends BaseScene {
    private characters: CharacterData[] = [];
    private selectedCharId: string | null = null;
    private charCards: Phaser.GameObjects.Container[] = [];
    private uiContainer!: Phaser.GameObjects.Container;

    constructor() {
        super('LobbyScene');
    }

    protected onInit(data: { selectedCharId?: string }) {
        this.characters    = CombatRegistry.getInstance().getAllCharactersData();
        this.charCards     = [];
        this.selectedCharId = (data && data.selectedCharId) ? data.selectedCharId : null;
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
        this.charCards   = [];

        // Background
        const bg = this.add.image(this.centerX, this.centerY, 'menu_bg')
            .setDisplaySize(this.gameWidth, this.gameHeight)
            .setAlpha(0.3);
        this.uiContainer.add(bg);

        // Title
        const title = this.add.text(this.centerX, 80 * this.scaleFactor, 'SELECT YOUR HERO', {
            fontSize:    `${Math.floor(42 * this.scaleFactor)}px`,
            fontFamily:  'monospace',
            color:       '#10b981',
            fontStyle:   'bold',
        }).setOrigin(0.5);
        this.uiContainer.add(title);

        this.createCharacterGrid();

        // Back Button
        const backBtn = this.createButton(
            100 * this.scaleFactor,
            50  * this.scaleFactor,
            'BACK',
            () => { this.scene.start('MainMenuScene'); },
            0xef4444,
        );
        this.uiContainer.add(backBtn);

        // Next Button — hidden until a character is selected
        const nextBtn = this.createButton(
            this.gameWidth  - 100 * this.scaleFactor,
            this.gameHeight -  80 * this.scaleFactor,
            'NEXT',
            () => {
                if (this.selectedCharId) {
                    this.scene.start('LoadoutScene', { charId: this.selectedCharId });
                }
            },
            0x10b981,
        );
        nextBtn.setVisible(this.selectedCharId !== null);
        this.data.set('nextBtn', nextBtn);
        this.uiContainer.add(nextBtn);
    }

    private createCharacterGrid() {
        const maxCols        = 3;
        const baseCardWidth  = 240;
        const baseCardHeight = 320;
        const baseSpacing    = 40;

        const actualCols    = Math.min(maxCols, this.characters.length);
        const totalBaseWidth = actualCols * baseCardWidth + (actualCols - 1) * baseSpacing;

        // Scale down so cards fit within 80 % of the screen width
        const maxAvailableWidth = this.gameWidth * 0.8;
        let scale = this.scaleFactor;
        if (totalBaseWidth * scale > maxAvailableWidth) {
            scale = maxAvailableWidth / totalBaseWidth;
        }

        const scaledCardW   = baseCardWidth  * scale;
        const scaledCardH   = baseCardHeight * scale;
        const scaledSpacing = baseSpacing    * scale;
        const totalScaledW  = actualCols * scaledCardW + (actualCols - 1) * scaledSpacing;

        const startX = (this.gameWidth - totalScaledW) / 2 + scaledCardW / 2;
        const startY = this.gameHeight * 0.4;

        const gim = GlobalInputManager.getInstance();

        this.characters.forEach((char, i) => {
            const col = i % maxCols;
            const row = Math.floor(i / maxCols);

            const x = startX + col  * (scaledCardW + scaledSpacing);
            const y = startY + row  * (scaledCardH + scaledSpacing);

            const card = this.add.container(x, y);
            card.setScale(scale);
            card.setData('baseScale', scale);
            card.setAlpha(0);
            card.y += 50;    // offset for entry tween

            // ── Card background ────────────────────────────────────────────
            const cardBg = this.add.rectangle(
                0, 0,
                baseCardWidth, baseCardHeight,
                0x1a1a1a, 1,
            ).setStrokeStyle(2, 0x333333);

            const glowRect = this.add.rectangle(
                0, 0,
                baseCardWidth, baseCardHeight,
                0x10b981, 0,
            ).setStrokeStyle(4, 0x10b981);

            // ── Portrait ───────────────────────────────────────────────────
            const portrait = this.add.image(0, -40, char.portrait)
                .setDisplaySize(baseCardWidth - 20, 180);

            const maskShape = this.make.graphics({ x: 0, y: 0 });
            maskShape.fillStyle(0xffffff);
            maskShape.fillRoundedRect(
                x - (scaledCardW - 20 * scale) / 2,
                y - 40 * scale - 90 * scale,
                scaledCardW - 20 * scale,
                180 * scale,
                10 * scale,
            );
            portrait.setMask(maskShape.createGeometryMask());

            // ── Labels ─────────────────────────────────────────────────────
            const nameText = this.add.text(0, 60, char.name.toUpperCase(), {
                fontSize:   '24px',
                fontFamily: 'monospace',
                color:      '#ffffff',
                fontStyle:  'bold',
            }).setOrigin(0.5);

            const classText = this.add.text(0, 85, char.classType, {
                fontSize:   '14px',
                fontFamily: 'monospace',
                color:      '#10b981',
            }).setOrigin(0.5);

            // ── Stats ──────────────────────────────────────────────────────
            const statsContainer = this.add.container(-100, 105);
            const statStyle = { fontSize: '10px', fontFamily: 'monospace', color: '#aaaaaa' };
            const valStyle  = { fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' };

            [
                { label: 'STR', val: char.stats.strength,   x:   0, y:  0 },
                { label: 'END', val: char.stats.endurance,  x:  65, y:  0 },
                { label: 'PWR', val: char.stats.power,      x: 130, y:  0 },
                { label: 'RES', val: char.stats.resistance, x:   0, y: 20 },
                { label: 'SPD', val: char.stats.speed,      x:  65, y: 20 },
                { label: 'ACC', val: char.stats.accuracy,   x: 130, y: 20 },
            ].forEach(s => {
                statsContainer.add(this.add.text(s.x,      s.y, `${s.label}:`, statStyle));
                statsContainer.add(this.add.text(s.x + 25, s.y,  s.val.toString(), valStyle));
            });

            card.add([cardBg, glowRect, portrait, nameText, classText, statsContainer]);
            this.charCards.push(card);
            this.uiContainer.add(card);

            // ── Entry animation ────────────────────────────────────────────
            this.tweens.add({
                targets:  card,
                alpha:    1,
                y,
                duration: 600,
                delay:    200 + i * 150,
                ease:     'Back.easeOut',
            });

            // ── Input: hover (desktop) ─────────────────────────────────────
            // cardBg must be interactive for hover AND as the tap target
            cardBg.setInteractive({ useHandCursor: true });

            cardBg.on('pointerover', () => {
                if (this.selectedCharId !== char.id) {
                    cardBg.setStrokeStyle(2, 0x10b981);
                    this.tweens.add({ targets: card, scale: scale * 1.05, duration: 200 });
                    this.tweens.add({ targets: glowRect, alpha: 0.3, duration: 200 });
                }
            });

            cardBg.on('pointerout', () => {
                if (this.selectedCharId !== char.id) {
                    cardBg.setStrokeStyle(2, 0x333333);
                    this.tweens.add({ targets: card, scale, duration: 200 });
                    this.tweens.add({ targets: glowRect, alpha: 0, duration: 200 });
                }
            });

            // ── Input: tap / click (touch-safe via GlobalInputManager) ─────
            // makeTappable fires callback only when the pointer hasn't dragged
            // more than 12 CSS px — prevents accidental selection while scrolling.
            gim.makeTappable(cardBg, () => {
                this.selectCharacter(char.id, card, cardBg, glowRect);
            });

            // ── Pre-select if returning from LoadoutScene ──────────────────
            if (this.selectedCharId === char.id) {
                cardBg.setStrokeStyle(4, 0x10b981);
                cardBg.setFillStyle(0x10b981, 0.1);
                glowRect.setAlpha(0.5);
                card.setScale(scale * 1.05);
            }
        });
    }

    private selectCharacter(
        id:       string,
        card:     Phaser.GameObjects.Container,
        bg:       Phaser.GameObjects.Rectangle,
        glow:     Phaser.GameObjects.Rectangle,
    ) {
        this.selectedCharId = id;

        // Reset all cards to deselected appearance
        this.charCards.forEach(c => {
            const baseScale = c.getData('baseScale') || 1;
            const otherBg   = c.list[0] as Phaser.GameObjects.Rectangle;
            const otherGlow = c.list[1] as Phaser.GameObjects.Rectangle;

            if (otherBg && otherBg !== bg) {
                otherBg.setStrokeStyle(2, 0x333333);
                otherBg.setFillStyle(0x1a1a1a, 1);
                if (otherGlow?.setAlpha) otherGlow.setAlpha(0);
                this.tweens.add({ targets: c, scale: baseScale, duration: 200 });
            }
        });

        // Highlight selected card
        const baseScale = card.getData('baseScale') || 1;
        bg.setStrokeStyle(4, 0x10b981);
        bg.setFillStyle(0x10b981, 0.1);
        glow.setAlpha(0.5);
        this.tweens.add({ targets: card, scale: baseScale * 1.05, duration: 200 });

        // Reveal the "NEXT" button if not already visible
        const nextBtn = this.data.get('nextBtn') as Phaser.GameObjects.Container;
        if (nextBtn && !nextBtn.visible) {
            nextBtn.setVisible(true);
            nextBtn.setAlpha(0);
            this.tweens.add({
                targets:  nextBtn,
                alpha:    1,
                y:        { from: nextBtn.y + 20, to: nextBtn.y },
                duration: 400,
                ease:     'Back.easeOut',
            });
        }
    }

    /**
     * Create a simple rectangular button.
     * Uses pointerup + distance guard (via GlobalInputManager.makeTappable)
     * so the callback fires reliably on both touch and mouse without triggering
     * during a scroll drag.
     */
    private createButton(
        x:        number,
        y:        number,
        label:    string,
        callback: () => void,
        color:    number,
    ): Phaser.GameObjects.Container {
        const gim       = GlobalInputManager.getInstance();
        const container = this.add.container(x, y);

        const btnBg = this.add.rectangle(
            0, 0,
            160 * this.scaleFactor,
             50 * this.scaleFactor,
            color, 0.8,
        ).setInteractive({ useHandCursor: true });

        const text = this.add.text(0, 0, label, {
            fontSize:   `${Math.floor(18 * this.scaleFactor)}px`,
            fontFamily: 'monospace',
            color:      '#ffffff',
            fontStyle:  'bold',
        }).setOrigin(0.5);

        container.add([btnBg, text]);

        // Hover (desktop)
        btnBg.on('pointerover', () => btnBg.setAlpha(1));
        btnBg.on('pointerout',  () => btnBg.setAlpha(0.8));

        // Touch-safe tap
        gim.makeTappable(btnBg, callback);

        return container;
    }
}
