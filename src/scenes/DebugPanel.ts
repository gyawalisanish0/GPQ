import GUI from 'lil-gui';
import Phaser from 'phaser';
import { CombatManager } from '../engine/CombatManager';
import { CombatRegistry } from '../engine/CombatRegistry';
import { GemRegistry } from '../engine/GemRegistry';
import { GameState } from '../engine/GameState';

/**
 * DebugPanel — Admin lil-gui panel toggled by a floating pill button.
 *
 * Provides:
 *   • Scene navigation (jump to any scene)
 *   • Force-dismiss loading overlay
 *   • Combat state manipulation (HP, Charge, turn)
 *   • Registry inspection (gems, characters, skills)
 *   • FPS overlay toggle
 *   • Scale factor / viewport info
 *
 * Usage in App.tsx:
 *   import { DebugPanel } from './debug/DebugPanel';
 *   // After game is created:
 *   DebugPanel.init(game, () => setIsReady(true));
 *
 * Or press backtick (`) as a hotkey at any time.
 */
export class DebugPanel {
  private static instance: DebugPanel | null = null;
  private gui: GUI | null = null;
  private game: Phaser.Game;
  private forceReady: () => void;
  private pillEl: HTMLElement | null = null;
  private visible = false;
  private fpsText: HTMLElement | null = null;
  private fpsEnabled = false;

  private constructor(game: Phaser.Game, forceReady: () => void) {
    this.game = game;
    this.forceReady = forceReady;
    this.createPill();
    this.bindHotkey();
  }

  /** Call once after Phaser.Game is created. */
  static init(game: Phaser.Game, forceReady: () => void): DebugPanel {
    if (!DebugPanel.instance) {
      DebugPanel.instance = new DebugPanel(game, forceReady);
    }
    return DebugPanel.instance;
  }

  static destroy(): void {
    if (DebugPanel.instance) {
      DebugPanel.instance.teardown();
      DebugPanel.instance = null;
    }
  }

  /* ── Floating Pill Button ───────────────────────────────── */

  private createPill(): void {
    const pill = document.createElement('div');
    pill.id = 'debug-pill';
    pill.innerHTML = '🛠';
    Object.assign(pill.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      width: '44px',
      height: '44px',
      borderRadius: '50%',
      background: 'rgba(16,185,129,0.9)',
      color: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '20px',
      cursor: 'pointer',
      zIndex: '99999',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      transition: 'transform 0.15s, opacity 0.15s',
      userSelect: 'none',
      fontFamily: 'monospace',
    });

    pill.addEventListener('click', () => this.toggle());
    pill.addEventListener('mouseenter', () => { pill.style.transform = 'scale(1.15)'; });
    pill.addEventListener('mouseleave', () => { pill.style.transform = 'scale(1)'; });

    document.body.appendChild(pill);
    this.pillEl = pill;
  }

  /* ── Hotkey (backtick) ──────────────────────────────────── */

  private bindHotkey(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  /* ── Toggle ─────────────────────────────────────────────── */

  private toggle(): void {
    if (this.visible) {
      this.gui?.destroy();
      this.gui = null;
      this.visible = false;
      if (this.pillEl) this.pillEl.style.background = 'rgba(16,185,129,0.9)';
    } else {
      this.buildGUI();
      this.visible = true;
      if (this.pillEl) this.pillEl.style.background = 'rgba(239,68,68,0.9)';
    }
  }

  /* ── Build GUI ──────────────────────────────────────────── */

  private buildGUI(): void {
    this.gui = new GUI({ title: '🛠 GENESIS DEBUG', width: 300 });
    this.gui.domElement.style.zIndex = '99998';

    this.buildDiagnosticsFolder();
    this.buildSceneFolder();
    this.buildCombatFolder();
    this.buildRegistryFolder();
    this.buildToolsFolder();
  }

  /* ── Diagnostics ────────────────────────────────────────── */

  private buildDiagnosticsFolder(): void {
    const f = this.gui!.addFolder('📊 Diagnostics');

    const scene = this.game.scene.getScenes(true)[0];
    const info = {
      fps: '—',
      viewport: `${this.game.canvas.width}×${this.game.canvas.height}`,
      scaleFactor: scene ? ((scene as any).scaleFactor?.toFixed(3) ?? '—') : '—',
      activeScene: scene?.scene.key ?? '—',
      renderer: this.game.config.renderType === Phaser.CANVAS ? 'CANVAS' : 'WEBGL',
      textureCount: scene ? scene.textures.getTextureKeys().length : 0,
    };

    f.add(info, 'activeScene').name('Active Scene').disable();
    f.add(info, 'viewport').name('Viewport').disable();
    f.add(info, 'scaleFactor').name('Scale Factor').disable();
    f.add(info, 'renderer').name('Renderer').disable();
    f.add(info, 'textureCount').name('Textures Loaded').disable();

    // Live FPS
    const fpsObj = { showFPS: this.fpsEnabled };
    f.add(fpsObj, 'showFPS').name('Show FPS Overlay').onChange((v: boolean) => {
      this.fpsEnabled = v;
      this.toggleFPS(v);
    });
    f.open();
  }

  /* ── Scene Navigation ───────────────────────────────────── */

  private buildSceneFolder(): void {
    const f = this.gui!.addFolder('🎬 Scenes');

    const actions = {
      'Force Dismiss Loading': () => {
        this.forceReady();
        console.log('[Debug] Loading overlay force-dismissed');
      },
      'Go → MainMenu': () => this.jumpScene('MainMenuScene'),
      'Go → Lobby': () => this.jumpScene('LobbyScene'),
      'Go → Loadout (warrior)': () => this.jumpScene('LoadoutScene', { charId: 'warrior' }),
      'Go → Loadout (mage)': () => this.jumpScene('LoadoutScene', { charId: 'mage' }),
      'Go → Game (warrior vs mage)': () => this.jumpScene('Game_Scene', { userCharId: 'warrior', opponentCharId: 'mage' }),
      'Restart Current Scene': () => {
        const active = this.game.scene.getScenes(true)[0];
        if (active) active.scene.restart();
      },
    };

    Object.entries(actions).forEach(([name, fn]) => {
      f.add(actions, name as keyof typeof actions);
    });
    f.open();
  }

  /* ── Combat Manipulation ────────────────────────────────── */

  private buildCombatFolder(): void {
    const f = this.gui!.addFolder('⚔️ Combat');
    const combat = CombatManager.getInstance();

    if (!combat.user || !combat.opponent) {
      f.add({ status: 'No active combat' }, 'status').name('Status').disable();
      return;
    }

    const user = combat.user;
    const opp  = combat.opponent;

    // User controls
    const uf = f.addFolder(`👤 ${user.name} (User)`);
    const userData = {
      hp: user.currentHp,
      maxHp: user.maxHp,
      charge: user.currentCharge,
      maxCharge: user.maxCharge,
      setHP: () => { user.currentHp = userData.hp; this.game.events.emit('HP_UPDATED', { character: 'USER', hp: user.currentHp, maxHp: user.maxHp }); },
      setCharge: () => { user.currentCharge = userData.charge; this.game.events.emit('CHARGE_UPDATED', { character: 'USER', charge: user.currentCharge, maxCharge: user.maxCharge }); },
      fullHeal: () => { user.currentHp = user.maxHp; userData.hp = user.maxHp; this.game.events.emit('HP_UPDATED', { character: 'USER', hp: user.currentHp, maxHp: user.maxHp }); },
      maxEnergy: () => { user.currentCharge = user.maxCharge; userData.charge = user.maxCharge; this.game.events.emit('CHARGE_UPDATED', { character: 'USER', charge: user.currentCharge, maxCharge: user.maxCharge }); },
    };
    uf.add(userData, 'hp', 0, user.maxHp, 1).name('HP');
    uf.add(userData, 'setHP').name('Apply HP');
    uf.add(userData, 'charge', 0, user.maxCharge, 1).name('Charge');
    uf.add(userData, 'setCharge').name('Apply Charge');
    uf.add(userData, 'fullHeal').name('⬆ Full Heal');
    uf.add(userData, 'maxEnergy').name('⚡ Max Energy');

    // Opponent controls
    const of2 = f.addFolder(`👹 ${opp.name} (Opponent)`);
    const oppData = {
      hp: opp.currentHp,
      setHP: () => { opp.currentHp = oppData.hp; this.game.events.emit('HP_UPDATED', { character: 'OPPONENT', hp: opp.currentHp, maxHp: opp.maxHp }); },
      oneShot: () => { opp.currentHp = 1; oppData.hp = 1; this.game.events.emit('HP_UPDATED', { character: 'OPPONENT', hp: 1, maxHp: opp.maxHp }); },
      kill: () => { opp.currentHp = 0; this.game.events.emit('HP_UPDATED', { character: 'OPPONENT', hp: 0, maxHp: opp.maxHp }); this.game.events.emit('GAME_OVER', { winner: 'USER' }); },
    };
    of2.add(oppData, 'hp', 0, opp.maxHp, 1).name('HP');
    of2.add(oppData, 'setHP').name('Apply HP');
    of2.add(oppData, 'oneShot').name('💀 Set to 1 HP');
    of2.add(oppData, 'kill').name('☠ Kill Instantly');

    // Turn control
    const turnData = {
      current: combat.currentTurn,
      forceUserTurn: () => {
        (combat as any).currentTurn = 'USER';
        this.game.events.emit('TURN_SWITCHED', { turn: 'USER' });
      },
    };
    f.add(turnData, 'current').name('Current Turn').disable();
    f.add(turnData, 'forceUserTurn').name('Force User Turn');
  }

  /* ── Registry Inspection ────────────────────────────────── */

  private buildRegistryFolder(): void {
    const f = this.gui!.addFolder('📦 Registries');

    // Gems
    const gems = GemRegistry.getInstance().getAllGems();
    const gemInfo = {
      total: gems.length,
      normal: gems.filter(g => g.type === 'normal').length,
      special: gems.filter(g => g.type === 'special').length,
      logAll: () => console.table(gems),
    };
    const gf = f.addFolder(`💎 Gems (${gems.length})`);
    gf.add(gemInfo, 'normal').name('Normal').disable();
    gf.add(gemInfo, 'special').name('Special').disable();
    gf.add(gemInfo, 'logAll').name('Log to Console');

    // Characters
    const chars = CombatRegistry.getInstance().getAllCharactersData();
    const charInfo = {
      total: chars.length,
      names: chars.map(c => c.name).join(', ') || '(none)',
      logAll: () => console.table(chars.map(c => ({ id: c.id, name: c.name, class: c.characterClass, hp: c.stats.endurance }))),
    };
    const cf = f.addFolder(`🧙 Characters (${chars.length})`);
    cf.add(charInfo, 'names').name('Loaded').disable();
    cf.add(charInfo, 'logAll').name('Log to Console');

    // Textures
    const scene = this.game.scene.getScenes(true)[0];
    if (scene) {
      const keys = scene.textures.getTextureKeys().filter(k => k !== '__DEFAULT' && k !== '__MISSING');
      const texInfo = {
        count: keys.length,
        logAll: () => console.log('Texture keys:', keys),
      };
      const tf = f.addFolder(`🖼 Textures (${keys.length})`);
      tf.add(texInfo, 'logAll').name('Log to Console');
    }
  }

  /* ── Tools ──────────────────────────────────────────────── */

  private buildToolsFolder(): void {
    const f = this.gui!.addFolder('🔧 Tools');

    const tools = {
      'Log Game Config': () => console.log('GameConfig:', this.game.config),
      'Log GameState': () => console.log('GameState:', GameState.getInstance().getData()),
      'Log CombatManager': () => console.log('CombatManager:', CombatManager.getInstance()),
      'Log Active Scene': () => {
        const scene = this.game.scene.getScenes(true)[0];
        console.log('Active scene:', scene?.scene.key, scene);
      },
      'Force Emit SCENE_READY': () => {
        this.game.events.emit('SCENE_READY', 'Debug');
        this.forceReady();
        console.log('[Debug] SCENE_READY force-emitted');
      },
      'Destroy & Restart Phaser': () => {
        console.log('[Debug] Restarting Phaser...');
        window.location.reload();
      },
    };

    Object.entries(tools).forEach(([name, fn]) => {
      f.add(tools, name as keyof typeof tools);
    });
  }

  /* ── FPS Overlay ────────────────────────────────────────── */

  private toggleFPS(on: boolean): void {
    if (on) {
      if (this.fpsText) return;
      const el = document.createElement('div');
      el.id = 'debug-fps';
      Object.assign(el.style, {
        position: 'fixed',
        top: '8px',
        left: '8px',
        padding: '4px 10px',
        background: 'rgba(0,0,0,0.75)',
        color: '#10b981',
        fontFamily: 'monospace',
        fontSize: '13px',
        borderRadius: '6px',
        zIndex: '99997',
        pointerEvents: 'none',
      });
      document.body.appendChild(el);
      this.fpsText = el;

      const update = () => {
        if (!this.fpsEnabled || !this.fpsText) return;
        const scene = this.game.scene.getScenes(true)[0];
        if (scene) {
          const fps = Math.round(this.game.loop.actualFps);
          const dt  = this.game.loop.delta.toFixed(1);
          this.fpsText.textContent = `FPS: ${fps} | Δ: ${dt}ms | ${scene.scene.key}`;
        }
        requestAnimationFrame(update);
      };
      requestAnimationFrame(update);
    } else {
      if (this.fpsText) {
        this.fpsText.remove();
        this.fpsText = null;
      }
    }
  }

  /* ── Scene Jump Helper ──────────────────────────────────── */

  private jumpScene(key: string, data?: any): void {
    const active = this.game.scene.getScenes(true);
    active.forEach(s => {
      if (s.scene.key !== key) {
        s.scene.stop();
      }
    });
    this.game.scene.start(key, data);
    console.log(`[Debug] Jumped to ${key}`, data ?? '');
  }

  /* ── Cleanup ────────────────────────────────────────────── */

  private teardown(): void {
    this.gui?.destroy();
    this.gui = null;
    this.pillEl?.remove();
    this.pillEl = null;
    this.toggleFPS(false);
  }
}
