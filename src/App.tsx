import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameConfig } from './engine/GameConfig';
import { Game_Scene } from './scenes/Game_Scene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { LoadoutScene } from './scenes/LoadoutScene';
import { motion, AnimatePresence } from 'motion/react';
import { GameState } from './engine/GameState';
import { CombatManager } from './engine/CombatManager';

export default function App() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initGame = async () => {
      // Small delay to ensure the container is fully laid out
      await new Promise(resolve => setTimeout(resolve, 100));

      const container = document.getElementById('game-container');
      if (!container) {
        console.error('Game container not found');
        return;
      }

      // Wait for a non-zero container size (important inside iframes / AI Studio)
      let attempts = 0;
      while ((container.clientWidth === 0 || container.clientHeight === 0) && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (gameRef.current) return; // already initialised

      const config: Phaser.Types.Core.GameConfig = {
        ...GameConfig,
        scene: [MainMenuScene, LobbyScene, LoadoutScene, Game_Scene],
      };

      try {
        const game = new Phaser.Game(config);
        gameRef.current = game;

        GameState.getInstance().setGame(game);
        CombatManager.getInstance().setGame(game);

        game.events.once('SCENE_READY', () => setIsReady(true));
      } catch (error) {
        console.error('Failed to initialise Phaser:', error);
      }
    };

    initGame();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-neutral-900 overflow-hidden">
      {/* Phaser canvas lives here */}
      <div id="game-container" className="absolute inset-0" />

      {/*
       * Loading overlay.
       *
       * CRITICAL FIX — pointer-events: none
       * ────────────────────────────────────
       * Without this the overlay intercepts every touch / click even after its
       * opacity reaches 0 during the exit animation, making the entire Phaser
       * canvas unresponsive until AnimatePresence finally unmounts the element
       * (~300 ms after the game is ready).  Setting pointer-events to none means
       * the overlay is purely visual and never competes with Phaser for input.
       */}
      <AnimatePresence>
        {!isReady && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ pointerEvents: 'none' }}   /* ← the critical fix */
            className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-white font-mono text-sm tracking-widest uppercase opacity-50">
                Initializing Engine…
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
