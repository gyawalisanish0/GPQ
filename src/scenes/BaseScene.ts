import Phaser from 'phaser';

export class BaseScene extends Phaser.Scene {
    protected gameWidth: number = 0;
    protected gameHeight: number = 0;
    protected centerX: number = 0;
    protected centerY: number = 0;
    /** Scale factor clamped to [0.25, 2.0] so UI stays visible on any screen. */
    protected scaleFactor: number = 1;

    constructor(key: string) {
        super(key);
    }

    init(data?: any) {
        this.updateDimensions();
        this.scale.on('resize', this.handleResize, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off('resize', this.handleResize, this);
        });
        this.onInit(data);
    }

    protected onInit(data?: any) {}

    protected updateDimensions() {
        this.gameWidth  = this.cameras.main.width;
        this.gameHeight = this.cameras.main.height;
        this.centerX    = this.gameWidth  / 2;
        this.centerY    = this.gameHeight / 2;
        // Clamp: at least 0.25 (avoids invisible UI on huge monitors) and at most
        // 2.0 (avoids over-scaling on tiny embedded screens).
        this.scaleFactor = Math.max(
            0.25,
            Math.min(2.0, Math.min(this.gameWidth / 1080, this.gameHeight / 1920))
        );
    }

    protected handleResize(gameSize: Phaser.Structs.Size) {
        this.cameras.resize(gameSize.width, gameSize.height);
        this.updateDimensions();
        this.onResize();
    }

    protected onResize() {}

    // ─── Layout helpers ───────────────────────────────────────────────────────

    /** Convert a design-space value to screen pixels. */
    protected s(value: number): number {
        return Math.round(value * this.scaleFactor);
    }

    /** Font size with an 8 px minimum so text is always readable. */
    protected fs(size: number): number {
        return Math.max(8, Math.round(size * this.scaleFactor));
    }

    /** X offset that horizontally centres a block of `contentWidth` pixels. */
    protected getCenteredX(contentWidth: number): number {
        return (this.gameWidth - contentWidth) / 2;
    }

    /**
     * Y offset that vertically centres a block of `contentHeight` pixels.
     * `yOffset` is in design-space pixels and is automatically scaled.
     */
    protected getCenteredY(contentHeight: number, yOffset: number = 0): number {
        return (this.gameHeight - contentHeight) / 2 + (yOffset * this.scaleFactor);
    }
}
