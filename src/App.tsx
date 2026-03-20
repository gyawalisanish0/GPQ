import React, { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameConfig }    from './engine/GameConfig';
import { Game_Scene }    from './scenes/Game_Scene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { LobbyScene }    from './scenes/LobbyScene';
import { LoadoutScene }  from './scenes/LoadoutScene';
import { motion, AnimatePresence } from 'motion/react';
import { GameState }       from './engine/GameState';
import { CombatManager }   from './engine/CombatManager';

// ─── SVG icons (inline so no extra asset requests) ────────────────────────
const FullscreenEnterIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
    <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
    <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
    <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
  </svg>
);

const FullscreenExitIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3v3a2 2 0 0 1-2 2H3"/>
    <path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
    <path d="M3 16h3a2 2 0 0 1 2 2v3"/>
    <path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
  </svg>
);

// ─── Fullscreen helpers (cross-browser) ───────────────────────────────────
function isFullscreen(): boolean {
  return !!(
    document.fullscreenElement               ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement    ||
    (document as any).msFullscreenElement
  );
}

async function requestFullscreen(el: Element): Promise<void> {
  try {
    if      (el.requestFullscreen)                         await el.requestFullscreen({ navigationUI: 'hide' });
    else if ((el as any).webkitRequestFullscreen)          await (el as any).webkitRequestFullscreen();
    else if ((el as any).mozRequestFullScreen)             await (el as any).mozRequestFullScreen();
    else if ((el as any).msRequestFullscreen)              await (el as any).msRequestFullscreen();
  } catch { /* User denied or API unavailable */ }
}

async function exitFullscreen(): Promise<void> {
  try {
    if      (document.exitFullscreen)                       await document.exitFullscreen();
    else if ((document as any).webkitExitFullscreen)        await (document as any).webkitExitFullscreen();
    else if ((document as any).mozCancelFullScreen)         await (document as any).mozCancelFullScreen();
    else if ((document as any).msExitFullscreen)            await (document as any).msExitFullscreen();
  } catch { /* Already not fullscreen */ }
}

// ─── App ──────────────────────────────────────────────────────────────────
export default function App() {
  const gameRef      = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const roRef        = useRef<ResizeObserver | null>(null);

  const [isReady, setIsReady]     = useState(false);
  const [isFull,  setIsFull]      = useState(false);
  const [fsAvail, setFsAvail]     = useState(false);
  const [showOrient, setShowOrient] = useState(false);

  // ── Fullscreen availability detection ───────────────────────────────────
  useEffect(() => {
    setFsAvail(
      !!(document.documentElement.requestFullscreen               ||
        (document.documentElement as any).webkitRequestFullscreen  ||
        (document.documentElement as any).mozRequestFullScreen      ||
        (document.documentElement as any).msRequestFullscreen)
    );
  }, []);

  // ── Fullscreen state listener ────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFull(isFullscreen());
    document.addEventListener('fullscreenchange',       onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    document.addEventListener('mozfullscreenchange',    onChange);
    document.addEventListener('MSFullscreenChange',     onChange);
    return () => {
      document.removeEventListener('fullscreenchange',       onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      document.removeEventListener('mozfullscreenchange',    onChange);
      document.removeEventListener('MSFullscreenChange',     onChange);
    };
  }, []);

  // ── Toggle fullscreen ────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen()) {
      await exitFullscreen();
    } else {
      // Prefer the game container; fall back to documentElement
      const el = containerRef.current ?? document.documentElement;
      await requestFullscreen(el);
    }
  }, []);

  // ── Orientation guard (portrait-first game, phone landscape = warn) ──────
  useEffect(() => {
    const check = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      const isPhone     = Math.min(window.innerWidth, window.innerHeight) < 600;
      setShowOrient(isLandscape && isPhone);
    };
    check();
    window.addEventListener('resize',            check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize',            check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  // ── iOS Safari scroll / rubber-band prevention ──────────────────────────
  useEffect(() => {
    const prevent = (e: TouchEvent) => {
      // Allow scrolling inside elements that explicitly need it
      if (!(e.target as Element)?.closest('[data-scrollable]')) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => document.removeEventListener('touchmove', prevent);
  }, []);

  // ── Also prevent context menu (long-press on mobile) ────────────────────
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', prevent);
    return () => document.removeEventListener('contextmenu', prevent);
  }, []);

  // ── Phaser initialisation ────────────────────────────────────────────────
  useEffect(() => {
    let game: Phaser.Game | null = null;

    const initGame = async () => {
      // Wait for the DOM to paint the container
      await new Promise(resolve => setTimeout(resolve, 200));

      const container = containerRef.current;
      if (!container) { console.error('Game container not found'); return; }

      // Wait for non-zero dimensions
      let attempts = 0;
      while ((container.clientWidth === 0 || container.clientHeight === 0) && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (gameRef.current) return;

      const config: Phaser.Types.Core.GameConfig = {
        ...GameConfig,
        parent: container,
        scene: [MainMenuScene, LobbyScene, LoadoutScene, Game_Scene],
      };

      const launch = (cfg: Phaser.Types.Core.GameConfig) => {
        game = new Phaser.Game(cfg);
        gameRef.current = game;
        GameState.getInstance().setGame(game);
        CombatManager.getInstance().setGame(game);
        game.events.once('SCENE_READY', () => setIsReady(true));
      };

      try {
        launch(config);
      } catch {
        console.warn('WebGL init failed — retrying with CANVAS renderer');
        launch({ ...config, type: Phaser.CANVAS });
      }

      // ── ResizeObserver: tell Phaser when the container resizes ────────────
      roRef.current = new ResizeObserver(entries => {
        const entry = entries[0];
        if (!entry || !gameRef.current) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          gameRef.current.scale.resize(width, height);
        }
      });
      roRef.current.observe(container);
    };

    initGame();

    return () => {
      roRef.current?.disconnect();
      roRef.current = null;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position:        'relative',
        width:           '100%',
        height:          '100%',
        overflow:        'hidden',
        backgroundColor: '#0a0a0a',
      }}
    >
      {/* ── Phaser canvas host ─────────────────────────────────────────── */}
      <div
        id="game-container"
        ref={containerRef}
        style={{
          position: 'absolute',
          inset:    0,
          width:    '100%',
          height:   '100%',
        }}
      />

      {/* ── Loading splash ────────────────────────────────────────────── */}
      <AnimatePresence>
        {!isReady && (
          <motion.div
            key="loading"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            className="loading-overlay"
            style={{ position: 'absolute', inset: 0, zIndex: 50 }}
          >
            <div className="loading-spinner" />
            <p className="loading-text">Initializing Engine…</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Orientation warning (portrait-first game on landscape phone) ── */}
      {showOrient && (
        <div
          className="orientation-overlay"
          style={{ position: 'absolute', inset: 0, zIndex: 100 }}
        >
          <div className="orientation-icon">⟳</div>
          <p className="orientation-text">Rotate your device to Portrait</p>
        </div>
      )}

      {/* ── Fullscreen toggle (visible once game is ready & API available) */}
      {isReady && fsAvail && (
        <button
          className="fullscreen-btn"
          onClick={toggleFullscreen}
          title={isFull ? 'Exit fullscreen' : 'Enter fullscreen'}
          aria-label={isFull ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFull ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
          <span>{isFull ? 'Exit' : 'Fullscreen'}</span>
        </button>
      )}
    </div>
  );
}
