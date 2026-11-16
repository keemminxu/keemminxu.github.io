// 은크크 Pick 테스트 공용 도구 (의존성 없음)
let passed = 0, failed = 0;

export function test(name, fn) {
  try { fn(); passed++; console.log('ok -', name); }
  catch (e) { failed++; console.error('FAIL -', name, '\n ', e.message); process.exitCode = 1; }
}

export function summary() {
  console.log(`\n${passed} passed${failed ? `, ${failed} failed` : ''}`);
}

// 시드 고정 PRNG (mulberry32)
export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// localStorage 흉내
export function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
