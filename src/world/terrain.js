import * as THREE from 'three';
import {
  MAIN_TRAIL_POINTS,
  BIXIA_TRAIL_POINTS,
  RIGUAN_TRAIL_POINTS,
  TERRAIN_PLATFORMS,
  BUILDING_EXCAVATIONS,
} from './blueprint.js';
import {
  clamp,
  lerp,
  smoothstep,
  fbm2D,
  ridged2D,
  distAndHeightToSegment,
} from '../utils/noise.js';

// 将三条盘道分别存为独立折线组：采样时对每条盘道先求全局最近点，彻底杜绝陡坡下级台阶的净空帽反向削低上级台阶！
const TRAIL_POLYLINES = [];
function buildTrailPolyline(points, subdivPerSpan = 6) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    false,
    'catmullrom',
    0.16
  );
  const totalSegs = Math.max(8, (points.length - 1) * subdivPerSpan);
  const getInterpWidth = (u) => {
    const fIdx = u * (points.length - 1);
    const i0 = Math.min(points.length - 1, Math.floor(fIdx));
    const i1 = Math.min(points.length - 1, i0 + 1);
    return lerp(points[i0].width, points[i1].width, fIdx - i0);
  };

  const segs = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let prev = curve.getPointAt(0);
  let prevW = getInterpWidth(0);
  for (let i = 1; i <= totalSegs; i++) {
    const u = i / totalSegs;
    const cur = curve.getPointAt(u);
    const curW = getInterpWidth(u);
    segs.push({
      ax: prev.x, ay: prev.y, az: prev.z,
      bx: cur.x, by: cur.y, bz: cur.z,
      halfW: (prevW + curW) * 0.26,
    });
    minX = Math.min(minX, prev.x, cur.x);
    maxX = Math.max(maxX, prev.x, cur.x);
    minZ = Math.min(minZ, prev.z, cur.z);
    maxZ = Math.max(maxZ, prev.z, cur.z);
    prev = cur;
    prevW = curW;
  }
  TRAIL_POLYLINES.push({
    segs,
    minX: minX - 24,
    maxX: maxX + 24,
    minZ: minZ - 24,
    maxZ: maxZ + 24,
  });
}

buildTrailPolyline(MAIN_TRAIL_POINTS, 6);
buildTrailPolyline(BIXIA_TRAIL_POINTS, 6);
buildTrailPolyline(RIGUAN_TRAIL_POINTS, 5);

function closestOnPolyline(poly, x, z) {
  if (x < poly.minX || x > poly.maxX || z < poly.minZ || z > poly.maxZ) return null;
  let bestDist = Infinity;
  let bestY = 0;
  let bestHalfW = 3.0;
  for (let i = 0; i < poly.segs.length; i++) {
    const s = poly.segs[i];
    const res = distAndHeightToSegment(x, z, s.ax, s.ay, s.az, s.bx, s.by, s.bz);
    if (res.dist < bestDist) {
      bestDist = res.dist;
      bestY = res.y;
      bestHalfW = s.halfW;
    }
  }
  return { dist: bestDist, y: bestY, halfW: bestHalfW };
}

// 预计算建筑开挖区的旋转三角函数，加速高频地形采样
const PRECOMP_EXCAVATIONS = BUILDING_EXCAVATIONS.map((b) => ({
  ...b,
  cosR: Math.cos(b.rotY || 0),
  sinR: Math.sin(b.rotY || 0),
  boundR: Math.hypot(b.rx + 14, b.rz + 14),
}));

function smax(a, b, k = 12.0) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0.0, 1.0);
  return lerp(a, b, h) + k * h * (1.0 - h);
}

function peakBell(x, z, cx, cz, rx, rz, topY, baseY = 10.0) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  const d2 = dx * dx + dz * dz;
  return baseY + (topY - baseY) * Math.exp(-d2);
}

/**
 * 精确受控的泰山宏观构造断块高度场（唯一最高峰为玉皇顶 ~193.2m）
 */
function getRawTectonicHeight(x, z) {
  const r = Math.sqrt(x * x + z * z);
  let h = 12.0;

  // 1. 岱顶各主峰与高山台地包络
  h = smax(h, peakBell(x, z, 0, -95, 76, 68, 193.2), 14.0);
  h = smax(h, peakBell(x, z, 28, -58, 60, 50, 180.5), 12.0);
  h = smax(h, peakBell(x, z, 31, -41, 30, 20, 180.0), 9.0);

  const riguanRx = x > 102 ? 27 : 58;
  h = smax(h, peakBell(x, z, 98, -56, riguanRx, 48, 178.5), 12.0);

  // 碧霞祠高山台地 (80, -11) -> 峰值严格控制在 156.5m，配合开挖区绝不冒出院落
  h = smax(h, peakBell(x, z, 80, -11, 54, 46, 156.5), 11.0);

  // 天街山脊与南天门山口台地
  h = smax(h, peakBell(x, z, 36, 14, 50, 28, 149.5), 10.0);
  h = smax(h, peakBell(x, z, -12, 46, 46, 28, 144.5), 10.0);

  // 北坡后石坞缓坡山脉（“北缓南陡”，严格低于 142m）
  h = smax(h, peakBell(x, z, 10, -215, 195, 155, 142.0), 16.0);
  h = smax(h, peakBell(x, z, -115, -155, 150, 130, 130.0), 16.0);

  // 2. 南坡十八盘两侧护卫双峰：西翼【飞龙岩】与东翼【翔凤岭】
  h = smax(h, peakBell(x, z, -52, 98, 38, 58, 155.0), 10.0);
  h = smax(h, peakBell(x, z, -93, 122, 14, 22, 128.0), 6.0);
  h = smax(h, peakBell(x, z, -63, 122, 13, 22, 129.0), 6.0);

  h = smax(h, peakBell(x, z, 54, 96, 42, 58, 154.0), 10.0);
  h = smax(h, peakBell(x, z, 104, 128, 52, 52, 120.0), 12.0);

  // 3. 十八盘深切凹曲 V 形裂谷
  let valleySuppress = 0.0;
  if (z > 48 && z < 245 && Math.abs(x) < 76) {
    const tZ = clamp((z - 58) / 146, 0, 1);
    const axisX = lerp(0.0, -6.0, tZ);
    const valleyFloorY = 44.0 + 97.5 * Math.pow(1.0 - tZ, 1.36);
    const dx = Math.abs(x - axisX);
    const valleyProfile =
      Math.exp(-(dx * dx) / (2 * 24 * 24)) *
      smoothstep(48, 62, z) *
      (1.0 - smoothstep(206, 245, z));
    h = lerp(h, Math.min(h, valleyFloorY + dx * 1.42), valleyProfile * 0.95);
    valleySuppress = Math.exp(-(dx * dx) / (2 * 10 * 10)) * smoothstep(52, 66, z);
  }

  // 4. 外围“一览众山小”层叠远山环带
  if (r > 185) {
    const farMask = smoothstep(195, 380, r) * (1 - smoothstep(1680, 2200, r));
    const angle = Math.atan2(z, x);
    const eastOpen = 1.0 - 0.68 * Math.exp(-Math.pow((angle + 0.16) / 0.52, 2));
    const ridge1 = ridged2D(x * 0.0028 + 4.2, z * 0.0028 - 2.1, 4);
    const fbm1 = fbm2D(x * 0.0052 - 3.7, z * 0.0052 + 6.1, 3);
    const ringMod = 0.58 + 0.42 * Math.sin(r * 0.013 + fbm1 * 2.8);
    const farPeakH = (ridge1 * 82.0 * ringMod + fbm1 * 18.0 + 22.0) * farMask * eastOpen;
    h = smax(h, farPeakH, 14.0);
  }

  // 5. 自然山脊节理细节
  const detailMask = (1.0 - smoothstep(950, 2100, r) * 0.6) * (1.0 - valleySuppress * 0.85);
  const rMid = ridged2D(x * 0.018 + 9.3, z * 0.018 + 5.7, 4);
  const fMid = fbm2D(x * 0.035 - 2.4, z * 0.035 + 8.1, 3);
  const crag = (rMid - 0.42) * 10.8 + fMid * 3.8;
  h += crag * detailMask;

  // 6. 仙人桥万丈深涧裂谷下切（置于噪波之后，确保仙人桥三石悬空透光！）
  if (x > -98 && x < -58 && z > 52 && z < 146) {
    const slotX = Math.exp(-Math.pow((x + 78.0) / 6.8, 2));
    const slotZ = smoothstep(52, 78, z) * (1.0 - smoothstep(132, 145, z));
    const slotMask = slotX * slotZ;
    h = lerp(h, 58.0, slotMask * 0.96);
  }

  return h;
}

/**
 * 精确耦合古建筑清表开挖区与盘道石阶的最终地形高程函数：
 * 1) 托起台地使建筑稳扎稳打不悬空；
 * 2) 硬性执行 minHardCap 开挖上限（覆盖完整 2.6m 网格对角线余量），100% 杜绝绿皮山体穿入任何建筑、院落或台阶！
 */
export function getTerrainHeight(x, z) {
  let baseH = getRawTectonicHeight(x, z);

  if (x > -145 && x < 165 && z > -145 && z < 245) {
    let targetSum = 0;
    let weightSum = 0;
    let maxWeight = 0;
    let minHardCap = Infinity;
    let maxSupportFloor = -Infinity;

    // A. 宏观缓台支撑
    for (let i = 0; i < TERRAIN_PLATFORMS.length; i++) {
      const p = TERRAIN_PLATFORMS[i];
      if (Math.abs(x - p.cx) > p.rx + p.falloff || Math.abs(z - p.cz) > p.rz + p.falloff) continue;
      const nx = Math.max(0, Math.abs(x - p.cx) - p.rx);
      const nz = Math.max(0, Math.abs(z - p.cz) - p.rz);
      const d = Math.sqrt(nx * nx + nz * nz);
      if (d < p.falloff) {
        const w = 1.0 - smoothstep(0, p.falloff, d);
        const wPow = w * w * 1.1;
        targetSum += (p.y - 0.1) * wPow;
        weightSum += wPow;
        if (w > maxWeight) maxWeight = w;
      }
    }

    // B. 建筑、院落与石铺广场定向清表开挖与托底
    const excavResults = [];
    for (let i = 0; i < PRECOMP_EXCAVATIONS.length; i++) {
      const b = PRECOMP_EXCAVATIONS[i];
      const dx = x - b.cx;
      const dz = z - b.cz;
      if (Math.abs(dx) > b.boundR || Math.abs(dz) > b.boundR) continue;

      const lx = dx * b.cosR - dz * b.sinR;
      const lz = dx * b.sinR + dz * b.cosR;
      const clampedLx = clamp(lx, -b.rx, b.rx);
      const clampedLz = clamp(lz, -b.rz, b.rz);
      const localFloorY = b.floorY + clampedLx * b.slopeX + clampedLz * b.slopeZ;

      const padX = Math.max(0, Math.abs(lx) - b.rx);
      const padZ = Math.max(0, Math.abs(lz) - b.rz);
      const padDist = Math.sqrt(padX * padX + padZ * padZ);
      if (padDist < 11.5) {
        const w = 1.0 - smoothstep(0, 11.5, padDist);
        const wPow = w * w * 2.6;
        targetSum += (localFloorY - 0.62) * wPow;
        weightSum += wPow;
        if (w > maxWeight) maxWeight = w;
      }

      const exX = Math.max(0, Math.abs(lx) - (b.rx + 2.5));
      const exZ = Math.max(0, Math.abs(lz) - (b.rz + 2.5));
      const exDist = Math.sqrt(exX * exX + exZ * exZ);
      if (exDist < 7.5) {
        excavResults.push({ exDist, localFloorY, padDist });
      }
    }

    // C. 登山盘道石阶路基托底与硬性净空保护（每条折线求全局最近点，既不掩埋低阶，也不掏空高阶！）
    const trailResults = [];
    for (let i = 0; i < TRAIL_POLYLINES.length; i++) {
      const cp = closestOnPolyline(TRAIL_POLYLINES[i], x, z);
      if (!cp) continue;
      const outer = cp.halfW + 11.5;
      if (cp.dist < outer) {
        trailResults.push(cp);
        const w = 1.0 - smoothstep(cp.halfW * 1.15, outer, cp.dist);
        const wPow = w * w * 2.8;
        targetSum += (cp.y - 0.52) * wPow;
        weightSum += wPow;
        if (w > maxWeight) maxWeight = w;
      }
    }

    if (weightSum > 1e-5) {
      const targetH = targetSum / weightSum;
      baseH = lerp(baseH, targetH, smoothstep(0, 0.72, maxWeight));
    }

    // 在混合托底后的 baseH 基础上施加建筑与步道硬性托底与清表上限
    for (let i = 0; i < excavResults.length; i++) {
      const er = excavResults[i];
      if (er.padDist < 2.2) {
        maxSupportFloor = Math.max(maxSupportFloor, er.localFloorY - 2.1);
      }
      if (er.exDist === 0) {
        minHardCap = Math.min(minHardCap, er.localFloorY - 0.58);
      } else {
        const tBlend = smoothstep(0, 7.5, er.exDist);
        const softCap = lerp(er.localFloorY - 0.58, Math.max(baseH, er.localFloorY - 0.58), tBlend);
        minHardCap = Math.min(minHardCap, softCap);
      }
    }

    for (let i = 0; i < trailResults.length; i++) {
      const cp = trailResults[i];
      const safeBand = cp.halfW + 3.0;
      if (cp.dist <= cp.halfW + 1.2) {
        maxSupportFloor = Math.max(maxSupportFloor, cp.y - 1.9);
      }
      if (cp.dist <= safeBand) {
        minHardCap = Math.min(minHardCap, cp.y - 0.52);
      } else if (cp.dist < safeBand + 5.5) {
        const tBlend = smoothstep(safeBand, safeBand + 5.5, cp.dist);
        const softCap = lerp(cp.y - 0.52, Math.max(baseH, cp.y - 0.52), tBlend);
        minHardCap = Math.min(minHardCap, softCap);
      }
    }

    if (maxSupportFloor > -Infinity) {
      const safeSupport = minHardCap < Infinity ? Math.min(maxSupportFloor, minHardCap - 0.15) : maxSupportFloor;
      if (baseH < safeSupport) baseH = safeSupport;
    }
    if (minHardCap < Infinity && baseH > minHardCap) {
      baseH = minHardCap;
    }
  }

  return baseH;
}

export function getTerrainNormal(x, z, eps = 0.8) {
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
}

/**
 * 获取徒步与相机防穿地高度（包含条石广场、宫观院落地坪及石阶踏面！）
 */
export function getWalkableSurfaceHeight(x, z) {
  let h = getTerrainHeight(x, z);
  for (let i = 0; i < PRECOMP_EXCAVATIONS.length; i++) {
    const b = PRECOMP_EXCAVATIONS[i];
    const dx = x - b.cx;
    const dz = z - b.cz;
    if (Math.abs(dx) > b.boundR || Math.abs(dz) > b.boundR) continue;
    const lx = dx * b.cosR - dz * b.sinR;
    const lz = dx * b.sinR + dz * b.cosR;
    if (Math.abs(lx) <= b.rx + 0.5 && Math.abs(lz) <= b.rz + 0.5) {
      const fy = b.floorY + lx * b.slopeX + lz * b.slopeZ + 0.04;
      if (fy > h) h = fy;
    }
  }
  for (let i = 0; i < TRAIL_POLYLINES.length; i++) {
    const cp = closestOnPolyline(TRAIL_POLYLINES[i], x, z);
    if (cp && cp.dist <= cp.halfW + 0.4 && cp.y + 0.05 > h) {
      h = cp.y + 0.05;
    }
  }
  return h;
}

/**
 * 计算离所有建筑、院落、步道及摄影视线走廊的净距（严禁树石穿入古建筑与步道！）
 */
export function getClearanceFromPathsAndPlazas(x, z) {
  // 核心名胜摄影视廊禁植区
  if (x > -90 && x < -65 && z > 96 && z < 162) return 0;
  if (x > 17 && x < 42 && z > -38 && z < 0) return 0;
  if (x > 84 && x < 126 && z > -68 && z < -42) return 0;
  if (x > -3 && x < 24 && z > 24 && z < 42) return 0;

  let minClearance = 999;

  for (let i = 0; i < PRECOMP_EXCAVATIONS.length; i++) {
    const b = PRECOMP_EXCAVATIONS[i];
    const dx = x - b.cx;
    const dz = z - b.cz;
    if (Math.abs(dx) > b.boundR + 10 || Math.abs(dz) > b.boundR + 10) continue;
    const lx = dx * b.cosR - dz * b.sinR;
    const lz = dx * b.sinR + dz * b.cosR;
    const ox = Math.max(0, Math.abs(lx) - (b.rx + 1.5));
    const oz = Math.max(0, Math.abs(lz) - (b.rz + 1.5));
    const d = Math.sqrt(ox * ox + oz * oz);
    if (d < minClearance) minClearance = d;
  }

  for (let i = 0; i < TERRAIN_PLATFORMS.length; i++) {
    const p = TERRAIN_PLATFORMS[i];
    const nx = Math.max(0, Math.abs(x - p.cx) - p.rx);
    const nz = Math.max(0, Math.abs(z - p.cz) - p.rz);
    const d = Math.sqrt(nx * nx + nz * nz);
    if (d < minClearance) minClearance = d;
  }

  for (let i = 0; i < TRAIL_POLYLINES.length; i++) {
    const cp = closestOnPolyline(TRAIL_POLYLINES[i], x, z);
    if (!cp) continue;
    const d = Math.max(0, cp.dist - cp.halfW * 1.35);
    if (d < minClearance) minClearance = d;
  }

  return minClearance;
}

/**
 * 构建泰山高精度主地形网格与自然逼真的太古花岗片麻岩 + 苍翠鲁中山林 PBR 着色器
 */
export function createTaishanTerrain(sunUniforms) {
  const segs = 416;
  const geometry = new THREE.BufferGeometry();
  const count = (segs + 1) * (segs + 1);

  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices = new Uint32Array(segs * segs * 6);

  const coreFrac = 0.68;
  const coreRadius = 232.0;
  const slopeAtJoin = coreRadius / coreFrac;
  const warpCoord = (t) => {
    const s = Math.sign(t);
    const a = Math.abs(t);
    if (a <= coreFrac) {
      return s * (a / coreFrac) * coreRadius;
    }
    const u = (a - coreFrac) / (1.0 - coreFrac);
    const linearPart = slopeAtJoin * (1.0 - coreFrac) * u;
    return s * (coreRadius + linearPart + 1810.0 * u * u * u);
  };

  let ptr = 0;
  let uvPtr = 0;
  for (let iz = 0; iz <= segs; iz++) {
    const vz = (iz / segs) * 2 - 1;
    const wz = warpCoord(vz);
    for (let ix = 0; ix <= segs; ix++) {
      const vx = (ix / segs) * 2 - 1;
      const wx = warpCoord(vx);
      const wy = getTerrainHeight(wx, wz);

      positions[ptr++] = wx;
      positions[ptr++] = wy;
      positions[ptr++] = wz;

      uvs[uvPtr++] = ix / segs;
      uvs[uvPtr++] = iz / segs;
    }
  }

  let idxPtr = 0;
  const row = segs + 1;
  for (let iz = 0; iz < segs; iz++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices[idxPtr++] = a;
      indices[idxPtr++] = c;
      indices[idxPtr++] = b;
      indices[idxPtr++] = b;
      indices[idxPtr++] = c;
      indices[idxPtr++] = d;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.03,
  });

  material.customProgramCacheKey = () => 'taishan-natural-gneiss-v3';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = sunUniforms.uSunDir;
    shader.uniforms.uAerialColor = sunUniforms.uAerialColor;
    shader.uniforms.uCloudHeight = sunUniforms.uCloudHeight;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        varying vec3 vWorldNorm;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = wp.xyz;
        vWorldNorm = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        varying vec3 vWorldNorm;
        uniform vec3 uSunDir;
        uniform vec3 uAerialColor;
        uniform float uCloudHeight;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.53);
          return fract(p.x * p.y);
        }

        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        float fbmRock(vec2 p) {
          float s = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          for (int i = 0; i < 4; i++) {
            s += a * vnoise(p);
            p = rot * p * 2.08 + vec2(11.3, 23.7);
            a *= 0.5;
          }
          return s;
        }

        float ridgedRock(vec2 p) {
          float s = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.86, 0.50, -0.50, 0.86);
          for (int i = 0; i < 4; i++) {
            float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
            s += a * n * n;
            p = rot * p * 2.15 + vec2(7.9, 19.1);
            a *= 0.5;
          }
          return s;
        }

        vec4 sampleNaturalGranite(vec3 pos, vec3 nrm) {
          vec3 blend = abs(nrm);
          blend = pow(blend, vec3(4.0));
          blend /= (blend.x + blend.y + blend.z + 1e-4);

          vec2 uvX = vec2(pos.z * 0.078, pos.y * 0.044);
          vec2 uvZ = vec2(pos.x * 0.078, pos.y * 0.044);
          vec2 uvY = pos.xz * 0.078;

          float rX = ridgedRock(uvX * 2.6);
          float rZ = ridgedRock(uvZ * 2.6);
          float rY = ridgedRock(uvY * 2.6);
          float ridge = rX * blend.x + rY * blend.y + rZ * blend.z;

          float detail = fbmRock(pos.xz * 0.38 + pos.y * 0.24);
          float macro = fbmRock(pos.xz * 0.034);

          vec3 warmGranite = vec3(0.54, 0.48, 0.41);
          vec3 paleQuartz = vec3(0.63, 0.60, 0.56);
          vec3 darkCrevice = vec3(0.23, 0.22, 0.21);
          vec3 mossTint = vec3(0.28, 0.34, 0.23);

          vec3 col = mix(warmGranite, paleQuartz, smoothstep(0.32, 0.72, macro));
          col = mix(darkCrevice, col, smoothstep(0.18, 0.76, ridge * 0.72 + detail * 0.38));

          float lichen = smoothstep(0.52, 0.84, detail) * clamp(nrm.y + 0.25, 0.0, 1.0);
          col = mix(col, mossTint, lichen * 0.35);

          float relief = ridge * 0.65 + detail * 0.35;
          return vec4(col, relief);
        }`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 N = normalize(vWorldNorm);
        float slope = 1.0 - clamp(N.y, 0.0, 1.0);
        float cliffLip = clamp(length(fwidth(N)) * 2.6, 0.0, 0.26);
        float macroVeg = fbmRock(vWorldPos.xz * 0.035);
        float patchRock = fbmRock(vWorldPos.xz * 0.16 + 7.4);
        float microVeg = vnoise(vWorldPos.xz * 0.72);

        vec4 rockData = sampleNaturalGranite(vWorldPos, N);

        vec3 deepPineCanopy = vec3(0.08, 0.18, 0.09);
        vec3 lushSlopeShrub = vec3(0.15, 0.25, 0.12);
        vec3 summitTawnyGrass = vec3(0.30, 0.28, 0.16);

        float highAlt = smoothstep(138.0, 188.0, vWorldPos.y + macroVeg * 14.0);
        vec3 vegCol = mix(deepPineCanopy, lushSlopeShrub, smoothstep(0.25, 0.75, macroVeg));
        vegCol = mix(vegCol, summitTawnyGrass, highAlt * 0.44 * smoothstep(0.42, 0.84, patchRock));
        vegCol *= (0.78 + 0.38 * microVeg);

        float effectiveSlope = slope + cliffLip + (patchRock - 0.52) * 0.18 + highAlt * 0.08;
        float rockMask = smoothstep(0.22, 0.44, effectiveSlope);
        diffuseColor.rgb = mix(vegCol, rockData.rgb, rockMask);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float slpN = 1.0 - clamp(normalize(vWorldNorm).y, 0.0, 1.0);
        float hBump = fbmRock(vWorldPos.xz * 0.45 + vWorldPos.y * 0.28);
        vec3 dpdx = dFdx(vViewPosition);
        vec3 dpdy = dFdy(vViewPosition);
        float dhdx = dFdx(hBump);
        float dhdy = dFdy(hBump);
        vec3 r1 = cross(dpdy, normal);
        vec3 r2 = cross(normal, dpdx);
        float det = dot(dpdx, r1);
        if (abs(det) > 1e-6) {
          vec3 surfGrad = sign(det) * (dhdx * r1 + dhdy * r2);
          float bumpStrength = mix(0.20, 0.58, smoothstep(0.18, 0.48, slpN));
          normal = normalize(abs(det) * normal - surfGrad * bumpStrength);
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float slpR = 1.0 - clamp(normalize(vWorldNorm).y, 0.0, 1.0);
        roughnessFactor = mix(0.93, 0.78, smoothstep(0.22, 0.48, slpR));`
      )
      .replace(
        '#include <fog_fragment>',
        `float camDist = length(vWorldPos - cameraPosition);
        float aerial = smoothstep(280.0, 2100.0, camDist);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uAerialColor, aerial * 0.80);
        #include <fog_fragment>`
      );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'TaishanTerrain';

  return mesh;
}
