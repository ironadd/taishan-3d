import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import {
  SCENIC_SPOTS,
  PILGRIMAGE_TOUR_KEYFRAMES,
  worldYToAltitude,
} from './world/blueprint.js';
import { createTaishanTerrain, getWalkableSurfaceHeight } from './world/terrain.js';
import {
  createGraniteTextures,
  createAshlarStoneTextures,
  createCrimsonWallTexture,
  createRoofTileTextures,
  createCaihuaBeamTexture,
  createLatticeWindowTextures,
  createPineNeedleTextures,
} from './world/textures.js';
import { createTaishanRocksAndMonoliths } from './world/rocks.js';
import { createTaishanArchitecture } from './world/architecture.js';
import { createTaishanVegetation } from './world/vegetation.js';
import { createTaishanAtmosphere } from './world/atmosphere.js';
import { createTaishanSoundscape } from './audio/soundscape.js';
import { clamp, lerp, smoothstep } from './utils/noise.js';

const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');
const loadingScreen = document.getElementById('loading-screen');

function setProgress(pct, text) {
  if (loadingBar) loadingBar.style.width = `${pct}%`;
  if (loadingStatus && text) loadingStatus.textContent = text;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

async function bootstrap() {
  setProgress(15, '正在載入書法金石字庫…');
  if (document.fonts && document.fonts.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 1400)),
    ]);
  }
  await nextFrame();

  // =========================================================================
  // 1. 初始化场景、相机、渲染器与后期辉光管线
  // =========================================================================
  const container = document.getElementById('canvas-container');
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9b8f9e, 0.00042);

  function computeAdaptiveFov(aspect) {
    const baseFov = 46;
    if (aspect >= 1.42) return baseFov;
    const vRad = THREE.MathUtils.degToRad(baseFov);
    const adapted = 2 * Math.atan(Math.tan(vRad * 0.5) * (1.42 / Math.max(0.65, aspect)));
    return Math.min(70, THREE.MathUtils.radToDeg(adapted));
  }

  const initAspect = window.innerWidth / Math.max(1, window.innerHeight);
  const camera = new THREE.PerspectiveCamera(
    computeAdaptiveFov(initAspect),
    initAspect,
    0.5,
    5200
  );
  camera.position.set(...SCENIC_SPOTS.overview.camPos);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.26,
    0.60,
    0.88
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.492;
  controls.minDistance = 4.5;
  controls.maxDistance = 680;
  controls.target.set(...SCENIC_SPOTS.overview.target);
  controls.update();

  // =========================================================================
  // 2. 全局统一太阳光影 Uniforms 与多维通透布光
  // =========================================================================
  const sunUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.86, 0.20, -0.18).normalize() },
    uSunColor: { value: new THREE.Color(0xffb870) },
    uAerialColor: { value: new THREE.Color(0xa9969b) },
    uCloudHeight: { value: 42.0 },
  };

  const hemiLight = new THREE.HemisphereLight(0xb8ccf0, 0x4d463c, 1.05);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffb870, 3.1);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 20;
  sunLight.shadow.camera.far = 720;
  const shadowExtent = 185;
  sunLight.shadow.camera.left = -shadowExtent;
  sunLight.shadow.camera.right = shadowExtent;
  sunLight.shadow.camera.top = shadowExtent;
  sunLight.shadow.camera.bottom = -shadowExtent;
  sunLight.shadow.bias = -0.00045;
  sunLight.target.position.set(22, 155, -20);
  scene.add(sunLight);
  scene.add(sunLight.target);

  // 南向云海漫反射天空补光：确保十八盘、南天门、唐摩崖与碧霞祠正面细节温润通透不死黑！
  const fillLight = new THREE.DirectionalLight(0x9db7e6, 0.85);
  fillLight.position.set(-85, 145, 220);
  scene.add(fillLight);

  // =========================================================================
  // 3. 分阶段构建整座泰山三维景观
  // =========================================================================
  setProgress(30, '正在隆起太古斷塊山體與飛龍巖、翔鳳嶺…');
  await nextFrame();
  const terrainMesh = createTaishanTerrain(sunUniforms);
  scene.add(terrainMesh);

  setProgress(48, '正在鐫刻五嶽獨尊、唐摩崖、雕花格扇與松針肌理…');
  await nextFrame();
  const sharedTextures = {
    granite: createGraniteTextures(),
    ashlar: createAshlarStoneTextures(4, 2),
    crimsonWall: createCrimsonWallTexture(),
    yellowTile: createRoofTileTextures('yellow', 8, 3),
    goldTile: createRoofTileTextures('gold_bronze', 10, 3),
    greyTile: createRoofTileTextures('grey', 8, 3),
    caihua: createCaihuaBeamTexture(),
    latticeWindow: createLatticeWindowTextures(),
    pineNeedles: createPineNeedleTextures(),
  };

  setProgress(65, '正在疊砌拱北探海石、仙人橋與岱頂奇石群…');
  await nextFrame();
  const rocksGroup = createTaishanRocksAndMonoliths(sharedTextures);
  scene.add(rocksGroup);

  setProgress(80, '正在營造十八盤、南天門摩空閣、天街與碧霞金闕…');
  await nextFrame();
  const archSystem = createTaishanArchitecture(sharedTextures);
  scene.add(archSystem.group);

  setProgress(91, '正在栽植十八盤迎客松與千株高山蒼松…');
  await nextFrame();
  const vegGroup = createTaishanVegetation(sunUniforms, sharedTextures);
  scene.add(vegGroup);

  setProgress(98, '正在匯聚東海雲海玉盤與旭日霞光…');
  await nextFrame();
  const atmosphere = createTaishanAtmosphere(sunUniforms);
  scene.add(atmosphere.group);

  // =========================================================================
  // 4. 天象时辰光影实时联动
  // =========================================================================
  const envState = {
    hour: 6.6, // 默认 06:36 卯时日出：红日跃上东海云涛黄金仰角，霞光洒满岱顶！
    cloudHeight: 42.0,
    cloudDensity: 0.88,
    mistAmount: 0.65,
    sunDir: sunUniforms.uSunDir.value,
  };

  function getChineseShichenLabel(h) {
    const names = [
      '子時夜半', '丑時雞鳴', '寅時平旦', '卯時日出',
      '辰時食時', '巳時隅中', '午時日正', '未時日昳',
      '申時哺時', '酉時日入', '戌時黃昏', '亥時人定',
    ];
    const idx = Math.floor(((h + 1) % 24) / 2);
    const hh = String(Math.floor(h) % 24).padStart(2, '0');
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    return `${hh}:${mm} · ${names[idx]}`;
  }

  function updateEnvironmentFromHour() {
    const h = envState.hour;
    const phase = ((h - 6.0) / 24.0) * Math.PI * 2.0;
    const sunElev = Math.sin(phase) * 0.84;
    const horizCos = Math.cos(phase);
    const sx = horizCos * 0.94;
    const sz = Math.sin(phase) * 0.46 - horizCos * 0.16;
    const sy = sunElev;

    envState.sunDir.set(sx, sy, sz).normalize();
    const sunY = envState.sunDir.y;

    sunLight.position
      .copy(sunLight.target.position)
      .addScaledVector(envState.sunDir, 350);

    const dayAmt = smoothstep(-0.06, 0.36, sunY);
    const dawnGlow = Math.exp(-Math.pow((sunY - 0.13) / 0.19, 2.0));
    const nightAmt = 1.0 - smoothstep(-0.14, 0.02, sunY);

    const colDawn = new THREE.Color(0xff9f4d);
    const colNoon = new THREE.Color(0xfff7ea);
    const colNight = new THREE.Color(0x324d82);

    const curSunCol = colNight
      .clone()
      .lerp(colNoon, dayAmt)
      .lerp(colDawn, dawnGlow * 0.82);

    sunLight.color.copy(curSunCol);
    sunLight.intensity = lerp(0.32, 3.2, smoothstep(-0.04, 0.24, sunY)) + dawnGlow * 0.65;
    sunUniforms.uSunColor.value.copy(curSunCol);

    hemiLight.color.setRGB(
      lerp(0.16, 0.68, dayAmt) + dawnGlow * 0.20,
      lerp(0.20, 0.76, dayAmt) + dawnGlow * 0.08,
      lerp(0.36, 0.92, dayAmt)
    );
    hemiLight.groundColor.setRGB(
      lerp(0.08, 0.30, dayAmt),
      lerp(0.09, 0.27, dayAmt),
      lerp(0.12, 0.24, dayAmt)
    );
    hemiLight.intensity = lerp(0.55, 1.08, dayAmt);
    fillLight.intensity = lerp(0.32, 0.88, dayAmt);

    const fogNight = new THREE.Color(0x0d1526);
    const fogDawn = new THREE.Color(0xcf9372);
    const fogNoon = new THREE.Color(0xa2bdd9);
    const aerialCol = fogNight
      .clone()
      .lerp(fogNoon, dayAmt)
      .lerp(fogDawn, dawnGlow * 0.70);

    sunUniforms.uAerialColor.value.copy(aerialCol);
    scene.fog.color.copy(aerialCol);
    scene.fog.density = 0.00028 + envState.mistAmount * 0.00030;

    // 仅在日出前/日落后暗夜点亮雕花宣纸窗棂与红宫灯！
    const lampPower = smoothstep(0.03, -0.09, sunY);
    archSystem.windowGlowMat.emissiveIntensity = lampPower * 2.2;
    archSystem.lanternGlowMat.emissiveIntensity = 0.18 + lampPower * 2.6;
    archSystem.nightPointLights.forEach((pt) => {
      pt.intensity = lampPower * 2.6;
    });

    bloomPass.strength = lerp(0.22, 0.46, Math.max(dawnGlow * 0.65, nightAmt));
    renderer.toneMappingExposure = lerp(0.98, 1.15, dayAmt + dawnGlow * 0.12);
  }

  updateEnvironmentFromHour();

  // =========================================================================
  // 5. 相机平滑微弧飞跃、自动登岱巡礼与第一人称徒步漫游系统
  // =========================================================================
  let currentSpotId = 'overview';
  let flyAnim = null;
  let tourActive = false;
  let tourProgress = 0;
  let walkActive = false;

  const tourCamCurve = new THREE.CatmullRomCurve3(
    PILGRIMAGE_TOUR_KEYFRAMES.map((k) => new THREE.Vector3(...k.pos))
  );
  const tourLookCurve = new THREE.CatmullRomCurve3(
    PILGRIMAGE_TOUR_KEYFRAMES.map((k) => new THREE.Vector3(...k.look))
  );

  const elSpotElevation = document.getElementById('spot-elevation');
  const elSpotTitle = document.getElementById('spot-title');
  const elSpotVerse = document.getElementById('spot-verse');
  const elSpotDesc = document.getElementById('spot-desc');
  const elSubtitle = document.getElementById('current-spot-subtitle');
  const dockBtns = document.querySelectorAll('.dock-btn');

  function updateSpotCardUI(spotId) {
    const spot = SCENIC_SPOTS[spotId];
    if (!spot) return;
    currentSpotId = spotId;
    elSpotElevation.textContent = spot.altitude;
    elSpotTitle.textContent = spot.title;
    elSpotVerse.textContent = spot.verse;
    elSpotDesc.textContent = spot.desc;
    elSubtitle.textContent = `${spot.name} · ${spot.altitude}`;

    dockBtns.forEach((b) => {
      b.classList.toggle('active', b.dataset.camera === spotId);
    });
  }
  updateSpotCardUI('overview');

  function stopTourAndWalk() {
    if (tourActive) {
      tourActive = false;
      document.getElementById('btn-tour').classList.remove('active');
      document.getElementById('tour-label').textContent = '自動登岱巡禮';
    }
    if (walkActive) {
      setWalkMode(false);
    }
  }

  function flyToSpot(spotId, duration = 1.65) {
    const spot = SCENIC_SPOTS[spotId];
    if (!spot) return;
    stopTourAndWalk();
    updateSpotCardUI(spotId);

    const startPos = camera.position.clone();
    const endPos = new THREE.Vector3(...spot.camPos);
    const dist = startPos.distanceTo(endPos);

    flyAnim = {
      elapsed: 0,
      duration,
      startPos,
      endPos,
      arcLift: Math.min(32.0, dist * 0.14), // 优雅微拱飞行轨迹，轻松跨越山脊绝不擦碰！
      startTarget: controls.target.clone(),
      endTarget: new THREE.Vector3(...spot.target),
    };
  }

  const walkState = {
    yaw: 0,
    pitch: 0.12,
    velY: 0,
    onGround: true,
    keys: {},
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  function setWalkMode(active) {
    walkActive = active;
    const btnWalk = document.getElementById('btn-walk');
    const walkHint = document.getElementById('walk-hint');
    btnWalk.classList.toggle('active', active);
    document.getElementById('walk-label').textContent = active ? '退出徒步' : '徒步漫遊';
    walkHint.classList.toggle('hidden', !active);

    if (active) {
      if (tourActive) {
        tourActive = false;
        document.getElementById('btn-tour').classList.remove('active');
        document.getElementById('tour-label').textContent = '自動登岱巡禮';
      }
      flyAnim = null;
      controls.enabled = false;

      const groundH = getWalkableSurfaceHeight(camera.position.x, camera.position.z);
      if (camera.position.y - groundH > 18 || currentSpotId === 'overview') {
        camera.position.set(-4.2, getWalkableSurfaceHeight(-4.2, 168) + 1.78, 168);
        walkState.yaw = -0.04;
        walkState.pitch = 0.34;
        updateSpotCardUI('shibapan');
      } else {
        const lookDir = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
        walkState.yaw = Math.atan2(-lookDir.x, -lookDir.z);
        walkState.pitch = clamp(Math.asin(lookDir.y), -1.1, 1.1);
        camera.position.y = groundH + 1.78;
      }
      walkState.velY = 0;
    } else {
      controls.enabled = true;
      const forward = new THREE.Vector3(
        -Math.sin(walkState.yaw) * Math.cos(walkState.pitch),
        Math.sin(walkState.pitch),
        -Math.cos(walkState.yaw) * Math.cos(walkState.pitch)
      );
      controls.target.copy(camera.position).addScaledVector(forward, 18);
      controls.update();
    }
  }

  window.addEventListener('keydown', (e) => {
    walkState.keys[e.code] = true;
    if (e.code === 'KeyH') {
      toggleHideUI();
    } else if (e.code === 'Escape' && walkActive) {
      setWalkMode(false);
    }
  });
  window.addEventListener('keyup', (e) => {
    walkState.keys[e.code] = false;
  });

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (flyAnim) {
      flyAnim = null;
      controls.update();
    }
    if (walkActive) {
      walkState.dragging = true;
      walkState.lastX = e.clientX;
      walkState.lastY = e.clientY;
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (walkActive && walkState.dragging) {
      const dx = e.clientX - walkState.lastX;
      const dy = e.clientY - walkState.lastY;
      walkState.lastX = e.clientX;
      walkState.lastY = e.clientY;
      walkState.yaw -= dx * 0.0032;
      walkState.pitch = clamp(walkState.pitch - dy * 0.0032, -1.25, 1.25);
    }
  });
  window.addEventListener('pointerup', () => {
    walkState.dragging = false;
  });

  // =========================================================================
  // 6. 3D 空间悬浮胜迹铭牌（带 HUD 安全区避让与防重叠智能排布！）
  // =========================================================================
  const poiLayer = document.getElementById('poi-layer');
  let poiVisible = true;
  const poiItems = [];

  Object.values(SCENIC_SPOTS).forEach((spot) => {
    if (!spot.poiPos) return;
    const el = document.createElement('div');
    el.className = 'poi-marker';
    el.innerHTML = `
      <div class="poi-tag">
        <span class="poi-seal">${spot.shortSeal}</span>
        <span class="poi-name">${spot.name}</span>
      </div>
      <div class="poi-stem"></div>
      <div class="poi-dot"></div>
    `;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      flyToSpot(spot.id, 1.6);
    });
    poiLayer.appendChild(el);
    poiItems.push({
      id: spot.id,
      el,
      worldVec: new THREE.Vector3(...spot.poiPos),
      screenX: 0,
      screenY: 0,
      distToTarget: 0,
    });
  });

  const projVec = new THREE.Vector3();
  function updatePOIMarkers() {
    if (!poiVisible) return;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // 先按优先度排序：当前选中景点最优先，其次离注视中心更近的景点优先显示
    poiItems.forEach((it) => {
      it.distToTarget = it.id === currentSpotId ? -1000 : it.worldVec.distanceTo(controls.target);
    });
    const sorted = [...poiItems].sort((a, b) => a.distToTarget - b.distToTarget);
    const placedBoxes = [];

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      projVec.copy(item.worldVec).project(camera);
      const camDist = camera.position.distanceTo(item.worldVec);

      if (projVec.z > 1.0 || projVec.z < -1.0 || camDist > 560) {
        item.el.style.opacity = '0';
        item.el.style.pointerEvents = 'none';
        continue;
      }

      const sx = (projVec.x * 0.5 + 0.5) * w;
      const sy = (-projVec.y * 0.5 + 0.5) * h;

      // 屏幕四周及 HUD 面板区域安全淡出，彻底避免铭牌被切半或压在面板文字上！
      const edgeFade =
        smoothstep(55, 110, sx) *
        (1 - smoothstep(w - 110, w - 55, sx)) *
        smoothstep(78, 125, sy) *
        (1 - smoothstep(h - 105, h - 72, sy));

      // 避让右上天象控制面板与左下诗词卡片
      const inRightPanel = sx > w - 285 && sy < 370;
      const inLeftCard = sx < 355 && sy > h - 310;

      // 防重叠检测
      let overlapped = false;
      for (let j = 0; j < placedBoxes.length; j++) {
        if (Math.abs(sx - placedBoxes[j].x) < 104 && Math.abs(sy - placedBoxes[j].y) < 38) {
          overlapped = true;
          break;
        }
      }

      const distFade = 1.0 - smoothstep(330, 540, camDist);
      const finalAlpha = (inRightPanel || inLeftCard || overlapped) ? 0 : edgeFade * distFade;

      item.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      item.el.style.opacity = finalAlpha.toFixed(2);
      item.el.style.pointerEvents = finalAlpha > 0.2 ? 'auto' : 'none';

      if (finalAlpha > 0.15) {
        placedBoxes.push({ x: sx, y: sy });
      }
    }
  }

  // =========================================================================
  // 7. 绑定 UI 事件
  // =========================================================================
  dockBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      flyToSpot(btn.dataset.camera, 1.65);
    });
  });

  document.getElementById('btn-tour').addEventListener('click', () => {
    if (tourActive) {
      stopTourAndWalk();
    } else {
      if (walkActive) setWalkMode(false);
      flyAnim = null;
      tourActive = true;
      tourProgress = 0;
      document.getElementById('btn-tour').classList.add('active');
      document.getElementById('tour-label').textContent = '停止巡禮';
    }
  });

  document.getElementById('btn-walk').addEventListener('click', () => {
    setWalkMode(!walkActive);
  });

  const btnPoiToggle = document.getElementById('btn-poi-toggle');
  btnPoiToggle.addEventListener('click', () => {
    poiVisible = !poiVisible;
    btnPoiToggle.classList.toggle('active', poiVisible);
    poiLayer.style.display = poiVisible ? 'block' : 'none';
  });

  const soundscape = createTaishanSoundscape();
  const btnAudio = document.getElementById('btn-audio');
  btnAudio.addEventListener('click', () => {
    const on = soundscape.toggle();
    btnAudio.classList.toggle('active', on);
    document.getElementById('audio-icon').textContent = on ? '🔊' : '🔇';
  });

  const btnRestore = document.getElementById('btn-restore-ui');
  function toggleHideUI() {
    const hidden = document.body.classList.toggle('ui-hidden');
    btnRestore.classList.toggle('hidden', !hidden);
  }
  document.getElementById('btn-hide-ui').addEventListener('click', toggleHideUI);
  btnRestore.addEventListener('click', toggleHideUI);

  const panelBody = document.getElementById('panel-body');
  const btnCollapse = document.getElementById('btn-collapse-panel');
  btnCollapse.addEventListener('click', () => {
    const collapsed = panelBody.classList.toggle('collapsed');
    btnCollapse.textContent = collapsed ? '+' : '−';
  });

  const sliderTime = document.getElementById('slider-time');
  const valTime = document.getElementById('val-time');
  const presetBtns = document.querySelectorAll('.time-preset');

  function applyHour(h, activePresetName = null) {
    envState.hour = h;
    sliderTime.value = String(h);
    valTime.textContent = getChineseShichenLabel(h);
    presetBtns.forEach((b) => {
      b.classList.toggle('active', b.dataset.preset === activePresetName);
    });
    updateEnvironmentFromHour();
  }

  const presetMap = {
    sunrise: 6.6,  // 旭日东升（万道金霞洒满岱顶）
    noon: 11.2,    // 晴昼云海（苍松白石玉盘）
    sunset: 17.65, // 晚霞鎏金（夕照南天门）
    night: 22.5,   // 星河夜爬（十八盘灯火长龙）
  };
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset;
      if (presetMap[p] !== undefined) applyHour(presetMap[p], p);
    });
  });

  sliderTime.addEventListener('input', (e) => {
    applyHour(parseFloat(e.target.value), null);
  });

  const sliderCloudH = document.getElementById('slider-cloud-height');
  const valCloudH = document.getElementById('val-cloud-height');
  sliderCloudH.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    envState.cloudHeight = v;
    sunUniforms.uCloudHeight.value = v;
    valCloudH.textContent = `${worldYToAltitude(v)} m`;
  });

  const sliderCloudD = document.getElementById('slider-cloud-density');
  const valCloudD = document.getElementById('val-cloud-density');
  sliderCloudD.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    envState.cloudDensity = v;
    valCloudD.textContent = `${Math.round(v * 100)}%`;
  });

  const sliderMist = document.getElementById('slider-mist');
  const valMist = document.getElementById('val-mist');
  sliderMist.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    envState.mistAmount = v;
    valMist.textContent = `${Math.round(v * 100)}%`;
    updateEnvironmentFromHour();
  });

  window.addEventListener('resize', () => {
    const asp = window.innerWidth / Math.max(1, window.innerHeight);
    camera.aspect = asp;
    camera.fov = computeAdaptiveFov(asp);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  setProgress(100, '岱宗勝境已成 · 歡迎登臨');
  setTimeout(() => {
    loadingScreen.classList.add('fade-out');
  }, 150);

  // =========================================================================
  // 8. 主渲染循环（后台标签页自动休眠，零额外 GPU/CPU 消耗）
  // =========================================================================
  const clock = new THREE.Clock();
  const moveForward = new THREE.Vector3();
  const moveRight = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function animate() {
    requestAnimationFrame(animate);
    if (document.hidden) {
      clock.getDelta();
      return;
    }

    const rawDelta = clock.getDelta();
    const delta = Math.min(rawDelta, 0.05);
    const flyDelta = Math.min(rawDelta, 0.16);
    const elapsed = clock.elapsedTime;
    sunUniforms.uTime.value = elapsed;

    if (flyAnim) {
      flyAnim.elapsed += flyDelta;
      const rawT = clamp(flyAnim.elapsed / flyAnim.duration, 0, 1);
      const ease = rawT < 0.5
        ? 4 * rawT * rawT * rawT
        : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

      camera.position.lerpVectors(flyAnim.startPos, flyAnim.endPos, ease);
      camera.position.y += Math.sin(ease * Math.PI) * flyAnim.arcLift;
      const minFlyY = getWalkableSurfaceHeight(camera.position.x, camera.position.z) + 2.6;
      if (camera.position.y < minFlyY) camera.position.y = minFlyY;

      controls.target.lerpVectors(flyAnim.startTarget, flyAnim.endTarget, ease);
      camera.lookAt(controls.target);

      if (rawT >= 1) {
        camera.position.copy(flyAnim.endPos);
        controls.target.copy(flyAnim.endTarget);
        flyAnim = null;
        controls.update();
      }
    } else if (tourActive) {
      tourProgress += delta * 0.022;
      if (tourProgress >= 1.0) {
        tourProgress = 1.0;
        tourActive = false;
        document.getElementById('btn-tour').classList.remove('active');
        document.getElementById('tour-label').textContent = '自動登岱巡禮';
      }
      tourCamCurve.getPointAt(tourProgress, camera.position);
      tourLookCurve.getPointAt(tourProgress, controls.target);
      camera.lookAt(controls.target);

      const kfIdx = Math.min(
        PILGRIMAGE_TOUR_KEYFRAMES.length - 1,
        Math.floor(tourProgress * PILGRIMAGE_TOUR_KEYFRAMES.length)
      );
      updateSpotCardUI(PILGRIMAGE_TOUR_KEYFRAMES[kfIdx].spotId);
    } else if (walkActive) {
      const speed = (walkState.keys['ShiftLeft'] || walkState.keys['ShiftRight']) ? 16.5 : 8.2;
      moveForward.set(-Math.sin(walkState.yaw), 0, -Math.cos(walkState.yaw)).normalize();
      moveRight.set(Math.cos(walkState.yaw), 0, -Math.sin(walkState.yaw)).normalize();

      let mx = 0, mz = 0;
      if (walkState.keys['KeyW'] || walkState.keys['ArrowUp']) { mx += moveForward.x; mz += moveForward.z; }
      if (walkState.keys['KeyS'] || walkState.keys['ArrowDown']) { mx -= moveForward.x; mz -= moveForward.z; }
      if (walkState.keys['KeyD'] || walkState.keys['ArrowRight']) { mx += moveRight.x; mz += moveRight.z; }
      if (walkState.keys['KeyA'] || walkState.keys['ArrowLeft']) { mx -= moveRight.x; mz -= moveRight.z; }

      const mLen = Math.hypot(mx, mz);
      if (mLen > 0.001) {
        camera.position.x += (mx / mLen) * speed * delta;
        camera.position.z += (mz / mLen) * speed * delta;
      }

      if (walkState.keys['Space'] && walkState.onGround) {
        walkState.velY = 7.2;
        walkState.onGround = false;
      }

      walkState.velY -= 19.6 * delta;
      camera.position.y += walkState.velY * delta;

      const groundY = getWalkableSurfaceHeight(camera.position.x, camera.position.z) + 1.78;
      if (camera.position.y <= groundY) {
        camera.position.y = groundY;
        walkState.velY = 0;
        walkState.onGround = true;
      }

      euler.set(walkState.pitch, walkState.yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);
      elSubtitle.textContent = `徒步登岱中 · 當前海拔約 ${worldYToAltitude(camera.position.y - 1.78)} 米`;
    } else {
      controls.update();
      const minCamY = getWalkableSurfaceHeight(camera.position.x, camera.position.z) + 2.0;
      if (camera.position.y < minCamY) {
        camera.position.y = minCamY;
      }
    }

    atmosphere.update(elapsed, delta, envState);
    updatePOIMarkers();
    composer.render();
  }

  animate();
}

bootstrap().catch((err) => {
  console.error('Failed to initialize Mount Tai 3D scene:', err);
  if (loadingStatus) {
    loadingStatus.textContent = `初始化異常: ${err.message}`;
  }
});
