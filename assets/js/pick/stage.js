// 3D 무대 — 렌더러·카메라, 손잡이 입력, 배출·개봉 연출(툰 타격감), 경품 메시
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildMachine, DOME, HANDLE_POS, EXIT_POS, TRAY_POS } from './machine.js';
import { createCapsules, capsuleGeometries, CAPSULE_COLORS } from './capsules.js';
import { createFx } from './fx.js';
import { PAL, INK, toonRamp, normalOutline, toonGlass, inkDecal } from './toon.js';

export const SHOWCASE = new THREE.Vector3(0, 1.7, 3.2);
// 머신(높이 약 3.35)이 화면 위쪽 ~65%에 들어오고 아래쪽은 버튼·결과 카드 자리로 비운다
const CAMERA_POS = new THREE.Vector3(0, 1.9, 8.3);
const CAMERA_TARGET = new THREE.Vector3(0, 1.05, 0);
const PRIZE_SIZE = 0.95;
const OUTLINE_WORLD = 0.016; // 경품 외곽선 두께(월드 단위)
const TURN = Math.PI * 2;
const TICK = Math.PI / 4;
// Meshy 모델 보정: 방향(라디안), glass=투명 컵(몸통은 툰 유리, 인쇄만 데칼로), bright=사진 텍스처 밝기 배율
export const PRIZE_TUNE = {
  towel: { rotX: 0, rotY: 0, bright: 2.6 }, // 텍스처 중앙값 sRGB 144 → 흰색 근처로
  cup: { rotX: 0, rotY: 0, glass: true },
  bag: { rotX: 0, rotY: 0, bright: 1.7 },
};
// 경품은 정면을 보여 주며 좌우로 흔든다(얇은 수건·장바구니는 옆에서 보면 선이 된다)
const SWAY = { angle: 0.55, speed: 1.3 };
const SHINE_DIR = new THREE.Vector3(-0.35, 0.45, 0.82).normalize();

const lerp = (a, b, t) => a + (b - a) * t;
const easeInQuad = (x) => x * x;
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

// Meshy 재질을 툰으로: 사진 텍스처는 유지하고 음영만 셀로 + 잉크 외곽선. 유리 컵은 툰 유리 + 인쇄 데칼.
function toonify(root, tune) {
  const meshes = [];
  root.traverse((m) => { if (m.isMesh) meshes.push(m); });
  const ws = new THREE.Vector3();
  for (const m of meshes) {
    const map = m.material.map || null;
    m.getWorldScale(ws);
    if (tune.glass) {
      if (map) m.add(inkDecal(m));
      m.material = toonGlass({ side: THREE.DoubleSide, alpha: 0.1, edge: [0.6, 0.7] });
    } else {
      m.material = new THREE.MeshToonMaterial({ map, gradientMap: toonRamp('prize'), side: THREE.DoubleSide });
      m.material.color.setScalar(tune.bright || 1); // 실내광에 회색으로 찍힌 흰 천을 흰색으로
      m.add(normalOutline(m.geometry, OUTLINE_WORLD / ws.x));
    }
  }
}

// 크기·중심을 맞춘 홀더 그룹으로 감싼다(홀더를 흔들고 움직인다)
function normalizePrize(obj, tune) {
  const pivot = new THREE.Group();
  pivot.add(obj);
  pivot.rotation.set(tune.rotX, tune.rotY, 0);
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = PRIZE_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
  pivot.scale.setScalar(s);
  pivot.position.copy(center).multiplyScalar(-s);
  pivot.updateMatrixWorld(true);
  toonify(obj, tune);
  const holder = new THREE.Group();
  holder.add(pivot);
  return holder;
}

// GLB가 없거나 깨졌을 때: 경품 이름 스티커 카드
function prizeCard(label) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6e8';
  g.strokeStyle = '#14231a';
  g.lineWidth = 14;
  g.beginPath(); g.roundRect(12, 12, 488, 296, 44); g.fill(); g.stroke();
  g.fillStyle = '#1d6b3c';
  g.font = '700 120px ChaiHwaljjak, "Malgun Gothic", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 256, 170);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const holder = new THREE.Group();
  holder.add(new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })));
  return holder;
}

async function loadPrizes(scene, prizes) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  await Promise.all(Object.entries(prizes).map(async ([key, { url, label }]) => {
    let holder;
    try {
      const gltf = await loader.loadAsync(url);
      holder = normalizePrize(gltf.scene, { rotX: 0, rotY: 0, ...PRIZE_TUNE[key] });
    } catch (e) {
      console.warn(`[pick] ${key} GLB를 불러오지 못해 이름 카드로 대체`, e);
      holder = prizeCard(label);
    }
    holder.visible = false;
    scene.add(holder);
    out[key] = holder;
  }));
  return out;
}

export async function createStage({ canvas, sfx, prizes, onTurnComplete, onImpact = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); // WebGL 불가 시 여기서 throw
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // 툰은 팔레트 색을 그대로

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, PAL.green700, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); // 왼쪽 위 앞에서(캡슐 하이라이트와 같은 쪽)
  key.position.set(-3, 5, 6);
  scene.add(key);

  await document.fonts.load('700 80px ChaiHwaljjak').catch(() => {});
  const machine = buildMachine(scene);
  const capsules = createCapsules(scene, { center: DOME.center, radius: DOME.radius });
  const fx = createFx(scene);

  // 쇼케이스 뒤 배경을 어둡게 하는 판
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false }));
  dim.position.set(0, 1.5, 2.4);
  dim.visible = false;
  scene.add(dim);

  // 배출되는 캡슐: heroRoot(위치·크기·찌그러짐) → heroSpin(회전) → 반구 두 개(+잉크 외곽선)
  const capGeo = capsuleGeometries();
  const heroTopMat = new THREE.MeshToonMaterial({ color: CAPSULE_COLORS[0], gradientMap: toonRamp(), transparent: true });
  const heroBottomMat = new THREE.MeshToonMaterial({ color: PAL.cream, gradientMap: toonRamp(), transparent: true });
  const heroInkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, transparent: true });
  const half = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    const ink = new THREE.Mesh(geo, heroInkMat);
    ink.scale.setScalar(1.13);
    m.add(ink);
    return m;
  };
  const heroRoot = new THREE.Group();
  const heroSpin = new THREE.Group();
  const heroTop = half(capGeo.top, heroTopMat);
  const heroBottom = half(capGeo.bottom, heroBottomMat);
  const heroShine = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  heroShine.position.copy(SHINE_DIR);
  heroShine.scale.set(0.28, 0.18, 0.06);
  heroSpin.add(heroTop, heroBottom);
  heroRoot.add(heroSpin, heroShine);
  heroRoot.visible = false;
  scene.add(heroRoot);

  const prizeObjs = await loadPrizes(scene, prizes);

  const camBase = new THREE.Vector3();
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 16:9보다 좁으면 뒤로 물러나 머신이 잘리지 않게
    const back = Math.max(1, 1.5 / camera.aspect);
    camBase.copy(CAMERA_POS).setZ(CAMERA_POS.z * back);
    camera.position.copy(camBase);
    camera.lookAt(CAMERA_TARGET);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- 트윈 ----
  const tweens = new Set();
  const tween = (duration, fn, ease = (x) => x) => new Promise((resolve) => tweens.add({ t: 0, duration, fn, ease, resolve }));
  const wait = (s) => tween(s, () => {});

  // ---- 손잡이 ----
  let mode = 'idle'; // idle | ready | busy
  let turn = 0, nextTick = TICK, auto = false, dragging = false, lastAngle = 0, shake = 0, camShake = 0;
  let revealed = null, revealT = 0, idleStir = 0, time = 0;
  const handleWorld = new THREE.Vector3();

  function toScreen(v3) {
    const v = v3.clone().project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  function angleAt(e) {
    machine.handle.getWorldPosition(handleWorld);
    const s = toScreen(handleWorld);
    return Math.atan2(e.clientY - s.y, e.clientX - s.x); // 화면 좌표(y 아래)라 시계 방향이 +
  }

  function addTurn(d) {
    if (mode !== 'ready' || d <= 0) return;
    turn = Math.min(TURN, turn + d);
    machine.handle.rotation.z = -turn;
    while (turn >= nextTick) {
      nextTick += TICK;
      sfx.click();
      capsules.stir();
      shake = 1;
    }
    if (turn >= TURN) {
      mode = 'busy';
      auto = false;
      dragging = false;
      machine.hintRing.visible = false;
      onTurnComplete();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'ready') return;
    sfx.unlock();
    dragging = true;
    lastAngle = angleAt(e);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const a = angleAt(e);
    let d = a - lastAngle;
    if (d > Math.PI) d -= TURN;
    if (d < -Math.PI) d += TURN;
    lastAngle = a;
    addTurn(Math.min(d, 0.6)); // 역방향은 무시, 순간 점프는 제한
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  // 트랙패드 두 손가락 스크롤로도 돌린다(방향 무관)
  canvas.addEventListener('wheel', (e) => {
    if (mode !== 'ready') return;
    sfx.unlock();
    addTurn(Math.min(Math.abs(e.deltaY) * 0.003, 0.5));
  }, { passive: true });

  // 찌그러짐: k>0이면 납작(가로로 퍼짐), k<0이면 길쭉
  const squash = (base, k) => heroRoot.scale.set(base * (1 + k * 0.6), base * (1 - k), base * (1 + k * 0.6));

  // ---- 연출 ----
  async function playReveal(prizeKey) {
    mode = 'busy';
    const r = capsules.radius;
    const bottomPt = DOME.center.clone().setY(DOME.center.y - DOME.radius);
    const body = capsules.takeNearest(bottomPt.x, bottomPt.y, bottomPt.z);
    const start = body ? new THREE.Vector3(body.x, body.y, body.z) : bottomPt.clone().setY(bottomPt.y + r);
    heroTopMat.color.setHex(CAPSULE_COLORS[body ? body.color : 0]);
    heroTopMat.opacity = heroBottomMat.opacity = heroInkMat.opacity = 1;
    heroTop.position.set(0, 0, 0); heroTop.rotation.set(0, 0, 0);
    heroBottom.position.set(0, 0, 0); heroBottom.rotation.set(0, 0, 0);
    if (body) heroSpin.quaternion.set(body.qx, body.qy, body.qz, body.qw); else heroSpin.quaternion.identity();
    heroRoot.position.copy(start);
    heroRoot.scale.setScalar(r);
    heroShine.visible = true;
    heroRoot.visible = true;

    // 1) 돔 → 받침 속 → 배출구 → 트레이(쿵, 찌그러졌다 복원)
    const restY = TRAY_POS.y + 0.03 + r;
    const path = new THREE.CatmullRomCurve3([
      start,
      new THREE.Vector3(start.x * 0.5 - 0.25, 1.0, 0.1),
      new THREE.Vector3(EXIT_POS.x, EXIT_POS.y + 0.05, 0.45),
      new THREE.Vector3(EXIT_POS.x, EXIT_POS.y, EXIT_POS.z + 0.05),
      new THREE.Vector3(TRAY_POS.x, restY, TRAY_POS.z),
    ]);
    sfx.roll(1.3);
    tween(0.25, (t) => machine.setFlap(t));
    await tween(1.3, (t, dt) => { heroRoot.position.copy(path.getPoint(t)); heroSpin.rotateX(dt * 9); }, easeInQuad);
    sfx.thunk();
    tween(0.3, (t) => machine.setFlap(1 - t));
    await tween(0.45, (t) => {
      const k = Math.sin(t * Math.PI * 3) * (1 - t);
      squash(r, 0.35 * k);
      heroRoot.position.y = restY - r * 0.35 * Math.max(0, k) + Math.abs(Math.sin(t * Math.PI * 2)) * 0.06 * (1 - t);
    });
    heroRoot.scale.setScalar(r);
    await wait(0.2);

    // 2) 트레이 → 쇼케이스(크게), 배경 어둡게
    const from = heroRoot.position.clone();
    const lift = new THREE.CatmullRomCurve3([from, new THREE.Vector3(from.x * 0.5, 1.2, 1.8), SHOWCASE.clone()]);
    const q0 = heroSpin.quaternion.clone(), qUp = new THREE.Quaternion();
    dim.visible = true;
    await tween(0.85, (t) => {
      heroRoot.position.copy(lift.getPoint(t));
      heroRoot.scale.setScalar(lerp(r, 0.36, t));
      heroSpin.quaternion.slerpQuaternions(q0, qUp, t); // 색 반구가 위로 오게 세운다
      dim.material.opacity = 0.5 * t;
    }, easeInOutCubic);

    // 3) 흔들기(점점 세게) → 꾹 눌렸다가 쭉 늘어나는 예비 동작
    let tickAcc = 0;
    await tween(1.0, (t, dt) => {
      heroSpin.rotation.set(0, 0, Math.sin(t * 42) * 0.22 * t);
      tickAcc += dt;
      if (tickAcc > 0.1) { tickAcc = 0; sfx.tick(); }
    });
    heroSpin.rotation.set(0, 0, 0);
    await tween(0.16, (t) => squash(0.36, 0.28 * t));
    await tween(0.07, (t) => squash(0.36, lerp(0.28, -0.3, t)));

    // 4) 임팩트: 흰 플래시 + 정지 프레임 → 터짐
    sfx.pop();
    onImpact(toScreen(SHOWCASE));
    await wait(0.09);
    sfx.fanfare();
    camShake = 1;
    fx.burst(SHOWCASE);
    heroShine.visible = false;
    heroRoot.scale.setScalar(0.36);
    const prize = prizeObjs[prizeKey];
    prize.position.copy(SHOWCASE);
    prize.rotation.set(0, 0, 0);
    prize.scale.setScalar(0.001);
    prize.visible = true;
    revealed = prize;
    revealT = 0;
    tween(0.6, (t) => {
      const base = Math.max(0.001, easeOutBack(t));
      const k = Math.sin(t * Math.PI * 2.5) * (1 - t);
      prize.scale.set(base * (1 - 0.14 * k), base * (1 + 0.24 * k), base * (1 - 0.14 * k));
    });
    await tween(0.55, (t) => {
      const e = easeOutCubic(t);
      heroTop.position.set(-2.2 * e, 2.6 * e, 0.6 * e);
      heroTop.rotation.z = 1.6 * e;
      heroBottom.position.set(2.0 * e, -2.4 * e, 0.6 * e);
      heroBottom.rotation.z = -1.4 * e;
      heroTopMat.opacity = heroBottomMat.opacity = heroInkMat.opacity = 1 - t * t;
    });
    heroRoot.visible = false;
  }

  function clearReveal() {
    fx.clear();
    heroRoot.visible = false;
    dim.visible = false;
    dim.material.opacity = 0;
    if (revealed) revealed.visible = false;
    revealed = null;
  }

  function setMode(m) {
    mode = m;
    if (m === 'ready') {
      turn = 0;
      nextTick = TICK;
      machine.handle.rotation.z = 0;
    }
    machine.hintRing.visible = m === 'ready';
    if (m !== 'ready') { auto = false; dragging = false; }
  }

  // ---- 루프 ----
  const timer = new THREE.Timer();
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    time += dt;
    for (const tw of [...tweens]) {
      tw.t = Math.min(tw.duration, tw.t + dt);
      tw.fn(tw.ease(tw.t / tw.duration), dt);
      if (tw.t >= tw.duration) { tweens.delete(tw); tw.resolve(); }
    }
    if (auto) addTurn((dt * TURN) / 0.9); // 버튼 한 번에 0.9초 동안 저절로 한 바퀴
    if (mode !== 'busy') {
      idleStir += dt;
      if (idleStir > 5) { idleStir = 0; capsules.stir(0.06); } // 대기 중 가볍게 출렁
    }
    capsules.update(dt);
    fx.update(dt);
    if (machine.hintRing.visible) machine.hintRing.material.opacity = 0.45 + 0.45 * Math.sin(time * 6);
    // 손잡이 딸깍마다 머신이 들썩, 임팩트에 카메라가 흔들
    shake = Math.max(0, shake - dt * 6);
    machine.group.position.x = (Math.random() - 0.5) * 0.03 * shake;
    machine.group.rotation.z = (Math.random() - 0.5) * 0.01 * shake;
    camShake = Math.max(0, camShake - dt * 2.5);
    const cs = camShake * camShake * 0.09;
    camera.position.set(camBase.x + (Math.random() - 0.5) * cs, camBase.y + (Math.random() - 0.5) * cs, camBase.z);
    if (revealed) {
      revealT += dt;
      revealed.rotation.y = Math.sin(revealT * SWAY.speed) * SWAY.angle;
      revealed.position.y = SHOWCASE.y + Math.sin(time * 2) * 0.03;
    }
    renderer.render(scene, camera);
  });

  return {
    setMode,
    autoTurn() { if (mode === 'ready') { sfx.unlock(); auto = true; } },
    playReveal,
    clearReveal,
    setCapsuleCount(n) { capsules.setCount(n); },
    get mode() { return mode; },
  };
}
