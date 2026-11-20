import * as THREE from 'three';
import type { ThreeFinishPresetId, ThreeScenePresetId } from './aiStudioLogic';
import { THREE_FINISH_PRESETS } from './aiStudioLogic';

export interface StudioThreeMaterials {
  primaryBody: THREE.MeshPhysicalMaterial;
  accentMetal: THREE.MeshPhysicalMaterial;
  matteGrip: THREE.MeshStandardMaterial;
  opticalGlass: THREE.MeshPhysicalMaterial;
  emissiveLed: THREE.MeshStandardMaterial;
  vinylDisc: THREE.MeshStandardMaterial;
  solarPanel: THREE.MeshStandardMaterial;
  bumpTexture: THREE.CanvasTexture;
  vinylTexture: THREE.CanvasTexture;
  solarTexture: THREE.CanvasTexture;
  floorTexture: THREE.CanvasTexture;
  shadowTexture: THREE.CanvasTexture;
}

function createBrushedBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 2) {
      const shade = 112 + Math.floor(Math.sin(y * 0.7) * 18 + (y % 5) * 6);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(0, y, 256, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function createVinylGrooveTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0d111a';
    ctx.fillRect(0, 0, 512, 512);
    for (let r = 64; r < 248; r += 3) {
      ctx.beginPath();
      ctx.arc(256, 256, r, 0, Math.PI * 2);
      ctx.strokeStyle = r % 18 === 0 ? 'rgba(245,197,66,0.28)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(256, 256, 62, 0, Math.PI * 2);
    ctx.fillStyle = '#D4AF37';
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSolarCellTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0c2348';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(130, 195, 255, 0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createStudioFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(512, 512, 30, 512, 512, 512);
    grad.addColorStop(0, '#132a4f');
    grad.addColorStop(0.55, '#0b1c36');
    grad.addColorStop(1, '#071426');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Subtle concentric studio markings
    for (let r = 120; r <= 440; r += 80) {
      ctx.beginPath();
      ctx.arc(512, 512, r, 0, Math.PI * 2);
      ctx.strokeStyle = r === 200 ? 'rgba(212, 175, 55, 0.35)' : 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = r === 200 ? 2.5 : 1.5;
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 1024; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 1024);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(1024, i);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
    grad.addColorStop(0, 'rgba(2, 6, 16, 0.85)');
    grad.addColorStop(0.5, 'rgba(2, 6, 16, 0.38)');
    grad.addColorStop(1, 'rgba(2, 6, 16, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStudioThreeMaterials(
  maxAnisotropy: number,
  isSoftwareGl: boolean,
): StudioThreeMaterials {
  const bumpTexture = createBrushedBumpTexture();
  const vinylTexture = createVinylGrooveTexture(maxAnisotropy);
  const solarTexture = createSolarCellTexture(maxAnisotropy);
  const floorTexture = createStudioFloorTexture(maxAnisotropy);
  const shadowTexture = createContactShadowTexture();

  const initialFinish = THREE_FINISH_PRESETS[0];

  const primaryBody = new THREE.MeshPhysicalMaterial({
    color: initialFinish.primaryHex,
    metalness: initialFinish.metalness,
    roughness: initialFinish.roughness,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
    bumpMap: bumpTexture,
    bumpScale: 0.008,
  });

  const accentMetal = new THREE.MeshPhysicalMaterial({
    color: initialFinish.accentHex,
    metalness: 0.94,
    roughness: 0.16,
    anisotropy: isSoftwareGl ? 0 : 0.75,
    bumpMap: bumpTexture,
    bumpScale: 0.004,
  });

  const matteGrip = new THREE.MeshStandardMaterial({
    color: 0x1e2430,
    metalness: 0.1,
    roughness: 0.78,
    bumpMap: bumpTexture,
    bumpScale: 0.015,
  });

  const opticalGlass = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    metalness: 0.05,
    roughness: 0.06,
    clearcoat: 1.0,
    ior: 1.75,
    transmission: isSoftwareGl ? 0 : 0.85,
    thickness: 0.6,
    transparent: true,
    opacity: isSoftwareGl ? 0.55 : 0.95,
  });

  const emissiveLed = new THREE.MeshStandardMaterial({
    color: 0xf5c542,
    emissive: 0xf5c542,
    emissiveIntensity: 1.35,
    roughness: 0.25,
    metalness: 0.1,
  });

  const vinylDisc = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: vinylTexture,
    metalness: 0.25,
    roughness: 0.32,
  });

  const solarPanel = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: solarTexture,
    metalness: 0.6,
    roughness: 0.22,
  });

  return {
    primaryBody,
    accentMetal,
    matteGrip,
    opticalGlass,
    emissiveLed,
    vinylDisc,
    solarPanel,
    bumpTexture,
    vinylTexture,
    solarTexture,
    floorTexture,
    shadowTexture,
  };
}

export function applyFinishToStudioMaterials(
  mats: StudioThreeMaterials,
  finishId: ThreeFinishPresetId,
): void {
  const spec = THREE_FINISH_PRESETS.find((f) => f.id === finishId) || THREE_FINISH_PRESETS[0];
  mats.primaryBody.color.setHex(spec.primaryHex);
  mats.primaryBody.metalness = spec.metalness;
  mats.primaryBody.roughness = spec.roughness;
  mats.accentMetal.color.setHex(spec.accentHex);
}

function registerPart(
  parent: THREE.Group,
  mesh: THREE.Object3D,
  explodeVec: [number, number, number],
) {
  mesh.userData.basePos = mesh.position.clone();
  mesh.userData.explodeVec = new THREE.Vector3(...explodeVec);
  mesh.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  parent.add(mesh);
}

/**
 * 1) Composite 8-Part Prime X Cinema Gimbal Rig (grounded bottom-center at y = 0)
 */
export function buildGimbalRigModel(mats: StudioThreeMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gimbal_rig';

  // Part 1: Pedestal Plinth (grounded at y = 0)
  const baseGeo = new THREE.CylinderGeometry(0.95, 1.15, 0.18, 40);
  const baseMesh = new THREE.Mesh(baseGeo, mats.matteGrip);
  baseMesh.position.set(0, 0.09, 0);
  registerPart(group, baseMesh, [0, -0.15, 0]);

  // Part 2: Azimuth Gold Ring
  const ringGeo = new THREE.TorusGeometry(0.72, 0.06, 18, 48);
  ringGeo.rotateX(Math.PI / 2);
  const ringMesh = new THREE.Mesh(ringGeo, mats.accentMetal);
  ringMesh.position.set(0, 0.23, 0);
  registerPart(group, ringMesh, [0, -0.05, 0]);

  // Part 3: Center Gimbal Column & Yoke
  const yokeGroup = new THREE.Group();
  yokeGroup.position.set(0, 0.25, 0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.72, 24), mats.primaryBody);
  stem.position.set(0, 0.36, 0);
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.14, 0.22), mats.primaryBody);
  crossbar.position.set(0, 0.72, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 0.22), mats.primaryBody);
  armL.position.set(-0.78, 1.12, 0);
  const armR = armL.clone();
  armR.position.set(0.78, 1.12, 0);
  yokeGroup.add(stem, crossbar, armL, armR);
  registerPart(group, yokeGroup, [0, -0.25, -0.35]);

  // Part 4: Beveled Cinema Camera Body (ExtrudeGeometry)
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-0.52, -0.34);
  bodyShape.lineTo(0.52, -0.34);
  bodyShape.lineTo(0.52, 0.34);
  bodyShape.lineTo(-0.52, 0.34);
  bodyShape.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 0.92,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 3,
  });
  bodyGeo.center();
  const cameraBody = new THREE.Mesh(bodyGeo, mats.primaryBody);
  cameraBody.position.set(0, 1.65, -0.1);
  registerPart(group, cameraBody, [0, 0.35, -0.45]);

  // Part 5: Sculpted Multi-Stage Lens Barrel (LatheGeometry)
  const lathePts = [
    new THREE.Vector2(0.24, 0),
    new THREE.Vector2(0.32, 0.04),
    new THREE.Vector2(0.32, 0.32),
    new THREE.Vector2(0.36, 0.36),
    new THREE.Vector2(0.36, 0.68),
    new THREE.Vector2(0.41, 0.76),
    new THREE.Vector2(0.37, 0.84),
    new THREE.Vector2(0.28, 0.84),
  ];
  const lensGeo = new THREE.LatheGeometry(lathePts, 40);
  lensGeo.rotateX(Math.PI / 2);
  const lensBarrel = new THREE.Mesh(lensGeo, mats.matteGrip);
  lensBarrel.position.set(0, 1.65, 0.36);
  registerPart(group, lensBarrel, [0, 0.25, 0.85]);

  // Part 6: Anisotropic Gold Focus Ring
  const focusRingGeo = new THREE.CylinderGeometry(0.375, 0.375, 0.14, 40, 1, true);
  focusRingGeo.rotateX(Math.PI / 2);
  const focusRing = new THREE.Mesh(focusRingGeo, mats.accentMetal);
  focusRing.position.set(0, 1.65, 0.86);
  registerPart(group, focusRing, [0, 0.35, 1.25]);

  // Part 7: Sapphire Optical Front Element
  const glassGeo = new THREE.SphereGeometry(0.31, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42);
  glassGeo.rotateX(Math.PI / 2);
  const glassLens = new THREE.Mesh(glassGeo, mats.opticalGlass);
  glassLens.position.set(0, 1.65, 1.04);
  registerPart(group, glassLens, [0, 0.38, 1.55]);

  // Part 8: Twin Ergonomic Top Handle & Status Beacon (TubeGeometry)
  const handleGroup = new THREE.Group();
  handleGroup.position.set(0, 2.08, -0.05);
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -0.45),
    new THREE.Vector3(0, 0.28, -0.32),
    new THREE.Vector3(0, 0.32, 0.25),
    new THREE.Vector3(0, 0.02, 0.35),
  ]);
  const handleMesh = new THREE.Mesh(
    new THREE.TubeGeometry(handleCurve, 28, 0.055, 12, false),
    mats.accentMetal,
  );
  const recLamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.08), mats.emissiveLed);
  recLamp.position.set(0, 0.34, 0.3);
  handleGroup.add(handleMesh, recLamp);
  registerPart(group, handleGroup, [0, 0.95, 0]);

  return group;
}

/**
 * 2) Composite 7-Part Aero Audio Synth Turntable (grounded bottom-center at y = 0)
 */
export function buildSynthTurntableModel(mats: StudioThreeMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'synth_turntable';

  // Part 1: Isolation Feet (4 corners at y = 0)
  const feetGroup = new THREE.Group();
  const footGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.1, 20);
  [
    [-1.15, 0.05, -0.85],
    [1.15, 0.05, -0.85],
    [-1.15, 0.05, 0.85],
    [1.15, 0.05, 0.85],
  ].forEach(([x, y, z]) => {
    const f = new THREE.Mesh(footGeo, mats.accentMetal);
    f.position.set(x, y, z);
    feetGroup.add(f);
  });
  registerPart(group, feetGroup, [0, -0.25, 0]);

  // Part 2: Beveled Acoustic Plinth
  const plinthShape = new THREE.Shape();
  plinthShape.moveTo(-1.35, -1.0);
  plinthShape.lineTo(1.35, -1.0);
  plinthShape.lineTo(1.35, 1.0);
  plinthShape.lineTo(-1.35, 1.0);
  plinthShape.closePath();
  const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  plinthGeo.rotateX(Math.PI / 2);
  plinthGeo.center();
  const plinth = new THREE.Mesh(plinthGeo, mats.primaryBody);
  plinth.position.set(0, 0.26, 0);
  registerPart(group, plinth, [0, 0, 0]);

  // Part 3: Machined Gold Platter
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.86, 0.1, 48), mats.accentMetal);
  platter.position.set(-0.28, 0.45, 0);
  registerPart(group, platter, [0, 0.45, 0]);

  // Part 4: Grooved Vinyl Disc
  const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.03, 48), mats.vinylDisc);
  vinyl.position.set(-0.28, 0.52, 0);
  registerPart(group, vinyl, [0, 0.85, 0]);

  // Part 5: Spindle & Strobe Beacon
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.16, 16), mats.accentMetal);
  spindle.position.set(-0.28, 0.58, 0);
  registerPart(group, spindle, [0, 1.15, 0]);

  // Part 6: Articulated Tube Tonearm Assembly
  const armGroup = new THREE.Group();
  armGroup.position.set(0.95, 0.52, -0.58);
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.22, 24), mats.matteGrip);
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.14, -0.18),
    new THREE.Vector3(0, 0.14, 0.1),
    new THREE.Vector3(-0.18, 0.13, 0.65),
    new THREE.Vector3(-0.42, 0.08, 1.04),
  ]);
  const armTube = new THREE.Mesh(
    new THREE.TubeGeometry(armCurve, 28, 0.032, 12, false),
    mats.accentMetal,
  );
  const headShell = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.18), mats.matteGrip);
  headShell.position.set(-0.45, 0.06, 1.1);
  armGroup.add(turret, armTube, headShell);
  registerPart(group, armGroup, [0.55, 0.6, -0.25]);

  // Part 7: Rotary Tempo Knobs & Level Meter Bar
  const consoleGroup = new THREE.Group();
  consoleGroup.position.set(0.98, 0.45, 0.58);
  const knobGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.09, 24);
  const k1 = new THREE.Mesh(knobGeo, mats.accentMetal);
  k1.position.set(0, 0.04, -0.22);
  const k2 = new THREE.Mesh(knobGeo, mats.accentMetal);
  k2.position.set(0, 0.04, 0.08);
  const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.45), mats.emissiveLed);
  ledStrip.position.set(-0.2, 0.02, -0.05);
  consoleGroup.add(k1, k2, ledStrip);
  registerPart(group, consoleGroup, [0.55, 0.45, 0.45]);

  return group;
}

/**
 * 3) Composite 9-Part Orbital Telemetry Craft on Studio Pylon (grounded at y = 0)
 */
export function buildOrbitalSatModel(mats: StudioThreeMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'orbital_sat';

  // Part 1: Display Stand Foot (grounded at y = 0)
  const standBase = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 0.14, 32), mats.matteGrip);
  standBase.position.set(0, 0.07, 0);
  registerPart(group, standBase, [0, -0.2, 0]);

  // Part 2: Pylon Support Strut
  const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 1.0, 20), mats.accentMetal);
  pylon.position.set(0, 0.62, 0);
  registerPart(group, pylon, [0, -0.1, 0]);

  // Part 3: Octagonal Spacecraft Bus Core
  const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.05, 8), mats.primaryBody);
  bus.position.set(0, 1.65, 0);
  registerPart(group, bus, [0, 0.15, 0]);

  // Part 4: Gold Thermal Collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.055, 14, 32), mats.accentMetal);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 1.95, 0);
  registerPart(group, collar, [0, 0.55, 0]);

  // Part 5: Parabolic High-Gain Dish (LatheGeometry)
  const dishPts = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(0.22, 0.04),
    new THREE.Vector2(0.45, 0.16),
    new THREE.Vector2(0.65, 0.34),
  ];
  const dishGeo = new THREE.LatheGeometry(dishPts, 36);
  const dish = new THREE.Mesh(dishGeo, mats.accentMetal);
  dish.position.set(0, 2.22, 0);
  registerPart(group, dish, [0, 0.95, 0]);

  // Part 6: Feed Horn & Sapphire Sensor Tip
  const feedGroup = new THREE.Group();
  feedGroup.position.set(0, 2.52, 0);
  const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.42, 16), mats.matteGrip);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 20), mats.opticalGlass);
  tip.position.set(0, 0.24, 0);
  feedGroup.add(spike, tip);
  registerPart(group, feedGroup, [0, 1.45, 0]);

  // Part 7: Left Multi-Panel Solar Wing
  const wingL = new THREE.Group();
  wingL.position.set(-1.35, 1.65, 0);
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.04, 0.72), mats.matteGrip);
  const cellL = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.05, 0.64), mats.solarPanel);
  wingL.add(frameL, cellL);
  registerPart(group, wingL, [-1.15, 0.15, 0]);

  // Part 8: Right Multi-Panel Solar Wing
  const wingR = new THREE.Group();
  wingR.position.set(1.35, 1.65, 0);
  const frameR = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.04, 0.72), mats.matteGrip);
  const cellR = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.05, 0.64), mats.solarPanel);
  wingR.add(frameR, cellR);
  registerPart(group, wingR, [1.15, 0.15, 0]);

  // Part 9: Front Attitude Thruster & Beacon
  const frontModule = new THREE.Group();
  frontModule.position.set(0, 1.55, 0.56);
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.22, 16), mats.matteGrip);
  housing.rotation.x = Math.PI / 2;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), mats.emissiveLed);
  beacon.position.set(0, 0, 0.12);
  frontModule.add(housing, beacon);
  registerPart(group, frontModule, [0, 0.1, 0.9]);

  return group;
}

export function buildScenePresetGroup(
  presetId: ThreeScenePresetId,
  mats: StudioThreeMaterials,
): THREE.Group {
  switch (presetId) {
    case 'synth_turntable':
      return buildSynthTurntableModel(mats);
    case 'orbital_sat':
      return buildOrbitalSatModel(mats);
    case 'gimbal_rig':
    default:
      return buildGimbalRigModel(mats);
  }
}

export function disposeGroupGeometries(group: THREE.Object3D): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      mesh.geometry.dispose();
    }
  });
}

export function disposeStudioMaterials(mats: StudioThreeMaterials): void {
  mats.primaryBody.dispose();
  mats.accentMetal.dispose();
  mats.matteGrip.dispose();
  mats.opticalGlass.dispose();
  mats.emissiveLed.dispose();
  mats.vinylDisc.dispose();
  mats.solarPanel.dispose();
  mats.bumpTexture.dispose();
  mats.vinylTexture.dispose();
  mats.solarTexture.dispose();
  mats.floorTexture.dispose();
  mats.shadowTexture.dispose();
}
