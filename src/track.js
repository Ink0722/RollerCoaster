import * as THREE from 'three';

export const MIN_POINTS = 4;
export const MAX_POINTS = 24;
export const MIN_SPACING = 3;
export const MAX_GRADE = 0.9;
export const LIMITS = { x: 60, z: 60, minY: 2, maxY: 24 };

export const PRESETS = [
  {
    id: 'loop', name: '平缓环线',
    points: [[-32, 7, -17], [-18, 8, -30], [5, 8, -32], [27, 9, -22], [35, 8, -2], [28, 7, 20], [6, 8, 30], [-18, 7, 27], [-34, 7, 10]],
  },
  {
    id: 'hills', name: '连续山丘',
    points: [[-34, 7, -16], [-20, 15, -30], [1, 19, -32], [25, 7, -23], [35, 6, -5], [25, 17, 18], [4, 20, 31], [-20, 7, 27], [-36, 6, 9]],
  },
  {
    id: 'curves', name: '起伏弯道',
    points: [[-35, 8, -8], [-26, 13, -27], [-4, 17, -31], [13, 8, -23], [31, 9, -31], [38, 15, -7], [26, 6, 16], [7, 15, 31], [-12, 9, 20], [-34, 7, 27]],
  },
];

export function clonePoints(points) {
  return points.map((point) => new THREE.Vector3(...point));
}

export function makeCurve(points) {
  return new THREE.CatmullRomCurve3(points, true, 'centripetal');
}

export function frameAt(curve, u) {
  const point = curve.getPointAt(u);
  const tangent = curve.getTangentAt(u).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
  const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
  return { point, tangent, right, up };
}

// The cart faces local -Z. Negating both X and Z keeps the basis right-handed:
// local -Z points along the curve tangent, and local +Y follows the track up.
export function orientationFromFrame({ tangent, right, up }) {
  const basis = new THREE.Matrix4().makeBasis(right.clone().negate(), up, tangent.clone().negate());
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

function makeRail(curve, offset, segments, heightColor, minY, maxY) {
  const radial = 8;
  const vertices = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const low = new THREE.Color('#64b979');
  const high = new THREE.Color('#ed6748');
  const base = new THREE.Color('#ed694b');
  const radius = 0.15;

  for (let i = 0; i <= segments; i++) {
    const { point, right, up } = frameAt(curve, i / segments);
    const center = point.addScaledVector(right, offset);
    const color = heightColor
      ? low.clone().lerp(high, THREE.MathUtils.clamp((center.y - minY) / Math.max(1, maxY - minY), 0, 1))
      : base;
    for (let j = 0; j < radial; j++) {
      const angle = (j / radial) * Math.PI * 2;
      const normal = right.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
      const v = center.clone().addScaledVector(normal, radius);
      vertices.push(v.x, v.y, v.z);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + (j + 1) % radial;
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + (j + 1) % radial;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

function placeInstances(mesh, curve, count, createMatrix) {
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    matrix.copy(createMatrix(frameAt(curve, i / count), i));
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function buildTrack(points, options = {}) {
  const curve = makeCurve(points);
  const length = curve.getLength();
  const samples = Math.max(100, options.preview ? 140 : Math.ceil(length * 2.8));
  const heights = Array.from({ length: 256 }, (_, i) => curve.getPointAt(i / 256).y);
  const minY = Math.min(...heights);
  const maxY = Math.max(...heights);
  const group = new THREE.Group();
  group.name = 'Generated track';

  const railMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.22, roughness: 0.32, side: THREE.DoubleSide });
  for (const offset of [-0.76, 0.76]) {
    const rail = new THREE.Mesh(makeRail(curve, offset, samples, options.heightColor, minY, maxY), railMaterial);
    rail.receiveShadow = true;
    group.add(rail);
  }

  const beamMaterial = new THREE.MeshStandardMaterial({ color: '#775b57', metalness: 0.25, roughness: 0.55 });
  const sleeperCount = Math.max(24, Math.floor(length / 2.1));
  const sleeper = new THREE.InstancedMesh(new THREE.BoxGeometry(2.35, 0.18, 0.42), beamMaterial, sleeperCount);
  sleeper.name = 'Sleepers';
  sleeper.castShadow = true;
  placeInstances(sleeper, curve, sleeperCount, ({ point, tangent, right, up }) => {
    const rotation = orientationFromFrame({ tangent, right, up });
    return new THREE.Matrix4().compose(point.addScaledVector(up, -0.19), rotation, new THREE.Vector3(1, 1, 1));
  });
  sleeper.visible = options.sleepers !== false;
  group.add(sleeper);

  const supportMaterial = new THREE.MeshStandardMaterial({ color: '#a9adb0', metalness: 0.42, roughness: 0.48 });
  const supportStations = Math.max(8, Math.floor(length / 10));
  const support = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.17, 1, 7), supportMaterial, supportStations * 2);
  support.name = 'Supports';
  support.castShadow = true;
  const supportMatrix = new THREE.Matrix4();
  for (let i = 0; i < supportStations; i++) {
    const { point, right } = frameAt(curve, i / supportStations);
    for (let side = 0; side < 2; side++) {
      const pos = point.clone().addScaledVector(right, side ? 0.76 : -0.76);
      const height = Math.max(0.5, pos.y - 0.4);
      supportMatrix.compose(new THREE.Vector3(pos.x, height / 2, pos.z), new THREE.Quaternion(), new THREE.Vector3(1, height, 1));
      support.setMatrixAt(i * 2 + side, supportMatrix);
    }
  }
  support.instanceMatrix.needsUpdate = true;
  support.visible = options.supports !== false;
  group.add(support);

  return { group, curve, length, minY, maxY, sleeper, support };
}

export function disposeTrack(track) {
  if (!track) return;
  const geometries = new Set();
  const materials = new Set();
  track.group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export function validatePoint(point, points, index) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) return '坐标必须是有限数字';
  if (Math.abs(point.x) > LIMITS.x || Math.abs(point.z) > LIMITS.z || point.y < LIMITS.minY || point.y > LIMITS.maxY) return '坐标超出场景范围';
  const previous = points[(index - 1 + points.length) % points.length];
  const next = points[(index + 1) % points.length];
  for (const neighbor of [previous, next]) {
    const horizontal = Math.hypot(point.x - neighbor.x, point.z - neighbor.z);
    if (horizontal < MIN_SPACING) return `相邻节点水平距离至少 ${MIN_SPACING} 米`;
    if (Math.abs(point.y - neighbor.y) / horizontal > MAX_GRADE) return '相邻节点坡度过陡';
  }
  return null;
}

export function parseProject(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.points)) throw new Error('缺少控制点数据');
  if (value.points.length < MIN_POINTS || value.points.length > MAX_POINTS) throw new Error(`控制点数量需在 ${MIN_POINTS}～${MAX_POINTS} 个之间`);
  const points = value.points.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 3 || !entry.every(Number.isFinite)) throw new Error('控制点坐标格式无效');
    return new THREE.Vector3(...entry);
  });
  for (let i = 0; i < points.length; i++) {
    const error = validatePoint(points[i], points, i);
    if (error) throw new Error(`第 ${i + 1} 个控制点：${error}`);
  }
  const raw = value.settings || {};
  return {
    points,
    name: typeof value.name === 'string' ? value.name.slice(0, 50) : '导入的轨道',
    settings: {
      speed: THREE.MathUtils.clamp(Number(raw.speed) || 14, 4, 32),
      gravity: raw.gravity === true,
      heightColor: raw.heightColor === true,
      sleepers: raw.sleepers !== false,
      supports: raw.supports !== false,
      scenery: raw.scenery !== false,
      grid: raw.grid === true,
    },
  };
}
