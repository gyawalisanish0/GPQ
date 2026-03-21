
export enum SoundType {
  MATCH = 'match',
  SPECIAL = 'special',
  CLICK = 'click',
  SELECT = 'select',
  DAMAGE = 'damage',
  HEAL = 'heal',
  CHARGE = 'charge',
  TURN_CHANGE = 'turn_change'
}

export class SoundManager {
  private static instance: SoundManager;
  private audioCtx: AudioContext | null = null;

  private constructor() {
    // AudioContext is initialized on first user interaction to comply with browser policies
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private initAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public play(type: SoundType) {
    this.initAudioContext();
    if (!this.audioCtx) return;

    switch (type) {
      case SoundType.MATCH:
        this.playTone(440, 'sine', 0.1, 0.1);
        this.playTone(660, 'sine', 0.1, 0.1, 0.05);
        break;
      case SoundType.SPECIAL:
        this.playTone(220, 'sawtooth', 0.3, 0.2);
        this.playTone(880, 'sine', 0.2, 0.3, 0.1);
        break;
      case SoundType.CLICK:
        this.playTone(800, 'sine', 0.05, 0.05);
        break;
      case SoundType.SELECT:
        this.playTone(600, 'sine', 0.05, 0.05);
        break;
      case SoundType.DAMAGE:
        this.playTone(150, 'square', 0.2, 0.1);
        break;
      case SoundType.HEAL:
        this.playTone(523.25, 'sine', 0.1, 0.2);
        this.playTone(659.25, 'sine', 0.1, 0.2, 0.05);
        break;
      case SoundType.CHARGE:
        this.playTone(300, 'sine', 0.1, 0.1);
        this.playTone(400, 'sine', 0.1, 0.1, 0.05);
        this.playTone(500, 'sine', 0.1, 0.1, 0.1);
        break;
      case SoundType.TURN_CHANGE:
        this.playTone(400, 'sine', 0.2, 0.1);
        this.playTone(300, 'sine', 0.2, 0.1, 0.1);
        break;
    }
  }

  private playTone(freq: number, type: OscillatorType, volume: number, duration: number, delay: number = 0) {
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime + delay);

    gain.gain.setValueAtTime(volume, this.audioCtx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + delay + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(this.audioCtx.currentTime + delay);
    osc.stop(this.audioCtx.currentTime + delay + duration);
  }
}
