// 3D 무대 — 렌더러·카메라, 손잡이 입력, 배출·개봉 연출, 경품 메시
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildMachine, DOME, HANDLE_POS, EXIT_POS, TRAY_POS } from './machine.js';
import { createCapsules, capsuleGeometries, CAPSULE_COLORS } from './capsules.js';
import { createFx } from './fx.js';

export const SHOWCASE = new THREE.Vector3(0, 1.7, 3.2);
// 머신(높이 약 3.35)이 화면 위쪽 ~65%에 들어오고 아래쪽은 버튼·결과 카드 자리로 비운다
const CAMERA_POS = new THREE.Vector3(0, 1.9, 8.3);
const CAMERA_TARGET = new THREE.Vector3(0, 1.05, 0);
const PRIZE_SIZE = 0.95;
const TURN = Math.PI * 2;
const TICK = Math.PI / 4;
// Meshy 모델 보정: 방향(라디안), 불투명도(투명 컵), 밝기(사진 텍스처가 실내광에 회색으로 찍힌 것을 끌어올림)
export const PRIZE_TUNE = {
  towel: { rotX: 0, rotY: 0, opacity: 1, lift: 0.25 },
  cup: { rotX: 0, rotY: 0, opacity: 0.85, lift: 0.25 },
  bag: { rotX: 0, rotY: 0, opacity: 1, lift: 0.25 },
};
const DEFAULT_TUNE = { rotX: 0, rotY: 0, opacity: 1, lift: 0 };
// 경품은 정면을 보여 주며 좌우로 흔든다(얇은 수건·장바구니는 옆에서 보면 선이 된다)
const SWAY = { angle: 0.55, speed: 1.3 };

const lerp = (a, b, t) => a + (b - a) * t;
const easeInQuad = (x) => x * x;
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

// 크기·중심을 맞춘 홀더 그룹으로 감싼다(홀더를 돌리고 움직인다)
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
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const mat = m.material;
    if (tune.opacity < 1) { mat.transparent = true; mat.opacity = tune.opacity; }
    if (tune.lift > 0 && mat.map && 'emissive' in mat) {
      mat.emissive.setRGB(1, 1, 1);
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = tune.lift;
    }
  });
  const holder = new THREE.Group();
  holder.add(pivot);
  return holder;
}

// GLB가 없거나 깨졌을 때: 경품 이름 카드
function prizeCard(label) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f1e3';
  g.beginPath(); g.roundRect(6, 6, 500, 308, 48); g.fill();
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
      holder = normalizePrize(gltf.scene, { ...DEFAULT_TUNE, ...PRIZE_TUNE[key] });
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

export async function createStage({ canvas, sfx, prizes, title, onTurnComplete }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); // WebGL 불가 시 여기서 throw
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1d6b3c, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 6, 5);
  const rim = new THREE.DirectionalLight(0xffe14d, 0.8);
  rim.position.set(-4, 3, -3);
  // 쇼케이스 정면 보조광: 어두워진 배경 앞에서 경품 앞면을 밝힌다
  const fill = new THREE.DirectionalLight(0xffffff, 1.4);
  fill.position.set(0, 2.4, 9);
  fill.target.position.copy(SHOWCASE);
  scene.add(key, rim, fill, fill.target);

  await document.fonts.load('700 80px ChaiHwaljjak').catch(() => {});
  const machine = buildMachine(scene, { title });
  const capsules = createCapsules(scene, { center: DOME.center, radius: DOME.radius });
  const fx = createFx(scene);

  // 쇼케이스 뒤 배경을 어둡게 하는 판
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshBasicMaterial({ color: 0x06180d, transparent: true, opacity: 0, depthWrite: false }));
  dim.position.set(0, 1.5, 2.4);
  dim.visible = false;
  scene.add(dim);

  // 배출되는 캡슐(반으로 갈라지는 히어로)
  const capGeo = capsuleGeometries();
  const heroTopMat = new THREE.MeshStandardMaterial({ color: CAPSULE_COLORS[0], roughness: 0.25, transparent: true });
  const heroBottomMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e3, roughness: 0.4, transparent: true });
  const hero = new THREE.Group();
  const heroTop = new THREE.Mesh(capGeo.top, heroTopMat);
  const heroBottom = new THREE.Mesh(capGeo.bottom, heroBottomMat);
  hero.add(heroTop, heroBottom);
  hero.visible = false;
  scene.add(hero);

  const prizeObjs = await loadPrizes(scene, prizes);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 16:9보다 좁으면 뒤로 물러나 머신이 잘리지 않게
    const back = Math.max(1, 1.5 / camera.aspect);
    camera.position.copy(CAMERA_POS).setZ(CAMERA_POS.z * back);
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
  let turn = 0, nextTick = TICK, auto = false, dragging = false, lastAngle = 0, shake = 0;
  let revealed = null, revealT = 0, idleStir = 0, time = 0;
  const handleWorld = new THREE.Vector3();

  function angleAt(e) {
    machine.handle.getWorldPosition(handleWorld);
    const v = handleWorld.project(camera);
    const rect = canvas.getBoundingClientRect();
    const sx = rect.left + ((v.x + 1) / 2) * rect.width;
    const sy = rect.top + ((1 - v.y) / 2) * rect.height;
    return Math.atan2(e.clientY - sy, e.clientX - sx); // 화면 좌표(y 아래)라 시계 방향이 +
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

  // ---- 연출 ----
  async function playReveal(prizeKey) {
    mode = 'busy';
    const r = capsules.radius;
    const bottomPt = DOME.center.clone().setY(DOME.center.y - DOME.radius);
    const body = capsules.takeNearest(bottomPt.x, bottomPt.y, bottomPt.z);
    const start = body ? new THREE.Vector3(body.x, body.y, body.z) : bottomPt.clone().setY(bottomPt.y + r);
    heroTopMat.color.setHex(CAPSULE_COLORS[body ? body.color : 0]);
    heroTopMat.opacity = heroBottomMat.opacity = 1;
    heroTop.position.set(0, 0, 0); heroTop.rotation.set(0, 0, 0);
    heroBottom.position.set(0, 0, 0); heroBottom.rotation.set(0, 0, 0);
    if (body) hero.quaternion.set(body.qx, body.qy, body.qz, body.qw); else hero.quaternion.identity();
    hero.position.copy(start);
    hero.scale.setScalar(r);
    hero.visible = true;

    // 1) 돔 → 받침 속 → 배출구 → 트레이
    const restY = TRAY_POS.y + 0.03 + r;
    const path = new THREE.CatmullRomCurve3([
      start,
      new THREE.Vector3(start.x * 0.5 - 0.2, 1.0, 0.1),
      new THREE.Vector3(EXIT_POS.x, EXIT_POS.y + 0.05, 0.45),
      new THREE.Vector3(EXIT_POS.x, EXIT_POS.y, EXIT_POS.z + 0.05),
      new THREE.Vector3(TRAY_POS.x, restY, TRAY_POS.z),
    ]);
    sfx.roll(1.3);
    tween(0.25, (t) => machine.setFlap(t));
    await tween(1.3, (t, dt) => { hero.position.copy(path.getPoint(t)); hero.rotateX(dt * 9); }, easeInQuad);
    sfx.thunk();
    tween(0.3, (t) => machine.setFlap(1 - t));
    await tween(0.35, (t) => { hero.position.y = restY + Math.abs(Math.sin(t * Math.PI * 2)) * 0.08 * (1 - t); });
    await wait(0.25);

    // 2) 트레이 → 쇼케이스(크게), 배경 어둡게
    const from = hero.position.clone();
    const lift = new THREE.CatmullRomCurve3([from, new THREE.Vector3(from.x * 0.5, 1.2, 1.8), SHOWCASE.clone()]);
    const q0 = hero.quaternion.clone(), qUp = new THREE.Quaternion();
    dim.visible = true;
    await tween(0.9, (t) => {
      hero.position.copy(lift.getPoint(t));
      hero.scale.setScalar(lerp(r, 0.36, t));
      hero.quaternion.slerpQuaternions(q0, qUp, t); // 색 반구가 위로 오게 세운다
      dim.material.opacity = 0.55 * t;
    }, easeInOutCubic);

    // 3) 흔들기(점점 세게)
    let tickAcc = 0;
    await tween(1.1, (t, dt) => {
      hero.rotation.set(0, 0, Math.sin(t * 40) * 0.2 * t);
      tickAcc += dt;
      if (tickAcc > 0.11) { tickAcc = 0; sfx.tick(); }
    });

    // 4) 개봉: 반구가 갈라지고 경품 등장
    sfx.pop();
    sfx.fanfare();
    fx.burst(SHOWCASE);
    const prize = prizeObjs[prizeKey];
    prize.position.copy(SHOWCASE);
    prize.rotation.set(0, 0, 0);
    prize.scale.setScalar(0.001);
    prize.visible = true;
    revealed = prize;
    revealT = 0;
    tween(0.6, (t) => prize.scale.setScalar(Math.max(0.001, easeOutBack(t))));
    await tween(0.7, (t) => {
      heroTop.position.set(-1.5 * t, 2.2 * t, 0.5 * t);
      heroTop.rotation.z = 1.2 * t;
      heroBottom.position.set(1.4 * t, -2.0 * t, 0.5 * t);
      heroBottom.rotation.z = -1.0 * t;
      heroTopMat.opacity = heroBottomMat.opacity = 1 - t;
    });
    hero.visible = false;
  }

  function clearReveal() {
    fx.clear();
    hero.visible = false;
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
    if (auto) addTurn((dt * TURN) / 1.3);
    if (mode !== 'busy') {
      idleStir += dt;
      if (idleStir > 5) { idleStir = 0; capsules.stir(0.06); } // 대기 중 가볍게 출렁
    }
    capsules.update(dt);
    fx.update(dt);
    if (machine.hintRing.visible) machine.hintRing.material.opacity = 0.35 + 0.35 * Math.sin(time * 5);
    shake = Math.max(0, shake - dt * 6);
    machine.group.position.x = (Math.random() - 0.5) * 0.03 * shake;
    machine.group.rotation.z = (Math.random() - 0.5) * 0.01 * shake;
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
