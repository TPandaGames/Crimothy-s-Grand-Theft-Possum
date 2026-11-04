// js/audio.js — Procedural Web Audio API SFX & Funky Trash-Punk Synth

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmTimer = null;
    this.step = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone(freq, type = 'sine', duration = 0.12, vol = 0.15, slideFreq = null) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideFreq), now + duration);
    }
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playNoise(duration = 0.15, vol = 0.15, filterFreq = 1200, filterType = 'bandpass') {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }

  // Specific Game Sounds
  shinyPickup() {
    this.playTone(660, 'triangle', 0.09, 0.16, 990);
    setTimeout(() => this.playTone(1320, 'sine', 0.14, 0.16, 1760), 55);
  }

  trashCrash() {
    this.playNoise(0.28, 0.25, 650, 'lowpass');
    this.playTone(140, 'sawtooth', 0.2, 0.18, 45);
  }

  sprayCan() {
    this.playNoise(0.22, 0.16, 3800, 'highpass');
  }

  bunnyHop() {
    this.playTone(220, 'sine', 0.14, 0.18, 560);
  }

  trickSpin() {
    this.playTone(440, 'triangle', 0.12, 0.16, 880);
    setTimeout(() => this.playTone(660, 'triangle', 0.12, 0.15, 1100), 65);
  }

  trickLand() {
    this.playTone(180, 'square', 0.12, 0.14, 90);
    this.playTone(520, 'triangle', 0.18, 0.15, 1040);
  }

  playDeadFlop() {
    this.playTone(340, 'sawtooth', 0.35, 0.18, 75);
    setTimeout(() => this.playTone(95, 'sine', 0.25, 0.2, 60), 150);
  }

  possumHiss() {
    this.playNoise(0.25, 0.18, 2400, 'bandpass');
    this.playTone(580, 'sawtooth', 0.18, 0.08, 320);
  }

  boostFlame() {
    this.playNoise(0.12, 0.12, 420, 'lowpass');
  }

  sirenchirp() {
    this.playTone(650, 'sawtooth', 0.16, 0.11, 980);
    setTimeout(() => this.playTone(980, 'sawtooth', 0.18, 0.11, 620), 150);
  }

  hitDamage() {
    this.playNoise(0.2, 0.25, 400, 'lowpass');
    this.playTone(160, 'sawtooth', 0.22, 0.22, 55);
  }

  upgradeBuy() {
    [440, 554, 659, 880].forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 'triangle', 0.12, 0.16), idx * 65);
    });
  }

  zoneUnlock() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 'triangle', 0.18, 0.2, f * 1.03), idx * 80);
    });
    setTimeout(() => this.playNoise(0.25, 0.18, 1200, 'bandpass'), 120);
  }

  barricadeBounce() {
    this.playTone(130, 'sawtooth', 0.16, 0.18, 70);
  }

  startBGM(getWantedLevel) {
    if (this.bgmTimer) clearInterval(this.bgmTimer);
    const bassLine = [110, 110, 130.8, 146.8, 110, 164.8, 146.8, 130.8];
    const chaseLine = [146.8, 146.8, 174.6, 196.0, 220, 196.0, 174.6, 164.8];

    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.ctx || document.hidden) return;
      const wanted = getWantedLevel ? getWantedLevel() : 0;
      const notes = wanted >= 2 ? chaseLine : bassLine;
      const freq = notes[this.step % notes.length];
      this.playTone(freq, 'triangle', 0.14, 0.06, freq * 0.98);
      if (this.step % 4 === 2) {
        this.playNoise(0.05, 0.03, 5000, 'highpass'); // hi-hat
      }
      this.step++;
    }, 210);
  }
}

export const SFX = new SoundManager();

