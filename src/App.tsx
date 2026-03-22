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
import DebugPanel from './components/DebugPanel';

export default function App() {
  const gameRef          = useRef<Phaser.Game | null>(null);
  const [isReady,  setIsReady ] = useState(false);
  const [liveGame, setLiveGame] = useState<Phaser.Game | null>(null);

  useEffect(() => {
    let game: Phaser.Game | null = null;

    const initGame = async () => {
      await new Promise(resolve => setTimeout(resolve, 200));

      const container = document.getElementById('game-container');
      if (!container) { console.error('Game container not found'); return; }

      let attempts = 0;
      while ((container.clientWidth === 0 || container.clientHeight === 0) && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!gameRef.current) {
        const config = {
          ...GameConfig,
          scene: [MainMenuScene, LobbyScene, LoadoutScene, Game_Scene],
        };

        const launch = (cfg: typeof config) => {
          game = new Phaser.Game(cfg);
          gameRef.current = game;
          GameState.getInstance().setGame(game);
          CombatManager.getInstance().setGame(game);
          game.events.once('SCENE_READY', () => {
            setIsReady(true);
            setLiveGame(game); // expose to DebugPanel
          });
        };

        try {
          launch(config);
        } catch (error) {
          console.error('Failed to initialize Phaser:', error);
          if (config.type !== Phaser.CANVAS) {
            console.log('Retrying with CANVAS renderer...');
            config.type = Phaser.CANVAS;
            launch(config);
          }
        }
      }
    };

    initGame();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        setLiveGame(null);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-neutral-900 overflow-hidden">
      {/* Phaser Canvas */}
      <div id="game-container" className="absolute inset-0" />

      {/* lil-gui Debug Panel (press ` or F3 to toggle) */}
      <DebugPanel game={liveGame} />

      {/* Loading screen */}
      <AnimatePresence>
        {!isReady && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-white font-mono text-sm tracking-widest uppercase opacity-50">
                Initializing Engine...
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isReady && <div />}
    </div>
  );
}
