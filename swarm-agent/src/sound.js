// Sound of the swarm: a short tone for each event as the log clock passes it. Off by default; the browser needs a click
// before it lets audio play, so the first switch-on creates the audio context. Nothing is played when scrubbing back.
const TONES = {
  'run.started': [[392, 0.12, 'sine'], [523, 0.16, 'sine']],
  'run.completed': [[523, 0.12, 'triangle'], [659, 0.12, 'triangle'], [784, 0.22, 'triangle']],
  'run.failed': [[220, 0.35, 'sawtooth']],
  'agent.spawned': [[440, 0.08, 'sine'], [660, 0.1, 'sine']],
  'agent.finished': [[587, 0.1, 'sine']],
  'message.sent': [[520, 0.07, 'sine']],
  'file.write': [[330, 0.05, 'triangle']],
  'file.read': [[660, 0.03, 'sine']],
  'tool.started': [[900, 0.03, 'square']],
  'test': null, // by status, below
};
const TEST_PASS = [[660, 0.1, 'sine'], [990, 0.16, 'sine']];
const TEST_FAIL = [[196, 0.22, 'sawtooth'], [147, 0.3, 'sawtooth']];

export function createSound() {
  let ctx = null; let on = false; let gain = null;
  const ensure = () => {
    if (ctx) return ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C(); gain = ctx.createGain(); gain.gain.value = 0.12; gain.connect(ctx.destination);
    return ctx;
  };
  const note = (freq, dur, wave, at) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(1, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(gain); o.start(at); o.stop(at + dur + 0.02);
  };
  return {
    get on() { return on; },
    set(v) { on = !!v; if (on) { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); } },
    toggle() { this.set(!on); return on; },
    // one event: its tones, starting now (a few events at once are spread a little)
    play(ev, k = 0) {
      if (!on || !ensure()) return;
      const list = ev.type === 'test' ? (ev.status === 'failed' ? TEST_FAIL : TEST_PASS) : TONES[ev.type];
      if (!list) return;
      const t = ctx.currentTime + k * 0.06;
      list.forEach(([f, d, w], i) => note(f, d, w, t + i * 0.09));
    },
  };
}
