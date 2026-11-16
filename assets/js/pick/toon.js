// 툰 공용 — 포스터 손그림풍: 3단 셀 셰이딩, 잉크 외곽선, 툰 유리
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const INK = 0x14231a;
export const PAL = {
  green900: 0x0f3d24, green700: 0x1d6b3c, green500: 0x2f8f4e, mint: 0xd6f2e6,
  yellow: 0xffd84a, cream: 0xfbf6e8, pink: 0xf49ac1, orange: 0xf28c3c, ink: INK,
};

// 셀 램프(조도 계수). 값이 클수록 그림자가 옅다.
function ramp(steps) {
  const c = document.createElement('canvas');
  c.width = steps.length; c.height = 1;
  const g = c.getContext('2d');
  steps.forEach((v, i) => {
    const b = Math.round(v * 255);
    g.fillStyle = `rgb(${b},${b},${b})`;
    g.fillRect(i, 0, 1, 1);
  });
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
const RAMPS = {};
export const toonRamp = (kind = 'prop') => (RAMPS[kind] ||= ramp(kind === 'prize' ? [0.72, 0.9, 1.0] : [0.5, 0.78, 1.0]));

export function toonMat(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...extra });
}

const hullMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

// 볼록한 물체용 외곽선: 같은 지오메트리의 뒷면을 잉크색으로, 축마다 두께 t만큼 키워 자식으로 붙인다
export function inkHull(mesh, t = 0.022) {
  const g = mesh.geometry;
  g.computeBoundingBox();
  const size = g.boundingBox.getSize(new THREE.Vector3());
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  const k = (v) => (v > 1e-6 ? (v + 2 * t) / v : 1);
  const hull = new THREE.Mesh(g, hullMat);
  hull.scale.set(k(size.x), k(size.y), k(size.z));
  hull.position.set(c.x * (1 - hull.scale.x), c.y * (1 - hull.scale.y), c.z * (1 - hull.scale.z));
  hull.renderOrder = -1;
  mesh.add(hull);
  return mesh;
}

// 오목한 물체(경품)용 외곽선: 정점을 매끈한 법선 방향으로 t만큼 밀어낸 뒷면
export function normalOutline(geometry, t) {
  // meshopt 양자화(정수·정규화·인터리브) 위치를 Float32로 풀어야 mergeVertices가 동작한다
  const pos = geometry.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    arr[i * 3] = pos.getX(i); arr[i * 3 + 1] = pos.getY(i); arr[i * 3 + 2] = pos.getZ(i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  if (geometry.index) g.setIndex(Array.from(geometry.index.array));
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = { value: t };
    sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += normalize(normal) * uT;',
    );
  };
  return new THREE.Mesh(merged, mat);
}

// 툰 유리: 가운데는 비치고, 가장자리는 잉크선, 왼쪽 위에 흰 하이라이트 띠 두 줄
export function toonGlass({ tint = PAL.mint, alpha = 0.14, edge = [0.74, 0.82], side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTint: { value: new THREE.Color(tint) },
      uInk: { value: new THREE.Color(INK) },
      uAlpha: { value: alpha },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint; uniform vec3 uInk; uniform float uAlpha; uniform float uOpacity;
      varying vec3 vN; varying vec3 vV;
      float band(float x, float a, float b) { return smoothstep(a, a + 0.04, x) * (1.0 - smoothstep(b, b + 0.04, x)); }
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        float f = 1.0 - abs(dot(n, normalize(vV)));
        float e = smoothstep(${edge[0].toFixed(3)}, ${edge[1].toFixed(3)}, f);
        float d = dot(n.xy, normalize(vec2(-0.7, 0.7)));
        float hl = max(band(d, 0.34, 0.52), band(d, 0.62, 0.70));
        vec3 col = mix(mix(uTint, vec3(1.0), hl), uInk, e);
        float a = max(uAlpha, max(e, hl * 0.9));
        gl_FragColor = vec4(col, a * uOpacity);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side,
  });
}

// 텍스처에서 어두운 인쇄(로고)만 뽑아 같은 UV로 덮는 데칼 메시
export function inkDecal(mesh, threshold = 0.38) {
  const src = mesh.material.map;
  const img = src.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
    p[i] = 20; p[i + 1] = 35; p[i + 2] = 26;
    p[i + 3] = l < threshold ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = src.flipY;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2,
  }));
}
