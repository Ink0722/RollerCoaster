import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PRESETS, clonePoints, makeCurve, frameAt, orientationFromFrame, buildTrack, disposeTrack } from '../src/track.js';

for (const preset of PRESETS) {
  const points = clonePoints(preset.points);
  const curve = makeCurve(points);
  const start = frameAt(curve, 0).tangent;
  let minDirectionDot = 1;

  for (let i = 0; i < 120; i++) {
    const frame = frameAt(curve, i / 120);
    const orientation = orientationFromFrame(frame);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation).normalize();
    assert.ok(Math.abs(orientation.length() - 1) < 1e-6, `${preset.name}: quaternion must be unit length`);
    assert.ok(forward.dot(frame.tangent) > 0.999999, `${preset.name}: cart must face the track tangent`);
    assert.ok(up.dot(frame.up) > 0.999999, `${preset.name}: camera up must follow the track frame`);
    minDirectionDot = Math.min(minDirectionDot, forward.dot(start));
  }

  assert.ok(minDirectionDot < -0.5, `${preset.name}: heading must change around the loop`);
  const track = buildTrack(points);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < track.sleeper.count; i++) {
    track.sleeper.getMatrixAt(i, matrix);
    assert.ok(matrix.determinant() > 0.999, `${preset.name}: sleeper transform must not mirror geometry`);
  }
  disposeTrack(track);
  console.log(`${preset.name}: 车头方向、相机上方向和轨枕姿态通过`);
}
