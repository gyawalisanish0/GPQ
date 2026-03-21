import Phaser from 'phaser';

// ─── Types ───────────────────────────────────────────────────────────────────

type SupportedEvent =
  | 'pointerdown'
  | 'pointerup'
  | 'pointermove'
  | 'pointerover'
  | 'pointerout'
  | 'wheel';

interface ManagedEntry {
  event: SupportedEvent;
  bound: Function;
}

// ─── GlobalInputManager ──────────────────────────────────────────────────────

/**
 * GlobalInputManager
 * ──────────────────
 * A singleton that sits above individual Phaser scenes and provides:
 *
 *  1. Scene-scoped handler registration with guaranteed cleanup on SHUTDOWN
 *     (prevents stale listeners surviving scene transitions).
 *
 *  2. Tap-safe interactive objects – distinguishes a tap from a drag so that
 *     touch users don't accidentally trigger buttons while scrolling.
 *
 *  3. A global input-block gate – lets systems like CombatManager pause all
 *     player input while an animation or AI turn is in progress without having
 *     to thread a flag through every handler.
 *
 *  4. Coordinate helpers that stay correct across Phaser's Scale.RESIZE mode
 *     and the 1080×1920 design-space ↔ actual-screen-size transform.
 *
 * Usage
 * ─────
 *   const gim = GlobalInputManager.getInstance();
 *
 *   // Register a scene-scoped scene-level pointer handler
 *   gim.on(this, 'pointerdown', handler);
 *
 *   // Make any interactive GameObject respond to taps (not drags)
 *   gim.makeTappable(myButton, () => doSomething());
 *
 *   // Block / unblock player input during processing
 *   gim.block();
 *   // … later …
 *   gim.unblock();
 */
export class GlobalInputManager {
  private static _instance: GlobalInputManager | null = null;

  /** scene key → list of (event, bound-handler) pairs */
  private _registry = new Map<string, ManagedEntry[]>();

  /** When true every handler registered through this manager is silenced */
  private _blocked = false;

  private constructor() {}

  public static getInstance(): GlobalInputManager {
    if (!GlobalInputManager._instance) {
      GlobalInputManager._instance = new GlobalInputManager();
    }
    return GlobalInputManager._instance;
  }

  // ── Input block gate ────────────────────────────────────────────────────

  /** Stop all managed handlers from firing (e.g. during board processing). */
  public block(): void   { this._blocked = true;  }

  /** Re-enable all managed handlers. */
  public unblock(): void { this._blocked = false; }

  /** Returns true while input is globally blocked. */
  public isBlocked(): boolean { return this._blocked; }

  // ── Scene-scoped handler registration ───────────────────────────────────

  /**
   * Register `handler` on `scene.input` for `event`.
   * The handler is automatically removed when the scene emits SHUTDOWN,
   * preventing zombie listeners from surviving scene transitions.
   *
   * The handler is also silenced while `isBlocked()` is true unless you
   * pass `ignoreBlock = true` (useful for UI that must always respond).
   */
  public on(
    scene: Phaser.Scene,
    event: SupportedEvent,
    handler: (pointer: Phaser.Input.Pointer, ...args: any[]) => void,
    ignoreBlock = false,
  ): void {
    const bound = (pointer: Phaser.Input.Pointer, ...args: any[]) => {
      if (!ignoreBlock && this._blocked) return;
      handler(pointer, ...args);
    };

    scene.input.on(event, bound);

    const key = scene.sys.settings.key;

    if (!this._registry.has(key)) {
      this._registry.set(key, []);

      // Auto-cleanup on scene shutdown
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this._cleanupScene(scene, key);
      });
    }

    this._registry.get(key)!.push({ event, bound });
  }

  /**
   * Explicitly remove all handlers registered for a scene.
   * Called automatically on SHUTDOWN; you may also call it manually.
   */
  public offAll(scene: Phaser.Scene): void {
    this._cleanupScene(scene, scene.sys.settings.key);
  }

  private _cleanupScene(scene: Phaser.Scene, key: string): void {
    const entries = this._registry.get(key);
    if (!entries) return;

    try {
      if (scene.input) {
        entries.forEach(({ event, bound }) => {
          scene.input.off(event, bound as any);
        });
      }
    } catch {
      // Scene may already be destroyed; swallow the error.
    }

    this._registry.delete(key);
  }

  // ── Tap-safe interactive objects ─────────────────────────────────────────

  /**
   * Wraps a Phaser interactive GameObject so `callback` fires ONLY when the
   * pointer has not moved more than `threshold` CSS-pixels between pointerdown
   * and pointerup.  This correctly distinguishes taps from drags on touch
   * screens.
   *
   * If `ignoreBlock` is false (default) the callback is silenced while the
   * global input block is active.
   */
  public makeTappable(
    obj: Phaser.GameObjects.GameObject,
    callback: (pointer: Phaser.Input.Pointer) => void,
    threshold = 12,
    ignoreBlock = false,
  ): void {
    let downX = 0;
    let downY = 0;

    obj.on('pointerdown', (p: Phaser.Input.Pointer) => {
      downX = p.x;
      downY = p.y;
    });

    obj.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!ignoreBlock && this._blocked) return;
      const dist = Math.sqrt((p.x - downX) ** 2 + (p.y - downY) ** 2);
      if (dist <= threshold) callback(p);
    });
  }

  // ── Coordinate helpers ───────────────────────────────────────────────────

  /**
   * Returns true if the pointer falls inside a rectangle defined in
   * SCREEN space (CSS pixels).  Use this when testing against positions
   * you computed with scene.cameras.main.width / scaleFactor, since those
   * values are already in the same coordinate space as pointer.x / pointer.y.
   */
  public inBounds(
    pointer: Phaser.Input.Pointer,
    x: number, y: number,
    width: number, height: number,
  ): boolean {
    return (
      pointer.x >= x && pointer.x <= x + width &&
      pointer.y >= y && pointer.y <= y + height
    );
  }

  /**
   * Converts a position from the 1080×1920 design-space into screen-space
   * CSS pixels, using the scene's current scaleFactor.
   *
   * Useful when you store hard-coded HUD positions in design-space and need
   * to hit-test them against raw pointer coordinates.
   */
  public designToScreen(
    designX: number, designY: number,
    scaleFactor: number,
  ): { x: number; y: number } {
    return { x: designX * scaleFactor, y: designY * scaleFactor };
  }
}
