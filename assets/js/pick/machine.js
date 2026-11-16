// 가챠 머신 — three 기본 도형만으로 만든다(외부 모델 없음)
import * as THREE from 'three';

export const COLORS = {
  green900: 0x0f3d24, green700: 0x1d6b3c, green500: 0x2f8f4e,
  yellow: 0xffe14d, cream: 0xf6f1e3, pink: 0xf4a6c0, orange: 0xf39a52, ink: 0x14231a,
};

// 머신 로컬 좌표(머신 그룹은 원점에 둔다)
export const DOME = { center: new THREE.Vector3(0, 2.15, 0), radius: 1.0 };
export const HANDLE_POS = new THREE.Vector3(0.42, 0.48, 0.74);
export const EXIT_POS = new THREE.Vector3(-0.42, 0.44, 0.73);
export const TRAY_POS = new THREE.Vector3(-0.42, 0.14, 0.95);

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

function textTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildMachine(scene, { title = '은크크 Pick' } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, ...extra });

  // 받침
  const base = new THREE.Mesh(roundedBox(1.7, 1.15, 1.45, 0.16), std(COLORS.green700));
  base.position.y = 0.575;
  group.add(base);

  // 받침 위 테두리
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.86, 0.14, 48), std(COLORS.yellow, { roughness: 0.35 }));
  collar.position.y = 1.22;
  group.add(collar);

  // 유리 돔 + 뚜껑
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME.radius, 64, 48),
    new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, shininess: 140, specular: 0xffffff, depthWrite: false }),
  );
  dome.position.copy(DOME.center);
  dome.renderOrder = 2;
  group.add(dome);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.16, 32), std(COLORS.yellow, { roughness: 0.35 }));
  cap.position.y = DOME.center.y + DOME.radius + 0.02;
  group.add(cap);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), std(COLORS.pink, { roughness: 0.3 }));
  knob.position.y = cap.position.y + 0.14;
  group.add(knob);

  // 앞면 로고 판
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 0.32),
    new THREE.MeshBasicMaterial({
      map: textTexture(1000, 256, (g, w, h) => {
        g.fillStyle = '#f6f1e3';
        g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 60); g.fill();
        g.fillStyle = '#1d6b3c';
        g.font = '700 150px ChaiHwaljjak, "Malgun Gothic", sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(title, w / 2, h / 2 + 8);
      }),
      transparent: true,
    }),
  );
  logo.position.set(0, 0.9, 0.726);
  group.add(logo);

  // 손잡이(시계 방향으로 돈다) — 받침판 + 회전하는 원판·막대
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 48), std(COLORS.green900));
  bezel.rotation.x = Math.PI / 2;
  bezel.position.copy(HANDLE_POS).setZ(HANDLE_POS.z - 0.01);
  group.add(bezel);
  const handle = new THREE.Group();
  handle.position.copy(HANDLE_POS);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 40), std(COLORS.yellow, { roughness: 0.3 }));
  disc.rotation.x = Math.PI / 2;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.07), std(COLORS.cream, { roughness: 0.3 }));
  bar.position.z = 0.05;
  handle.add(disc, bar);
  group.add(handle);

  // 손잡이 안내 링(READY에서 깜빡임)
  const hintRing = new THREE.Mesh(
    new THREE.RingGeometry(0.31, 0.36, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.yellow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  hintRing.position.copy(HANDLE_POS).setZ(HANDLE_POS.z + 0.03);
  hintRing.visible = false;
  group.add(hintRing);

  // 배출구 + 위쪽 경첩으로 열리는 덮개
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), new THREE.MeshBasicMaterial({ color: COLORS.ink }));
  hole.position.copy(EXIT_POS);
  group.add(hole);
  const flapPivot = new THREE.Group();
  flapPivot.position.set(EXIT_POS.x, EXIT_POS.y + 0.17, EXIT_POS.z + 0.01);
  const flap = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), std(COLORS.pink, { transparent: true, opacity: 0.85 }));
  flap.position.y = -0.17;
  flapPivot.add(flap);
  group.add(flapPivot);

  // 받침 트레이
  const trayMat = std(COLORS.cream, { roughness: 0.4 });
  const trayBottom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.34), trayMat);
  trayBottom.position.copy(TRAY_POS);
  const trayLip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.04), trayMat);
  trayLip.position.set(TRAY_POS.x, TRAY_POS.y + 0.05, TRAY_POS.z + 0.17);
  group.add(trayBottom, trayLip);

  // 바닥 그림자(그림자 맵 대신 블롭 텍스처)
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 3.2),
    new THREE.MeshBasicMaterial({
      map: textTexture(256, 256, (g, w) => {
        const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        gr.addColorStop(0, 'rgba(5,25,14,0.55)');
        gr.addColorStop(1, 'rgba(5,25,14,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, w);
      }),
      transparent: true, depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  group.add(shadow);

  return {
    group,
    handle,
    hintRing,
    setFlap(open) { flapPivot.rotation.x = -open * 1.2; },
  };
}
