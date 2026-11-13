import * as THREE from 'three';
import {
  getTerrainHeight,
  getTerrainNormal,
  getClearanceFromPathsAndPlazas,
} from './terrain.js';
import { createSeededRandom, noise3D } from '../utils/noise.js';

function mergeGeos(geos) {
  let totalVerts = 0;
  const nonIndexed = geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    totalVerts += ng.attributes.position.count;
    return ng;
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  let vOffset = 0;
  for (let i = 0; i < nonIndexed.length; i++) {
    const g = nonIndexed[i];
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const uv = g.attributes.uv;
    positions.set(pos.array, vOffset * 3);
    if (nrm) normals.set(nrm.array, vOffset * 3);
    if (uv) uvs.set(uv.array, vOffset * 2);
    vOffset += pos.count;
    if (g !== geos[i]) g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return out;
}

function buildTwistedLimb(points, rStart, rEnd, radialSegs = 6) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = Math.max(5, points.length * 3);
  const frames = curve.computeFrenetFrames(segs, false);

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const vtx = new THREE.Vector3();

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const radius = rStart + (rEnd - rStart) * Math.pow(t, 0.82);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    for (let j = 0; j <= radialSegs; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      n.set(
        cos * N.x + sin * B.x,
        cos * N.y + sin * B.y,
        cos * N.z + sin * B.z
      ).normalize();

      vtx.copy(p).addScaledVector(n, radius);
      positions.push(vtx.x, vtx.y, vtx.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(j / radialSegs, t * 3.0);
    }
  }

  const row = radialSegs + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * row + j;
      const b = a + row;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * 构建多簇交叠、带真实松针 UV 展开与凹凸轮廓的泰山松云片团簇
 */
function buildPineCloudCluster(cx, cy, cz, rx, ry, rz, seed = 1) {
  const rng = createSeededRandom(seed);
  const subGeos = [];

  // 每个云片由 3 朵交错小松针团拼合，打破单一椭圆轮廓，呈现苍松参差剪影！
  const lobes = [
    [0, 0.08, 0, 1.0, 1.0, 1.0],
    [-rx * 0.42, -0.05, (rng() - 0.5) * rz * 0.4, 0.72, 0.85, 0.72],
    [rx * 0.42, -0.04, (rng() - 0.5) * rz * 0.4, 0.68, 0.82, 0.68],
  ];

  lobes.forEach(([ox, oy, oz, sx, sy, sz], idx) => {
    const geo = new THREE.IcosahedronGeometry(1.0, 2);
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const tuft = noise3D(v.x * 3.6 + seed + idx * 7, v.y * 3.6, v.z * 3.6 - seed);
      const fine = noise3D(v.x * 8.2, v.y * 8.2 + seed, v.z * 8.2);
      const rMod = 1.0 + tuft * 0.28 + fine * 0.12;

      let py = v.y * rMod;
      if (py < 0) py *= 0.46; // 迎风松冠底平顶簇

      pos.setXYZ(
        i,
        cx + ox + v.x * rMod * rx * sx,
        cy + oy + py * ry * sy,
        cz + oz + v.z * rMod * rz * sz
      );

      n.set(v.x * 0.85 + tuft * 0.3, v.y * 1.15 + 0.25, v.z * 0.85 + fine * 0.3).normalize();
      nrm.setXYZ(i, n.x, n.y, n.z);
      uv.setXY(i, v.x * 0.6 + 0.5, v.z * 0.6 + 0.5);
    }
    subGeos.push(geo);
  });

  return mergeGeos(subGeos);
}

function createTaishanPinePrototype({
  seed = 10,
  height = 6.0,
  leanX = 0.8,
  leanZ = 0.2,
  spread = 1.0,
  isWelcomingPine = false,
}) {
  const rng = createSeededRandom(seed);
  const trunkParts = [];
  const padParts = [];

  const p0 = new THREE.Vector3(0, -0.9, 0); // 树根深扎岩缝
  const p1 = new THREE.Vector3(leanX * 0.22, height * 0.32, leanZ * 0.2);
  const p2 = new THREE.Vector3(
    leanX * 0.68 + (rng() - 0.5) * 0.55,
    height * 0.68,
    leanZ * 0.65 + (rng() - 0.5) * 0.55
  );
  const p3 = new THREE.Vector3(leanX, height, leanZ);

  const baseR = isWelcomingPine ? 0.44 : 0.24 + rng() * 0.07;
  trunkParts.push(buildTwistedLimb([p0, p1, p2, p3], baseR, baseR * 0.28, 7));

  padParts.push(
    buildPineCloudCluster(p3.x, p3.y + 0.12, p3.z, 1.55 * spread, 0.52, 1.48 * spread, seed + 1)
  );

  const numBranches = isWelcomingPine ? 6 : 4;
  for (let b = 0; b < numBranches; b++) {
    const tAttach = 0.42 + (b / numBranches) * 0.5;
    const origin = new THREE.Vector3().lerpVectors(p1, p3, tAttach);
    let angle = b * 2.39996 + rng() * 0.45;
    let reach = (1.5 + rng() * 1.25) * spread;
    let dropY = (rng() - 0.35) * 0.55;

    if (isWelcomingPine && b === 0) {
      angle = Math.PI; // 向西探向十八盘石阶迎客！
      reach = 5.0;
      dropY = -0.45;
    } else if (isWelcomingPine && b === 1) {
      angle = Math.PI * 0.80;
      reach = 3.5;
      dropY = 0.28;
    }

    const mid = new THREE.Vector3(
      origin.x + Math.cos(angle) * reach * 0.55,
      origin.y + dropY * 0.4 - 0.2,
      origin.z + Math.sin(angle) * reach * 0.55
    );
    const tip = new THREE.Vector3(
      origin.x + Math.cos(angle) * reach,
      origin.y + dropY + 0.16,
      origin.z + Math.sin(angle) * reach
    );

    trunkParts.push(buildTwistedLimb([origin, mid, tip], baseR * 0.46, baseR * 0.14, 5));

    const padR = (isWelcomingPine && b === 0 ? 1.95 : 1.15 + rng() * 0.38) * spread;
    padParts.push(
      buildPineCloudCluster(tip.x, tip.y + 0.1, tip.z, padR, 0.46, padR * 0.9, seed + b * 13)
    );
    padParts.push(
      buildPineCloudCluster(mid.x, mid.y + 0.28, mid.z, padR * 0.68, 0.40, padR * 0.65, seed + b * 29)
    );
  }

  return {
    trunkGeo: mergeGeos(trunkParts),
    foliageGeo: mergeGeos(padParts),
  };
}

/**
 * 构建全山苍松翠柏系统（带精细放射松针贴图与凹凸法线！）
 */
export function createTaishanVegetation(sunUniforms, sharedTextures) {
  const group = new THREE.Group();
  group.name = 'TaishanVegetation';

  const barkMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.granite.map,
    color: 0x3e2d22,
    roughness: 0.95,
    metalness: 0.02,
  });

  const pineFoliageMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.pineNeedles.map,
    bumpMap: sharedTextures.pineNeedles.bumpMap,
    bumpScale: 0.28,
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.02,
  });

  pineFoliageMat.customProgramCacheKey = () => 'taishan-pine-foliage-v2';
  pineFoliageMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sunUniforms.uTime;
    shader.uniforms.uSunDir = sunUniforms.uSunDir;
    shader.uniforms.uSunColor = sunUniforms.uSunColor;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying vec3 vPineWorldPos;
        varying vec3 vPineWorldNorm;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPineWorldNorm = normalize(mat3(modelMatrix) * objectNormal);
        vec4 instWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          instWorld = instanceMatrix * instWorld;
          vPineWorldNorm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #endif
        instWorld = modelMatrix * instWorld;
        float swayPhase = instWorld.x * 0.13 + instWorld.z * 0.11 + uTime * 1.45;
        float hMask = clamp((position.y - 1.2) * 0.22, 0.0, 1.0);
        transformed.x += sin(swayPhase) * 0.10 * hMask;
        transformed.z += cos(swayPhase * 0.85) * 0.08 * hMask;
        vPineWorldPos = instWorld.xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vPineWorldPos;
        varying vec3 vPineWorldNorm;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // 叠加在放射松针贴图之上的背阴深墨绿与阳面苍翠冷暖体积感
        float topShade = clamp(normalize(vPineWorldNorm).y * 0.5 + 0.5, 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(0.45, 0.52, 0.46), vec3(1.08, 1.12, 0.96), topShade);`
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 viewDirW = normalize(cameraPosition - vPineWorldPos);
        float backScatter = pow(clamp(dot(viewDirW, -normalize(uSunDir)), 0.0, 1.0), 3.0);
        float rim = 1.0 - abs(dot(normalize(vPineWorldNorm), viewDirW));
        outgoingLight += uSunColor * diffuseColor.rgb * backScatter * (0.4 + 0.6 * rim) * 1.25;
        #include <opaque_fragment>`
      );
  };

  // =========================================================================
  // 一、 传世名松：【十八盘望人松 / 迎客松】 & 【五岳独尊左后侧伴生古松】
  // =========================================================================
  const welcomeProto = createTaishanPinePrototype({
    seed: 8888,
    height: 6.5,
    leanX: -2.0,
    leanZ: 0.3,
    spread: 1.15,
    isWelcomingPine: true,
  });

  // 1) 十八盘迎客松：扎根升仙坊 (-2.5, 84, 140) 东侧岩壁 (5.6, z=137.5)，苍劲探臂而不挡阶
  const welcomeGroup = new THREE.Group();
  const wpX = 5.6, wpZ = 137.5;
  welcomeGroup.position.set(wpX, getTerrainHeight(wpX, wpZ), wpZ);
  const wpTrunk = new THREE.Mesh(welcomeProto.trunkGeo, barkMat);
  wpTrunk.castShadow = true;
  const wpFoliage = new THREE.Mesh(welcomeProto.foliageGeo, pineFoliageMat);
  wpFoliage.castShadow = true;
  wpFoliage.receiveShadow = true;
  welcomeGroup.add(wpTrunk, wpFoliage);
  group.add(welcomeGroup);

  // 2) 五岳独尊伴生苍松：置于奇石左后方山石上 (40.5, -65.2)，衬景而不遮挡半个字！
  const wuyuePineGroup = new THREE.Group();
  const wypX = 40.5, wypZ = -65.2;
  wuyuePineGroup.position.set(wypX, getTerrainHeight(wypX, wypZ), wypZ);
  wuyuePineGroup.rotation.y = 0.65;
  wuyuePineGroup.scale.setScalar(0.95);
  const wypTrunk = new THREE.Mesh(welcomeProto.trunkGeo, barkMat);
  wypTrunk.castShadow = true;
  const wypFol = new THREE.Mesh(welcomeProto.foliageGeo, pineFoliageMat);
  wypFol.castShadow = true;
  wypFol.receiveShadow = true;
  wuyuePineGroup.add(wypTrunk, wypFol);
  group.add(wuyuePineGroup);

  // 3) 大观峰唐摩崖两侧崖肩点景奇松（复刻实景图 zh_14.jpg 削壁苍松意境）
  [
    { x: 15.8, y: 174.2, z: -34.5, ry: 0.4, sc: 0.82 },
    { x: 43.2, y: 174.8, z: -31.5, ry: 2.6, sc: 0.86 },
  ].forEach((cfg) => {
    const g = new THREE.Group();
    g.position.set(cfg.x, cfg.y, cfg.z);
    g.rotation.y = cfg.ry;
    g.scale.setScalar(cfg.sc);
    const t = new THREE.Mesh(welcomeProto.trunkGeo, barkMat);
    const f = new THREE.Mesh(welcomeProto.foliageGeo, pineFoliageMat);
    t.castShadow = true;
    f.castShadow = true;
    g.add(t, f);
    group.add(g);
  });

  // =========================================================================
  // 二、 全山 1700+ 株高山油松集群（严禁遮挡步道、广场与观日视线！）
  // =========================================================================
  const variants = [
    createTaishanPinePrototype({ seed: 101, height: 5.4, leanX: 0.85, leanZ: -0.3, spread: 0.92 }),
    createTaishanPinePrototype({ seed: 202, height: 6.1, leanX: -0.65, leanZ: 0.55, spread: 1.0 }),
    createTaishanPinePrototype({ seed: 303, height: 4.5, leanX: 1.0, leanZ: 0.35, spread: 0.86 }),
  ];

  const lists = [[], [], []];
  const rng = createSeededRandom(202606);

  // 1) 十八盘两侧深谷苍松（复刻实景图 zh_11.jpg 满谷松涛夹白石天梯！）
  for (let i = 0; i < 620; i++) {
    const z = 54 + rng() * 155;
    const axisX = -6.0 * Math.min(1, Math.max(0, (z - 56) / 150));
    const side = rng() > 0.5 ? 1 : -1;
    const distFromStair = 5.5 + Math.pow(rng(), 0.85) * 62;
    const x = axisX + side * distFromStair;

    if (getClearanceFromPathsAndPlazas(x, z) < 4.6) continue;
    const nrm = getTerrainNormal(x, z);
    if (nrm.y < 0.44) continue;

    const y = getTerrainHeight(x, z);
    lists[i % 3].push({
      x, y, z,
      scale: 0.65 + rng() * 0.68,
      rotY: rng() * Math.PI * 2,
      tiltX: (rng() - 0.5) * 0.14,
      tiltZ: -side * (0.05 + rng() * 0.12),
      tint: 0.84 + rng() * 0.32,
    });
  }

  // 2) 岱顶周边与外围群峰苍松（避开拱北石东向观日视廊与仙人桥正南视线）
  for (let i = 0; i < 1380; i++) {
    const r = 20 + Math.pow(rng(), 0.76) * 410;
    const theta = rng() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = -22 + Math.sin(theta) * r * 0.92;

    if (getClearanceFromPathsAndPlazas(x, z) < 5.4) continue;
    // 避开拱北石前方的观日崖口
    if (x > 100 && x < 126 && z > -70 && z < -44) continue;
    // 避开仙人桥正前方视线通道
    if (x > -90 && x < -66 && z > 116 && z < 162) continue;

    const y = getTerrainHeight(x, z);
    if (y < 40 || y > 189) continue;

    const nrm = getTerrainNormal(x, z);
    if (nrm.y < 0.48) continue;

    const altScale = y > 165 ? 0.52 + rng() * 0.42 : 0.72 + rng() * 0.68;
    lists[Math.floor(rng() * 3)].push({
      x, y, z,
      scale: altScale,
      rotY: rng() * Math.PI * 2,
      tiltX: (rng() - 0.5) * 0.12,
      tiltZ: (rng() - 0.5) * 0.12,
      tint: 0.82 + rng() * 0.34,
    });
  }

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  variants.forEach((proto, idx) => {
    const items = lists[idx];
    if (!items.length) return;
    const trunkInst = new THREE.InstancedMesh(proto.trunkGeo, barkMat, items.length);
    const folInst = new THREE.InstancedMesh(proto.foliageGeo, pineFoliageMat, items.length);
    trunkInst.castShadow = true;
    trunkInst.receiveShadow = true;
    folInst.castShadow = true;
    folInst.receiveShadow = true;

    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.tiltX, it.rotY, it.tiltZ);
      dummy.scale.setScalar(it.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
      folInst.setMatrixAt(i, dummy.matrix);
      col.setRGB(it.tint * 0.94, it.tint * 1.04, it.tint * 0.92);
      folInst.setColorAt(i, col);
    });

    trunkInst.instanceMatrix.needsUpdate = true;
    folInst.instanceMatrix.needsUpdate = true;
    if (folInst.instanceColor) folInst.instanceColor.needsUpdate = true;
    group.add(trunkInst, folInst);
  });

  return group;
}
