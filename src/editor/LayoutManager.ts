// ─── LayoutManager ───────────────────────────────────────────────────────────
// Captures/applies scene object positions and serialises them to JSON.
// Prefers the File System Access API (lets the user save directly into
// src/scenes/) with a standard download fallback.

import Phaser from 'phaser';
import type { ObjectLayout, SceneLayout } from './types';

export class LayoutManager {
  static readonly VERSION = '1.0.0';

  // ── Capture ───────────────────────────────────────────────────────────────

  static captureScene(scene: Phaser.Scene): ObjectLayout[] {
    const objects: ObjectLayout[] = [];
    const children = scene.sys.displayList.getChildren() as Phaser.GameObjects.GameObject[];

    children.forEach((child, idx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c    = child as any;
      const id   = (c.name as string) || `${c.type as string}_${idx}`;

      objects.push({
        id,
        name:   id,
        type:   (c.type as string) || 'Unknown',
        x:      Math.round((c.x as number) ?? 0),
        y:      Math.round((c.y as number) ?? 0),
        scaleX: (c.scaleX as number) ?? 1,
        scaleY: (c.scaleY as number) ?? 1,
        alpha:  (c.alpha  as number) ?? 1,
        angle:  (c.angle  as number) ?? 0,
      });
    });

    return objects;
  }

  // ── Apply ─────────────────────────────────────────────────────────────────

  static applyLayout(scene: Phaser.Scene, layout: SceneLayout): void {
    const children = scene.sys.displayList.getChildren() as Phaser.GameObjects.GameObject[];

    layout.objects.forEach(data => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj = children.find(c => (c as any).name === data.id) as any | undefined;
      if (!obj) return;

      obj.x      = data.x;
      obj.y      = data.y;
      obj.scaleX = data.scaleX;
      obj.scaleY = data.scaleY;
      obj.alpha  = data.alpha;
      obj.angle  = data.angle;
    });

    console.info(
      `[LayoutManager] Applied "${layout.sceneKey}" layout (${layout.objects.length} objects).`
    );
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  static async saveLayout(scene: Phaser.Scene): Promise<boolean> {
    const layout: SceneLayout = {
      sceneKey: scene.scene.key,
      version:  this.VERSION,
      savedAt:  new Date().toISOString(),
      objects:  this.captureScene(scene),
    };

    const json     = JSON.stringify(layout, null, 2);
    const filename = `${scene.scene.key.toLowerCase()}_layout.json`;

    // Prefer File System Access API (Chromium / Edge 86+)
    if ('showSaveFilePicker' in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          startIn:       'documents',
          types: [{ description: 'JSON Layout', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        console.info(`[LayoutManager] Saved via File System Access API → ${filename}`);
        return true;
      } catch (err: unknown) {
        if ((err as { name?: string }).name !== 'AbortError') {
          console.warn('[LayoutManager] File System Access API error:', err);
        }
        // User cancelled or API unavailable — fall through
      }
    }

    // Fallback: trigger download
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: filename,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.info(`[LayoutManager] Downloaded → ${filename}`);
    return true;
  }

  // ── Parse ─────────────────────────────────────────────────────────────────

  static parseLayout(json: string): SceneLayout | null {
    try {
      return JSON.parse(json) as SceneLayout;
    } catch {
      console.error('[LayoutManager] Failed to parse layout JSON.');
      return null;
    }
  }

  // ── Load via file picker ──────────────────────────────────────────────────

  static async loadLayoutFromFile(): Promise<SceneLayout | null> {
    return new Promise<SceneLayout | null>(resolve => {
      const input = Object.assign(document.createElement('input'), {
        type:   'file',
        accept: '.json',
      });
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(this.parseLayout(reader.result as string));
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      input.click();
    });
  }
}
