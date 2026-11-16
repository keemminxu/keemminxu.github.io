// 개봉 이펙트 — 후처리 없이 가산 혼합 스프라이트·인스턴스로
import * as THREE from 'three';

export const FX_COLORS = [0xffe14d, 0xf4a6c0, 0xf39a52, 0x2f8f4e, 0xf6f1e3];
const CONFETTI = 300;
const SPARKLES = 40;

const easeOutBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  return canvasTexture(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,240,1)');
    gr.addColorStop(0.25, 'rgba(255,240,170,0.8)');
    gr.addColorStop(1, 'rgba(255,225,77,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

function raysTexture() {
  return canvasTexture(512, (g, s) => {
    g.translate(s / 2, s / 2);
    const n = 14;
    for (let i = 0; i < n; i++) {
      g.rotate((Math.PI * 2) / n);
      const gr = g.createLinearGradient(0, 0, s / 2, 0);
      gr.addColorStop(0, 'rgba(255,240,180,0.9)');
      gr.addColorStop(1, 'rgba(255,225,77,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(s / 2, -s * 0.06);
      g.lineTo(s / 2, s * 0.06);
      g.closePath();
      g.fill();
    }
  });
}

export function createFx(scene) {
  const additive = (map) => new THREE.SpriteMaterial({ map, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = glowTexture();
  const flash = new THREE.Sprite(additive(glow));
  const rays = new THREE.Sprite(additive(raysTexture()));
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.62, 64),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );

  // 색종이
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.085), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONFETTI);
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  confetti.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < CONFETTI; i++) confetti.setColorAt(i, col.setHex(FX_COLORS[i % FX_COLORS.length]));
  confetti.count = 0;
  const bits = Array.from({ length: CONFETTI }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 }));

  // 경품 주변 반짝이
  const sPos = new Float32Array(SPARKLES * 3);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const sparkles = new THREE.Points(sGeo, new THREE.PointsMaterial({ map: glow, size: 0.09, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparkles.frustumCulled = false;
  const seeds = Array.from({ length: SPARKLES }, () => ({ a: Math.random() * Math.PI * 2, rad: 0.45 + Math.random() * 0.35, y: (Math.random() * 2 - 1) * 0.45, sp: 0.4 + Math.random() * 0.8 }));

  const parts = [flash, rays, halo, confetti, sparkles];
  parts.forEach((o) => { o.visible = false; scene.add(o); });

  let time = 0, since = 0, active = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), none = new THREE.Vector3(0, 0, 0);

  return {
    burst(pos) {
      active = true;
      since = 0;
      flash.position.copy(pos);
      rays.position.copy(pos).setZ(pos.z - 0.35); // 경품 뒤
      halo.position.copy(pos).setZ(pos.z - 0.3);
      sparkles.position.copy(pos);
      for (const b of bits) {
        const a = Math.random() * Math.PI * 2, up = 2.2 + Math.random() * 2.6, out = 0.8 + Math.random() * 2.2;
        b.p.copy(pos);
        b.v.set(Math.cos(a) * out, up, Math.sin(a) * out * 0.4); // 카메라 쪽으로 덜 튀게
        b.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        b.w.set((Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 10);
        b.life = 2.6 + Math.random() * 0.8;
      }
      confetti.count = CONFETTI;
      parts.forEach((o) => { o.visible = true; });
    },
    clear() {
      active = false;
      confetti.count = 0;
      parts.forEach((o) => { o.visible = false; });
    },
    update(dt) {
      time += dt;
      if (!active) return;
      since += dt;
      // 섬광: 0.35초 동안 커지며 사라짐
      const f = Math.min(1, since / 0.35);
      flash.material.opacity = 1 - f;
      flash.scale.setScalar(0.3 + f * 3.6);
      // 빛줄기·후광: 0.5초에 걸쳐 나타난 뒤 유지, 천천히 회전
      const k = Math.min(1, since / 0.5);
      rays.material.opacity = 0.75 * k;
      rays.scale.setScalar(3.4 * easeOutBack(k));
      rays.material.rotation += dt * 0.35;
      halo.material.opacity = 0.6 * k;
      halo.scale.setScalar(0.6 + 0.4 * k + Math.sin(time * 3) * 0.03);
      // 반짝이
      sparkles.material.opacity = Math.min(1, since / 0.6);
      for (let i = 0; i < SPARKLES; i++) {
        const s = seeds[i], a = s.a + time * s.sp;
        sPos[i * 3] = Math.cos(a) * s.rad;
        sPos[i * 3 + 1] = s.y + Math.sin(time * 2 + i) * 0.05;
        sPos[i * 3 + 2] = Math.sin(a) * s.rad * 0.5;
      }
      sGeo.attributes.position.needsUpdate = true;
      // 색종이
      for (let i = 0; i < CONFETTI; i++) {
        const b = bits[i];
        if (b.life > 0) {
          b.life -= dt;
          b.v.y -= 3.2 * dt;
          b.v.multiplyScalar(1 - 1.2 * dt);
          b.p.addScaledVector(b.v, dt);
          b.r.x += b.w.x * dt; b.r.y += b.w.y * dt; b.r.z += b.w.z * dt;
        }
        q.setFromEuler(b.r);
        m.compose(b.p, q, b.life > 0 ? one : none);
        confetti.setMatrixAt(i, m);
      }
      confetti.instanceMatrix.needsUpdate = true;
    },
  };
}
