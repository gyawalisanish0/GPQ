// ─── Genesis Editor Types ────────────────────────────────────────────────────

export interface ObjectLayout {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  angle: number;
}

export interface SceneLayout {
  sceneKey: string;
  version: string;
  savedAt: string;
  objects: ObjectLayout[];
}

export interface InspectorProxy {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  angle: number;
  name: string;
  type: string;
}

export interface EditorState {
  enabled: boolean;
  paneVisible: boolean;
  activeSceneKey: string;
  selectedObjectName: string;
}

export type DragState = {
  isDragging: boolean;
  object: Phaser.GameObjects.GameObject | null;
  offsetX: number;
  offsetY: number;
};
