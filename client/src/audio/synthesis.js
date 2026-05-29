import * as Tone from 'tone';

export const BPM = 120;
export const STEPS = 16;
export const BAR_SECS = (60 / BPM) * 4; // 2.0 seconds

// C major scale (one octave per instrument), row 0 = highest pitch
export const NOTES = {
  bass:   ['C3','B2','A2','G2','F2','E2','D2','C2'],
  lead:   ['C4','B3','A3','G3','F3','E3','D3','C3'],
  melody: ['C5','B4','A4','G4','F4','E4','D4','C4'],
};

// Drum row labels, row 0 (top) = crash, row 7 (bottom) = kick
export const DRUM_ROW_LABELS = ['CRASH', 'RIDE', 'O-HH', 'HH', 'CLAP', 'SNARE', 'TOM', 'KICK'];

let ready = false;
let synths = null;
let drumTriggers = null;
let masterBus = null;

export async function initAudio() {
  if (ready) return;
  await Tone.start();

  masterBus = new Tone.Gain(1).toDestination();
  const limiter = new Tone.Limiter(-3).connect(masterBus);
  const reverb = new Tone.Reverb({ decay: 2, wet: 0.25 }).connect(limiter);

  synths = {
    bass: new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.5, release: 1.2 },
      volume: -6,
    }).connect(reverb),

    lead: new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.4 },
      volume: -10,
    }).connect(reverb),

    melody: new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.3, release: 0.6 },
      volume: -8,
    }).connect(reverb),
  };

  // Drums: each synth is a different instrument, triggered by row
  const drumBus = new Tone.Gain(1).connect(limiter);
  const drumRoom = new Tone.Reverb({ decay: 0.6, wet: 0.12 }).connect(drumBus);

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.06, octaves: 8,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
    volume: -2,
  }).connect(drumBus);

  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.04, octaves: 5,
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.08 },
    volume: -5,
  }).connect(drumBus);

  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.13, sustain: 0, release: 0.03 },
    volume: -8,
  }).connect(drumBus);

  const clap = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.05 },
    volume: -8,
  }).connect(drumRoom);

  const hihatClosed = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
    volume: -14,
  }).connect(drumBus);

  const hihatOpen = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.28, sustain: 0.04, release: 0.1 },
    volume: -14,
  }).connect(drumBus);

  const ride = new Tone.MetalSynth({
    frequency: 540, harmonicity: 3.4, modulationIndex: 12,
    resonance: 3500, octaves: 1.2,
    envelope: { attack: 0.001, decay: 0.5, release: 0.1 },
    volume: -16,
  }).connect(drumBus);

  const crash = new Tone.MetalSynth({
    frequency: 300, harmonicity: 5.1, modulationIndex: 32,
    resonance: 4200, octaves: 1.5,
    envelope: { attack: 0.001, decay: 1.2, release: 0.3 },
    volume: -18,
  }).connect(drumRoom);

  // Row 0 (top) = crash … row 7 (bottom) = kick
  drumTriggers = [
    (t) => crash.triggerAttackRelease('16n', t),
    (t) => ride.triggerAttackRelease('16n', t),
    (t) => hihatOpen.triggerAttackRelease('16n', t),
    (t) => hihatClosed.triggerAttackRelease('32n', t),
    (t) => clap.triggerAttackRelease('16n', t),
    (t) => snare.triggerAttackRelease('16n', t),
    (t) => tom.triggerAttackRelease('C2', '8n', t),
    (t) => kick.triggerAttackRelease('C1', '8n', t),
  ];

  ready = true;
}

export function previewNote(role, row) {
  if (!ready) return;
  const now = Tone.now();
  if (role === 'drums') {
    drumTriggers?.[row]?.(now);
  } else if (synths?.[role]) {
    synths[role].triggerAttackRelease(NOTES[role][row], '8n', now);
  }
}

export function stopAll() {
  Tone.Transport.stop();
  Tone.Transport.cancel();
  synths && Object.values(synths).forEach(s => s.releaseAll());
}

// bars: array of { [playerId]: { grid, role } }
// Returns a cleanup function
export function playBars(bars, { onProgress, onComplete } = {}) {
  if (!synths) return () => {};

  stopAll();
  Tone.Transport.bpm.value = BPM;

  bars.forEach((barData, barIdx) => {
    if (!barData) return;
    Object.values(barData).forEach(({ grid, role }) => {
      if (!grid) return;
      const offset = (step) => barIdx * BAR_SECS + (step / STEPS) * BAR_SECS;

      if (role === 'drums') {
        for (let step = 0; step < STEPS; step++) {
          for (let row = 0; row < 8; row++) {
            if (grid[row]?.[step] && drumTriggers?.[row]) {
              const fn = drumTriggers[row];
              Tone.Transport.schedule((time) => fn(time), offset(step));
            }
          }
        }
      } else if (synths[role]) {
        const noteArray = NOTES[role];
        const stepSecs = BAR_SECS / STEPS;
        for (let row = 0; row < 8; row++) {
          let step = 0;
          while (step < STEPS) {
            if (grid[row]?.[step]) {
              // Measure the run of consecutive painted cells
              let run = 1;
              while (step + run < STEPS && grid[row]?.[step + run]) run++;
              const note = noteArray[row];
              const duration = run * stepSecs;
              Tone.Transport.schedule((time) => {
                synths[role].triggerAttackRelease(note, duration, time);
              }, offset(step));
              step += run;
            } else {
              step++;
            }
          }
        }
      }
    });
  });

  const total = bars.length * BAR_SECS;
  Tone.Transport.schedule(() => { Tone.Transport.stop(); onComplete?.(); }, total + 0.3);

  let raf;
  const t0 = performance.now();
  if (onProgress) {
    const tick = () => {
      const p = Math.min((performance.now() - t0) / 1000 / total, 1);
      onProgress(p);
      if (p < 1 && Tone.Transport.state === 'started') raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  Tone.Transport.start();
  return () => { cancelAnimationFrame(raf); stopAll(); };
}

// Records the full song via masterBus while playing it back, then downloads as .webm
export function downloadSong(bars, { onProgress, onComplete } = {}) {
  if (!synths || !masterBus) return;

  const recorder = new Tone.Recorder();
  masterBus.connect(recorder);
  recorder.start();

  playBars(bars, {
    onProgress,
    onComplete: async () => {
      await new Promise(r => setTimeout(r, 800)); // let reverb tail finish
      const blob = await recorder.stop();
      try { masterBus.disconnect(recorder); } catch (_) {}
      recorder.dispose();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'musicbox.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      onComplete?.();
    },
  });
}
