import { EFFECTS, RATE, render } from "./synth.js";

// Plays the synthesised sounds through Web Audio, as SoundFX in the Mac app's
// Sounds.swift: a few voices round-robin, the oldest cut off if all are busy,
// and the audio device let sleep once nothing has played for a moment.

const VOICES = 6;

export class SoundFX {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.buffers = new Map();
    this.voices = [];
    this.idle = 0;
  }

  /** Makes every sound, a few at a time between frames, so launching isn't held up. */
  prepare() {
    this.context = new AudioContext({ sampleRate: RATE, latencyHint: "interactive" });
    this.gain = this.context.createGain();
    this.gain.gain.value = 0.6;
    this.gain.connect(this.context.destination);
    const queue = EFFECTS.slice();
    const next = () => {
      const effect = queue.shift();
      if (!effect) { this.sleepSoon(0.5); return; }
      const samples = render(effect);
      if (samples.length) {
        const buffer = this.context.createBuffer(1, samples.length, RATE);
        buffer.copyToChannel(samples, 0);
        this.buffers.set(effect, buffer);
      }
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  }

  play(effect) {
    if (!this.enabled || !this.context) return;
    const buffer = this.buffers.get(effect);
    if (!buffer) return;
    if (this.context.state !== "running") this.context.resume();
    if (this.voices.length >= VOICES) {
      try { this.voices.shift().stop(); } catch { /* already over */ }
    }
    const voice = this.context.createBufferSource();
    voice.buffer = buffer;
    voice.connect(this.gain);
    voice.onended = () => { this.voices = this.voices.filter(v => v !== voice); };
    voice.start();
    this.voices.push(voice);
    this.sleepSoon(buffer.duration + 1.5);
  }

  /** A running audio context keeps the sound card awake, so it's suspended once nothing has played for a moment. */
  sleepSoon(seconds) {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      if (!this.voices.length) this.context?.suspend();
    }, seconds * 1000);
  }
}
