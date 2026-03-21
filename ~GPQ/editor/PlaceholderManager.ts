// ─── PlaceholderManager ──────────────────────────────────────────────────────
// Injects ADMIN_-prefixed placeholder data to prevent crashes when the editor
// switches to a scene that normally requires real game data.

export class PlaceholderManager {
  private static store: Map<string, unknown> = new Map();

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Store a value under the ADMIN_ namespace. */
  static set(key: string, value: unknown): void {
    this.store.set(`ADMIN_${key.toUpperCase()}`, value);
  }

  /** Bulk-set multiple values. */
  static setAll(record: Record<string, unknown>): void {
    Object.entries(record).forEach(([k, v]) => this.set(k, v));
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /** Retrieve a value by its un-prefixed key. */
  static get<T = unknown>(key: string): T | undefined {
    return this.store.get(`ADMIN_${key.toUpperCase()}`) as T | undefined;
  }

  /** Returns true if the key exists. */
  static has(key: string): boolean {
    return this.store.has(`ADMIN_${key.toUpperCase()}`);
  }

  /** Returns every stored ADMIN_ pair as a plain object. */
  static getAll(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    this.store.forEach((v, k) => { out[k] = v; });
    return out;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  static clear(): void {
    this.store.clear();
  }

  /**
   * Inject a standard set of safe defaults for a given scene so the scene
   * can start without crashing when launched from the editor without real data.
   */
  static injectDefaultsForScene(sceneKey: string): void {
    this.set('SCENE_KEY',       sceneKey);
    this.set('PLAYER_1',        { id: 'ADMIN_PLAYER_1', name: 'Debug Hero',  level: 1, hp: 500 });
    this.set('OPPONENT_1',      { id: 'ADMIN_OPP_1',    name: 'Debug Dummy', level: 1, hp: 500 });
    this.set('MAP_001',         { id: 'map_001', name: 'Debug Map', difficulty: 1 });
    this.set('USER_CHAR_ID',    'warrior');
    this.set('OPPONENT_CHAR_ID','dummy1');

    console.info(
      `[PlaceholderManager] Injected defaults for scene "${sceneKey}":`,
      this.getAll()
    );
  }

  /** Log all current placeholder values to the console. */
  static dump(): void {
    console.table(this.getAll());
  }
}
