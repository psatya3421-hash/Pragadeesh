import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Camera, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';
import {
  THREE_FINISH_PRESETS,
  THREE_SCENE_PRESETS,
  getThreeCameraPose,
} from '../../lib/aiStudioLogic';
import type {
  ThreeCameraViewId,
  ThreeFinishPresetId,
  ThreeScenePresetId,
} from '../../lib/aiStudioLogic';
import {
  applyFinishToStudioMaterials,
  buildScenePresetGroup,
  createStudioThreeMaterials,
  disposeGroupGeometries,
  disposeStudioMaterials,
} from '../../lib/threeModels';

interface ThreeSceneStudioProps {
  onCaptureFrameToTimeline: (dataUrl: string, title: string) => void;
}

const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _scratchVec = new THREE.Vector3();

function detectSoftwareWebGl(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const ThreeSceneStudio: React.FC<ThreeSceneStudioProps> = ({
  onCaptureFrameToTimeline,
}) => {
  const [scenePreset, setScenePreset] = useState<ThreeScenePresetId>('gimbal_rig');
  const [finishPreset, setFinishPreset] = useState<ThreeFinishPresetId>('prime_gold');
  const [cameraView, setCameraView] = useState<ThreeCameraViewId>('hero');
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [autoSpin, setAutoSpin] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneStateRef = useRef({
    scenePreset: 'gimbal_rig' as ThreeScenePresetId,
    finishPreset: 'prime_gold' as ThreeFinishPresetId,
    explodeTarget: 0,
    explodeCurrent: 0,
    autoSpin: true,
    camTransitionActive: false,
    camGoalPos: new THREE.Vector3(3.8, 2.55, 4.4),
    camGoalTarget: new THREE.Vector3(0, 1.25, 0),
  });

  const apiRef = useRef<{
    setModel: (preset: ThreeScenePresetId) => void;
    setFinish: (finish: ThreeFinishPresetId) => void;
    setCameraPreset: (view: ThreeCameraViewId) => void;
    requestDraw: () => void;
    captureDataUrl: () => string | null;
  } | null>(null);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const isSoftwareGl = detectSoftwareWebGl();
    const width = Math.max(320, mount.clientWidth || 960);
    const height = Math.max(360, mount.clientHeight || 560);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'w-full h-full block outline-none';
    renderer.domElement.setAttribute('data-testid', 'three-scene-canvas');

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071426);
    scene.fog = new THREE.FogExp2(0x071426, 0.038);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(3.8, 2.55, 4.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 2.0;
    controls.maxDistance = 11.5;
    controls.target.set(0, 1.25, 0);
    controls.update();

    controls.addEventListener('start', () => {
      sceneStateRef.current.camTransitionActive = false;
    });

    // Balanced warm/cool studio lighting rig
    const hemiLight = new THREE.HemisphereLight(0x88bcff, 0x0a172b, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.35);
    keyLight.position.set(4.5, 6.5, 4.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -4.5;
    keyLight.shadow.camera.right = 4.5;
    keyLight.shadow.camera.top = 4.5;
    keyLight.shadow.camera.bottom = -4.5;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 18;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7cc4ff, 1.15);
    rimLight.position.set(-4.5, 3.8, -4.5);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight(0xffe8b8, 3.5, 3.5, 1.8);
      softbox.position.set(2.8, 4.0, -2.5);
      softbox.lookAt(0, 1.2, 0);
      scene.add(softbox);
    }

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const mats = createStudioThreeMaterials(maxAnisotropy, isSoftwareGl);

    // Studio floor disc + contact shadow disc (disjoint Y >= 0.015 to avoid z-fighting)
    const floorGeo = new THREE.CircleGeometry(14, 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: mats.floorTexture,
      roughness: 0.72,
      metalness: 0.18,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const shadowGeo = new THREE.PlaneGeometry(3.6, 3.6);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: mats.shadowTexture,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.position.y = 0.015;
    scene.add(contactShadow);

    let activeModel = buildScenePresetGroup(sceneStateRef.current.scenePreset, mats);
    scene.add(activeModel);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function applyExplodeDamping(dt: number) {
      const st = sceneStateRef.current;
      st.explodeCurrent = THREE.MathUtils.damp(st.explodeCurrent, st.explodeTarget, 8, dt);
      activeModel.children.forEach((child) => {
        const basePos = child.userData.basePos as THREE.Vector3 | undefined;
        const explodeVec = child.userData.explodeVec as THREE.Vector3 | undefined;
        if (basePos && explodeVec) {
          _scratchVec.copy(explodeVec).multiplyScalar(st.explodeCurrent);
          child.position.copy(basePos).add(_scratchVec);
        }
      });
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      let polls = 0;
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        polls += 1;
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED && polls < 6) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function stepScene(dt: number) {
      const st = sceneStateRef.current;
      if (st.autoSpin) {
        activeModel.rotation.y += dt * 0.45;
      }
      if (st.camTransitionActive) {
        const alpha = 1 - Math.exp(-7 * dt);
        _targetPos.copy(st.camGoalPos);
        _targetLook.copy(st.camGoalTarget);
        camera.position.lerp(_targetPos, alpha);
        controls.target.lerp(_targetLook, alpha);
        if (
          camera.position.distanceTo(_targetPos) < 0.02 &&
          controls.target.distanceTo(_targetLook) < 0.02
        ) {
          st.camTransitionActive = false;
        }
      }
      applyExplodeDamping(dt);
      controls.update();
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        stepScene(dt);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (disposed) return;
          const st = sceneStateRef.current;
          const stillAnimating =
            st.autoSpin ||
            st.camTransitionActive ||
            Math.abs(st.explodeCurrent - st.explodeTarget) > 0.005;
          if (renderDirty || stillAnimating) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    }

    controls.addEventListener('change', () => {
      requestRender();
    });

    const handleResize = () => {
      if (!mount || disposed) return;
      const w = Math.max(320, mount.clientWidth || 960);
      const h = Math.max(360, mount.clientHeight || 560);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    apiRef.current = {
      setModel: (preset) => {
        sceneStateRef.current.scenePreset = preset;
        const prevRotY = activeModel.rotation.y;
        scene.remove(activeModel);
        disposeGroupGeometries(activeModel);
        activeModel = buildScenePresetGroup(preset, mats);
        activeModel.rotation.y = prevRotY;
        scene.add(activeModel);
        applyExplodeDamping(0.05);
        renderer.render(scene, camera);
        requestRender();
      },
      setFinish: (finish) => {
        sceneStateRef.current.finishPreset = finish;
        applyFinishToStudioMaterials(mats, finish);
        requestRender();
      },
      setCameraPreset: (view) => {
        const pose = getThreeCameraPose(view);
        sceneStateRef.current.camGoalPos.set(...pose.position);
        sceneStateRef.current.camGoalTarget.set(...pose.target);
        sceneStateRef.current.camTransitionActive = true;
        requestRender();
      },
      requestDraw: requestRender,
      captureDataUrl: () => {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      },
    };

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      disposeGroupGeometries(activeModel);
      floorGeo.dispose();
      floorMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      disposeStudioMaterials(mats);
      envTarget.dispose();
      renderer.dispose();
      apiRef.current = null;
    };
  }, []);

  const handleModelChange = (preset: ThreeScenePresetId) => {
    setScenePreset(preset);
    apiRef.current?.setModel(preset);
  };

  const handleFinishChange = (finish: ThreeFinishPresetId) => {
    setFinishPreset(finish);
    apiRef.current?.setFinish(finish);
  };

  const handleCameraChange = (view: ThreeCameraViewId) => {
    setCameraView(view);
    apiRef.current?.setCameraPreset(view);
  };

  const handleExplodeChange = (val: number) => {
    setExplodeAmount(val);
    sceneStateRef.current.explodeTarget = val;
    apiRef.current?.requestDraw();
  };

  const handleToggleSpin = () => {
    setAutoSpin((prev) => {
      const next = !prev;
      sceneStateRef.current.autoSpin = next;
      apiRef.current?.requestDraw();
      return next;
    });
  };

  const handleCaptureFrame = () => {
    const dataUrl = apiRef.current?.captureDataUrl();
    if (!dataUrl) return;
    const presetMeta = THREE_SCENE_PRESETS.find((p) => p.id === scenePreset);
    onCaptureFrameToTimeline(dataUrl, `${presetMeta?.name || '3D Render'} (${cameraView})`);
  };

  const activeSpec = THREE_SCENE_PRESETS.find((p) => p.id === scenePreset) || THREE_SCENE_PRESETS[0];

  return (
    <div
      data-testid="three-scene-studio"
      className="relative w-full h-[640px] rounded-2xl overflow-hidden border border-[#D4AF37]/35 bg-[#071426] shadow-2xl"
    >
      {/* Dedicated WebGL Mount Container */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {/* Minimal Top-Left Spec Readout (solid rgba, no backdrop-filter over WebGL) */}
      <div className="absolute top-4 left-4 pointer-events-none bg-[#071426]/90 border border-[#D4AF37]/35 rounded-xl px-3.5 py-2.5">
        <div className="text-[11px] font-mono uppercase tracking-wider text-[#F5C542]">
          Three.js PBR Stage · {activeSpec.partCount}-Part Assembly
        </div>
        <div className="text-sm font-display font-bold text-white">{activeSpec.name}</div>
        <div className="text-[11px] text-slate-300">{activeSpec.subtitle}</div>
      </div>

      {/* Top-Right Capture CTA */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleCaptureFrame}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F5C542] hover:bg-[#eab62a] text-[#0B1F3A] text-xs font-bold shadow-lg transition-colors"
        >
          <Camera className="w-4 h-4" />
          <span>Capture Frame to Timeline</span>
        </button>
      </div>

      {/* Unified Collapsible Bottom Control Dock */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(900px,94%)] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((c) => !c)}
          className="mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#071426]/95 border border-[#D4AF37]/40 text-[#F5C542] text-[11px] font-semibold hover:bg-[#0B1F3A]"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="w-full rounded-2xl bg-[#071426]/95 border border-white/15 px-4 py-3 shadow-2xl grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Model Presets */}
            <div className="md:col-span-4 space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                3D Subject
              </div>
              <div className="flex flex-wrap gap-1.5">
                {THREE_SCENE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleModelChange(p.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                      scenePreset === p.id
                        ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                        : 'bg-[#0B1F3A] text-slate-200 border-white/10 hover:border-[#F5C542]/40'
                    }`}
                  >
                    {p.name.replace('Prime X ', '').replace('Telemetry ', '')}
                  </button>
                ))}
              </div>
            </div>

            {/* Finish Swatches & Camera Views */}
            <div className="md:col-span-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Finish
                </span>
                <div className="flex items-center gap-1.5">
                  {THREE_FINISH_PRESETS.map((fin) => (
                    <button
                      key={fin.id}
                      type="button"
                      aria-label={`Select ${fin.label} finish`}
                      title={fin.label}
                      onClick={() => handleFinishChange(fin.id)}
                      className={`w-5 h-5 rounded-full border-2 ${fin.swatchClass} ${
                        finishPreset === fin.id
                          ? 'border-white scale-110'
                          : 'border-white/25 opacity-80 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {(['hero', 'front', 'top', 'detail'] as ThreeCameraViewId[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleCameraChange(v)}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-semibold capitalize border ${
                      cameraView === v
                        ? 'bg-[#D4AF37]/25 border-[#F5C542] text-[#F5C542]'
                        : 'bg-[#0B1F3A] border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Exploded View & Spin */}
            <div className="md:col-span-4 flex items-center gap-3">
              <label className="flex-1 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300">Exploded View</span>
                  <span className="font-mono text-[#F5C542]">
                    {Math.round(explodeAmount * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Exploded view slider"
                  min={0}
                  max={1}
                  step={0.05}
                  value={explodeAmount}
                  onChange={(e) => handleExplodeChange(Number(e.target.value))}
                  className="w-full accent-[#F5C542]"
                />
              </label>

              <button
                type="button"
                onClick={handleToggleSpin}
                aria-label="Toggle turntable auto-spin"
                className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-semibold border shrink-0 ${
                  autoSpin
                    ? 'bg-[#D4AF37]/20 border-[#F5C542] text-[#F5C542]'
                    : 'bg-[#0B1F3A] border-white/15 text-slate-300'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{autoSpin ? 'Spin On' : 'Paused'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
