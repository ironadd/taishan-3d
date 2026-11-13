import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';
import { MAIN_TRAIL_POINTS, RIGUAN_TRAIL_POINTS } from './blueprint.js';
import { createSeededRandom, clamp, lerp, smoothstep } from '../utils/noise.js';

/**
 * 生成柔和云雾粒子径向纹理
 */
function createSoftPuffTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255, 255, 255, 0.85)');
  g.addColorStop(0.38, 'rgba(248, 250, 255, 0.42)');
  g.addColorStop(0.72, 'rgba(240, 245, 255, 0.10)');
  g.addColorStop(1.0, 'rgba(240, 245, 255, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/**
 * 构建泰山大气苍穹、翻涌云海玉盘、峡谷流岚、夜爬星火、香炉瑞烟与盘旋飞鹤
 */
export function createTaishanAtmosphere(sunUniforms) {
  const root = new THREE.Group();
  root.name = 'TaishanAtmosphere';

  // =========================================================================
  // 一、 物理感瑞利/米氏散射天空穹顶 + 旭日霞冕 + 高空卷云 + 子夜银河星海
  // =========================================================================
  const skyGeo = new THREE.SphereGeometry(3600, 48, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: sunUniforms.uTime,
      uSunDir: sunUniforms.uSunDir,
      uZenithColor: { value: new THREE.Color(0x162b4d) },
      uHorizonColor: { value: new THREE.Color(0xf28b44) },
      uSunGlowColor: { value: new THREE.Color(0xffb55a) },
      uStarIntensity: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunGlowColor;
      uniform float uStarIntensity;

      float hash31(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash31(vec3(i, 1.0));
        float b = hash31(vec3(i + vec2(1.0, 0.0), 1.0));
        float c = hash31(vec3(i + vec2(0.0, 1.0), 1.0));
        float d = hash31(vec3(i + vec2(1.0, 1.0), 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec3 dir = normalize(vDir);
        vec3 sDir = normalize(uSunDir);
        float up = clamp(dir.y, 0.0, 1.0);

        // 天顶到地平线大气梯度
        float horizonPow = pow(1.0 - up, 2.75);
        vec3 col = mix(uZenithColor, uHorizonColor, horizonPow);

        // 太阳方位米氏前向霞光光晕（旭日东升万道金霞！）
        float sunCos = max(dot(dir, sDir), 0.0);
        float sunVisible = smoothstep(-0.14, 0.08, sDir.y);
        float mieHalo = pow(sunCos, 6.0) * 0.48 + pow(sunCos, 36.0) * 0.65;
        col += uSunGlowColor * mieHalo * sunVisible;

        // 太阳本体圆盘
        float sunDisk = smoothstep(0.99915, 0.99968, dot(dir, sDir));
        col += uSunGlowColor * sunDisk * 3.8 * smoothstep(-0.06, 0.02, sDir.y);

        // 高空丝缕霞染卷云 (High-Altitude Cirrus)
        if (dir.y > 0.03) {
          vec2 skyUV = dir.xz / (dir.y + 0.18) * 1.6 + vec2(uTime * 0.008, -uTime * 0.004);
          float c1 = noise2(skyUV * 2.2);
          float c2 = noise2(skyUV * 5.1 + c1 * 1.4);
          float cirrus = smoothstep(0.56, 0.88, c1 * 0.6 + c2 * 0.4) * smoothstep(0.03, 0.25, dir.y);
          vec3 cirrusCol = mix(vec3(0.92, 0.94, 0.98), uSunGlowColor * 1.25, pow(sunCos, 2.0) * 0.75 + 0.2);
          col = mix(col, cirrusCol, cirrus * 0.34 * (0.25 + 0.75 * sunVisible));
        }

        // 夜爬泰山璀璨繁星与银河微带
        if (uStarIntensity > 0.01 && dir.y > 0.0) {
          vec3 starCell = floor(dir * 380.0);
          float rnd = hash31(starCell);
          if (rnd > 0.9935) {
            float twinkle = 0.65 + 0.35 * sin(uTime * 2.8 + rnd * 120.0);
            float starBright = smoothstep(0.9935, 1.0, rnd) * twinkle * smoothstep(0.02, 0.25, dir.y);
            col += vec3(0.95, 0.97, 1.0) * starBright * uStarIntensity * 2.6;
          }
          // 淡淡银河光带横跨天街夜空
          float milkyWay = exp(-pow((dir.x * 0.65 + dir.z * 0.45 - 0.15) * 3.6, 2.0)) * smoothstep(0.08, 0.5, dir.y);
          col += vec3(0.11, 0.15, 0.26) * milkyWay * uStarIntensity * 0.65;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  root.add(skyMesh);

  // =========================================================================
  // 二、 双层动态翻涌【云海玉盘】（预烘焙地形高程实现零瑕疵软岸线绕山羽化！）
  // =========================================================================
  function buildCloudSeaLayer(yOffset = 0, opacityScale = 1.0, speedScale = 1.0, segs = 230) {
    const size = 4100;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI * 0.5);

    const pos = geo.attributes.position;
    // 非线性加密核心区岸线精度，使十八盘与岱顶周围云岸过渡丝滑细腻
    const terrainHeights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const ux = pos.getX(i) / (size * 0.5);
      const uz = pos.getZ(i) / (size * 0.5);
      const wx = Math.sign(ux) * (260 * Math.abs(ux) + 1840 * Math.pow(Math.abs(ux), 2.5));
      const wz = Math.sign(uz) * (260 * Math.abs(uz) + 1840 * Math.pow(Math.abs(uz), 2.5));
      pos.setXYZ(i, wx, 0, wz);
      terrainHeights[i] = getTerrainHeight(wx, wz);
    }
    geo.setAttribute('aTerrainY', new THREE.BufferAttribute(terrainHeights, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: sunUniforms.uTime,
        uSunDir: sunUniforms.uSunDir,
        uCloudHeight: sunUniforms.uCloudHeight,
        uLayerOffset: { value: yOffset },
        uCloudDensity: { value: 0.88 * opacityScale },
        uSpeed: { value: speedScale },
        uLitColor: { value: new THREE.Color(0xfff0d8) },
        uShadowColor: { value: new THREE.Color(0x5d6e8c) },
        uRimGlowColor: { value: new THREE.Color(0xff9d47) },
      },
      vertexShader: /* glsl */ `
        attribute float aTerrainY;
        uniform float uTime;
        uniform float uCloudHeight;
        uniform float uLayerOffset;
        uniform float uSpeed;

        varying vec3 vWorldPos;
        varying float vTerrainY;
        varying float vBillow;

        float h21(vec2 p) {
          p = fract(p * vec2(234.34, 435.345));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
            mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          vec3 p = position;
          vec2 drift = vec2(uTime * 0.032 * uSpeed, -uTime * 0.018 * uSpeed);
          float w1 = vnoise(p.xz * 0.0085 + drift);
          float w2 = vnoise(p.xz * 0.021 - drift * 1.4);
          float billow = w1 * 0.65 + w2 * 0.35;
          vBillow = billow;

          p.y = uCloudHeight + uLayerOffset + (billow - 0.45) * 13.5;
          vTerrainY = aTerrainY;

          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform float uCloudDensity;
        uniform float uSpeed;
        uniform vec3 uLitColor;
        uniform vec3 uShadowColor;
        uniform vec3 uRimGlowColor;

        varying vec3 vWorldPos;
        varying float vTerrainY;
        varying float vBillow;

        float h21(vec2 p) {
          p = fract(p * vec2(234.34, 435.345));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
            mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        float fbmCloud(vec2 p) {
          float s = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
            s += a * vnoise(p);
            p = p * 2.04 + vec2(13.7, 29.3);
            a *= 0.5;
          }
          return s;
        }

        void main() {
          // 岸线地形差值软羽化：山峰刺破云海处如同绵白轻纱自然缠绕山腰
          float clearance = vWorldPos.y - vTerrainY;
          if (clearance <= 0.05) discard;
          float shoreFade = smoothstep(0.1, 15.0, clearance);

          vec2 flow = vec2(uTime * 0.022 * uSpeed, -uTime * 0.013 * uSpeed);
          vec2 uv = vWorldPos.xz * 0.0072 + flow;
          float nMain = fbmCloud(uv);
          float nDetail = fbmCloud(vWorldPos.xz * 0.024 - flow * 1.5);
          float cloudVal = nMain * 0.68 + nDetail * 0.32 + vBillow * 0.18;

          // 用太阳方向偏移采样近似体积云自阴影与高光顶面（Volumetric Gradient Approximation）
          vec2 sunHoriz = normalize(uSunDir.xz + vec2(1e-4));
          float nTowardsSun = fbmCloud(uv + sunHoriz * 0.09);
          float selfLit = clamp((cloudVal - nTowardsSun) * 3.4 + 0.58, 0.0, 1.0);

          vec3 baseCol = mix(uShadowColor, uLitColor, smoothstep(0.18, 0.88, selfLit * 0.75 + nDetail * 0.3));

          // 朝向东方初升太阳的前向透射金霞（Silver Lining）
          vec3 viewDir = normalize(vWorldPos - cameraPosition);
          float forwardScatter = pow(max(dot(viewDir, normalize(uSunDir)), 0.0), 4.0);
          float sunUp = smoothstep(-0.12, 0.25, uSunDir.y);
          baseCol += uRimGlowColor * forwardScatter * (0.45 + 0.55 * selfLit) * sunUp * 0.85;

          // 远方天际自然融入雾霭消隐
          float dist = length(vWorldPos.xz);
          float edgeFade = 1.0 - smoothstep(1450.0, 2050.0, dist);

          float densityShape = smoothstep(0.34, 0.76, cloudVal);
          float alpha = densityShape * shoreFade * edgeFade * clamp(uCloudDensity, 0.0, 1.2);
          if (alpha < 0.008) discard;

          gl_FragColor = vec4(baseCol, clamp(alpha, 0.0, 0.95));
        }
      `,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = yOffset === 0 ? 2 : 3;
    return mesh;
  }

  const mainCloudSea = buildCloudSeaLayer(0.0, 1.0, 1.0, 230);
  const upperCloudVeil = buildCloudSeaLayer(9.5, 0.48, 1.45, 160);
  root.add(mainCloudSea, upperCloudVeil);

  // =========================================================================
  // 三、 十八盘深涧与南天门穿谷流岚（Drifting Canyon Mist）
  // =========================================================================
  const puffTex = createSoftPuffTexture();
  const mistMat = new THREE.SpriteMaterial({
    map: puffTex,
    color: 0xeaf0f8,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  const mistParticles = [];
  const mistGroup = new THREE.Group();
  const rng = createSeededRandom(7731);

  for (let i = 0; i < 64; i++) {
    const sp = new THREE.Sprite(mistMat);
    const zone = i % 3;
    let bx, by, bz, scale;
    if (zone === 0) {
      // 十八盘峡谷上升云气
      bz = 52 + rng() * 145;
      bx = -10 * ((bz - 52) / 145) + (rng() - 0.5) * 38;
      by = getTerrainHeight(bx, bz) + 5 + rng() * 14;
      scale = 22 + rng() * 26;
    } else if (zone === 1) {
      // 仙人桥深渊穿谷云雾
      bx = -78 + (rng() - 0.5) * 22;
      bz = 118 + (rng() - 0.5) * 32;
      by = 86 + rng() * 24;
      scale = 18 + rng() * 20;
    } else {
      // 天街南崖与碧霞祠山腰浮岚
      bx = 18 + rng() * 88;
      bz = -25 + rng() * 62;
      by = 138 + rng() * 22;
      scale = 26 + rng() * 30;
    }
    sp.position.set(bx, by, bz);
    sp.scale.set(scale * 1.45, scale * 0.72, 1);
    mistGroup.add(sp);
    mistParticles.push({
      sprite: sp,
      originX: bx,
      originY: by,
      originZ: bz,
      phase: rng() * Math.PI * 2,
      speed: 0.25 + rng() * 0.35,
    });
  }
  root.add(mistGroup);

  // =========================================================================
  // 四、【夜爬泰山】十八盘与天街蜿蜒攀登的暖金手电星火长龙！
  // =========================================================================
  const trailCurvePts = MAIN_TRAIL_POINTS.map((p) => new THREE.Vector3(p.x, p.y + 0.85, p.z));
  const climbCurve = new THREE.CatmullRomCurve3(trailCurvePts);
  const riguanCurve = new THREE.CatmullRomCurve3(
    RIGUAN_TRAIL_POINTS.map((p) => new THREE.Vector3(p.x, p.y + 0.85, p.z))
  );

  const climberCount = 320;
  const climberProgress = new Float32Array(climberCount);
  const climberLateral = new Float32Array(climberCount);
  const climberBranch = new Uint8Array(climberCount);
  const climberPosArr = new Float32Array(climberCount * 3);
  const climberColors = new Float32Array(climberCount * 3);

  for (let i = 0; i < climberCount; i++) {
    // 75% 集中在十八盘至玉皇顶主线，25% 前往日观峰等待日出！
    climberBranch[i] = i < 255 ? 0 : 1;
    climberProgress[i] = rng();
    climberLateral[i] = (rng() - 0.5) * 2.2;

    const warm = rng();
    // 暖黄头灯与白炽手电光交织
    climberColors[i * 3 + 0] = 1.0;
    climberColors[i * 3 + 1] = 0.76 + warm * 0.22;
    climberColors[i * 3 + 2] = 0.42 + warm * 0.45;
  }

  const climberGeo = new THREE.BufferGeometry();
  climberGeo.setAttribute('position', new THREE.BufferAttribute(climberPosArr, 3));
  climberGeo.setAttribute('color', new THREE.BufferAttribute(climberColors, 3));

  const climberMat = new THREE.PointsMaterial({
    size: 1.12,
    map: puffTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const climberPoints = new THREE.Points(climberGeo, climberMat);
  root.add(climberPoints);

  // =========================================================================
  // 五、 碧霞祠与玉皇顶袅袅祈福青烟 + 日观峰云海展翅盘旋的瑞鹤
  // =========================================================================
  const incenseOrigins = [
    new THREE.Vector3(80.0, 158.3, -11.2), // 碧霞祠院心大铜香炉
    new THREE.Vector3(0.0, 195.0, -99.5),  // 玉皇顶庙前香炉
  ];
  const incensePuffs = [];
  const incenseMat = new THREE.SpriteMaterial({
    map: puffTex,
    color: 0xdce2ea,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });

  incenseOrigins.forEach((orig) => {
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(incenseMat.clone());
      root.add(sp);
      incensePuffs.push({
        sprite: sp,
        origin: orig,
        offset: i / 14,
      });
    }
  });

  // 展翅瑞鹤模型群（绕日观峰与南天门云海优雅翱翔）
  const craneGroup = new THREE.Group();
  root.add(craneGroup);

  const craneGeo = new THREE.BufferGeometry();
  // 简洁优雅的 V 形飞鸟双翼网格（6 个顶点两片翼面）
  const wingVerts = new Float32Array([
    0, 0, 0.55,   0, 0, -0.45,  -1.35, 0.15, -0.1,
    0, 0, -0.45,  0, 0, 0.55,    1.35, 0.15, -0.1,
  ]);
  craneGeo.setAttribute('position', new THREE.BufferAttribute(wingVerts, 3));
  craneGeo.computeVertexNormals();

  const craneMat = new THREE.MeshBasicMaterial({
    color: 0xf6f3ea,
    side: THREE.DoubleSide,
  });

  const cranes = [];
  const craneCenters = [
    { cx: 122, cy: 184, cz: -55, radius: 34, speed: 0.26 },
    { cx: 98, cy: 175, cz: -28, radius: 42, speed: 0.21 },
    { cx: -18, cy: 156, cz: 92, radius: 38, speed: 0.24 },
  ];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(craneGeo, craneMat);
    const cfg = craneCenters[i % craneCenters.length];
    m.scale.setScalar(0.85 + (i % 3) * 0.22);
    craneGroup.add(m);
    cranes.push({
      mesh: m,
      ...cfg,
      phase: (i / 8) * Math.PI * 2,
      flapOffset: i * 1.3,
    });
  }

  // =========================================================================
  // 实时更新接口（由主循环每帧驱动天色、云海色彩、流雾、夜爬灯火与飞鹤）
  // =========================================================================
  const tmpPt = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();

  function update(elapsedTime, delta, envState) {
    const { sunDir, mistAmount, cloudDensity } = envState;
    const sunY = sunDir.y; // [-1, 1]

    // 1. 计算四时天光与云海散射色彩
    const dayFactor = smoothstep(-0.08, 0.36, sunY);
    const goldenFactor = Math.exp(-Math.pow((sunY - 0.08) / 0.19, 2.0)); // 破晓与黄昏极盛金霞！
    const nightFactor = 1.0 - smoothstep(-0.18, 0.04, sunY);

    // 天顶与地平线动态过渡
    const cZenithNight = new THREE.Color(0x060a14);
    const cZenithDawn = new THREE.Color(0x1b335c);
    const cZenithNoon = new THREE.Color(0x2864a6);

    const cHorizNight = new THREE.Color(0x10192b);
    const cHorizDawn = new THREE.Color(0xeb7e38);
    const cHorizNoon = new THREE.Color(0xa6CBE3);

    skyMat.uniforms.uZenithColor.value
      .copy(cZenithNight)
      .lerp(cZenithNoon, dayFactor)
      .lerp(cZenithDawn, goldenFactor * 0.72);

    skyMat.uniforms.uHorizonColor.value
      .copy(cHorizNight)
      .lerp(cHorizNoon, dayFactor)
      .lerp(cHorizDawn, goldenFactor * 0.88);

    skyMat.uniforms.uSunGlowColor.value.setRGB(
      1.0,
      lerp(0.55, 0.92, dayFactor),
      lerp(0.24, 0.76, dayFactor)
    );
    skyMat.uniforms.uStarIntensity.value = nightFactor;

    // 2. 更新双层云海玉盘色彩与浓度
    const cloudLitNight = new THREE.Color(0x1d273b);
    const cloudLitDawn = new THREE.Color(0xffdfba);
    const cloudLitNoon = new THREE.Color(0xfafcff);

    const cloudShadNight = new THREE.Color(0x0c121e);
    const cloudShadDawn = new THREE.Color(0x5a6585);
    const cloudShadNoon = new THREE.Color(0x8ba2bd);

    const litCol = cloudLitNight.clone().lerp(cloudLitNoon, dayFactor).lerp(cloudLitDawn, goldenFactor * 0.78);
    const shadCol = cloudShadNight.clone().lerp(cloudShadNoon, dayFactor).lerp(cloudShadDawn, goldenFactor * 0.72);

    mainCloudSea.material.uniforms.uLitColor.value.copy(litCol);
    mainCloudSea.material.uniforms.uShadowColor.value.copy(shadCol);
    mainCloudSea.material.uniforms.uCloudDensity.value = cloudDensity;

    upperCloudVeil.material.uniforms.uLitColor.value.copy(litCol);
    upperCloudVeil.material.uniforms.uShadowColor.value.copy(shadCol);
    upperCloudVeil.material.uniforms.uCloudDensity.value = cloudDensity * 0.46;

    // 3. 十八盘穿谷流雾飘移
    mistMat.opacity = 0.24 * mistAmount * (0.35 + 0.65 * (1.0 - nightFactor * 0.5));
    mistMat.color.copy(litCol);
    for (let i = 0; i < mistParticles.length; i++) {
      const mp = mistParticles[i];
      const cycle = ((elapsedTime * mp.speed * 0.08 + mp.phase) % 1.0);
      mp.sprite.position.x = mp.originX + Math.sin(elapsedTime * 0.3 + mp.phase) * 6.5;
      mp.sprite.position.y = mp.originY + cycle * 14.0;
      mp.sprite.position.z = mp.originZ - cycle * 18.0;
    }

    // 4. 夜爬泰山十八盘星火长龙推进（仅夜晚与日出前暗夜亮起，日出后清爽隐去！）
    const torchVisibility = smoothstep(0.01, -0.09, sunY);
    climberMat.opacity = torchVisibility * 0.92;
    climberPoints.visible = torchVisibility > 0.01;

    if (climberPoints.visible) {
      const posAttr = climberGeo.attributes.position;
      for (let i = 0; i < climberCount; i++) {
        climberProgress[i] = (climberProgress[i] + delta * 0.014) % 1.0;
        const t = climberProgress[i];
        const curve = climberBranch[i] === 0 ? climbCurve : riguanCurve;
        curve.getPointAt(t, tmpPt);
        curve.getTangentAt(t, tmpTan);
        const sideX = tmpTan.z;
        const sideZ = -tmpTan.x;
        const bob = Math.abs(Math.sin(elapsedTime * 4.5 + i)) * 0.16;

        posAttr.setXYZ(
          i,
          tmpPt.x + sideX * climberLateral[i],
          tmpPt.y + bob,
          tmpPt.z + sideZ * climberLateral[i]
        );
      }
      posAttr.needsUpdate = true;
    }

    // 5. 碧霞祠与玉皇顶袅袅上升香烟
    for (let i = 0; i < incensePuffs.length; i++) {
      const p = incensePuffs[i];
      const life = (elapsedTime * 0.18 + p.offset) % 1.0;
      p.sprite.position.set(
        p.origin.x + Math.sin(elapsedTime * 1.2 + life * 6.0) * (0.4 + life * 1.8),
        p.origin.y + life * 9.5,
        p.origin.z - life * 1.6
      );
      const s = 0.8 + life * 3.8;
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = Math.sin(life * Math.PI) * 0.22;
    }

    // 6. 盘旋瑞鹤振翅飞行
    craneGroup.visible = nightFactor < 0.75;
    if (craneGroup.visible) {
      for (let i = 0; i < cranes.length; i++) {
        const c = cranes[i];
        const ang = elapsedTime * c.speed + c.phase;
        const nx = c.cx + Math.cos(ang) * c.radius;
        const nz = c.cz + Math.sin(ang) * c.radius * 0.78;
        const ny = c.cy + Math.sin(ang * 2.0) * 2.8;

        c.mesh.position.set(nx, ny, nz);
        c.mesh.rotation.y = -ang;
        c.mesh.rotation.z = 0.22; // 盘旋内倾坡度
        // 双翼轻柔上下扇动
        const flap = Math.sin(elapsedTime * 5.2 + c.flapOffset) * 0.35;
        const wPos = c.mesh.geometry.attributes.position;
        wPos.setY(2, 0.15 + flap);
        wPos.setY(5, 0.15 + flap);
        wPos.needsUpdate = true;
      }
    }
  }

  return {
    group: root,
    update,
  };
}
