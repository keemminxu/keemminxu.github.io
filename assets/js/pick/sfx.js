// 효과음 — Web Audio 합성(음원 파일 없음). 첫 사용자 입력에서 unlock() 해야 소리가 난다.
export function createSfx() {
  let ctx = null, master = null, noiseBuf = null, enabled = true;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function envelope(g, t0, dur, vol) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone({ type = 'sine', f0, f1 = f0, t = 0, dur, vol = 0.3 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    envelope(g, t0, dur, vol);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise({ t = 0, dur, vol = 0.3, type = 'bandpass', freq = 1200, q = 1 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + t;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    envelope(g, t0, dur, vol);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    get enabled() { return enabled; },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled && ctx && ctx.state === 'running') ctx.suspend();
    },
    unlock() { ensure(); },
    click() { tone({ type: 'square', f0: 1800, f1: 900, dur: 0.035, vol: 0.12 }); noise({ dur: 0.03, vol: 0.15, freq: 3000 }); },
    // 캡슐이 굴러 내려가는 소리. 대역을 좁히면(Q↑) 음량이 같이 깎여서 Q는 낮게, vol은 높게 둔다(딸깍과 비슷한 크기).
    roll(dur = 1.2) {
      for (let i = 0; i < 8; i++) noise({ t: (i * dur) / 8, dur: 0.09, vol: 0.8, freq: 500 + Math.random() * 400, q: 1.2 });
    },
    thunk() { tone({ f0: 160, f1: 60, dur: 0.18, vol: 0.5 }); noise({ dur: 0.06, vol: 0.2, freq: 400 }); },
    tick() { tone({ type: 'triangle', f0: 900, dur: 0.025, vol: 0.12 }); },
    pop() { noise({ dur: 0.12, vol: 0.35, type: 'highpass', freq: 1500 }); tone({ f0: 500, f1: 1400, dur: 0.12, vol: 0.25 }); },
    fanfare() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ type: 'triangle', f0: f, t: i * 0.11, dur: i === 3 ? 0.5 : 0.12, vol: 0.22 }));
    },
  };
}
