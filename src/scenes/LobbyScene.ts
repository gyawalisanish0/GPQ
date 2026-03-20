import Phaser from 'phaser';
import { CombatRegistry } from '../engine/CombatRegistry';
import { CharacterData } from '../entities/Character';
import { BaseScene } from './BaseScene';

// ─── Button constants (50 % larger than the original 160 × 50 / 18 px) ───────
const BTN_W  = 240; // design-space width  (was 160)
const BTN_H  = 75;  // design-space height (was 50)
const BTN_FS = 24;  // font size           (was 18)

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
        this.charCards  = [];
        this.selectedCharId = (data && data.selectedCharId) ? data.selectedCharId : null;
    }

    create()            { this.buildUI(); }
    protected onResize() { this.buildUI(); }

    // ─── UI ──────────────────────────────────────────────────────────────────

    private buildUI() {
        if (this.uiContainer) this.uiContainer.destroy();
        this.uiContainer = this.add.container(0, 0);
        this.charCards = [];

        const sf = this.scaleFactor;

        // Background
        const bg = this.add.image(this.centerX, this.centerY, 'menu_bg')
            .setDisplaySize(this.gameWidth, this.gameHeight).setAlpha(0.3);
        this.uiContainer.add(bg);

        // Title
        const title = this.add.text(this.centerX, this.s(80), 'SELECT YOUR HERO', {
            fontSize: `${this.fs(42)}px`,
            fontFamily: 'monospace',
            color: '#10b981',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.uiContainer.add(title);

        // ── Buttons (positioned first so grid knows reserved space) ──────────
        // Use at least 16 physical pixels of margin from every edge.
        const margin  = Math.max(this.s(16), 16);
        const btnW_px = this.s(BTN_W);
        const btnH_px = this.s(BTN_H);

        // Back – top-left
        const backX = margin + btnW_px / 2;
        const backY = margin + btnH_px / 2;
        const backBtn = this.createButton(backX, backY, 'BACK', () => {
            this.scene.start('MainMenuScene');
        }, 0xef4444);
        this.uiContainer.add(backBtn);

        // Next – bottom-right (hidden until a character is selected)
        const nextX = this.gameWidth  - margin - btnW_px / 2;
        const nextY = this.gameHeight - margin - btnH_px / 2;
        const nextBtn = this.createButton(nextX, nextY, 'NEXT', () => {
            if (this.selectedCharId) {
                this.scene.start('LoadoutScene', { charId: this.selectedCharId });
            }
        }, 0x10b981);
        nextBtn.setVisible(this.selectedCharId !== null);
        this.data.set('nextBtn', nextBtn);
        this.uiContainer.add(nextBtn);

        // Grid (pass reserved vertical space so cards never overlap buttons)
        this.createCharacterGrid(backY + btnH_px / 2 + margin, nextY - btnH_px / 2 - margin);
    }

    // ─── Character grid ───────────────────────────────────────────────────────

    private createCharacterGrid(topReserved: number, bottomReserved: number) {
        const sf = this.scaleFactor;

        const maxCols       = 3;
        const baseCardW     = 240;
        const baseCardH     = 320;
        const baseSpacing   = 40;

        const actualCols    = Math.min(maxCols, this.characters.length);
        const totalBaseW    = actualCols * baseCardW + (actualCols - 1) * baseSpacing;

        // Scale down further if cards would overflow 80 % of screen width
        const maxW = this.gameWidth * 0.8;
        let scale  = sf;
        if (totalBaseW * sf > maxW) scale = maxW / totalBaseW;

        const cardW   = baseCardW   * scale;
        const cardH   = baseCardH   * scale;
        const spacing = baseSpacing * scale;

        const totalScaledW = actualCols * cardW + (actualCols - 1) * spacing;
        const startX = (this.gameWidth - totalScaledW) / 2 + cardW / 2;

        // Vertically centre within available band
        const availH = bottomReserved - topReserved;
        const rows    = Math.ceil(this.characters.length / maxCols);
        const gridH   = rows * cardH + (rows - 1) * spacing;
        const startY  = topReserved + (availH - gridH) / 2 + cardH / 2;

        this.characters.forEach((char, i) => {
            const col = i % maxCols;
            const row = Math.floor(i / maxCols);

            const x = startX + col * (cardW + spacing);
            const y = startY + row * (cardH + spacing);

            const card = this.add.container(x, y);
            card.setScale(scale);
            card.setData('baseScale', scale);
            card.setAlpha(0);
            card.y += 50;

            const bgRect = this.add.rectangle(0, 0, baseCardW, baseCardH, 0x1a1a1a, 1)
                .setStrokeStyle(2, 0x333333)
                .setInteractive({ useHandCursor: true });

            const glow = this.add.rectangle(0, 0, baseCardW, baseCardH, 0x10b981, 0)
                .setStrokeStyle(4, 0x10b981);

            // Portrait with clipping mask
            const portrait = this.add.image(0, -40, char.portrait)
                .setDisplaySize(baseCardW - 20, 180);
            const maskGfx = this.make.graphics({ x: 0, y: 0 });
            maskGfx.fillStyle(0xffffff);
            maskGfx.fillRoundedRect(
                x - (cardW - 20 * scale) / 2,
                y - 40 * scale - 90 * scale,
                cardW - 20 * scale,
                180 * scale,
                10 * scale
            );
            portrait.setMask(maskGfx.createGeometryMask());

            const nameLabel = this.add.text(0, 60, char.name.toUpperCase(), {
                fontSize: '24px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
            }).setOrigin(0.5);

            const classLabel = this.add.text(0, 85, char.classType, {
                fontSize: '14px', fontFamily: 'monospace', color: '#10b981'
            }).setOrigin(0.5);

            const statsCt = this.add.container(-100, 105);
            const ss = { fontSize: '10px', fontFamily: 'monospace', color: '#aaaaaa' };
            const sv = { fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' };
            [
                { label: 'STR', val: char.stats.strength,   x: 0,   y: 0  },
                { label: 'END', val: char.stats.endurance,  x: 65,  y: 0  },
                { label: 'PWR', val: char.stats.power,      x: 130, y: 0  },
                { label: 'RES', val: char.stats.resistance, x: 0,   y: 20 },
                { label: 'SPD', val: char.stats.speed,      x: 65,  y: 20 },
                { label: 'ACC', val: char.stats.accuracy,   x: 130, y: 20 },
            ].forEach(s => {
                statsCt.add(this.add.text(s.x,      s.y, `${s.label}:`,       ss));
                statsCt.add(this.add.text(s.x + 25, s.y,  s.val.toString(),   sv));
            });

            card.add([bgRect, glow, portrait, nameLabel, classLabel, statsCt]);
            this.charCards.push(card);
            this.uiContainer.add(card);

            this.tweens.add({
                targets: card, alpha: 1, y,
                duration: 600, delay: 200 + i * 150, ease: 'Back.easeOut'
            });

            bgRect.on('pointerover', () => {
                if (this.selectedCharId === char.id) return;
                bgRect.setStrokeStyle(2, 0x10b981);
                this.tweens.add({ targets: card, scale: scale * 1.05, duration: 200 });
                this.tweens.add({ targets: glow, alpha: 0.3, duration: 200 });
            });
            bgRect.on('pointerout', () => {
                if (this.selectedCharId === char.id) return;
                bgRect.setStrokeStyle(2, 0x333333);
                this.tweens.add({ targets: card, scale: scale, duration: 200 });
                this.tweens.add({ targets: glow, alpha: 0, duration: 200 });
            });
            bgRect.on('pointerdown', () => this.selectCharacter(char.id, card, bgRect, glow));

            if (this.selectedCharId === char.id) {
                bgRect.setStrokeStyle(4, 0x10b981);
                bgRect.setFillStyle(0x10b981, 0.1);
                glow.setAlpha(0.5);
                card.setScale(scale * 1.05);
            }
        });
    }

    // ─── Selection ────────────────────────────────────────────────────────────

    private selectCharacter(
        id: string,
        card: Phaser.GameObjects.Container,
        bg: Phaser.GameObjects.Rectangle,
        glow: Phaser.GameObjects.Rectangle
    ) {
        this.selectedCharId = id;

        this.charCards.forEach(child => {
            const bs = child.getData('baseScale') || 1;
            const otherBg   = child.list[0] as Phaser.GameObjects.Rectangle;
            const otherGlow = child.list[1] as Phaser.GameObjects.Rectangle;
            if (otherBg && otherBg !== bg && otherBg.setStrokeStyle) {
                otherBg.setStrokeStyle(2, 0x333333);
                otherBg.setFillStyle(0x1a1a1a, 1);
                if (otherGlow?.setAlpha) otherGlow.setAlpha(0);
                this.tweens.add({ targets: child, scale: bs, duration: 200 });
            }
        });

        const bs = card.getData('baseScale') || 1;
        bg.setStrokeStyle(4, 0x10b981);
        bg.setFillStyle(0x10b981, 0.1);
        glow.setAlpha(0.5);
        this.tweens.add({ targets: card, scale: bs * 1.05, duration: 200 });

        const nextBtn = this.data.get('nextBtn') as Phaser.GameObjects.Container;
        if (nextBtn && !nextBtn.visible) {
            nextBtn.setVisible(true);
            nextBtn.setAlpha(0);
            this.tweens.add({ targets: nextBtn, alpha: 1, y: { from: nextBtn.y + 20, to: nextBtn.y }, duration: 400, ease: 'Back.easeOut' });
        }
    }

    // ─── Button factory ───────────────────────────────────────────────────────

    private createButton(x: number, y: number, label: string, callback: () => void, color: number) {
        const container = this.add.container(x, y);
        const btnW_px   = this.s(BTN_W);
        const btnH_px   = this.s(BTN_H);

        const bg = this.add.rectangle(0, 0, btnW_px, btnH_px, color, 0.85)
            .setStrokeStyle(2, 0xffffff, 0.4)
            .setInteractive({ useHandCursor: true });

        const glow = this.add.rectangle(0, 0, btnW_px, btnH_px, color, 0)
            .setStrokeStyle(3, color);

        const text = this.add.text(0, 0, label, {
            fontSize: `${this.fs(BTN_FS)}px`,
            fontFamily: 'monospace',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        container.add([bg, glow, text]);

        bg.on('pointerdown', () => {
            this.tweens.add({ targets: container, scaleX: 0.93, scaleY: 0.93, duration: 60, yoyo: true });
            callback();
        });
        bg.on('pointerover', () => {
            bg.setFillStyle(color, 1);
            this.tweens.add({ targets: glow,      alpha: 0.8, duration: 150 });
            this.tweens.add({ targets: container, scaleX: 1.07, scaleY: 1.07, duration: 150 });
        });
        bg.on('pointerout', () => {
            bg.setFillStyle(color, 0.85);
            this.tweens.add({ targets: glow,      alpha: 0,   duration: 150 });
            this.tweens.add({ targets: container, scaleX: 1,  scaleY: 1,  duration: 150 });
        });

        return container;
    }
}
