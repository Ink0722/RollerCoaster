import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import WebGL from 'three/addons/capabilities/WebGL.js';
import './style.css';
import {
  PRESETS, MIN_POINTS, MAX_POINTS, LIMITS,
  clonePoints, makeCurve, buildTrack, disposeTrack, frameAt, orientationFromFrame, validatePoint, parseProject,
} from './track.js';

const $ = (selector) => document.querySelector(selector);

function presetPreviewPath(preset) {
  const curve = makeCurve(clonePoints(preset.points));
  const projected = Array.from({ length: 72 }, (_, index) => {
    const point = curve.getPoint(index / 72);
    return { x: point.x + point.z * 0.26, y: point.z * 0.48 - point.y * 0.75 };
  });
  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(62 / Math.max(1, maxX - minX), 34 / Math.max(1, maxY - minY));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return `${projected.map((point, index) => `${index ? 'L' : 'M'}${(36 + (point.x - centerX) * scale).toFixed(1)} ${(22 + (point.y - centerY) * scale).toFixed(1)}`).join(' ')} Z`;
}

const presetPreviews = new Map(PRESETS.map((preset) => [preset.id, presetPreviewPath(preset)]));

const ui = {
  host: $('#scene-host'), error: $('#webgl-error'), presets: $('#presets'), pointList: $('#point-list'),
  pointCount: $('#point-count'), selectedLabel: $('#selected-point-label'),
  coords: [$('#point-x'), $('#point-y'), $('#point-z')],
  speed: $('#speed-range'), speedValue: $('#speed-value'),
  gravity: $('#gravity-toggle'), heightColor: $('#height-toggle'),
  sleepers: $('#sleepers-toggle'), supports: $('#supports-toggle'), scenery: $('#scenery-toggle'), grid: $('#grid-toggle'),
  launch: $('#launch-button'), pause: $('#pause-button'), reset: $('#reset-button'),
  buildMode: $('#build-mode'), rideMode: $('#ride-mode'),
  trackName: $('#track-name'), status: $('#status-text'),
  length: $('#length-value'), height: $('#height-value'), currentSpeed: $('#current-speed-value'),
  progress: $('#progress-value'), progressFill: $('#progress-fill'), fps: $('#fps-value'),
  profilePanel: $('#profile-panel'), profileSvg: $('#profile-panel svg'),
  profileFill: $('#profile-fill'), profileLine: $('#profile-line'),
  profileCursor: $('#profile-cursor'), profileDot: $('#profile-dot'),
};

const state = {
  points: clonePoints(PRESETS[0].points), name: PRESETS[0].name, preset: PRESETS[0].id,
  selected: -1, mode: 'build', view: 'free', running: false, canResume: false,
  distance: 0, speed: 14, actualSpeed: 0,
  gravity: false, heightColor: false, sleepers: true, supports: true, scenery: true, grid: false,
};

if (!WebGL.isWebGL2Available()) {
  ui.error.hidden = false;
  ui.error.innerHTML = '<strong>此浏览器暂时无法创建 WebGL 2 场景</strong><span>请在 Chrome 或 Edge 中启用硬件加速，并确认显卡驱动支持 WebGL 2。</span>';
} else {
  initialize();
}

function initialize() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9f1ef');
  scene.fog = new THREE.Fog('#e9f1ef', 115, 230);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.52;
  ui.host.appendChild(renderer.domElement);

  const freeCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
  freeCamera.position.set(53, 46, 60);
  const followCamera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);
  const firstCamera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);

  const orbit = new OrbitControls(freeCamera, renderer.domElement);
  orbit.target.set(0, 6, 0);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.minDistance = 15;
  orbit.maxDistance = 185;
  orbit.maxPolarAngle = Math.PI * 0.48;
  orbit.update();

  scene.add(new THREE.HemisphereLight('#ffffff', '#9bb5a1', 2.45));
  const sun = new THREE.DirectionalLight('#fff5dd', 3.1);
  sun.position.set(-45, 75, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  sun.shadow.bias = -0.0002;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: '#b6d9ab', roughness: 0.94 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grassPatchMaterial = new THREE.MeshStandardMaterial({ color: '#a7cf9c', roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(6 + (i % 4) * 2.5, 32), grassPatchMaterial);
    const a = i * 2.39996;
    const r = 22 + (i % 5) * 13;
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(Math.cos(a) * r, 0.013, Math.sin(a) * r);
    patch.scale.set(1.45, 0.7, 1);
    scene.add(patch);
  }

  const grid = new THREE.GridHelper(160, 40, '#83b995', '#a5caaa');
  grid.position.y = 0.028;
  grid.visible = false;
  scene.add(grid);

  const scenery = createScenery();
  scene.add(scenery);
  const station = createStation();
  scene.add(station);

  const cart = createCart();
  cart.add(firstCamera);
  firstCamera.position.set(0, 1.7, -1.05);
  scene.add(cart);

  const controlGroup = new THREE.Group();
  scene.add(controlGroup);
  const pointMeshes = [];
  const pointGeometry = new THREE.SphereGeometry(0.82, 16, 12);
  const transform = new TransformControls(freeCamera, renderer.domElement);
  transform.setMode('translate');
  transform.setSize(0.85);
  transform.showY = true;
  scene.add(transform.getHelper());
  transform.getHelper().visible = false;

  let track = null;
  let dragInProgress = false;
  let lastValidPoint = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const clock = new THREE.Clock();
  let fpsElapsed = 0;
  let fpsFrames = 0;
  let followNeedsSnap = true;
  let statusTimer = null;
  let profileLow = 0;
  let profileSpan = 1;

  function setStatus(message) {
    clearTimeout(statusTimer);
    ui.status.textContent = message;
    ui.status.hidden = !message;
    if (message) statusTimer = setTimeout(() => {
      ui.status.textContent = '';
      ui.status.hidden = true;
    }, 4500);
  }

  function updateTransportButtons() {
    ui.launch.querySelector('span:last-child').textContent = state.running ? '行驶中' : state.canResume ? '继续' : '发车';
    ui.launch.disabled = state.running;
    ui.pause.disabled = !state.running;
  }

  function stopForEdit(message = '轨道已更新，从起点重新发车') {
    state.running = false;
    state.canResume = false;
    state.distance = 0;
    state.actualSpeed = 0;
    setStatus(message);
    updateTransportButtons();
  }

  function updateMetrics() {
    if (!track) return;
    ui.length.textContent = `${track.length.toFixed(1)} m`;
    ui.height.textContent = `${(track.maxY - track.minY).toFixed(1)} m`;
    ui.currentSpeed.textContent = `${state.actualSpeed.toFixed(1)} m/s`;
    const percent = (state.distance / track.length) * 100;
    ui.progress.textContent = `${percent.toFixed(0)}%`;
    ui.progressFill.style.width = `${percent}%`;
  }

  function profileY(height) {
    return 64 - THREE.MathUtils.clamp((height - profileLow) / profileSpan, 0, 1) * 50;
  }

  function rebuildProfile() {
    const heightRange = track.maxY - track.minY;
    profileSpan = Math.max(6, heightRange);
    profileLow = (track.minY + track.maxY - profileSpan) / 2;
    const steps = 120;
    const line = Array.from({ length: steps + 1 }, (_, i) => {
      const x = 8 + (i / steps) * 224;
      const y = profileY(track.curve.getPointAt(i / steps).y);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    ui.profileLine.setAttribute('d', line);
    ui.profileFill.setAttribute('d', `${line} L232 64 L8 64 Z`);
    ui.profileSvg.setAttribute('aria-label', `轨道高度剖面，最低 ${track.minY.toFixed(1)} 米，最高 ${track.maxY.toFixed(1)} 米`);
    ui.profilePanel.hidden = false;
  }

  function updateProfileMarker(progress, height) {
    const x = 8 + progress * 224;
    ui.profileCursor.setAttribute('x1', x.toFixed(1));
    ui.profileCursor.setAttribute('x2', x.toFixed(1));
    ui.profileDot.setAttribute('cx', x.toFixed(1));
    ui.profileDot.setAttribute('cy', profileY(height).toFixed(1));
  }

  function poseCart() {
    if (!track) return;
    const progress = state.distance / track.length;
    const frame = frameAt(track.curve, progress);
    const { point, up } = frame;
    cart.position.copy(point).addScaledVector(up, 0.68);
    cart.quaternion.copy(orientationFromFrame(frame));
    updateProfileMarker(progress, point.y);
  }

  function poseStation() {
    if (!track) return;
    const { point, tangent } = frameAt(track.curve, 0);
    station.position.set(point.x, 0, point.z);
    station.rotation.y = Math.atan2(-tangent.x, -tangent.z);
  }

  function rebuildTrack(preview = false) {
    if (track) {
      scene.remove(track.group);
      disposeTrack(track);
    }
    track = buildTrack(state.points, {
      preview, heightColor: state.heightColor, sleepers: state.sleepers, supports: state.supports,
    });
    scene.add(track.group);
    state.distance = Math.min(state.distance, track.length);
    rebuildProfile();
    poseCart();
    poseStation();
    updateMetrics();
  }

  function refreshPointMeshes() {
    transform.detach();
    for (const mesh of pointMeshes) {
      controlGroup.remove(mesh);
      mesh.material.dispose();
    }
    pointMeshes.length = 0;
    state.points.forEach((point, index) => {
      const material = new THREE.MeshStandardMaterial({ color: '#e95239', emissive: '#a53024', emissiveIntensity: 0.16, roughness: 0.32 });
      const mesh = new THREE.Mesh(pointGeometry, material);
      mesh.position.copy(point);
      mesh.userData.pointIndex = index;
      mesh.castShadow = true;
      controlGroup.add(mesh);
      pointMeshes.push(mesh);
    });
    selectPoint(state.selected);
  }

  function selectPoint(index) {
    state.selected = index >= 0 && index < state.points.length ? index : -1;
    pointMeshes.forEach((mesh, i) => {
      const selected = i === state.selected;
      mesh.scale.setScalar(selected ? 1.28 : 1);
      mesh.material.color.set(selected ? '#ffe1a0' : '#e95239');
      mesh.material.emissiveIntensity = selected ? 0.35 : 0.16;
    });
    if (state.selected >= 0 && state.mode === 'build' && state.view === 'free') {
      transform.attach(pointMeshes[state.selected]);
      transform.getHelper().visible = true;
      lastValidPoint = state.points[state.selected].clone();
    } else {
      transform.detach();
      transform.getHelper().visible = false;
    }
    renderPointList();
    updateCoordinateInputs();
  }

  function renderPresets() {
    ui.presets.replaceChildren();
    PRESETS.forEach((preset) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `preset-card ${state.preset === preset.id ? 'active' : ''}`;
      const preview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      preview.setAttribute('class', 'preset-preview');
      preview.setAttribute('viewBox', '0 0 72 44');
      preview.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', presetPreviews.get(preset.id));
      preview.append(path);
      const name = document.createElement('span');
      name.textContent = preset.name;
      button.append(preview, name);
      button.setAttribute('aria-pressed', String(state.preset === preset.id));
      button.addEventListener('click', () => {
        state.points = clonePoints(preset.points);
        state.preset = preset.id;
        state.name = preset.name;
        state.selected = -1;
        ui.trackName.textContent = state.name;
        stopForEdit(`已载入「${preset.name}」，可以开始发车`);
        refreshPointMeshes();
        rebuildTrack();
        renderPresets();
      });
      ui.presets.append(button);
    });
  }

  function renderPointList() {
    ui.pointList.replaceChildren();
    ui.pointCount.textContent = `${state.points.length} 个`;
    state.points.forEach((point, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `point-row ${index === state.selected ? 'active' : ''}`;
      button.setAttribute('aria-pressed', String(index === state.selected));
      button.setAttribute('aria-label', `节点 ${index + 1}，高度 ${point.y.toFixed(1)} 米`);
      const level = THREE.MathUtils.clamp(((point.y - LIMITS.minY) / (LIMITS.maxY - LIMITS.minY)) * 100, 0, 100);
      button.innerHTML = `<span class="point-index">${String(index + 1).padStart(2, '0')}</span><span class="point-level"><i style="width:${level.toFixed(1)}%"></i></span><span class="point-height">${point.y.toFixed(1)} m</span>`;
      button.addEventListener('click', () => {
        if (state.mode !== 'build' || state.view !== 'free') setMode('build');
        selectPoint(index);
      });
      ui.pointList.append(button);
    });
    const selectedRow = ui.pointList.children[state.selected];
    if (selectedRow) {
      const listBounds = ui.pointList.getBoundingClientRect();
      const rowBounds = selectedRow.getBoundingClientRect();
      if (rowBounds.top < listBounds.top) ui.pointList.scrollTop -= listBounds.top - rowBounds.top;
      else if (rowBounds.bottom > listBounds.bottom) ui.pointList.scrollTop += rowBounds.bottom - listBounds.bottom;
    }
  }

  function updateCoordinateInputs() {
    const point = state.points[state.selected];
    $('#coordinate-editor').classList.toggle('has-selection', Boolean(point));
    ui.selectedLabel.textContent = point ? String(state.selected + 1).padStart(2, '0') : '—';
    ui.coords.forEach((input, axis) => {
      input.disabled = !point;
      input.value = point ? point.getComponent(axis).toFixed(1) : '';
    });
  }

  function setView(view) {
    state.view = view;
    if (view === 'follow') followNeedsSnap = true;
    document.querySelectorAll('.view-button').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    orbit.enabled = view === 'free' && !dragInProgress;
    if (view === 'free') {
      if (state.mode === 'ride') selectPoint(-1);
    } else {
      if (state.mode === 'build') setMode('ride', false);
    }
    selectPoint(state.selected);
  }

  function setMode(mode, changeView = true) {
    state.mode = mode;
    ui.buildMode.classList.toggle('active', mode === 'build');
    ui.rideMode.classList.toggle('active', mode === 'ride');
    ui.buildMode.setAttribute('aria-pressed', String(mode === 'build'));
    ui.rideMode.setAttribute('aria-pressed', String(mode === 'ride'));
    controlGroup.visible = mode === 'build';
    if (mode === 'build') {
      if (state.running) {
        state.running = false;
        state.canResume = true;
        updateTransportButtons();
      }
      if (changeView) setView('free');
    } else {
      selectPoint(-1);
      if (changeView && state.view === 'free') setView('follow');
    }
    orbit.enabled = state.view === 'free' && !dragInProgress;
    transform.enabled = mode === 'build' && state.view === 'free';
    transform.getHelper().visible = transform.enabled && state.selected >= 0;
  }

  function addPoint() {
    if (state.mode !== 'build' || state.view !== 'free') setMode('build');
    if (state.points.length >= MAX_POINTS) return setStatus(`最多允许 ${MAX_POINTS} 个节点`);
    let index = state.selected;
    if (index < 0) {
      let longest = -1;
      for (let i = 0; i < state.points.length; i++) {
        const distance = state.points[i].distanceTo(state.points[(i + 1) % state.points.length]);
        if (distance > longest) { longest = distance; index = i; }
      }
    }
    const next = (index + 1) % state.points.length;
    const inserted = state.points[index].clone().add(state.points[next]).multiplyScalar(0.5);
    if (inserted.distanceTo(state.points[index]) < 3) return setStatus('这段轨道太短，无法插入节点');
    state.points.splice(index + 1, 0, inserted);
    state.preset = null;
    stopForEdit(`已在节点 ${index + 1} 后添加控制点`);
    state.selected = index + 1;
    refreshPointMeshes();
    rebuildTrack();
    renderPresets();
  }

  function deletePoint() {
    if (state.mode !== 'build' || state.view !== 'free') setMode('build');
    if (state.selected < 0) return setStatus('请先选中一个控制点');
    if (state.points.length <= MIN_POINTS) return setStatus(`轨道至少需要 ${MIN_POINTS} 个控制点`);
    const candidate = state.points.filter((_, index) => index !== state.selected);
    for (let i = 0; i < candidate.length; i++) {
      const error = validatePoint(candidate[i], candidate, i);
      if (error) return setStatus(`删除后轨道无效：${error}`);
    }
    state.points = candidate;
    state.selected = Math.min(state.selected, state.points.length - 1);
    state.preset = null;
    stopForEdit('已删除控制点');
    refreshPointMeshes();
    rebuildTrack();
    renderPresets();
  }

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'build' || state.view !== 'free' || transform.axis !== null) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, freeCamera);
    const hit = raycaster.intersectObjects(pointMeshes, false)[0];
    if (hit) selectPoint(hit.object.userData.pointIndex);
  });

  transform.addEventListener('dragging-changed', (event) => {
    dragInProgress = event.value;
    orbit.enabled = !event.value && state.view === 'free';
    if (!event.value && state.selected >= 0) rebuildTrack(false);
  });
  transform.addEventListener('objectChange', () => {
    if (state.selected < 0) return;
    const mesh = pointMeshes[state.selected];
    mesh.position.x = THREE.MathUtils.clamp(mesh.position.x, -LIMITS.x, LIMITS.x);
    mesh.position.y = THREE.MathUtils.clamp(mesh.position.y, LIMITS.minY, LIMITS.maxY);
    mesh.position.z = THREE.MathUtils.clamp(mesh.position.z, -LIMITS.z, LIMITS.z);
    const error = validatePoint(mesh.position, state.points, state.selected);
    if (error) {
      mesh.position.copy(lastValidPoint);
      setStatus(error);
      return;
    }
    lastValidPoint.copy(mesh.position);
    state.points[state.selected].copy(mesh.position);
    state.preset = null;
    stopForEdit('轨道已改变，重新发车将从起点开始');
    rebuildTrack(true);
    renderPointList();
    updateCoordinateInputs();
    renderPresets();
  });

  ui.coords.forEach((input, axis) => input.addEventListener('change', () => {
    if (state.selected < 0) return;
    const candidate = state.points[state.selected].clone();
    candidate.setComponent(axis, Number(input.value));
    const error = validatePoint(candidate, state.points, state.selected);
    if (error) {
      setStatus(error);
      updateCoordinateInputs();
      return;
    }
    state.points[state.selected].copy(candidate);
    pointMeshes[state.selected].position.copy(candidate);
    lastValidPoint.copy(candidate);
    state.preset = null;
    stopForEdit('节点坐标已更新，重新发车将从起点开始');
    rebuildTrack();
    renderPointList();
    updateCoordinateInputs();
    renderPresets();
  }));

  ui.launch.addEventListener('click', () => {
    if (!state.canResume) state.distance = 0;
    state.running = true;
    state.canResume = true;
    setMode('ride');
    if (state.view === 'free') setView('follow');
    setStatus('');
    updateTransportButtons();
  });
  ui.pause.addEventListener('click', () => {
    state.running = false;
    state.canResume = true;
    state.actualSpeed = 0;
    setStatus('已暂停 · 点击继续恢复运行');
    updateMetrics();
    updateTransportButtons();
  });
  ui.reset.addEventListener('click', () => {
    state.running = false;
    state.canResume = false;
    state.distance = 0;
    state.actualSpeed = 0;
    poseCart();
    updateMetrics();
    updateTransportButtons();
    setStatus('小车已返回起点');
  });
  ui.buildMode.addEventListener('click', () => setMode('build'));
  ui.rideMode.addEventListener('click', () => setMode('ride'));
  document.querySelectorAll('.view-button').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  $('#add-point').addEventListener('click', addPoint);
  $('#delete-point').addEventListener('click', deletePoint);

  ui.speed.addEventListener('input', () => {
    state.speed = Number(ui.speed.value);
    ui.speedValue.textContent = `${state.speed} m/s`;
  });
  ui.gravity.addEventListener('change', () => { state.gravity = ui.gravity.checked; });
  ui.heightColor.addEventListener('change', () => { state.heightColor = ui.heightColor.checked; rebuildTrack(); });
  ui.sleepers.addEventListener('change', () => { state.sleepers = ui.sleepers.checked; track.sleeper.visible = state.sleepers; });
  ui.supports.addEventListener('change', () => { state.supports = ui.supports.checked; track.support.visible = state.supports; });
  ui.scenery.addEventListener('change', () => { state.scenery = ui.scenery.checked; scenery.visible = state.scenery; station.visible = state.scenery; });
  ui.grid.addEventListener('change', () => { state.grid = ui.grid.checked; grid.visible = state.grid; });

  $('#export-button').addEventListener('click', () => {
    const payload = {
      format: 'roller-coaster-workshop', version: 1, name: state.name,
      points: state.points.map((point) => point.toArray().map((value) => Number(value.toFixed(3)))),
      settings: {
        speed: state.speed, gravity: state.gravity, heightColor: state.heightColor,
        sleepers: state.sleepers, supports: state.supports, scenery: state.scenery, grid: state.grid,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `roller-coaster-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setStatus('作品已导出为 JSON 文件');
  });
  $('#import-button').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('文件超过 1 MB');
      const project = parseProject(JSON.parse(await file.text()));
      state.points = project.points;
      state.name = project.name;
      state.preset = null;
      state.selected = -1;
      Object.assign(state, project.settings);
      ui.trackName.textContent = state.name;
      ui.speed.value = String(state.speed);
      ui.speedValue.textContent = `${state.speed} m/s`;
      ui.gravity.checked = state.gravity;
      ui.heightColor.checked = state.heightColor;
      ui.sleepers.checked = state.sleepers;
      ui.supports.checked = state.supports;
      ui.scenery.checked = state.scenery;
      ui.grid.checked = state.grid;
      scenery.visible = state.scenery;
      station.visible = state.scenery;
      grid.visible = state.grid;
      setMode('build');
      stopForEdit(`已载入「${state.name}」`);
      refreshPointMeshes();
      rebuildTrack();
      renderPresets();
    } catch (error) {
      setStatus(`导入失败：${error.message}`);
    } finally {
      event.target.value = '';
    }
  });

  const resize = () => {
    const width = Math.max(1, ui.host.clientWidth);
    const height = Math.max(1, ui.host.clientHeight);
    renderer.setSize(width, height, false);
    for (const camera of [freeCamera, followCamera, firstCamera]) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  };
  new ResizeObserver(resize).observe(ui.host);
  resize();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (state.running && track) {
      const height = track.curve.getPointAt(state.distance / track.length).y;
      const startHeight = track.curve.getPointAt(0).y;
      state.actualSpeed = state.gravity
        ? THREE.MathUtils.clamp(state.speed + 0.85 * (startHeight - height), 4, 45)
        : state.speed;
      state.distance = (state.distance + state.actualSpeed * dt) % track.length;
      poseCart();
      updateMetrics();
    }
    if (state.view === 'free') orbit.update();
    if (state.view === 'follow') {
      const desired = cart.localToWorld(new THREE.Vector3(0, 5.5, 11));
      const target = cart.localToWorld(new THREE.Vector3(0, 0.8, -4));
      if (followNeedsSnap) {
        followCamera.position.copy(desired);
        followNeedsSnap = false;
      } else {
        followCamera.position.lerp(desired, Math.min(1, dt * 7));
      }
      followCamera.lookAt(target);
    }
    const camera = state.view === 'first' ? firstCamera : state.view === 'follow' ? followCamera : freeCamera;
    renderer.render(scene, camera);
    fpsElapsed += dt;
    fpsFrames++;
    if (fpsElapsed >= 0.8) {
      ui.fps.textContent = `${Math.round(fpsFrames / fpsElapsed)} FPS`;
      fpsFrames = 0;
      fpsElapsed = 0;
    }
  }

  renderPresets();
  refreshPointMeshes();
  rebuildTrack();
  updateTransportButtons();
  animate();
}

function createCart() {
  const group = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#3c7cba', metalness: 0.22, roughness: 0.34 });
  const blueLight = new THREE.MeshStandardMaterial({ color: '#75b8df', metalness: 0.08, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#23445e', metalness: 0.16, roughness: 0.46 });
  const cream = new THREE.MeshStandardMaterial({ color: '#fff2d0', roughness: 0.6 });
  const addBox = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  addBox(2.1, 0.38, 3.05, 0, 0.35, 0, blue);
  addBox(2.04, 0.9, 0.2, 0, 0.9, 1.43, blue);
  addBox(0.2, 0.65, 2.4, -0.93, 0.8, 0, blueLight);
  addBox(0.2, 0.65, 2.4, 0.93, 0.8, 0, blueLight);
  addBox(1.75, 0.25, 0.92, 0, 0.7, 0.35, dark);
  addBox(1.72, 0.55, 0.18, 0, 1.07, 0.78, dark);
  addBox(1.8, 0.22, 0.12, 0, 1.16, -0.38, cream);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.58, 0.5), blueLight);
  nose.position.set(0, 0.55, -1.45);
  nose.rotation.x = -0.17;
  nose.castShadow = true;
  group.add(nose);
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.95, 1.02]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.15, 14), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.07, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }
  return group;
}

function createScenery() {
  const group = new THREE.Group();
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#9d8063', roughness: 0.95 });
  const leaves = ['#599f72', '#70b780', '#498b68', '#83c391'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.3, 2.1, 6);
  const crownGeometry = new THREE.ConeGeometry(1.65, 4.2, 7);
  let seed = 27103;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 70; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 44 + random() * 58;
    const tree = new THREE.Group();
    tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    const scale = 0.7 + random() * 0.85;
    tree.scale.setScalar(scale);
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1.05;
    trunk.castShadow = true;
    tree.add(trunk);
    const crown = new THREE.Mesh(crownGeometry, leaves[i % leaves.length]);
    crown.position.y = 4.0;
    crown.castShadow = true;
    tree.add(crown);
    group.add(tree);
  }
  const boothColors = ['#f6d9aa', '#f3b8aa', '#d6e6dd'];
  [[-53, -42], [56, 36], [38, -53], [-44, 48]].forEach(([x, z], i) => {
    const house = new THREE.Group();
    house.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 5, 6), new THREE.MeshStandardMaterial({ color: boothColors[i % 3] }));
    body.position.y = 2.5;
    body.castShadow = true;
    house.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 3.2, 4), new THREE.MeshStandardMaterial({ color: i % 2 ? '#d96d61' : '#e5a45b' }));
    roof.position.y = 6.55;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.7, 0.06), new THREE.MeshStandardMaterial({ color: '#6f8794' }));
    door.position.set(0, 1.36, 3.04);
    house.add(door);
    group.add(house);
  });
  return group;
}

function createStation() {
  const group = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 8), new THREE.MeshStandardMaterial({ color: '#ece3cf', roughness: 0.92 }));
  platform.position.set(0, 0.2, 0);
  platform.receiveShadow = true;
  group.add(platform);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(12.7, 0.34, 9), new THREE.MeshStandardMaterial({ color: '#e69c79', roughness: 0.8 }));
  roof.position.y = 12;
  roof.castShadow = true;
  group.add(roof);
  const postMaterial = new THREE.MeshStandardMaterial({ color: '#f6f2e7', roughness: 0.8 });
  for (const x of [-5.3, 5.3]) for (const z of [-3.5, 3.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 11.8, 8), postMaterial);
    post.position.set(x, 6, z);
    post.castShadow = true;
    group.add(post);
  }
  return group;
}
