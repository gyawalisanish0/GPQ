import Phaser from 'phaser';
import { CombatRegistry } from '../engine/CombatRegistry';
import { SkillData, SkillType } from '../entities/Skill';
import { CharacterData } from '../entities/Character';
import { BaseScene } from './BaseScene';

// ─── Button constants (50 % larger than original) ─────────────────────────────
const BACK_BTN_W  = 180;  // was 120
const START_BTN_W = 300;  // was 200
const BTN_H       = 75;   // was 50
const BTN_FS      = 24;   // was 18

export class LoadoutScene extends BaseScene {
    private charId!: string;
    private charData!: CharacterData;
    private availableSkills: SkillData[] = [];
    private loadout: { passive: string | null; active: string | null; stacks: string[] } =
        { passive: null, active: null, stacks: [] };

    private uiContainer!:     Phaser.GameObjects.Container;
    private leftPane!:         Phaser.GameObjects.Container;
    private rightPane!:        Phaser.GameObjects.Container;
    private scrollContainer!:  Phaser.GameObjects.Container;
    private skillCards:  Map<string, Phaser.GameObjects.Container> = new Map();
    private slotContainers: Map<string, Phaser.GameObjects.Container> = new Map();

    private targetScrollY:  number = 0;
    private currentScrollY: number = 0;
    private maxScroll:       number = 0;
    private scrollBaseY:     number = 0;
    private isDraggingScroll: boolean = false;
    private dragLastY:       number = 0;
    private scrollAreaLeft:  number = 0;
    private scrollAreaTop:   number = 0;

    constructor() { super('LoadoutScene'); }

    protected onInit(data: { charId: string }) {
        this.charId = data.charId;
        const reg  = CombatRegistry.getInstance();
        const char = reg.getCharacterData(this.charId);
        if (char) {
            this.charData = char;
            this.availableSkills = char.unlockedSkills
                .map(id => reg.getSkillData(id))
                .filter((s): s is SkillData => s !== null);
            const passives      = this.availableSkills.filter(s => s.type === SkillType.PASSIVE);
            const defaultPassive = passives.length > 0 ? passives[0].id : null;
            this.loadout = {
                passive: char.loadout.passive || defaultPassive,
                active:  char.loadout.active  || null,
                stacks:  char.loadout.stacks  ? [...char.loadout.stacks] : []
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

        // Normalised wheel scroll (handles pixel / line / page modes)
        this.input.on('wheel',
            (pointer: Phaser.Input.Pointer, _go: any, _dx: number, deltaY: number) => {
                const ev = pointer.event as WheelEvent;
                let norm = deltaY;
                if (ev?.deltaMode === 1) norm = deltaY * 20;
                else if (ev?.deltaMode === 2) norm = deltaY * 600;
                this.targetScrollY -= norm * 0.8;
                this.targetScrollY  = Phaser.Math.Clamp(this.targetScrollY, -this.maxScroll, 0);
            }
        );

        // Touch / drag scroll for right pane
        this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            if (ptr.x >= this.scrollAreaLeft && ptr.y >= this.scrollAreaTop) {
                this.isDraggingScroll = true;
                this.dragLastY = ptr.y;
            }
        });
        this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
            if (!this.isDraggingScroll || !ptr.isDown) return;
            const delta = ptr.y - this.dragLastY;
            this.dragLastY = ptr.y;
            if (Math.abs(delta) > 4) {
                this.targetScrollY += delta;
                this.targetScrollY  = Phaser.Math.Clamp(this.targetScrollY, -this.maxScroll, 0);
            }
        });
        this.input.on('pointerup', () => { this.isDraggingScroll = false; });

        this.buildUI();
    }

    update() {
        if (this.scrollContainer) {
            this.currentScrollY += (this.targetScrollY - this.currentScrollY) * 0.15;
            this.scrollContainer.y = this.scrollBaseY + this.currentScrollY;
        }
    }

    protected onResize() { this.buildUI(); }

    // ─── Full UI rebuild ──────────────────────────────────────────────────────

    private buildUI() {
        if (this.uiContainer) this.uiContainer.destroy();
        this.skillCards.clear();
        this.slotContainers.clear();
        this.targetScrollY  = 0;
        this.currentScrollY = 0;
        this.scrollBaseY    = 0;
        this.isDraggingScroll = false;

        this.uiContainer = this.add.container(0, 0);

        const sf = this.scaleFactor;

        const bgGfx = this.add.graphics();
        bgGfx.fillGradientStyle(0x0a0a2a, 0x1a0a3a, 0x0a1a3a, 0x050515, 1, 1, 1, 1);
        bgGfx.fillRect(0, 0, this.gameWidth, this.gameHeight);
        this.uiContainer.add(bgGfx);

        const particles = this.add.particles(0, 0, 'star_particle', {
            x: { min: 0, max: this.gameWidth },
            y: { min: this.gameHeight, max: this.gameHeight + 100 },
            lifespan: 10000, speedY: { min: -10, max: -30 },
            scale: { start: 0.5 * sf, end: 0 }, alpha: { start: 0.3, end: 0 },
            quantity: 1, frequency: 200
        });
        this.uiContainer.add(particles);

        // ── Layout: reserve button footprint first ────────────────────────────
        const margin     = Math.max(this.s(16), 16);
        const backH_px   = this.s(BTN_H);
        const startH_px  = this.s(BTN_H);

        // Back is anchored top-left, Start Battle is anchored bottom-right.
        const backBtnX  = margin + this.s(BACK_BTN_W)  / 2;
        const backBtnY  = margin + backH_px / 2;
        const startBtnX = this.gameWidth  - margin - this.s(START_BTN_W) / 2;
        const startBtnY = this.gameHeight - margin - startH_px / 2;

        // ── Two-pane layout ───────────────────────────────────────────────────
        const maxUiW  = Math.min(this.gameWidth,  1200 * sf);
        const offsetX = this.getCenteredX(maxUiW);
        const leftW   = maxUiW * 0.35;
        const rightW  = maxUiW - leftW;

        const portraitSize  = Math.min(180 * sf, leftW * 0.6);
        const contentHeight =
            portraitSize + this.s(30) + this.s(35) + this.s(45) +
            this.s(110)  + this.s(30) + this.s(144) + this.s(45) + this.s(100);
        const pad       = this.s(40);
        const paneH     = contentHeight + pad * 2;
        const topMargin = (this.gameHeight - paneH) / 2;

        this.leftPane  = this.add.container(offsetX,         0);
        this.rightPane = this.add.container(offsetX + leftW, 0);
        this.uiContainer.add([this.leftPane, this.rightPane]);

        this.buildLeftPane(leftW, topMargin, paneH, sf);
        this.buildRightPane(rightW, paneH, topMargin, offsetX, leftW, sf);

        // ── Buttons ───────────────────────────────────────────────────────────
        const backBtn  = this.createButton(backBtnX,  backBtnY,  'BACK',         () => this.scene.start('LobbyScene', { selectedCharId: this.charId }), 0xef4444, BACK_BTN_W,  sf);
        const startBtn = this.createButton(startBtnX, startBtnY, 'START BATTLE', () => this.startBattle(), 0x10b981, START_BTN_W, sf);
        this.uiContainer.add([backBtn, startBtn]);

        this.updateVisuals();
    }

    // ─── Left pane ────────────────────────────────────────────────────────────

    private buildLeftPane(width: number, topMargin: number, paneH: number, sf: number) {
        const portraitSize = Math.min(180 * sf, width * 0.6);

        const bg = this.add.rectangle(0, topMargin, width, paneH, 0x050b14, 0.85)
            .setOrigin(0, 0).setStrokeStyle(2, 0x1e3a8a, 0.5);
        this.leftPane.add(bg);

        const cx  = width / 2;
        const pad = this.s(40);
        let cy    = topMargin + pad;

        // Portrait
        const frame = this.add.circle(cx, cy + portraitSize / 2, portraitSize / 2 + this.s(4), 0x000000, 0.5)
            .setStrokeStyle(3, 0x3b82f6, 0.8);
        this.leftPane.add(frame);

        const portrait = this.add.image(cx, cy + portraitSize / 2, this.charData.portrait)
            .setDisplaySize(portraitSize, portraitSize * 1.2);
        const mgfx = this.make.graphics({ x: 0, y: 0 });
        mgfx.fillStyle(0xffffff);
        mgfx.fillCircle(cx, cy + portraitSize / 2, portraitSize / 2);
        portrait.setMask(mgfx.createGeometryMask());
        this.leftPane.add(portrait);
        cy += portraitSize + this.s(30);

        const nameText = this.add.text(cx, cy, this.charData.name.toUpperCase(), {
            fontSize: `${this.fs(36)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setShadow(0, 2, '#000000', 4, false, true);
        cy += this.s(35);

        const classText = this.add.text(cx, cy, this.charData.classType, {
            fontSize: `${this.fs(18)}px`, fontFamily: 'monospace', color: '#3b82f6', fontStyle: 'bold'
        }).setOrigin(0.5);
        cy += this.s(45);

        const statsBg = this.add.rectangle(cx, cy + this.s(30), width * 0.85, this.s(80), 0x0f172a, 0.8)
            .setStrokeStyle(1, 0x1e293b);
        this.leftPane.add(statsBg);
        this.leftPane.add([nameText, classText]);

        const ss = { fontSize: `${this.fs(12)}px`, fontFamily: 'monospace', color: '#94a3b8' };
        const sv = { fontSize: `${this.fs(16)}px`, fontFamily: 'monospace', color: '#f8fafc', fontStyle: 'bold' };
        const gap = this.s(80);
        [
            { l: 'STR', v: this.charData.stats.strength,   dx: cx - gap, dy: cy + this.s(10) },
            { l: 'END', v: this.charData.stats.endurance,  dx: cx,       dy: cy + this.s(10) },
            { l: 'PWR', v: this.charData.stats.power,      dx: cx + gap, dy: cy + this.s(10) },
            { l: 'RES', v: this.charData.stats.resistance, dx: cx - gap, dy: cy + this.s(40) },
            { l: 'SPD', v: this.charData.stats.speed,      dx: cx,       dy: cy + this.s(40) },
            { l: 'ACC', v: this.charData.stats.accuracy,   dx: cx + gap, dy: cy + this.s(40) },
        ].forEach(s => {
            this.leftPane.add(this.add.text(s.dx - this.s(15), s.dy, s.l, ss).setOrigin(1, 0.5));
            this.leftPane.add(this.add.text(s.dx - this.s(5),  s.dy, s.v.toString(), sv).setOrigin(0, 0.5));
        });
        cy += this.s(100);

        const loadTitle = this.add.text(cx, cy, 'CURRENT LOADOUT', {
            fontSize: `${this.fs(14)}px`, fontFamily: 'monospace', color: '#94a3b8', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.leftPane.add(loadTitle);
        cy += this.s(30);

        this.createSlot(cx, cy, 'PASSIVE',  'passive', width * 0.8, sf);  cy += this.s(72);
        this.createSlot(cx, cy, 'ULTIMATE', 'active',  width * 0.8, sf);  cy += this.s(72);

        const sw = (width * 0.8 - this.s(20)) / 3;
        const ss2 = sw + this.s(10);
        this.createSlot(cx - ss2, cy, 'STACK 1', 'stack_0', sw, sf);
        this.createSlot(cx,       cy, 'STACK 2', 'stack_1', sw, sf);
        this.createSlot(cx + ss2, cy, 'STACK 3', 'stack_2', sw, sf);
    }

    private createSlot(x: number, y: number, label: string, id: string, width: number, sf: number) {
        const ct = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, width, this.s(45), 0x0f172a, 1).setStrokeStyle(1, 0x1e293b);
        const tl = this.add.text(0, -this.s(32), label, {
            fontSize: `${this.fs(11)}px`, fontFamily: 'monospace', color: '#64748b', fontStyle: 'bold'
        }).setOrigin(0.5);
        const tv = this.add.text(0, 0, 'EMPTY', {
            fontSize: `${this.fs(13)}px`, fontFamily: 'monospace', color: '#475569', fontStyle: 'bold'
        }).setOrigin(0.5);
        ct.add([bg, tl, tv]);
        this.leftPane.add(ct);
        this.slotContainers.set(id, ct);
    }

    // ─── Right pane (scrollable armory) ──────────────────────────────────────

    private buildRightPane(width: number, paneH: number, topMargin: number, offsetX: number, leftW: number, sf: number) {
        const headerH = this.s(80);
        const footerH = this.s(20);

        const title = this.add.text(this.s(40), topMargin + this.s(50), 'ARMORY', {
            fontSize: `${this.fs(32)}px`, fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0, 0.5).setShadow(0, 2, '#3b82f6', 10, false, true);
        const line = this.add.rectangle(this.s(40), topMargin + this.s(70), this.s(120), this.s(2), 0x3b82f6).setOrigin(0, 0.5);
        this.rightPane.add([title, line]);

        this.scrollBaseY = topMargin + headerH;
        this.scrollContainer = this.add.container(0, this.scrollBaseY);
        this.rightPane.add(this.scrollContainer);

        this.scrollAreaLeft = offsetX + leftW;
        this.scrollAreaTop  = topMargin + headerH;

        let cy = this.s(10);
        cy = this.renderSkillSection(cy, width, 'PASSIVE ABILITIES',   this.availableSkills.filter(s => s.type === SkillType.PASSIVE), sf);
        cy = this.renderSkillSection(cy, width, 'ULTIMATE PROTOCOLS',  this.availableSkills.filter(s => s.type === SkillType.ACTIVE),  sf);
        cy = this.renderSkillSection(cy, width, 'TACTICAL STACKS',     this.availableSkills.filter(s => s.type === SkillType.STACK),   sf);

        const maskH = paneH - headerH - footerH;
        this.maxScroll = Math.max(0, cy - maskH);

        const mg = this.make.graphics({ x: 0, y: 0 });
        mg.fillStyle(0xffffff);
        mg.fillRect(offsetX + leftW, topMargin + headerH, width, maskH);
        this.scrollContainer.setMask(mg.createGeometryMask());
    }

    private renderSkillSection(y: number, paneW: number, title: string, skills: SkillData[], sf: number): number {
        if (skills.length === 0) return y;

        this.scrollContainer.add(this.add.text(this.s(40), y, title, {
            fontSize: `${this.fs(16)}px`, fontFamily: 'monospace', color: '#3b82f6', fontStyle: 'bold'
        }));

        const cW  = this.s(240), cH = this.s(140), gap = this.s(25);
        const cols = 2;
        const gW   = cW * cols + gap * (cols - 1);
        const sx   = (paneW - gW) / 2 + cW / 2;
        let maxRow = -1;

        skills.forEach((skill, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            maxRow = Math.max(maxRow, row);
            const cx = sx + col * (cW + gap);
            const cy = y + this.s(30) + row * (cH + gap) + cH / 2;

            const ct = this.add.container(cx, cy);
            this.scrollContainer.add(ct);
            ct.setData('skill', skill);
            ct.setData('hovered', false);

            const bg   = this.add.rectangle(0, 0, cW, cH, 0x0f172a, 0.9).setStrokeStyle(1, 0x1e293b);
            const glow = this.add.rectangle(0, 0, cW, cH, 0x3b82f6, 0).setStrokeStyle(3, 0x3b82f6);
            glow.setAlpha(0);

            if (skill.type !== SkillType.PASSIVE) {
                bg.setInteractive({ useHandCursor: true });
                bg.on('pointerdown', () => this.toggleSkill(skill));
                bg.on('pointerover', () => { ct.setData('hovered', true);  this.updateVisuals(); });
                bg.on('pointerout',  () => { ct.setData('hovered', false); this.updateVisuals(); });
            }

            const iconSz = this.s(40);
            const ico = this.add.image(-cW/2 + this.s(30), -cH/2 + this.s(30), skill.icon).setDisplaySize(iconSz, iconSz);
            const nm  = this.add.text(-cW/2 + this.s(60), -cH/2 + this.s(30), skill.name, {
                fontSize: `${this.fs(15)}px`, fontFamily: 'monospace', color: '#f8fafc', fontStyle: 'bold'
            }).setOrigin(0, 0.5);
            const cb  = this.add.rectangle(cW/2 - this.s(25), -cH/2 + this.s(30), this.s(30), this.s(20), 0x000000, 0.6).setStrokeStyle(1, 0x333333);
            const cc  = this.add.text(cW/2 - this.s(25), -cH/2 + this.s(30), `${skill.chargeCost}`, {
                fontSize: `${this.fs(12)}px`, fontFamily: 'monospace', color: '#fbbf24', fontStyle: 'bold'
            }).setOrigin(0.5);
            const desc = this.add.text(0, this.s(15), skill.description, {
                fontSize: `${this.fs(11)}px`, fontFamily: 'monospace', color: '#94a3b8',
                align: 'left', wordWrap: { width: cW - this.s(40) }
            }).setOrigin(0.5, 0);

            const ebg  = this.add.rectangle(0, cH/2 - this.s(12), this.s(80), this.s(16), 0x10b981, 1);
            const etxt = this.add.text(0, cH/2 - this.s(12), 'EQUIPPED', {
                fontSize: `${this.fs(10)}px`, fontFamily: 'monospace', color: '#000000', fontStyle: 'bold'
            }).setOrigin(0.5);
            const badge = this.add.container(0, 0, [ebg, etxt]).setAlpha(0);
            ct.setData('equippedBadge', badge);

            ct.add([bg, glow, ico, nm, cb, cc, desc, badge]);
            this.skillCards.set(skill.id, ct);
        });

        return y + this.s(50) + (maxRow + 1) * (cH + gap) + this.s(30);
    }

    // ─── Skill toggling ───────────────────────────────────────────────────────

    private toggleSkill(skill: SkillData) {
        if (skill.type === SkillType.PASSIVE) return;
        if (skill.type === SkillType.ACTIVE) {
            this.loadout.active = this.loadout.active === skill.id ? null : skill.id;
        } else {
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
        ['stack_0','stack_1','stack_2'].forEach(id => {
            const ct = this.slotContainers.get(id);
            if (!ct) return;
            const bg = ct.list[0] as Phaser.GameObjects.Rectangle;
            this.tweens.add({ targets: bg, fillColor: 0xef4444, duration: 100, yoyo: true, repeat: 1,
                onComplete: () => bg.setFillStyle(0x1a1a1a, 1) });
        });
    }

    private isSkillSelected(id: string): boolean {
        return this.loadout.passive === id || this.loadout.active === id || this.loadout.stacks.includes(id);
    }

    private updateVisuals() {
        this.skillCards.forEach((ct, id) => {
            const bg    = ct.list[0] as Phaser.GameObjects.Rectangle;
            const glow  = ct.list[1] as Phaser.GameObjects.Rectangle;
            const badge = ct.getData('equippedBadge') as Phaser.GameObjects.Container;
            const sel   = this.isSkillSelected(id);
            const hov   = ct.getData('hovered');

            this.tweens.getTweensOf(ct).forEach(t => {
                if (t.data?.some((d: any) => d.key === 'scaleX' || d.key === 'scaleY')) t.stop();
            });

            if (sel) {
                bg.setStrokeStyle(2, 0x10b981); bg.setFillStyle(0x064e3b, 0.4);
                this.tweens.add({ targets: glow, alpha: 0.8, duration: 200 });
                badge.setAlpha(1);
            } else if (hov) {
                bg.setStrokeStyle(2, 0x3b82f6); bg.setFillStyle(0x1e293b, 1);
                this.tweens.add({ targets: glow, alpha: 0.4, duration: 200 });
                badge.setAlpha(0);
            } else {
                bg.setStrokeStyle(1, 0x1e293b); bg.setFillStyle(0x0f172a, 0.9);
                this.tweens.add({ targets: glow, alpha: 0, duration: 200 });
                badge.setAlpha(0);
            }
            const ts = (sel || hov) ? 1.03 : 1;
            this.tweens.add({ targets: ct, scaleX: ts, scaleY: ts, duration: 200 });
        });

        const upd = (id: string, skillId: string | null) => {
            const ct = this.slotContainers.get(id); if (!ct) return;
            const bg   = ct.list[0] as Phaser.GameObjects.Rectangle;
            const text = ct.list[2] as Phaser.GameObjects.Text;
            if (skillId) {
                const sk = this.availableSkills.find(s => s.id === skillId);
                text.setText(sk ? sk.name.toUpperCase() : 'UNKNOWN').setColor('#10b981');
                bg.setStrokeStyle(1, 0x10b981).setFillStyle(0x064e3b, 0.3);
            } else {
                text.setText('EMPTY').setColor('#475569');
                bg.setStrokeStyle(1, 0x1e293b).setFillStyle(0x0f172a, 1);
            }
        };
        upd('passive', this.loadout.passive);
        upd('active',  this.loadout.active);
        upd('stack_0', this.loadout.stacks[0] || null);
        upd('stack_1', this.loadout.stacks[1] || null);
        upd('stack_2', this.loadout.stacks[2] || null);
    }

    // ─── Start battle ─────────────────────────────────────────────────────────

    private startBattle() {
        if (!this.loadout.active) {
            this.cameras.main.shake(100, 0.01);
            const slot = this.slotContainers.get('active');
            if (slot) {
                const bg = slot.list[0] as Phaser.GameObjects.Rectangle;
                this.tweens.add({ targets: bg, fillColor: 0xef4444, duration: 100, yoyo: true, repeat: 2,
                    onComplete: () => this.updateVisuals() });
            }
            return;
        }
        const char = CombatRegistry.getInstance().getCharacterData(this.charId);
        if (char) char.loadout = { passive: this.loadout.passive, active: this.loadout.active, stacks: this.loadout.stacks };
        const opponents = ['warrior','mage','rogue','paladin'];
        const opp = opponents[Math.floor(Math.random() * opponents.length)];
        this.scene.start('Game_Scene', { userCharId: this.charId, opponentCharId: opp });
    }

    // ─── Button factory ───────────────────────────────────────────────────────

    private createButton(x: number, y: number, label: string, callback: () => void, color: number, designW: number, sf: number) {
        const container = this.add.container(x, y);
        const bW = this.s(designW);
        const bH = this.s(BTN_H);

        const bg = this.add.rectangle(0, 0, bW, bH, color, 0.9)
            .setStrokeStyle(2, 0xffffff, 0.4)
            .setInteractive({ useHandCursor: true });
        const glow = this.add.rectangle(0, 0, bW, bH, color, 0).setStrokeStyle(4, color);
        const text = this.add.text(0, 0, label, {
            fontSize: `${this.fs(BTN_FS)}px`, fontFamily: 'monospace', color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5).setShadow(0, 2, '#000000', 4, false, true);

        container.add([bg, glow, text]);

        bg.on('pointerdown', () => {
            this.tweens.add({ targets: container, scaleX: 0.93, scaleY: 0.93, duration: 60, yoyo: true });
            callback();
        });
        bg.on('pointerover', () => {
            bg.setFillStyle(color, 1);
            this.tweens.add({ targets: glow,      alpha: 1,    duration: 200 });
            this.tweens.add({ targets: container, scaleX: 1.06, scaleY: 1.06, duration: 200 });
        });
        bg.on('pointerout', () => {
            bg.setFillStyle(color, 0.9);
            this.tweens.add({ targets: glow,      alpha: 0, duration: 200 });
            this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 200 });
        });

        return container;
    }
}
