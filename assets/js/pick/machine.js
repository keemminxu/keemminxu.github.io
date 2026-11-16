// 가챠 머신 — 기본 도형 + 툰(셀 셰이딩·잉크 외곽선). 앞판에 포스터의 은크크Pick 도장.
import * as THREE from 'three';
import { PAL, INK, toonMat, inkHull, toonGlass } from './toon.js';

// 머신 로컬 좌표(머신 그룹은 원점에 둔다)
export const DOME = { center: new THREE.Vector3(0, 2.15, 0), radius: 1.0 };
export const HANDLE_POS = new THREE.Vector3(0.52, 0.46, 0.74);
export const EXIT_POS = new THREE.Vector3(-0.52, 0.42, 0.73);
export const TRAY_POS = new THREE.Vector3(-0.52, 0.14, 0.95);

const STAMP_URL = new URL('../../images/eunkk-pick/stamp.png', import.meta.url).href;

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x0 = -w / 2, y0 = -h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

// 모서리가 둥근 상자(가운데 정렬). 베벨이 바깥으로 붙으므로 그만큼 빼고 만든다.
function roundedBox(w, h, d, r) {
  const bevel = Math.min(r, d / 4);
  const g = new THREE.ExtrudeGeometry(
    roundedRectShape(w - 2 * bevel, h - 2 * bevel, Math.max(0.001, r - bevel)),
    { depth: d - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8 },
  );
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return g;
}

// 납작한 도형(원판·스티커)은 뒷면 외곽선이 안 보이므로 잉크 판을 뒤에 깐다
function inkBacking(geometry, pad, z = -0.004) {
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: INK }));
  m.scale.setScalar(pad);
  m.position.z = z;
  return m;
}

export function buildMachine(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const part = (geo, color, pos, extra) => {
    const m = inkHull(new THREE.Mesh(geo, toonMat(color, extra)));
    if (pos) m.position.copy(pos);
    group.add(m);
    return m;
  };

  // 받침 + 다리
  part(roundedBox(1.7, 1.1, 1.45, 0.18), PAL.yellow, new THREE.Vector3(0, 0.6, 0));
  for (const [x, z] of [[-0.62, -0.5], [0.62, -0.5], [-0.62, 0.5], [0.62, 0.5]]) {
    part(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 20), PAL.green700, new THREE.Vector3(x, 0.04, z));
  }
  // 받침 위 테두리, 뚜껑, 꼭지
  part(new THREE.CylinderGeometry(0.84, 0.88, 0.16, 48), PAL.green700, new THREE.Vector3(0, 1.22, 0));
  part(new THREE.CylinderGeometry(0.3, 0.34, 0.18, 32), PAL.green700, new THREE.Vector3(0, DOME.center.y + DOME.radius + 0.02, 0));
  part(new THREE.SphereGeometry(0.11, 24, 16), PAL.pink, new THREE.Vector3(0, DOME.center.y + DOME.radius + 0.17, 0));

  // 툰 유리 돔(캡슐보다 나중에 그린다)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME.radius, 64, 48), toonGlass());
  dome.position.copy(DOME.center);
  dome.renderOrder = 2;
  group.add(dome);

  // 앞판 도장 스티커(살짝 기울임) + 잉크 그림자
  const stampTex = new THREE.TextureLoader().load(STAMP_URL);
  stampTex.colorSpace = THREE.SRGBColorSpace;
  stampTex.anisotropy = 4;
  const stampGeo = new THREE.PlaneGeometry(0.6, 0.59);
  const stamp = new THREE.Mesh(stampGeo, new THREE.MeshBasicMaterial({ map: stampTex, transparent: true, alphaTest: 0.5 }));
  const stampShadow = new THREE.Mesh(stampGeo, new THREE.MeshBasicMaterial({ color: INK, alphaMap: stampTex, transparent: true, alphaTest: 0.5 }));
  stamp.position.set(0, 0.8, 0.735);
  stamp.rotation.z = 0.06;
  stampShadow.position.set(0.025, 0.775, 0.732);
  stampShadow.rotation.z = 0.06;
  group.add(stampShadow, stamp);

  // 손잡이: 받침판 + 시계 방향으로 도는 원판·막대
  const bezel = part(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 48), PAL.green900, HANDLE_POS.clone().setZ(HANDLE_POS.z - 0.015));
  bezel.rotation.x = Math.PI / 2;
  const handle = new THREE.Group();
  handle.position.copy(HANDLE_POS);
  const disc = inkHull(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 40), toonMat(PAL.orange)));
  disc.rotation.x = Math.PI / 2;
  const bar = inkHull(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.08), toonMat(PAL.cream)));
  bar.position.z = 0.06;
  handle.add(disc, bar);
  group.add(handle);

  // 손잡이 안내 링(READY에서 깜빡임)
  const hintRing = new THREE.Mesh(
    new THREE.RingGeometry(0.29, 0.34, 48),
    new THREE.MeshBasicMaterial({ color: PAL.cream, transparent: true, opacity: 0, depthWrite: false }),
  );
  hintRing.position.copy(HANDLE_POS).setZ(HANDLE_POS.z + 0.04);
  hintRing.visible = false;
  group.add(hintRing);

  // 배출구 + 위쪽 경첩으로 열리는 분홍 덮개
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshBasicMaterial({ color: INK }));
  hole.position.copy(EXIT_POS);
  group.add(hole);
  const flapPivot = new THREE.Group();
  flapPivot.position.set(EXIT_POS.x, EXIT_POS.y + 0.15, EXIT_POS.z + 0.012);
  const flapGeo = new THREE.CircleGeometry(0.14, 32);
  const flap = new THREE.Mesh(flapGeo, toonMat(PAL.pink));
  flap.position.y = -0.15;
  flap.add(inkBacking(flapGeo, 1.14));
  flapPivot.add(flap);
  group.add(flapPivot);

  // 받침 트레이
  part(new THREE.BoxGeometry(0.5, 0.06, 0.34), PAL.green700, TRAY_POS);
  part(new THREE.BoxGeometry(0.5, 0.12, 0.04), PAL.green700, new THREE.Vector3(TRAY_POS.x, TRAY_POS.y + 0.05, TRAY_POS.z + 0.17));

  // 바닥 그림자(납작한 잉크 타원)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 48),
    new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.1, 0.75, 1);
  shadow.position.set(0.08, 0.002, 0.15);
  group.add(shadow);

  return {
    group,
    handle,
    hintRing,
    setFlap(open) { flapPivot.rotation.x = -open * 1.2; },
  };
}
