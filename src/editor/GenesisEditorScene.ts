// ─── GenesisEditorScene ──────────────────────────────────────────────────────
// A persistent Phaser scene that runs in parallel with every game scene.
// Hosts the Tweakpane GUI, the DEBUG pill, drag-manipulation, and layout I/O.

import Phaser from 'phaser';
import { Pane, FolderApi, TpChangeEvent, InputBindingApi } from 'tweakpane';
// BindingApi is the base type exported from @tweakpane/core which tweakpane re-exports as InputBindingApi
type BindingApi = InputBindingApi;

import { DragHandler }         from './DragHandler';
import { LayoutManager }       from './LayoutManager';
import { PlaceholderManager }  from './PlaceholderManager';
import type { InspectorProxy } from './types';

const EDITOR_KEY    = 'GenesisEditorScene';
const DOUBLE_TAP_MS = 280;

// ─────────────────────────────────────────────────────────────────────────────

export class GenesisEditorScene extends Phaser.Scene {
  // ── Tweakpane ──────────────────────────────────────────────────────────────
  private pane!: Pane;
  private propFolder!:   FolderApi;
  private sceneFolder!:  FolderApi;
  private actionFolder!: FolderApi;

  // Bindings created for the currently-selected object (need disposing on change)
  private propBindings: BindingApi[] = [];

  // ── Inspector proxy ────────────────────────────────────────────────────────
  private proxy: InspectorProxy = {
    x: 0, y: 0, scaleX: 1, scaleY: 1, alpha: 1, angle: 0,
    name: '', type: '',
  };

  // ── Drag handler ───────────────────────────────────────────────────────────
  private dragHandler!: DragHandler;

  // ── HTML pill ──────────────────────────────────────────────────────────────
  private pillEl!: HTMLDivElement;
  private lastTapMs = 0;

  // ── Scene navigator ────────────────────────────────────────────────────────
  private navState    = { activeScene: '' };
  private sceneOpts: Record<string, string> = {};

  // ── Status display ────────────────────────────────────────────────────────
  private statusState = { status: 'No selection' };

  constructor() {
    super({ key: EDITOR_KEY, active: false });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  create(): void {
    this.buildDragHandler();
    this.buildTweakpane();
    this.buildDebugPill();

    this.game.events.on(Phaser.Scenes.Events.START,    this.onSceneListChanged, this);
    this.game.events.on(Phaser.Scenes.Events.STOP,     this.onSceneListChanged, this);
    this.game.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onSceneListChanged, this);

    this.refreshSceneList();
    console.info('[GenesisEditor] ✔ Running. Tap the red DEBUG pill to toggle UI.');
  }

  shutdown(): void {
    this.game.events.off(Phaser.Scenes.Events.START,    this.onSceneListChanged, this);
    this.game.events.off(Phaser.Scenes.Events.STOP,     this.onSceneListChanged, this);
    this.game.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onSceneListChanged, this);

    this.dragHandler.destroy();
    this.pane.dispose();
    this.pillEl?.remove();
  }

  /** Keep the property panel in sync while dragging. */
  update(): void {
    const obj = this.dragHandler.selectedObject;
    if (obj) {
      this.syncProxy(obj);
      this.pane.refresh();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DragHandler
  // ──────────────────────────────────────────────────────────────────────────

  private buildDragHandler(): void {
    this.dragHandler = new DragHandler(this, (obj) => {
      if (obj) {
        this.syncProxy(obj);
        this.rebuildPropBindings();
        this.setStatus(`Selected: ${(obj as any).name || (obj as any).type}`);
      } else {
        this.setStatus('No selection');
        this.rebuildPropBindings();
      }
      this.pane.refresh();
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Tweakpane
  // ──────────────────────────────────────────────────────────────────────────

  private buildTweakpane(): void {
    this.pane = new Pane({ title: '⚙  Genesis Editor', expanded: true });

    // Position pane on the right side of the viewport
    const el = this.pane.element as HTMLElement;
    Object.assign(el.style, {
      position:  'fixed',
      top:       '44px',
      right:     '8px',
      width:     '280px',
      maxHeight: 'calc(100vh - 52px)',
      overflowY: 'auto',
      zIndex:    '9999',
    });

    // Status row (read-only)
    this.pane.addBinding(this.statusState, 'status', { label: 'ℹ', readonly: true });
    this.pane.addBlade({ view: 'separator' });

    // Folders
    this.sceneFolder  = this.pane.addFolder({ title: '🗺  Scene Navigator', expanded: false });
    this.pane.addBlade({ view: 'separator' });

    this.propFolder   = this.pane.addFolder({ title: '📐  Property Inspector', expanded: true });
    this.pane.addBlade({ view: 'separator' });

    this.actionFolder = this.pane.addFolder({ title: '💾  Actions', expanded: true });

    this.rebuildPropBindings();
    this.buildActionsUI();
  }

  // ── Scene Navigator ────────────────────────────────────────────────────────

  private buildSceneNavUI(): void {
    while (this.sceneFolder.children.length) {
      this.sceneFolder.children[0].dispose();
    }

    if (Object.keys(this.sceneOpts).length === 0) {
      this.sceneFolder.addBinding(
        { info: 'No scenes detected yet.' },
        'info',
        { label: '', readonly: true }
      );
      return;
    }

    this.sceneFolder
      .addBinding(this.navState, 'activeScene', {
        label:   'Switch to',
        options: this.sceneOpts,
      })
      .on('change', (ev: TpChangeEvent<string>) => {
        const val = ev.value;
        if (!val || val === EDITOR_KEY) return;
        this.switchToScene(val);
      });

    this.sceneFolder
      .addButton({ title: '↺  Refresh List' })
      .on('click', () => this.refreshSceneList());

    this.sceneFolder
      .addButton({ title: '🔄  Restart Current Scene' })
      .on('click', () => {
        const s = this.getActiveGameScene();
        if (s) s.scene.restart();
      });
  }

  // ── Property Inspector ─────────────────────────────────────────────────────

  private rebuildPropBindings(): void {
    this.propBindings.forEach(b => b.dispose());
    this.propBindings = [];
    while (this.propFolder.children.length) {
      this.propFolder.children[0].dispose();
    }

    const obj = this.dragHandler.selectedObject as any;
    if (!obj) {
      this.propFolder.addBinding(
        { hint: 'Click a sprite on the canvas to select it.' },
        'hint',
        { label: '', readonly: true }
      );
      return;
    }

    // Read-only info row
    this.propFolder.addBinding(this.proxy, 'name', { label: 'Name', readonly: true });
    this.propFolder.addBinding(this.proxy, 'type', { label: 'Type', readonly: true });

    const W = this.game.canvas.width;
    const H = this.game.canvas.height;

    const bind = (
      key: keyof InspectorProxy,
      label: string,
      opts: Record<string, unknown> = {}
    ): void => {
      const b = this.propFolder.addBinding(this.proxy, key, { label, ...opts }) as BindingApi;
      b.on('change', (ev: TpChangeEvent<unknown>) => {
        obj[key as string] = ev.value;
      });
      this.propBindings.push(b);
    };

    bind('x',      'X',       { step: 1,    min: -W,  max: W * 2 });
    bind('y',      'Y',       { step: 1,    min: -H,  max: H * 2 });
    bind('scaleX', 'Scale X', { step: 0.01, min: -5,  max: 5 });
    bind('scaleY', 'Scale Y', { step: 0.01, min: -5,  max: 5 });
    bind('alpha',  'Alpha',   { step: 0.01, min:  0,  max: 1 });
    bind('angle',  'Angle',   { step: 1,    min: -360, max: 360 });

    this.propFolder
      .addButton({ title: '↩  Reset Transform' })
      .on('click', () => {
        obj.x = obj.y = 0;
        obj.scaleX = obj.scaleY = 1;
        obj.alpha  = 1;
        obj.angle  = 0;
        this.syncProxy(obj);
        this.pane.refresh();
      });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private buildActionsUI(): void {
    while (this.actionFolder.children.length) {
      this.actionFolder.children[0].dispose();
    }

    this.actionFolder
      .addButton({ title: '💾  Save Layout (current scene)' })
      .on('click', async () => {
        const s = this.getActiveGameScene();
        if (!s) { alert('No active game scene found.'); return; }
        const ok = await LayoutManager.saveLayout(s);
        if (ok) this.setStatus(`✔ Saved: ${s.scene.key}`);
      });

    this.actionFolder
      .addButton({ title: '📂  Load Layout …' })
      .on('click', async () => {
        const layout = await LayoutManager.loadLayoutFromFile();
        if (!layout) return;
        const s = this.game.scene.getScene(layout.sceneKey);
        if (s) {
          LayoutManager.applyLayout(s, layout);
          this.setStatus(`✔ Applied: ${layout.sceneKey}`);
        } else {
          alert(`Scene "${layout.sceneKey}" is not currently running.`);
        }
      });

    this.actionFolder
      .addButton({ title: '🔎  Re-scan Scene Objects' })
      .on('click', () => this.rescanScene());

    this.actionFolder
      .addButton({ title: '✕  Clear Selection' })
      .on('click', () => {
        this.dragHandler.clearSelection();
        this.pane.refresh();
      });

    this.actionFolder
      .addButton({ title: '📋  Dump Placeholders to Console' })
      .on('click', () => PlaceholderManager.dump());
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DEBUG pill
  // ──────────────────────────────────────────────────────────────────────────

  private buildDebugPill(): void {
    const pill = document.createElement('div');
    pill.id    = 'genesis-debug-pill';

    Object.assign(pill.style, {
      position:      'fixed',
      top:           '8px',
      left:          '8px',
      background:    '#ef4444',
      color:         '#ffffff',
      fontFamily:    '"Courier New", Courier, monospace',
      fontSize:      '11px',
      fontWeight:    '700',
      letterSpacing: '1.5px',
      padding:       '4px 10px',
      borderRadius:  '20px',
      cursor:        'pointer',
      zIndex:        '10000',
      userSelect:    'none',
      boxShadow:     '0 2px 8px rgba(0,0,0,0.45)',
      transition:    'transform 0.1s ease, opacity 0.15s ease',
      border:        '1.5px solid rgba(255,255,255,0.3)',
    });

    pill.innerHTML = '⚙&nbsp;DEBUG';
    pill.title     = 'Single tap: toggle UI  |  Double-tap: re-scan objects';

    pill.addEventListener('mouseenter', () => { pill.style.transform = 'scale(1.08)'; });
    pill.addEventListener('mouseleave', () => { pill.style.transform = 'scale(1)'; });

    pill.addEventListener('click', () => {
      const now = Date.now();
      if (now - this.lastTapMs < DOUBLE_TAP_MS) {
        // Double-tap → re-scan
        this.rescanScene();
        pill.style.background = '#f97316';
        setTimeout(() => { pill.style.background = '#ef4444'; }, 300);
      } else {
        this.togglePane();
      }
      this.lastTapMs = now;
    });

    document.body.appendChild(pill);
    this.pillEl = pill;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Scene list management
  // ──────────────────────────────────────────────────────────────────────────

  private refreshSceneList(): void {
    const opts: Record<string, string> = {};
    for (const s of this.game.scene.scenes) {
      if (s.scene.key === EDITOR_KEY) continue;
      opts[s.scene.key] = s.scene.key;
    }
    this.sceneOpts = opts;

    const keys = Object.keys(opts);
    if (keys.length && !this.navState.activeScene) {
      this.navState.activeScene = keys[0];
    }

    this.buildSceneNavUI();
    this.pane.refresh();
  }

  private onSceneListChanged(): void {
    this.refreshSceneList();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Scene switching
  // ──────────────────────────────────────────────────────────────────────────

  private switchToScene(key: string): void {
    PlaceholderManager.injectDefaultsForScene(key);
    const data   = PlaceholderManager.getAll();
    const target = this.game.scene.getScene(key);

    if (target) {
      if (target.sys.isActive()) {
        target.scene.restart(data);
      } else {
        // Stop other game scenes first
        for (const s of this.game.scene.scenes) {
          if (s === target || s.scene.key === EDITOR_KEY) continue;
          if (s.sys.isActive()) s.scene.stop();
        }
        target.scene.start(data);
      }
    }

    this.setStatus(`Switched → ${key}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private syncProxy(obj: unknown): void {
    const o = obj as any;
    this.proxy.x      = o.x      ?? 0;
    this.proxy.y      = o.y      ?? 0;
    this.proxy.scaleX = o.scaleX ?? 1;
    this.proxy.scaleY = o.scaleY ?? 1;
    this.proxy.alpha  = o.alpha  ?? 1;
    this.proxy.angle  = o.angle  ?? 0;
    this.proxy.name   = o.name   || '';
    this.proxy.type   = o.type   || 'Unknown';
  }

  private getActiveGameScene(): Phaser.Scene | null {
    for (const s of this.game.scene.scenes) {
      if (s.scene.key === EDITOR_KEY) continue;
      if (s.sys.isActive()) return s;
    }
    return null;
  }

  private togglePane(): void {
    const el      = this.pane.element as HTMLElement;
    const visible = el.style.display !== 'none';
    el.style.display          = visible ? 'none' : 'block';
    this.pillEl.style.opacity = visible ? '0.6'  : '1';
  }

  private rescanScene(): void {
    const s = this.getActiveGameScene();
    if (!s) { this.setStatus('No active scene to scan.'); return; }
    const count = s.sys.displayList.length;
    this.setStatus(`Re-scanned "${s.scene.key}" (${count} objects)`);
    this.dragHandler.clearSelection();
    this.refreshSceneList();
    console.info(`[GenesisEditor] Re-scanned "${s.scene.key}": ${count} objects.`);
  }

  private setStatus(msg: string): void {
    this.statusState.status = msg;
    this.pane.refresh();
  }
}
