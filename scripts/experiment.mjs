import { PRESETS, clonePoints, makeCurve, buildTrack, disposeTrack } from '../src/track.js';

const steps = 240;

function coefficientOfVariation(distances) {
  const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  const variance = distances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / distances.length;
  return Math.sqrt(variance) / mean;
}

function stepDistances(curve, method) {
  const distances = [];
  for (let i = 0; i < steps; i++) {
    const a = method.call(curve, i / steps);
    const b = method.call(curve, (i + 1) / steps);
    distances.push(a.distanceTo(b));
  }
  return distances;
}

console.log(`相邻采样距离的变异系数，${steps} 步；越低表示速度越均匀`);
console.log('轨道\t参数 t\t弧长 u\t改进倍数\t长度');
for (const preset of PRESETS) {
  const curve = makeCurve(clonePoints(preset.points));
  const parameterCV = coefficientOfVariation(stepDistances(curve, curve.getPoint));
  const arcCV = coefficientOfVariation(stepDistances(curve, curve.getPointAt));
  console.log(`${preset.name}\t${parameterCV.toFixed(4)}\t${arcCV.toFixed(4)}\t${(parameterCV / arcCV).toFixed(1)}×\t${curve.getLength().toFixed(1)} m`);
}

console.log('\n轨道采样密度与双轨三角形数量（平缓环线）');
const points = clonePoints(PRESETS[0].points);
for (const preview of [true, false]) {
  const track = buildTrack(points, { preview });
  const rails = track.group.children.slice(0, 2);
  const triangles = rails.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
  console.log(`${preview ? '拖动预览' : '完整轨道'}\t${triangles} triangles`);
  disposeTrack(track);
}
