/**
 * DebugPanel — lil-gui overlay for Genesis Puzzle Quest
 *
 * Toggle with  `  (backtick)  or  F3
 *
 * Reads live game state via Phaser game.events, writes tweaks back
 * via the same event bus so the panel works without touching game code.
 *
 * Install: npm install lil-gui
 */
import { useEffect, useRef } from 'react';
import GUI from 'lil-gui';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebugPanelProps {
  game: Phaser.Game | null;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function DebugPanel({ game }: DebugPanelProps) {
  const guiRef = useRef<GUI | null>(null);

  useEffect(() => {
    if (!game) return;

    // ── Reactive state objects (lil-gui reads these by reference) ────────────
    const layoutState = {
      scaleFactor: 1,
      canvasWidth: 0,
      canvasHeight: 0,
      cellSize: 88,
      gridOffsetX: 0,
      gridOffsetY: 0,
    };

    const combatState = {
      currentTurn: '—',
      turnCount: 0,
      powerSurge: 0,
      // User
      userHp: 0,
      userMaxHp: 0,
      userCharge: 0,
      userMaxCharge: 0,
      // Opponent
      opponentHp: 0,
      opponentMaxHp: 0,
      opponentCharge: 0,
      opponentMaxCharge: 0,
    };

    const tweaks = {
      /** Emit a custom event so CombatManager/Game_Scene can respond */
      godModeUser: false,
      slowMotion: false,
      showGridOverlay: false,
      // Balance knobs — emit BALANCE_TWEAK so the game can pick them up
      matchDamageMul: 1.0,
      chargeMul: 1.0,
    };

    // ── Build GUI ─────────────────────────────────────────────────────────────
    const gui = new GUI({ title: '⚙  Genesis Debug', width: 290 });
    gui.domElement.style.position     = 'fixed';
    gui.domElement.style.top          = '8px';
    gui.domElement.style.left         = '8px';
    gui.domElement.style.zIndex       = '9999';
    gui.domElement.style.fontFamily   = 'monospace';
    gui.close(); // hidden until toggled
    guiRef.current = gui;

    // ── Layout folder ─────────────────────────────────────────────────────────
    const layoutFolder = gui.addFolder('📐 Layout');
    layoutFolder.add(layoutState, 'scaleFactor').decimals(4).disable().listen();
    layoutFolder.add(layoutState, 'canvasWidth').disable().listen();
    layoutFolder.add(layoutState, 'canvasHeight').disable().listen();
    layoutFolder.add(layoutState, 'cellSize').disable().listen();
    layoutFolder.add(layoutState, 'gridOffsetX').decimals(1).disable().listen();
    layoutFolder.add(layoutState, 'gridOffsetY').decimals(1).disable().listen();
    layoutFolder.close();

    // ── Combat folder ─────────────────────────────────────────────────────────
    const combatFolder = gui.addFolder('⚔  Combat');
    combatFolder.add(combatState, 'currentTurn').disable().listen();
    combatFolder.add(combatState, 'turnCount').disable().listen();
    combatFolder.add(combatState, 'powerSurge').disable().listen();

    const userFolder = combatFolder.addFolder('USER');
    userFolder.add(combatState, 'userHp').disable().listen();
    userFolder.add(combatState, 'userMaxHp').disable().listen();
    userFolder.add(combatState, 'userCharge').disable().listen();
    userFolder.add(combatState, 'userMaxCharge').disable().listen();
    userFolder.close();

    const opponentFolder = combatFolder.addFolder('OPPONENT');
    opponentFolder.add(combatState, 'opponentHp').disable().listen();
    opponentFolder.add(combatState, 'opponentMaxHp').disable().listen();
    opponentFolder.add(combatState, 'opponentCharge').disable().listen();
    opponentFolder.add(combatState, 'opponentMaxCharge').disable().listen();
    opponentFolder.close();
    combatFolder.close();

    // ── Tweaks folder ─────────────────────────────────────────────────────────
    const tweaksFolder = gui.addFolder('🔧 Tweaks');

    tweaksFolder.add(tweaks, 'godModeUser').name('God Mode (user)').onChange((v: boolean) => {
      game.events.emit('DEBUG_GOD_MODE', { character: 'USER', enabled: v });
    });

    tweaksFolder.add(tweaks, 'showGridOverlay').name('Grid overlay').onChange((v: boolean) => {
      game.events.emit('DEBUG_GRID_OVERLAY', { enabled: v });
    });

    tweaksFolder.add(tweaks, 'matchDamageMul', 0, 5, 0.1).name('Match dmg ×').onChange((v: number) => {
      game.events.emit('DEBUG_BALANCE', { key: 'matchDamageMul', value: v });
    });

    tweaksFolder.add(tweaks, 'chargeMul', 0, 5, 0.1).name('Charge gain ×').onChange((v: number) => {
      game.events.emit('DEBUG_BALANCE', { key: 'chargeMul', value: v });
    });

    tweaksFolder.add({ fillHpUser: () => game.events.emit('DEBUG_FILL_HP', { character: 'USER' }) }, 'fillHpUser').name('Fill HP (user)');
    tweaksFolder.add({ fillHpOpponent: () => game.events.emit('DEBUG_FILL_HP', { character: 'OPPONENT' }) }, 'fillHpOpponent').name('Fill HP (opponent)');
    tweaksFolder.add({ fillChargeUser: () => game.events.emit('DEBUG_FILL_CHARGE', { character: 'USER' }) }, 'fillChargeUser').name('Fill Charge (user)');
    tweaksFolder.add({ killOpponent: () => game.events.emit('DEBUG_KILL', { character: 'OPPONENT' }) }, 'killOpponent').name('Kill opponent ☠');

    // ── Phaser event listeners ────────────────────────────────────────────────

    const onResize = () => {
      const scene = game.scene.getScenes(true)[0] as any;
      if (!scene) return;
      layoutState.scaleFactor  = scene.scaleFactor  ?? 1;
      layoutState.canvasWidth  = scene.gameWidth    ?? game.canvas.width;
      layoutState.canvasHeight = scene.gameHeight   ?? game.canvas.height;
      layoutState.cellSize     = scene.CELL_SIZE    ?? 88;
      // Approximate grid offsets via the same formula as BaseScene
      const gridPx = (scene.CELL_SIZE ?? 88) * 10;
      layoutState.gridOffsetX  = (layoutState.canvasWidth  - gridPx) / 2;
      layoutState.gridOffsetY  = (layoutState.canvasHeight - gridPx) / 2 + (-77 * layoutState.scaleFactor);
    };

    const onHpUpdated = (data: any) => {
      if (data.character === 'USER') {
        combatState.userHp    = Math.round(data.hp);
        combatState.userMaxHp = data.maxHp;
      } else {
        combatState.opponentHp    = Math.round(data.hp);
        combatState.opponentMaxHp = data.maxHp;
      }
    };

    const onChargeUpdated = (data: any) => {
      if (data.character === 'USER') {
        combatState.userCharge    = Math.round(data.charge);
        combatState.userMaxCharge = data.maxCharge;
      } else {
        combatState.opponentCharge    = Math.round(data.charge);
        combatState.opponentMaxCharge = data.maxCharge;
      }
    };

    const onTurnSwitched = (turn: string) => {
      combatState.currentTurn = turn;
      const mgr = (game.scene.getScenes(true)[0] as any)?.scene?.get?.('Game_Scene')?.combatMgr;
      if (mgr) combatState.turnCount = mgr.turnCount ?? combatState.turnCount;
    };

    const onPowerUpdate = (power: number) => {
      combatState.powerSurge = power;
    };

    const onCombatInit = (data: any) => {
      combatState.userHp        = data.user?.currentHp    ?? 0;
      combatState.userMaxHp     = data.user?.maxHp        ?? 0;
      combatState.userCharge    = data.user?.currentCharge ?? 0;
      combatState.userMaxCharge = data.user?.maxCharge    ?? 0;
      combatState.opponentHp    = data.opponent?.currentHp    ?? 0;
      combatState.opponentMaxHp = data.opponent?.maxHp        ?? 0;
      combatState.opponentCharge    = data.opponent?.currentCharge ?? 0;
      combatState.opponentMaxCharge = data.opponent?.maxCharge    ?? 0;
      onResize();
    };

    // Bootstrap layout state immediately if a scene is already running
    onResize();

    game.events.on('HP_UPDATED',     onHpUpdated);
    game.events.on('CHARGE_UPDATED', onChargeUpdated);
    game.events.on('TURN_SWITCHED',  onTurnSwitched);
    game.events.on('POWER_UPDATE',   onPowerUpdate);
    game.events.on('COMBAT_INIT',    onCombatInit);
    game.scale.on('resize',          onResize);

    // ── Keyboard toggle ───────────────────────────────────────────────────────
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === 'F3') {
        e.preventDefault();
        if (gui._closed) gui.open(); else gui.close();
      }
    };
    window.addEventListener('keydown', handleKey);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      game.events.off('HP_UPDATED',     onHpUpdated);
      game.events.off('CHARGE_UPDATED', onChargeUpdated);
      game.events.off('TURN_SWITCHED',  onTurnSwitched);
      game.events.off('POWER_UPDATE',   onPowerUpdate);
      game.events.off('COMBAT_INIT',    onCombatInit);
      game.scale.off('resize',          onResize);
      window.removeEventListener('keydown', handleKey);
      gui.destroy();
    };
  }, [game]);

  return null; // lil-gui manages its own DOM node
}
