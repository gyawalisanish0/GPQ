import Phaser from 'phaser';

export class BaseScene extends Phaser.Scene {
    protected gameWidth: number = 0;
    protected gameHeight: number = 0;
    protected centerX: number = 0;
    protected centerY: number = 0;
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

    protected onInit(data?: any) {
        // Override in subclasses
    }

    protected updateDimensions() {
        this.gameWidth = this.cameras.main.width;
        this.gameHeight = this.cameras.main.height;
        this.centerX = this.gameWidth / 2;
        this.centerY = this.gameHeight / 2;
        this.scaleFactor = Math.min(this.gameWidth / 1080, this.gameHeight / 1920);
    }

    protected handleResize(gameSize: Phaser.Structs.Size) {
        this.cameras.resize(gameSize.width, gameSize.height);
        this.updateDimensions();
        this.onResize();
    }

    protected onResize() {
        // Override in subclasses to rebuild UI
    }

    /**
     * Returns the X offset needed to left-align a block of content so that
     * it is centred horizontally within the canvas.
     */
    protected getCenteredX(contentWidth: number): number {
        return (this.gameWidth - contentWidth) / 2;
    }

    /**
     * Returns the Y offset needed to top-align a block of content so that
     * it is centred vertically within the canvas.
     *
     * @param contentHeight Height of the content in **scaled** pixels (i.e.
     *   already multiplied by `this.scaleFactor` where necessary).
     * @param yOffset Additional vertical nudge in **raw logical pixels**
     *   (1080×1920 design space). The offset is scaled by `scaleFactor`
     *   internally — do NOT pre-scale the value before passing it in.
     *
     * Example — shift the board 77 logical pixels upward:
     *   `this.getCenteredY(GRID_SIZE * CELL_SIZE, -77)`
     */
    protected getCenteredY(contentHeight: number, yOffset: number = 0): number {
        return (this.gameHeight - contentHeight) / 2 + (yOffset * this.scaleFactor);
    }
}
