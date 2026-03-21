// ─── App.tsx ──────────────────────────────────────────────────────────────────
// Bootstraps the Phaser game and, when VITE_EDITOR=true, also starts the
// GenesisEditorScene in parallel with the normal game scenes.

import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameConfig }      from './engine/GameConfig';
import { Game_Scene }      from './scenes/Game_Scene';
import { MainMenuScene }   from './scenes/MainMenuScene';
import { LobbyScene }      from './scenes/LobbyScene';
import { LoadoutScene }    from './scenes/LoadoutScene';
import { motion, AnimatePresence } from 'motion/react';
import { GameState }       from './engine/GameState';
import { CombatManager }   from './engine/CombatManager';
import { GenesisEditorScene } from './editor/GenesisEditorScene';

// ── Feature flag ──────────────────────────────────────────────────────────────
// Add  VITE_EDITOR=true  to your .env.local to enable the editor.
// In development mode (npm run dev) it is always enabled for convenience.
const EDITOR_ENABLED: boolean =
  import.meta.env['VITE_EDITOR'] === 'true' ||
  import.meta.env.DEV === true;

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initGame = async () => {
      // Give the container a moment to render and size itself
      await new Promise<void>(resolve => setTimeout(resolve, 200));

      const container = document.getElementById('game-container');
      if (!container) {
        console.error('[App] game-container element not found');
        return;
      }

      // Wait up to 1 second for the container to have non-zero dimensions
      for (let i = 0; i < 10; i++) {
        if (container.clientWidth > 0 && container.clientHeight > 0) break;
        await new Promise<void>(resolve => setTimeout(resolve, 100));
      }

      if (gameRef.current) return; // already initialized

      const gameScenes = [MainMenuScene, LobbyScene, LoadoutScene, Game_Scene];

      // Editor scene goes last so its overlay renders on top
      const allScenes = EDITOR_ENABLED
        ? [...gameScenes, GenesisEditorScene]
        : gameScenes;

      const config: Phaser.Types.Core.GameConfig = {
        ...GameConfig,
        scene: allScenes,
      };

      const boot = (game: Phaser.Game) => {
        gameRef.current = game;
        GameState.getInstance().setGame(game);
        CombatManager.getInstance().setGame(game);

        game.events.once('SCENE_READY', () => {
          setIsReady(true);

          if (EDITOR_ENABLED) {
            game.scene.start('GenesisEditorScene');
            console.info(
              '%c[GenesisEditor] Active — tap the red DEBUG pill to open/close the UI.',
              'color:#ef4444;font-weight:bold'
            );
          }
        });
      };

      try {
        boot(new Phaser.Game(config));
      } catch (err) {
        console.error('[App] Phaser init failed, retrying with CANVAS:', err);
        boot(new Phaser.Game({ ...config, type: Phaser.CANVAS }));
      }
    };

    void initGame();

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      document.getElementById('genesis-debug-pill')?.remove();
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-neutral-900 overflow-hidden">
      {/* Phaser canvas */}
      <div id="game-container" className="absolute inset-0" />

      {/* Loading overlay */}
      <AnimatePresence>
        {!isReady && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-white font-mono text-sm tracking-widest uppercase opacity-50">
                Initializing Engine…
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
