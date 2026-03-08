'use strict';

// Simple Web Audio API sound stub — generates short tones for game events.
class AudioManager {
  constructor() {
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this._ctx = null;
    }
    this._muted = true;
  }

  play(sound) {
    if (this._muted || !this._ctx) return;
    // Resume context if suspended (browser autoplay policy)
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    try {
      switch (sound) {
        case 'command':       this._tone(440, 0.05, 'square', 0.08); break;
        case 'build':         this._tone(520, 0.1,  'sine',   0.1);  break;
        case 'train':         this._tone(600, 0.12, 'sine',   0.12); break;
        case 'hit':           this._noise(0.06, 0.08); break;
        case 'hit_building':  this._noise(0.1,  0.06); break;
        case 'error':         this._tone(200, 0.15, 'sawtooth', 0.1); break;
        case 'age_up':        this._fanfare(); break;
        case 'attack_warning':this._tone(300, 0.2, 'square', 0.1); break;
        default: break;
      }
    } catch (e) { /* ignore audio errors */ }
  }

  _tone(freq, duration, type, vol) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  _noise(duration, vol) {
    const ctx = this._ctx;
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    src.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.start();
  }

  _fanfare() {
    const notes = [440, 550, 660, 880];
    notes.forEach((freq, i) => {
      setTimeout(() => this._tone(freq, 0.2, 'sine', 0.15), i * 80);
    });
  }

  mute() { this._muted = true; }
  unmute() { this._muted = false; }
}
