import * as THREE from 'three';
import {
  getTerrainHeight,
  getTerrainNormal,
  getClearanceFromPathsAndPlazas,
} from './terrain.js';
import { createSeededRandom, noise3D, clamp } from '../utils/noise.js';
import {
  createWuYueDuZunTexture,
  createAngTouTianWaiTexture,
  createVerticalSteleTexture,
  createTangMoyaCliffTexture,
} from './textures.js';

/**
 * 基于地质节理平面切削算法生成真实泰山花岗岩块状几何体
 */
export function createFacetedRockGeometry(seed = 1, detail = 3, flatness = 0.85) {
  const rng = createSeededRandom(seed);
  const geo = new THREE.IcosahedronGeometry(1.0, detail);
  const pos = geo.attributes.position;

  const planes = [];
  for (let i = 0; i < 12; i++) {
    const theta = rng() * Math.PI * 2;
    const yBias = i < 3 ? (i === 0 ? 0.92 : -0.88) : (rng() - 0.5) * 0.75;
    const rHoriz = Math.sqrt(Math.max(0.05, 1 - yBias * yBias));
    const n = new THREE.Vector3(Math.cos(theta) * rHoriz, yBias, Math.sin(theta) * rHoriz).normalize();
    const dist = 0.56 + rng() * 0.28;
    planes.push({ n, dist });
  }

  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    for (let p = 0; p < planes.length; p++) {
      const d = v.dot(planes[p].n);
      if (d > planes[p].dist) {
        v.addScaledVector(planes[p].n, -(d - planes[p].dist) * flatness);
      }
    }
    const n1 = noise3D(v.x * 2.3 + seed, v.y * 2.3, v.z * 2.3 - seed);
    const n2 = noise3D(v.x * 5.8 - seed, v.y * 5.8, v.z * 5.8 + seed);
    v.multiplyScalar(1.0 + n1 * 0.11 + n2 * 0.035);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  const crispGeo = geo.toNonIndexed();
  crispGeo.computeVertexNormals();
  geo.dispose();
  return crispGeo;
}

/**
 * 生成正面平整可贴石刻、四周与顶部自然崩裂收分的摩崖立石几何体
 */
function createInscribedMonolithGeometry(width, height, depth, seed = 77) {
  const geo = new THREE.BoxGeometry(width, height, depth, 16, 24, 10);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = v.x / (width * 0.5);
    const ny = v.y / (height * 0.5);
    const nz = v.z / (depth * 0.5);

    const nLow = noise3D(v.x * 0.55 + seed, v.y * 0.5, v.z * 0.55);
    const nHigh = noise3D(v.x * 2.1 - seed, v.y * 2.0, v.z * 2.1);

    const taper = 1.0 - clamp((ny + 1.0) * 0.5, 0, 1) * 0.12;
    v.x *= taper;

    if (ny > 0.68) {
      const crownWave = Math.sin(nx * 2.6 + seed) * 0.12 + nx * nx * 0.18;
      v.y -= crownWave * height * 0.14 * ((ny - 0.68) / 0.32);
      v.y += nLow * 0.35;
    }

    const isFrontCenter = nz > 0.85 && Math.abs(nx) < 0.82 && Math.abs(ny) < 0.84;
    if (isFrontCenter) {
      v.z += nHigh * 0.02;
    } else {
      v.x += (nLow * 0.22 + nHigh * 0.06) * Math.min(3.0, width * 0.22);
      v.z += (nLow * 0.26 + nHigh * 0.07) * Math.min(2.5, depth * 0.28);
      v.y += nHigh * 0.08;
    }

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * 构建整座泰山的块状花岗岩奇石群与五大名石摩崖地标（零悬空、零穿殿！）
 */
export function createTaishanRocksAndMonoliths(sharedTextures) {
  const group = new THREE.Group();
  group.name = 'TaishanRocksAndMonoliths';

  const baseRockMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.granite.map,
    bumpMap: sharedTextures.granite.bumpMap,
    bumpScale: 0.26,
    color: 0xd0cac0,
    roughness: 0.86,
    metalness: 0.03,
  });

  // =========================================================================
  // 一、 全山山脊与岩顶出露奇石（严密避开全部建筑开挖区、步道与摄影视廊！）
  // =========================================================================
  const variants = [
    createFacetedRockGeometry(101, 2, 0.88),
    createFacetedRockGeometry(205, 2, 0.84),
    createFacetedRockGeometry(309, 2, 0.90),
  ];

  const placements = [[], [], []];
  const rng = createSeededRandom(9528);

  const pushGroundedRock = (x, z, sx, sy, sz, rx, ry, rz, tint = 1.0, minClear = 5.5) => {
    if (getClearanceFromPathsAndPlazas(x, z) < minClear) return;
    const nrm = getTerrainNormal(x, z);
    const slope = 1.0 - nrm.y;
    if (slope > 0.56) return;

    const embedX = x - nrm.x * sx * 0.42;
    const embedZ = z - nrm.z * sz * 0.42;
    if (getClearanceFromPathsAndPlazas(embedX, embedZ) < minClear * 0.8) return;

    const gy = getTerrainHeight(embedX, embedZ);
    const embedY = gy - sy * (0.30 + slope * 0.42);

    const vIdx = Math.floor(rng() * variants.length);
    placements[vIdx].push({
      x: embedX, y: embedY, z: embedZ,
      sx, sy, sz, rx, ry, rz, tint,
    });
  };

  // 1) 玉皇顶底座外围攒簇花岗岩莲台石群（严格置于城台外缘 rad >= 17.5m，绝不穿入极顶院墙！）
  for (let i = 0; i < 85; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 17.5 + rng() * 14.5;
    const rx = Math.cos(ang) * rad;
    const rz = -95 + Math.sin(ang) * rad * 0.94;
    if (rx > -8 && rx < 9 && rz > -85) continue;
    const sx = 2.0 + rng() * 3.0;
    const sy = 2.8 + rng() * 4.4;
    const sz = 2.0 + rng() * 2.8;
    pushGroundedRock(
      rx, rz, sx, sy, sz,
      -Math.sin(ang) * 0.2,
      rng() * Math.PI,
      Math.cos(ang) * 0.2,
      0.94 + rng() * 0.16,
      2.2
    );
  }

  // 2) 飞龙岩、翔凤岭峰脊与外围山脊奇石簇
  for (let i = 0; i < 520; i++) {
    const x = (rng() - 0.45) * 280;
    const z = (rng() - 0.52) * 290;
    const gy = getTerrainHeight(x, z);
    if (gy < 65) continue;

    const sc = 1.6 + rng() * 3.2;
    pushGroundedRock(
      x, z,
      sc * (0.85 + rng() * 0.4),
      sc * (0.95 + rng() * 0.65),
      sc * (0.85 + rng() * 0.4),
      (rng() - 0.5) * 0.22,
      rng() * Math.PI * 2,
      (rng() - 0.5) * 0.22,
      0.88 + rng() * 0.22,
      6.2
    );
  }

  const dummy = new THREE.Object3D();
  const colHelper = new THREE.Color();
  variants.forEach((geo, idx) => {
    const list = placements[idx];
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(geo, baseRockMat, list.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    list.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.rx, it.ry, it.rz);
      dummy.scale.set(it.sx, it.sy, it.sz);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      colHelper.setRGB(it.tint * 1.02, it.tint * 0.99, it.tint * 0.95);
      inst.setColorAt(i, colHelper);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
  });

  // =========================================================================
  // 二、【五嶽獨尊 & 昂頭天外】双拼垂直裂隙传世奇石（稳立于 179.04m 石台东缘）
  // =========================================================================
  const wuyueGroup = new THREE.Group();
  wuyueGroup.position.set(37.2, 178.95, -58.2);
  wuyueGroup.rotation.y = -0.94;

  const wuyueFrontMat = new THREE.MeshStandardMaterial({
    map: createWuYueDuZunTexture(),
    bumpMap: sharedTextures.granite.bumpMap,
    bumpScale: 0.16,
    roughness: 0.82,
  });
  const leftStone = new THREE.Mesh(
    createInscribedMonolithGeometry(1.62, 4.38, 1.48, 1907),
    [baseRockMat, baseRockMat, baseRockMat, baseRockMat, wuyueFrontMat, baseRockMat]
  );
  leftStone.position.set(-0.86, 2.05, 0);
  leftStone.castShadow = true;
  leftStone.receiveShadow = true;
  wuyueGroup.add(leftStone);

  const angtouFrontMat = new THREE.MeshStandardMaterial({
    map: createAngTouTianWaiTexture(),
    bumpMap: sharedTextures.granite.bumpMap,
    bumpScale: 0.16,
    roughness: 0.82,
  });
  const rightStone = new THREE.Mesh(
    createInscribedMonolithGeometry(1.48, 4.18, 1.44, 1908),
    [baseRockMat, baseRockMat, baseRockMat, baseRockMat, angtouFrontMat, baseRockMat]
  );
  rightStone.position.set(0.77, 1.95, -0.04);
  rightStone.rotation.z = -0.025;
  rightStone.castShadow = true;
  rightStone.receiveShadow = true;
  wuyueGroup.add(rightStone);

  const baseCluster = [
    [-2.1, 0.75, -0.35, 1.35, 1.3, 1.2],
    [2.05, 0.9, -0.4, 1.4, 1.5, 1.25],
    [0.0, 1.25, -1.35, 2.5, 2.0, 1.4],
    [-0.8, 0.12, 1.35, 1.15, 0.28, 0.85],
    [0.6, 0.10, 1.45, 1.25, 0.26, 0.9],
  ];
  baseCluster.forEach(([rx, ry, rz, sx, sy, sz], idx) => {
    const m = new THREE.Mesh(variants[idx % 3], baseRockMat);
    m.position.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    wuyueGroup.add(m);
  });
  group.add(wuyueGroup);

  // =========================================================================
  // 三、【雄峙天東 & 孔子小天下處】双石碑奇观（稳立于 184.04m 条石台面）
  // =========================================================================
  const confuciusGroup = new THREE.Group();
  confuciusGroup.position.set(21.2, 183.98, -70.0);
  confuciusGroup.rotation.y = -0.55;

  const xiongzhiTex = createVerticalSteleTexture(['雄', '峙', '天', '東'], ['乾', '隆', '御', '題'], 3401);
  const xiongzhiStele = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 3.25, 0.55),
    [
      baseRockMat, baseRockMat, baseRockMat, baseRockMat,
      new THREE.MeshStandardMaterial({ map: xiongzhiTex, roughness: 0.82 }),
      baseRockMat,
    ]
  );
  xiongzhiStele.position.set(-1.1, 1.55, 0);
  xiongzhiStele.castShadow = true;
  confuciusGroup.add(xiongzhiStele);

  const kongziTex = createVerticalSteleTexture(['孔', '子', '小', '天', '下', '處'], [], 3402);
  const kongziStele = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 2.45, 0.46),
    [
      baseRockMat, baseRockMat, baseRockMat, baseRockMat,
      new THREE.MeshStandardMaterial({ map: kongziTex, roughness: 0.82 }),
      baseRockMat,
    ]
  );
  kongziStele.position.set(1.25, 1.18, 0.08);
  kongziStele.castShadow = true;
  confuciusGroup.add(kongziStele);

  const capGeo = new THREE.CylinderGeometry(0.42, 0.72, 0.42, 4);
  capGeo.rotateY(Math.PI * 0.25);
  const capMesh = new THREE.Mesh(capGeo, baseRockMat);
  capMesh.scale.set(1.25, 1.0, 0.72);
  capMesh.position.set(1.25, 2.58, 0.08);
  confuciusGroup.add(capMesh);
  group.add(confuciusGroup);

  // =========================================================================
  // 四、【大观峰 · 唐摩崖《紀泰山銘》天然山体摩崖巨壁 + 厚实条石瞻仰广场】
  // =========================================================================
  const moyaGroup = new THREE.Group();
  moyaGroup.position.set(29.5, 167.0, -33.5);
  moyaGroup.rotation.y = -0.14;

  const tangMoyaTex = createTangMoyaCliffTexture();
  const moyaFrontMat = new THREE.MeshStandardMaterial({
    map: tangMoyaTex,
    bumpMap: sharedTextures.granite.bumpMap,
    bumpScale: 0.22,
    roughness: 0.80,
    metalness: 0.05,
  });

  const cliffW = 21.0;
  const cliffH = 12.6;
  const cliffD = 7.5;
  const moyaCliff = new THREE.Mesh(
    createInscribedMonolithGeometry(cliffW, cliffH, cliffD, 7260),
    [baseRockMat, baseRockMat, baseRockMat, baseRockMat, moyaFrontMat, baseRockMat]
  );
  moyaCliff.position.set(0, cliffH * 0.45, 0);
  moyaCliff.castShadow = true;
  moyaCliff.receiveShadow = true;
  moyaGroup.add(moyaCliff);

  const cragFrame = [
    [-11.8, 4.8, -0.5, 4.5, 7.2, 5.2],
    [-14.2, 2.8, 1.2, 3.6, 4.6, 4.0],
    [11.6, 5.2, -0.4, 4.8, 7.8, 5.4],
    [14.5, 3.0, 1.0, 3.8, 4.8, 4.2],
    [-7.5, 11.8, -1.8, 4.6, 3.2, 4.2],
    [-1.8, 12.6, -2.0, 5.2, 3.6, 4.6],
    [4.8, 12.2, -1.8, 4.8, 3.4, 4.4],
    [9.5, 11.2, -1.5, 4.0, 3.0, 4.0],
    [0.0, 7.5, -5.5, 13.5, 9.5, 6.0],
  ];
  cragFrame.forEach(([cx, cy, cz, sx, sy, sz], i) => {
    const rMesh = new THREE.Mesh(variants[i % 3], baseRockMat);
    rMesh.position.set(cx, cy, cz);
    rMesh.scale.set(sx, sy, sz);
    rMesh.rotation.set((i % 3 - 1) * 0.12, i * 0.8, 0);
    rMesh.castShadow = true;
    rMesh.receiveShadow = true;
    moyaGroup.add(rMesh);
  });

  // 6.0m 厚实心花岗岩瞻仰石坪（顶面 y = 167.05m，高于开挖地面 0.63m，零绿草穿透！）
  const plazaSlabMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.ashlar.map,
    bumpMap: sharedTextures.ashlar.bumpMap,
    bumpScale: 0.12,
    color: 0xc5c0b6,
    roughness: 0.86,
  });
  const moyaPlaza = new THREE.Mesh(new THREE.BoxGeometry(22.8, 6.0, 13.2), plazaSlabMat);
  moyaPlaza.position.set(-1.5, -2.95, 10.4);
  moyaPlaza.castShadow = true;
  moyaPlaza.receiveShadow = true;
  moyaGroup.add(moyaPlaza);

  const lowBrickMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.ashlar.map,
    color: 0x6c737b,
    roughness: 0.88,
  });
  const lowWall = new THREE.Mesh(new THREE.BoxGeometry(21.2, 0.92, 0.52), lowBrickMat);
  lowWall.position.set(0, 0.50, 4.4);
  lowWall.castShadow = true;
  lowWall.receiveShadow = true;
  moyaGroup.add(lowWall);

  // 广场南缘临崖护栏
  const southGuard = new THREE.Mesh(new THREE.BoxGeometry(22.4, 0.88, 0.36), plazaSlabMat);
  southGuard.position.set(-1.5, 0.48, 16.8);
  moyaGroup.add(southGuard);

  group.add(moyaGroup);

  // =========================================================================
  // 五、【日观峰 · 拱北石 / 探海石】 凌空斜刺东海万顷云涛
  // =========================================================================
  const gongbeiGroup = new THREE.Group();
  gongbeiGroup.position.set(105.0, 177.95, -59.5);
  gongbeiGroup.rotation.y = 0.28;

  const bladeLen = 13.5;
  const bladeGeo = new THREE.BoxGeometry(bladeLen, 2.15, 2.55, 20, 6, 6);
  const bPos = bladeGeo.attributes.position;
  const bv = new THREE.Vector3();
  for (let i = 0; i < bPos.count; i++) {
    bv.fromBufferAttribute(bPos, i);
    const t = bv.x / bladeLen + 0.5;
    bv.y *= 1.0 - Math.pow(t, 1.5) * 0.56;
    bv.z *= 1.0 - Math.pow(t, 1.4) * 0.48;
    bv.y += Math.sin(t * Math.PI) * 0.35;
    const rn = noise3D(bv.x * 0.5 + 31, bv.y * 0.8, bv.z * 0.8);
    bv.y += rn * 0.2;
    bv.z += rn * 0.22;
    bPos.setXYZ(i, bv.x, bv.y, bv.z);
  }
  const crispBlade = bladeGeo.toNonIndexed();
  crispBlade.computeVertexNormals();
  bladeGeo.dispose();

  const gongbeiMesh = new THREE.Mesh(crispBlade, baseRockMat);
  gongbeiMesh.position.set(3.4, 2.7, 0);
  gongbeiMesh.rotation.z = 0.50;
  gongbeiMesh.castShadow = true;
  gongbeiMesh.receiveShadow = true;
  gongbeiGroup.add(gongbeiMesh);

  [
    [-2.4, 1.0, 0.2, 3.6, 2.6, 3.4],
    [-0.5, 0.6, -2.0, 2.8, 2.0, 2.5],
    [-0.8, 0.7, 1.9, 2.6, 1.9, 2.4],
  ].forEach(([rx, ry, rz, sx, sy, sz], idx) => {
    const m = new THREE.Mesh(variants[idx % 3], baseRockMat);
    m.position.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    gongbeiGroup.add(m);
  });
  group.add(gongbeiGroup);

  // =========================================================================
  // 六、【仙人桥 · 三石悬空】 飞龙岩西侧万丈深涧，三石凌空相互抵撑，桥底透出云海天光！
  // =========================================================================
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(-78.0, 114.2, 122.0);

  // 左右两侧擎天夹壁石柱深扎于 58m 谷底，中间留出 14m 净空深渊！
  const leftPillar = new THREE.Mesh(variants[0], baseRockMat);
  leftPillar.position.set(-11.4, -14.0, 0);
  leftPillar.scale.set(6.8, 28.0, 8.6);
  leftPillar.castShadow = true;
  leftPillar.receiveShadow = true;
  bridgeGroup.add(leftPillar);

  const rightPillar = new THREE.Mesh(variants[1], baseRockMat);
  rightPillar.position.set(11.4, -13.5, 0);
  rightPillar.scale.set(6.8, 28.5, 8.6);
  rightPillar.castShadow = true;
  rightPillar.receiveShadow = true;
  bridgeGroup.add(rightPillar);

  // 凌空卡在两崖绝壁之间的三块太古花岗岩巨石（复刻实景图 wiki_8.jpg！）
  const chockStones = [
    { pos: [-4.6, 0.8, 0.0], scale: [3.2, 2.5, 2.8], rot: [0.08, 0.18, 0.32] },
    { pos: [0.0, 1.45, 0.1], scale: [3.0, 2.9, 2.7], rot: [-0.05, -0.14, -0.36] },
    { pos: [4.6, 2.15, -0.1], scale: [3.3, 2.6, 2.9], rot: [0.04, 0.22, 0.26] },
    { pos: [-3.2, -1.6, 0.1], scale: [1.3, 2.1, 1.9], rot: [0, 0.1, -0.25] },
  ];
  chockStones.forEach((s, i) => {
    const m = new THREE.Mesh(variants[i % 3], baseRockMat);
    m.position.set(...s.pos);
    m.scale.set(...s.scale);
    m.rotation.set(...s.rot);
    m.castShadow = true;
    m.receiveShadow = true;
    bridgeGroup.add(m);
  });
  group.add(bridgeGroup);

  return group;
}
