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
import { CombatRegistry } from './engine/CombatRegistry';

export default function App() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let game: Phaser.Game | null = null;
    
    const initGame = async () => {
      // Small delay to ensure the container is fully rendered
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const container = document.getElementById('game-container');
      if (!container) {
        console.error('Game container not found');
        return;
      }

      // Wait for container to have a non-zero size
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
        
        try {
          game = new Phaser.Game(config);
          gameRef.current = game;
          
          // Initialize GameState system
          GameState.getInstance().setGame(game);
          CombatManager.getInstance().setGame(game);

          game.events.once('SCENE_READY', () => {
            setIsReady(true);
          });
        } catch (error) {
          console.error('Failed to initialize Phaser:', error);
          if (config.type !== Phaser.CANVAS) {
            console.log('Retrying with CANVAS renderer...');
            config.type = Phaser.CANVAS;
            game = new Phaser.Game(config);
            gameRef.current = game;
            GameState.getInstance().setGame(game);
            CombatManager.getInstance().setGame(game);
            
            game.events.once('SCENE_READY', () => setIsReady(true));
          }
        }
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
      {/* Phaser Canvas Container */}
      <div id="game-container" className="absolute inset-0" />

      {/* React UI Layer */}
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
