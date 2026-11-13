import * as THREE from 'three';
import {
  MAIN_TRAIL_POINTS,
  BIXIA_TRAIL_POINTS,
  RIGUAN_TRAIL_POINTS,
} from './blueprint.js';
import {
  createPlaqueTexture,
  createCoupletTexture,
  createVerticalSteleTexture,
} from './textures.js';

/**
 * 构建带真实举折凹曲面与四角飞檐起翘的中国古建歇山/庑殿屋顶组合体
 */
function createChineseRoof({
  width = 12,
  depth = 8,
  height = 3.2,
  eaveOverhang = 1.35,
  cornerLift = 0.65,
  tileMat,
  ridgeMat,
  isGableHip = true,
}) {
  const roofGroup = new THREE.Group();
  const totalW = width + eaveOverhang * 2;
  const totalD = depth + eaveOverhang * 2;
  const segX = 22;
  const segZ = 18;

  const geo = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];

  const ridgeHalfLen = Math.max(width * 0.28, (totalW - totalD * 0.82) * 0.5);

  const surfaceYAt = (x, z) => {
    const absX = Math.abs(x);
    const normZ = Math.abs(z) / (totalD * 0.5);
    const dxRidge = Math.max(0, absX - ridgeHalfLen) / Math.max(0.01, totalW * 0.5 - ridgeHalfLen);
    const r = Math.max(normZ, dxRidge);
    let y = height * Math.pow(Math.max(0, 1.0 - r), 1.46);
    const normX = absX / (totalW * 0.5);
    y += cornerLift * Math.pow(normX * normZ, 1.85);
    return { y, r };
  };

  for (let iz = 0; iz <= segZ; iz++) {
    const vz = iz / segZ;
    const z = (vz - 0.5) * totalD;
    for (let ix = 0; ix <= segX; ix++) {
      const vx = ix / segX;
      const x = (vx - 0.5) * totalW;
      const { y, r } = surfaceYAt(x, z);
      positions.push(x, y, z);
      uvs.push(vx * (totalW * 0.48), r * 2.4);
    }
  }

  const row = segX + 1;
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const doubleTileMat = tileMat.clone();
  doubleTileMat.side = THREE.DoubleSide;
  const surfaceMesh = new THREE.Mesh(geo, doubleTileMat);
  surfaceMesh.castShadow = true;
  surfaceMesh.receiveShadow = true;
  roofGroup.add(surfaceMesh);

  // 歇山顶平整山花博风板（采用标准三角拉伸棱柱，杜绝圆锥法线反光伪影）
  if (isGableHip && ridgeHalfLen > 0.4) {
    const gShape = new THREE.Shape();
    const gw = depth * 0.28;
    const gh = height * 0.48;
    gShape.moveTo(-gw, 0);
    gShape.lineTo(gw, 0);
    gShape.lineTo(0, gh);
    gShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gShape, { depth: 0.18, bevelEnabled: false });
    gableGeo.translate(0, 0, -0.09);

    [-1, 1].forEach((dir) => {
      const g = new THREE.Mesh(gableGeo, ridgeMat);
      g.rotation.y = dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      g.position.set(dir * ridgeHalfLen, height * 0.48, 0);
      roofGroup.add(g);
    });
  }

  // 正脊梁 + 两端吞脊鸱吻
  const mainRidgeLen = ridgeHalfLen * 2 + 0.55;
  const mainRidge = new THREE.Mesh(new THREE.BoxGeometry(mainRidgeLen, 0.38, 0.34), ridgeMat);
  mainRidge.position.set(0, height + 0.12, 0);
  mainRidge.castShadow = true;
  roofGroup.add(mainRidge);

  [-1, 1].forEach((side) => {
    const chiwen = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.82, 0.40), ridgeMat);
    chiwen.position.set(side * (mainRidgeLen * 0.5), height + 0.34, 0);
    chiwen.rotation.z = -side * 0.22;
    roofGroup.add(chiwen);
  });

  // 贴合凹曲屋面的四条垂脊曲线与仙人走兽翘角
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  corners.forEach(([sx, sz]) => {
    const curvePts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const cx = sx * (ridgeHalfLen + (totalW * 0.5 - ridgeHalfLen) * t);
      const cz = sz * (totalD * 0.5 * t);
      const { y } = surfaceYAt(cx, cz);
      curvePts.push(new THREE.Vector3(cx, y + 0.08, cz));
    }
    const hipCurve = new THREE.CatmullRomCurve3(curvePts);
    const tubeGeo = new THREE.TubeGeometry(hipCurve, 8, 0.10, 6, false);
    const tubeMesh = new THREE.Mesh(tubeGeo, ridgeMat);
    roofGroup.add(tubeMesh);

    const tipPt = curvePts[curvePts.length - 1];
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.52, 5), ridgeMat);
    finial.position.set(tipPt.x + sx * 0.06, tipPt.y + 0.22, tipPt.z + sz * 0.06);
    finial.rotation.z = -sx * 0.32;
    finial.rotation.x = sz * 0.32;
    roofGroup.add(finial);
  });

  return roofGroup;
}

/**
 * 构建带半圆拱券通道的城门台基（底部深扎 3.2m 地基裙墙）
 */
function createArchedGateWall({
  width = 22,
  height = 8.0,
  depth = 11.0,
  archRadius = 2.35,
  archSpringY = 2.7,
  wallMat,
  stoneMat,
}) {
  const group = new THREE.Group();

  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.5, 0);
  shape.lineTo(-archRadius, 0);
  shape.lineTo(-archRadius, archSpringY);
  shape.absarc(0, archSpringY, archRadius, Math.PI, 0, true);
  shape.lineTo(archRadius, 0);
  shape.lineTo(width * 0.5, 0);
  shape.lineTo(width * 0.5, height);
  shape.lineTo(-width * 0.5, height);
  shape.closePath();

  const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 24,
  });
  extrudeGeo.translate(0, 0, -depth * 0.5);
  const pos = extrudeGeo.attributes.position;
  const uv = extrudeGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) * 0.14, pos.getY(i) * 0.14);
  }

  const wallMesh = new THREE.Mesh(extrudeGeo, wallMat);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  const sideW = (width - archRadius * 2) * 0.5;
  [-1, 1].forEach((s) => {
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(sideW + 0.14, archSpringY + 3.2, depth + 0.28),
      stoneMat
    );
    plinth.position.set(s * (archRadius + sideW * 0.5), (archSpringY - 3.2) * 0.5, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);
  });

  const archRingGeo = new THREE.RingGeometry(archRadius - 0.02, archRadius + 0.52, 24, 1, 0, Math.PI);
  [-1, 1].forEach((sideZ) => {
    const ring = new THREE.Mesh(archRingGeo, stoneMat);
    ring.position.set(0, archSpringY, sideZ * (depth * 0.5 + 0.08));
    if (sideZ < 0) ring.rotation.y = Math.PI;
    group.add(ring);
  });

  const vaultGeo = new THREE.CylinderGeometry(
    archRadius - 0.03,
    archRadius - 0.03,
    depth - 0.1,
    20,
    1,
    true,
    0,
    Math.PI
  );
  vaultGeo.rotateZ(-Math.PI * 0.5);
  vaultGeo.rotateY(Math.PI * 0.5);
  const whiteVaultMat = new THREE.MeshStandardMaterial({
    color: 0xdcdad3,
    roughness: 0.9,
    side: THREE.BackSide,
  });
  const vaultMesh = new THREE.Mesh(vaultGeo, whiteVaultMat);
  vaultMesh.position.set(0, archSpringY, 0);
  group.add(vaultMesh);

  return group;
}

/**
 * 构建传统殿堂主体（配备 3.4m 深扎石台基、雕花木格扇门窗、无遮挡牌匾与飞檐屋顶）
 */
function createClassicalHall({
  width = 12,
  depth = 8,
  wallH = 4.2,
  plinthH = 1.2,
  roofH = 3.2,
  overhang = 1.4,
  doubleEave = false,
  wallMat,
  stoneMat,
  caihuaMat,
  tileMat,
  ridgeMat,
  windowMat,
  plaqueText = '',
  plaqueStyle = 'royal_blue',
}) {
  const hall = new THREE.Group();

  const skirtDepth = 5.6;
  const totalPlinthH = plinthH + skirtDepth;
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(width + 1.1, totalPlinthH, depth + 1.1),
    stoneMat
  );
  plinth.position.y = plinthH - totalPlinthH * 0.5;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  hall.add(plinth);

  // 正门前条石踏跺台阶
  if (plinthH >= 0.5) {
    const stepW = Math.min(width * 0.42, 4.6);
    const stepBox = new THREE.Mesh(
      new THREE.BoxGeometry(stepW, plinthH + 1.4, 1.35),
      stoneMat
    );
    stepBox.position.set(0, (plinthH - 1.4) * 0.5 - 0.12, depth * 0.5 + 0.95);
    stepBox.castShadow = true;
    stepBox.receiveShadow = true;
    hall.add(stepBox);
  }

  const baseTop = plinthH;

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, wallH, depth), wallMat);
  body.position.y = baseTop + wallH * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  hall.add(body);

  const bays = Math.max(3, Math.round(width / 2.8));
  const bayW = width / bays;
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8d231b, roughness: 0.62 });
  for (let i = 0; i <= bays; i++) {
    const px = -width * 0.5 + i * bayW;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, wallH, 10), pillarMat);
    col.position.set(px, baseTop + wallH * 0.5, depth * 0.5 + 0.07);
    col.castShadow = true;
    hall.add(col);

    if (i < bays && windowMat) {
      const isCenterDoor = i === Math.floor(bays * 0.5);
      const winH = isCenterDoor ? wallH * 0.76 : wallH * 0.60;
      const winY = isCenterDoor ? baseTop + winH * 0.5 : baseTop + wallH * 0.52;
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(bayW * 0.66, winH),
        windowMat
      );
      pane.position.set(px + bayW * 0.5, winY, depth * 0.5 + 0.04);
      hall.add(pane);
    }
  }

  const beamH = 0.68;
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.36, beamH, depth + 0.36),
    caihuaMat
  );
  beam.position.y = baseTop + wallH + beamH * 0.45;
  hall.add(beam);

  let roofStartY = baseTop + wallH + beamH * 0.8;

  if (doubleEave) {
    const lowerRoof = createChineseRoof({
      width: width + 0.8,
      depth: depth + 0.8,
      height: roofH * 0.46,
      eaveOverhang: overhang * 1.05,
      cornerLift: 0.52,
      tileMat,
      ridgeMat,
      isGableHip: false,
    });
    lowerRoof.position.y = roofStartY - 0.12;
    hall.add(lowerRoof);

    const upperCore = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.86, 1.24, depth * 0.84),
      caihuaMat
    );
    upperCore.position.y = roofStartY + 0.84;
    hall.add(upperCore);
    roofStartY += 1.40;
  }

  const mainRoof = createChineseRoof({
    width: doubleEave ? width * 0.88 : width,
    depth: doubleEave ? depth * 0.86 : depth,
    height: roofH,
    eaveOverhang: overhang,
    cornerLift: 0.64,
    tileMat,
    ridgeMat,
    isGableHip: true,
  });
  mainRoof.position.y = roofStartY;
  hall.add(mainRoof);

  if (plaqueText) {
    const pTex = createPlaqueTexture(plaqueText, { style: plaqueStyle, rtl: true });
    const pMat = new THREE.MeshStandardMaterial({ map: pTex, roughness: 0.42, metalness: 0.18 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b2818, roughness: 0.6 });
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(2.45, 0.88, 0.14),
      [frameMat, frameMat, frameMat, frameMat, pMat, frameMat]
    );
    // 重檐殿宇牌匾悬挂于下檐额枋正下方，彻底避免被下层挑檐遮挡！
    const py = doubleEave ? baseTop + wallH - 0.28 : baseTop + wallH + 0.16;
    plaque.position.set(0, py, depth * 0.5 + 0.22);
    plaque.rotation.x = 0.10;
    hall.add(plaque);
  }

  return hall;
}

/**
 * 构建冲天式石牌坊（升仙坊 & 天街四柱三间盘龙石坊）
 */
function createStoneArchway({
  fourPillars = true,
  title = '天街',
  stoneMat,
  greyTileMat,
}) {
  const arch = new THREE.Group();
  const pillarPositions = fourPillars ? [-5.2, -1.95, 1.95, 5.2] : [-2.35, 2.35];
  const pillarHeights = fourPillars ? [6.5, 8.1, 8.1, 6.5] : [6.8, 6.8];

  pillarPositions.forEach((px, idx) => {
    const h = pillarHeights[idx];
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.56, h + 2.2, 0.56), stoneMat);
    col.position.set(px, (h - 2.2) * 0.5, 0);
    col.castShadow = true;
    col.receiveShadow = true;
    arch.add(col);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.45, 8), stoneMat);
    cap.position.set(px, h + 0.22, 0);
    arch.add(cap);

    const baseDrum = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.8, 1.55), stoneMat);
    baseDrum.position.set(px, 0.05, 0);
    arch.add(baseDrum);

    [-1, 1].forEach((sz) => {
      const lion = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.68, 0.46), stoneMat);
      lion.position.set(px, 1.15, sz * 0.56);
      arch.add(lion);
    });

    if (fourPillars) {
      for (let t = 0; t < 7; t++) {
        const ang = t * 1.15;
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.1, 6, 12), stoneMat);
        coil.position.set(px, h - 2.3 + t * 0.3, 0);
        coil.rotation.x = Math.PI * 0.5 + Math.sin(ang) * 0.28;
        coil.rotation.y = ang;
        arch.add(coil);
      }
    }
  });

  const centerSpan = 3.9;
  const mainBeam = new THREE.Mesh(new THREE.BoxGeometry(centerSpan + 0.6, 0.65, 0.45), stoneMat);
  mainBeam.position.set(0, 4.4, 0);
  arch.add(mainBeam);

  const subBeam = new THREE.Mesh(new THREE.BoxGeometry(centerSpan + 0.6, 0.48, 0.42), stoneMat);
  subBeam.position.set(0, 5.65, 0);
  arch.add(subBeam);

  const plaqueTex = createPlaqueTexture(title, { style: 'stone_arch', rtl: true });
  const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.8 });
  const plaqueBox = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.96, 0.48),
    [stoneMat, stoneMat, stoneMat, stoneMat, plaqueMat, plaqueMat]
  );
  plaqueBox.position.set(0, 5.05, 0);
  arch.add(plaqueBox);

  const centerRoof = createChineseRoof({
    width: 3.6,
    depth: 1.4,
    height: 1.15,
    eaveOverhang: 0.65,
    cornerLift: 0.32,
    tileMat: greyTileMat,
    ridgeMat: stoneMat,
    isGableHip: true,
  });
  centerRoof.position.set(0, 6.05, 0);
  arch.add(centerRoof);

  if (fourPillars) {
    [-3.58, 3.58].forEach((sx) => {
      const sideBeam1 = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.55, 0.42), stoneMat);
      sideBeam1.position.set(sx, 3.65, 0);
      arch.add(sideBeam1);

      const sideBeam2 = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.48, 0.4), stoneMat);
      sideBeam2.position.set(sx, 4.45, 0);
      arch.add(sideBeam2);

      const sideRoof = createChineseRoof({
        width: 2.8,
        depth: 1.25,
        height: 0.95,
        eaveOverhang: 0.52,
        cornerLift: 0.26,
        tileMat: greyTileMat,
        ridgeMat: stoneMat,
        isGableHip: true,
      });
      sideRoof.position.set(sx, 4.82, 0);
      arch.add(sideRoof);
    });
  }

  return arch;
}

/**
 * 构建全山连续平滑盘道石阶、条石广场台地、青白石望柱栏杆及皇家道教古建筑群
 */
export function createTaishanArchitecture(sharedTextures) {
  const root = new THREE.Group();
  root.name = 'TaishanArchitecture';

  const stoneMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.ashlar.map,
    bumpMap: sharedTextures.ashlar.bumpMap,
    bumpScale: 0.16,
    color: 0xc8c3ba,
    roughness: 0.86,
  });

  const balustradeMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.granite.map,
    color: 0xd6d5d0,
    roughness: 0.78,
  });

  const crimsonWallMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.crimsonWall,
    roughness: 0.84,
  });

  const caihuaMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.caihua,
    roughness: 0.55,
  });

  const yellowGlazeMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.yellowTile.map,
    bumpMap: sharedTextures.yellowTile.bumpMap,
    bumpScale: 0.14,
    roughness: 0.28,
    metalness: 0.15,
  });
  const yellowRidgeMat = new THREE.MeshStandardMaterial({
    color: 0xe6a128,
    roughness: 0.3,
    metalness: 0.22,
  });

  const goldenBronzeTileMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.goldTile.map,
    bumpMap: sharedTextures.goldTile.bumpMap,
    bumpScale: 0.15,
    color: 0xffdf85,
    roughness: 0.24,
    metalness: 0.82,
  });
  const goldenBronzeRidgeMat = new THREE.MeshStandardMaterial({
    color: 0xf7cf65,
    roughness: 0.22,
    metalness: 0.88,
  });

  const greyTileMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.greyTile.map,
    bumpMap: sharedTextures.greyTile.bumpMap,
    bumpScale: 0.14,
    roughness: 0.72,
    metalness: 0.08,
  });
  const greyRidgeMat = new THREE.MeshStandardMaterial({
    color: 0x525a63,
    roughness: 0.76,
  });

  const windowGlowMat = new THREE.MeshStandardMaterial({
    map: sharedTextures.latticeWindow.map,
    emissiveMap: sharedTextures.latticeWindow.emissiveMap,
    emissive: new THREE.Color(0xff9d3b),
    emissiveIntensity: 0.0,
    roughness: 0.62,
  });

  const lanternGlowMat = new THREE.MeshStandardMaterial({
    color: 0xcf2d1f,
    emissive: new THREE.Color(0xff5e24),
    emissiveIntensity: 0.2,
    roughness: 0.42,
  });

  const nightPointLights = [];
  const addLanternPair = (parent, xL, xR, y, z, withPointLight = false) => {
    [xL, xR].forEach((lx) => {
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), lanternGlowMat);
      lantern.scale.set(1.0, 1.28, 1.0);
      lantern.position.set(lx, y, z);
      parent.add(lantern);
    });
    if (withPointLight) {
      const pt = new THREE.PointLight(0xff8e3c, 0, 26, 1.6);
      pt.position.set((xL + xR) * 0.5, y - 0.3, z + 0.8);
      parent.add(pt);
      nightPointLights.push(pt);
    }
  };

  // =========================================================================
  // 一、 基于连续平滑样条曲线采样构建无缝登山条石天梯与精准对齐青白石护栏
  // =========================================================================
  const stepTransforms = [];
  const postTransforms = [];
  const railMatrices = [];

  const dummy = new THREE.Object3D();
  const ptCur = new THREE.Vector3();
  const ptTan = new THREE.Vector3();

  function sampleSmoothTrail(points, railMaskFn, includeSteps = true) {
    const curve3 = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      false,
      'catmullrom',
      0.16
    );
    const totalLen = curve3.getLength();

    const getInterpWidth = (u) => {
      const fIdx = u * (points.length - 1);
      const i0 = Math.min(points.length - 1, Math.floor(fIdx));
      const i1 = Math.min(points.length - 1, i0 + 1);
      const frac = fIdx - i0;
      return points[i0].width + (points[i1].width - points[i0].width) * frac;
    };

    if (includeSteps) {
      const stepSpacing = 0.72;
      const numSteps = Math.max(4, Math.ceil(totalLen / stepSpacing));
      for (let i = 0; i <= numSteps; i++) {
        const u = i / numSteps;
        curve3.getPointAt(u, ptCur);
        curve3.getTangentAt(u, ptTan);
        const yaw = Math.atan2(ptTan.x, ptTan.z);
        const w = getInterpWidth(u);

        // 踏面高出设计线 +0.05m，底部深扎厚实石砌盘道挡墙路基，100% 凌驾于清表地面之上且绝不悬空！
        stepTransforms.push({
          x: ptCur.x,
          y: ptCur.y - 3.15,
          z: ptCur.z,
          yaw,
          sx: w,
          sy: 6.40,
          sz: stepSpacing * 1.42,
        });
      }
    }

    const postSpacing = 2.6;
    const numPosts = Math.max(2, Math.round(totalLen / postSpacing));
    const leftPosts = [];
    const rightPosts = [];

    for (let i = 0; i <= numPosts; i++) {
      const u = i / numPosts;
      curve3.getPointAt(u, ptCur);
      curve3.getTangentAt(u, ptTan);
      const horizLen = Math.hypot(ptTan.x, ptTan.z) || 1;
      const rx = ptTan.z / horizLen;
      const rz = -ptTan.x / horizLen;
      const yaw = Math.atan2(ptTan.x, ptTan.z);
      const halfW = getInterpWidth(u) * 0.5 - 0.18;
      const mask = railMaskFn ? railMaskFn(ptCur.x, ptCur.z, u) : { left: true, right: true };

      if (mask.left) {
        const lp = new THREE.Vector3(ptCur.x - rx * halfW, ptCur.y, ptCur.z - rz * halfW);
        postTransforms.push({ x: lp.x, y: lp.y + 0.25, z: lp.z, yaw });
        leftPosts.push(lp);
      } else {
        leftPosts.push(null);
      }

      if (mask.right) {
        const rp = new THREE.Vector3(ptCur.x + rx * halfW, ptCur.y, ptCur.z + rz * halfW);
        postTransforms.push({ x: rp.x, y: rp.y + 0.25, z: rp.z, yaw });
        rightPosts.push(rp);
      } else {
        rightPosts.push(null);
      }
    }

    [leftPosts, rightPosts].forEach((arr) => {
      for (let i = 0; i < arr.length - 1; i++) {
        const p0 = arr[i];
        const p1 = arr[i + 1];
        if (!p0 || !p1) continue;
        const dist = p0.distanceTo(p1);
        if (dist > 4.2 || dist < 0.1) continue;

        dummy.position.set(
          (p0.x + p1.x) * 0.5,
          (p0.y + p1.y) * 0.5 + 0.52,
          (p0.z + p1.z) * 0.5
        );
        dummy.lookAt(p1.x, p1.y + 0.52, p1.z);
        dummy.scale.set(0.16, 0.52, dist + 0.08);
        dummy.updateMatrix();
        railMatrices.push(dummy.matrix.clone());
      }
    });
  }

  sampleSmoothTrail(MAIN_TRAIL_POINTS, (x, z) => {
    if (z > 39 && z < 59 && Math.abs(x) < 6) return { left: false, right: false };
    if (x > 15 && x < 59 && z > 14 && z < 32) {
      const atBixiaJunction = x > 52;
      return { left: false, right: !atBixiaJunction };
    }
    if (z < -16 && z > -29 && x > 18 && x < 30) return { left: true, right: false };
    if (z < -49 && z > -61 && x > 22 && x < 35) return { left: true, right: false };
    if (z < -81.5) return { left: false, right: false };
    return { left: true, right: true };
  });

  sampleSmoothTrail(BIXIA_TRAIL_POINTS, (x, z) => {
    if (z < 13.5 && x > 74) return { left: false, right: false };
    return { left: true, right: true };
  });

  sampleSmoothTrail(RIGUAN_TRAIL_POINTS, (x) => {
    if (x > 94) return { left: false, right: false };
    return { left: true, right: true };
  });

  // 日观峰观日台东缘半圆临崖护栏 + 实心花岗岩观日石台！
  const riguanTerraceGeo = new THREE.CylinderGeometry(8.1, 8.8, 5.6, 20);
  const riguanTerrace = new THREE.Mesh(riguanTerraceGeo, stoneMat);
  riguanTerrace.position.set(101.5, 178.0 - 2.75, -56.0);
  riguanTerrace.castShadow = true;
  riguanTerrace.receiveShadow = true;
  root.add(riguanTerrace);

  const riguanArc = [];
  for (let k = 0; k <= 8; k++) {
    const ang = -Math.PI * 0.44 + (k / 8) * Math.PI * 0.88;
    riguanArc.push({
      x: 101.5 + Math.cos(ang) * 7.7,
      y: 178.05,
      z: -56.0 + Math.sin(ang) * 7.5,
      width: 0.4,
    });
  }
  sampleSmoothTrail(riguanArc, () => ({ left: false, right: true }), false);

  // 五岳独尊与孔子小天下处条石铺装观景坪（消除绿草穿地，深厚挡土石基直抵崖底）
  const wuyueTerrace = new THREE.Mesh(new THREE.BoxGeometry(14.5, 6.0, 11.5), stoneMat);
  wuyueTerrace.position.set(32.5, 179.0 - 2.96, -56.5);
  wuyueTerrace.castShadow = true;
  wuyueTerrace.receiveShadow = true;
  root.add(wuyueTerrace);

  const confuciusTerrace = new THREE.Mesh(new THREE.BoxGeometry(9.8, 6.4, 8.4), stoneMat);
  confuciusTerrace.position.set(19.8, 184.0 - 3.16, -69.5);
  confuciusTerrace.castShadow = true;
  confuciusTerrace.receiveShadow = true;
  root.add(confuciusTerrace);

  const stepInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneMat, stepTransforms.length);
  stepInst.castShadow = true;
  stepInst.receiveShadow = true;
  stepTransforms.forEach((s, i) => {
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.set(s.sx, s.sy, s.sz);
    dummy.updateMatrix();
    stepInst.setMatrixAt(i, dummy.matrix);
  });
  stepInst.instanceMatrix.needsUpdate = true;
  root.add(stepInst);

  const postInst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.30, 1.85, 0.30),
    balustradeMat,
    postTransforms.length
  );
  postInst.castShadow = true;
  postInst.receiveShadow = true;
  postTransforms.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postInst.setMatrixAt(i, dummy.matrix);
  });
  postInst.instanceMatrix.needsUpdate = true;
  root.add(postInst);

  const railInst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    balustradeMat,
    railMatrices.length
  );
  railInst.castShadow = true;
  railInst.receiveShadow = true;
  railMatrices.forEach((mat4, i) => {
    railInst.setMatrixAt(i, mat4);
  });
  railInst.instanceMatrix.needsUpdate = true;
  root.add(railInst);

  // =========================================================================
  // 二、【升仙坊】 十八盘咽喉双柱冲天石坊 (-2.5, 84.0, 140.0)
  // =========================================================================
  const shengxianArch = createStoneArchway({
    fourPillars: false,
    title: '升仙坊',
    stoneMat: balustradeMat,
    greyTileMat,
  });
  shengxianArch.position.set(-2.5, 84.0, 140.0);
  shengxianArch.rotation.y = -0.05;
  root.add(shengxianArch);

  // =========================================================================
  // 三、【南天门与摩空阁 + 南北条石门庭 + 西翼悬崖红墙配殿群】 (0, 142.0, 50.0)
  // =========================================================================
  const nantianmenGroup = new THREE.Group();
  nantianmenGroup.position.set(0, 142.0, 50.0);
  root.add(nantianmenGroup);

  // 南北两侧铺设宽整条石门庭台基，彻底杜绝山坡绿草爬上南天门红墙！
  const ntmSouthCourt = new THREE.Mesh(new THREE.BoxGeometry(24.0, 6.0, 11.0), stoneMat);
  ntmSouthCourt.position.set(0, -2.98, 8.2);
  ntmSouthCourt.receiveShadow = true;
  nantianmenGroup.add(ntmSouthCourt);

  const ntmNorthCourt = new THREE.Mesh(new THREE.BoxGeometry(21.0, 6.0, 11.5), stoneMat);
  ntmNorthCourt.position.set(0, -2.96, -8.2);
  ntmNorthCourt.receiveShadow = true;
  nantianmenGroup.add(ntmNorthCourt);

  const gateWall = createArchedGateWall({
    width: 22.5,
    height: 8.2,
    depth: 11.2,
    archRadius: 2.35,
    archSpringY: 2.65,
    wallMat: crimsonWallMat,
    stoneMat,
  });
  nantianmenGroup.add(gateWall);

  const parapetMat = new THREE.MeshStandardMaterial({ color: 0x7c8288, roughness: 0.85 });
  const frontParapet = new THREE.Mesh(new THREE.BoxGeometry(22.9, 1.02, 0.55), parapetMat);
  frontParapet.position.set(0, 8.68, 5.4);
  nantianmenGroup.add(frontParapet);

  const backParapet = frontParapet.clone();
  backParapet.position.set(0, 8.68, -5.4);
  nantianmenGroup.add(backParapet);

  const ntmPlaqueTex = createPlaqueTexture('南天門', { style: 'royal_blue', rtl: true });
  const ntmFrameMat = new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.6 });
  const ntmPlaqueMat = new THREE.MeshStandardMaterial({ map: ntmPlaqueTex, roughness: 0.4, metalness: 0.2 });
  const ntmPlaque = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 1.25, 0.18),
    [ntmFrameMat, ntmFrameMat, ntmFrameMat, ntmFrameMat, ntmPlaqueMat, ntmFrameMat]
  );
  ntmPlaque.position.set(0, 6.35, 5.68);
  nantianmenGroup.add(ntmPlaque);

  const coupletMatR = new THREE.MeshStandardMaterial({ map: createCoupletTexture('門闢九霄仰步三天勝蹟'), roughness: 0.45 });
  const cRight = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 4.5, 0.14),
    [ntmFrameMat, ntmFrameMat, ntmFrameMat, ntmFrameMat, coupletMatR, ntmFrameMat]
  );
  cRight.position.set(3.45, 4.1, 5.66);
  nantianmenGroup.add(cRight);

  const coupletMatL = new THREE.MeshStandardMaterial({ map: createCoupletTexture('階崇萬級俯臨千嶂奇觀'), roughness: 0.45 });
  const cLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 4.5, 0.14),
    [ntmFrameMat, ntmFrameMat, ntmFrameMat, ntmFrameMat, coupletMatL, ntmFrameMat]
  );
  cLeft.position.set(-3.45, 4.1, 5.66);
  nantianmenGroup.add(cLeft);

  addLanternPair(nantianmenGroup, -4.6, 4.6, 6.2, 5.85, true);

  const mokongPavilion = createClassicalHall({
    width: 13.6,
    depth: 7.8,
    wallH: 4.3,
    plinthH: 0.35,
    roofH: 3.4,
    overhang: 1.55,
    doubleEave: true,
    wallMat: crimsonWallMat,
    stoneMat,
    caihuaMat,
    tileMat: yellowGlazeMat,
    ridgeMat: yellowRidgeMat,
    windowMat: windowGlowMat,
    plaqueText: '摩空閣',
    plaqueStyle: 'white_marble',
  });
  mokongPavilion.position.set(0, 8.2, 0);
  nantianmenGroup.add(mokongPavilion);

  // 西翼延伸红墙与间距充裕的两座青瓦配殿
  const westWingWall = new THREE.Mesh(new THREE.BoxGeometry(28.5, 9.6, 3.4), crimsonWallMat);
  westWingWall.position.set(-25.0, 1.8, 1.8);
  westWingWall.castShadow = true;
  westWingWall.receiveShadow = true;
  nantianmenGroup.add(westWingWall);

  const westHall1 = createClassicalHall({
    width: 9.8,
    depth: 6.0,
    wallH: 3.6,
    plinthH: 1.2,
    roofH: 2.6,
    overhang: 1.15,
    doubleEave: false,
    wallMat: crimsonWallMat,
    stoneMat,
    caihuaMat,
    tileMat: greyTileMat,
    ridgeMat: greyRidgeMat,
    windowMat: windowGlowMat,
  });
  westHall1.position.set(-19.2, 4.6, -1.2);
  nantianmenGroup.add(westHall1);

  const westHall2 = createClassicalHall({
    width: 8.4,
    depth: 5.8,
    wallH: 3.5,
    plinthH: 1.4,
    roofH: 2.5,
    overhang: 1.12,
    doubleEave: false,
    wallMat: crimsonWallMat,
    stoneMat,
    caihuaMat,
    tileMat: greyTileMat,
    ridgeMat: greyRidgeMat,
    windowMat: windowGlowMat,
  });
  westHall2.position.set(-31.8, 4.9, -1.3);
  nantianmenGroup.add(westHall2);

  // =========================================================================
  // 四、【天街 · 四柱三间盘龙石坊、条石古街长廊与平行对齐古肆客栈群】
  // =========================================================================
  const tianjieArch = createStoneArchway({
    fourPillars: true,
    title: '天街',
    stoneMat: balustradeMat,
    greyTileMat,
  });
  tianjieArch.position.set(14.2, 145.2, 29.8);
  // 垂直横跨天街步道，正面朝向南天门方向来客！
  tianjieArch.rotation.y = -1.18;
  root.add(tianjieArch);

  // 整条天街与商铺前院铺装倾斜花岗岩条石长台，彻底消除红框内的草坡穿入！
  const tianjieTerraceGroup = new THREE.Group();
  tianjieTerraceGroup.position.set(35.5, 148.55, 20.2);
  tianjieTerraceGroup.rotation.y = 0.275; // 与天街严格平行！
  const tjSlabGeo = new THREE.BoxGeometry(45.0, 5.8, 16.2, 12, 1, 1);
  const tjPos = tjSlabGeo.attributes.position;
  for (let i = 0; i < tjPos.count; i++) {
    const lx = tjPos.getX(i);
    tjPos.setY(i, tjPos.getY(i) + lx * 0.148);
  }
  tjSlabGeo.computeVertexNormals();
  const tjSlabMesh = new THREE.Mesh(tjSlabGeo, stoneMat);
  tjSlabMesh.position.y = -2.88;
  tjSlabMesh.castShadow = true;
  tjSlabMesh.receiveShadow = true;
  tianjieTerraceGroup.add(tjSlabMesh);
  root.add(tianjieTerraceGroup);

  // 三座天街古肆茶楼：正门 (+Z) 全部以 rotY = +0.275 平行面向天街石板路，屋檐留足胡同间隙！
  const shopsConfig = [
    { x: 22.8, y: 146.9, z: 19.6, w: 8.6, d: 5.6, rotY: 0.275, plaque: '蓬萊驛' },
    { x: 34.2, y: 148.6, z: 16.2, w: 9.4, d: 5.8, rotY: 0.275, plaque: '白雲居' },
    { x: 45.4, y: 150.3, z: 12.9, w: 8.4, d: 5.6, rotY: 0.275, plaque: '岱宗茗' },
  ];
  shopsConfig.forEach((sc, idx) => {
    const shop = createClassicalHall({
      width: sc.w,
      depth: sc.d,
      wallH: 3.8 + (idx % 2) * 0.4,
      plinthH: 1.0,
      roofH: 2.35,
      overhang: 1.08,
      doubleEave: false,
      wallMat: crimsonWallMat,
      stoneMat,
      caihuaMat,
      tileMat: greyTileMat,
      ridgeMat: greyRidgeMat,
      windowMat: windowGlowMat,
      plaqueText: sc.plaque,
      plaqueStyle: 'royal_blue',
    });
    shop.position.set(sc.x, sc.y, sc.z);
    shop.rotation.y = sc.rotY;
    addLanternPair(shop, -sc.w * 0.36, sc.w * 0.36, 4.2, sc.d * 0.5 + 0.52, idx === 1);
    root.add(shop);
  });

  // =========================================================================
  // 五、【碧霞祠高山道教宫观群 · 严整无遮挡二进重台与 360 垄鎏金铜瓦金顶】 (80.0, 156.0, -10.0)
  // =========================================================================
  const bixiaGroup = new THREE.Group();
  bixiaGroup.position.set(80.0, 156.0, -10.0);
  root.add(bixiaGroup);

  // 满铺整座宫观院落的花岗岩条石大台基（顶面 y = 156.04m，高出开挖地面 0.62m，寸草不侵！）
  const bxFoundation = new THREE.Mesh(new THREE.BoxGeometry(39.6, 9.2, 46.8), stoneMat);
  bxFoundation.position.set(0, -4.56, -1.0);
  bxFoundation.castShadow = true;
  bxFoundation.receiveShadow = true;
  bixiaGroup.add(bxFoundation);

  const wallThick = 0.85;
  const wallHeight = 3.8;
  [-18.8, 18.8].forEach((wx) => {
    const wMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallHeight, 44.8), crimsonWallMat);
    wMesh.position.set(wx, wallHeight * 0.5, -1.0);
    wMesh.castShadow = true;
    wMesh.receiveShadow = true;
    bixiaGroup.add(wMesh);
  });
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(38.4, wallHeight + 2.4, wallThick), crimsonWallMat);
  northWall.position.set(0, (wallHeight + 2.4) * 0.5, -23.4);
  bixiaGroup.add(northWall);

  // 南山门红墙券洞 (z = +20.2 -> 世界坐标 z = +10.2，正接 BIXIA_TRAIL 终点 z = 11.8！)
  const southGateWall = createArchedGateWall({
    width: 38.4,
    height: 4.2,
    depth: 3.2,
    archRadius: 2.05,
    archSpringY: 2.05,
    wallMat: crimsonWallMat,
    stoneMat,
  });
  southGateWall.position.set(0, 0, 20.2);
  bixiaGroup.add(southGateWall);

  const shanmenPavilion = createClassicalHall({
    width: 11.2,
    depth: 5.2,
    wallH: 3.3,
    plinthH: 0.2,
    roofH: 2.45,
    overhang: 1.15,
    doubleEave: false,
    wallMat: crimsonWallMat,
    stoneMat,
    caihuaMat,
    tileMat: greyTileMat,
    ridgeMat: greyRidgeMat,
    windowMat: windowGlowMat,
    plaqueText: '碧霞祠',
    plaqueStyle: 'royal_blue',
  });
  shanmenPavilion.position.set(0, 4.1, 20.2);
  addLanternPair(shanmenPavilion, -4.0, 4.0, 3.0, 3.1, true);
  bixiaGroup.add(shanmenPavilion);

  // 院落对称礼制布局：前隅钟鼓楼 (z=15.6) -> 御碑亭 (z=8.8) -> 东西配殿 (z=-2.2)，间距朗阔零碰撞！
  [-1, 1].forEach((dir) => {
    const tower = createClassicalHall({
      width: 4.6,
      depth: 4.6,
      wallH: 4.6,
      plinthH: 0.8,
      roofH: 2.15,
      overhang: 0.95,
      doubleEave: true,
      wallMat: crimsonWallMat,
      stoneMat,
      caihuaMat,
      tileMat: greyTileMat,
      ridgeMat: greyRidgeMat,
      windowMat: windowGlowMat,
    });
    tower.position.set(dir * 13.8, 0.04, 15.4);
    bixiaGroup.add(tower);

    const stelePavilion = createClassicalHall({
      width: 3.8,
      depth: 3.8,
      wallH: 2.9,
      plinthH: 0.7,
      roofH: 1.95,
      overhang: 0.88,
      doubleEave: false,
      wallMat: crimsonWallMat,
      stoneMat,
      caihuaMat,
      tileMat: yellowGlazeMat,
      ridgeMat: yellowRidgeMat,
    });
    stelePavilion.position.set(dir * 7.6, 0.04, 8.6);
    bixiaGroup.add(stelePavilion);

    const sideHall = createClassicalHall({
      width: 10.4,
      depth: 4.8,
      wallH: 3.5,
      plinthH: 0.8,
      roofH: 2.25,
      overhang: 0.95,
      doubleEave: false,
      wallMat: crimsonWallMat,
      stoneMat,
      caihuaMat,
      tileMat: greyTileMat,
      ridgeMat: greyRidgeMat,
      windowMat: windowGlowMat,
    });
    sideHall.position.set(dir * 14.0, 0.04, -2.0);
    sideHall.rotation.y = dir < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    bixiaGroup.add(sideHall);
  });

  // 院心大铜香炉与明代万历/嘉靖双铜碑（配独立石须弥座）
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0x78643c,
    roughness: 0.34,
    metalness: 0.80,
  });
  const censerPedestal = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 2.8), balustradeMat);
  censerPedestal.position.set(0, 0.3, -1.2);
  bixiaGroup.add(censerPedestal);

  const censer = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.85, 1.65, 12), bronzeMat);
  censer.position.set(0, 1.38, -1.2);
  censer.castShadow = true;
  bixiaGroup.add(censer);

  [-4.8, 4.8].forEach((bx) => {
    const steleBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.9), balustradeMat);
    steleBase.position.set(bx, 0.32, -4.2);
    bixiaGroup.add(steleBase);

    const bronzeStele = new THREE.Mesh(new THREE.BoxGeometry(1.05, 3.5, 0.4), bronzeMat);
    bronzeStele.position.set(bx, 2.35, -4.2);
    bronzeStele.castShadow = true;
    bixiaGroup.add(bronzeStele);
  });

  // 二进高崇石雕丹墀月台 + 御路台阶 + 五开间九脊重檐歇山顶【碧霞元君大殿（360垄鎏金铜瓦）】
  const mainTerrace = new THREE.Mesh(new THREE.BoxGeometry(26.4, 2.6, 13.6), stoneMat);
  mainTerrace.position.set(0, 1.32, -15.6);
  mainTerrace.castShadow = true;
  mainTerrace.receiveShadow = true;
  bixiaGroup.add(mainTerrace);

  const terraceStairs = new THREE.Mesh(new THREE.BoxGeometry(5.8, 2.4, 3.2), balustradeMat);
  terraceStairs.position.set(0, 1.15, -7.8);
  terraceStairs.rotation.x = 0.32;
  bixiaGroup.add(terraceStairs);

  const bixiaMainHall = createClassicalHall({
    width: 18.8,
    depth: 10.0,
    wallH: 5.2,
    plinthH: 0.8,
    roofH: 4.3,
    overhang: 1.78,
    doubleEave: true,
    wallMat: crimsonWallMat,
    stoneMat,
    caihuaMat,
    tileMat: goldenBronzeTileMat,
    ridgeMat: goldenBronzeRidgeMat,
    windowMat: windowGlowMat,
    plaqueText: '贊化東皇',
    plaqueStyle: 'royal_blue',
  });
  bixiaMainHall.position.set(0, 2.6, -15.8);
  addLanternPair(bixiaMainHall, -6.2, 6.2, 5.0, 5.6, true);
  bixiaGroup.add(bixiaMainHall);

  // =========================================================================
  // 六、【玉皇顶 · 1545米泰山极顶庙宇、极顶石碑与古登封台】 (0, 193.2, -95.0)
  // =========================================================================
  const yuhuangGroup = new THREE.Group();
  yuhuangGroup.position.set(0, 193.2, -95.0);
  root.add(yuhuangGroup);

  // 宽阔四方收分条石极顶高台（顶面 y = 193.24m，高于清表地面 0.62m，开阔无遮挡！）
  const yhFortGeo = new THREE.CylinderGeometry(14.8, 17.8, 8.6, 4);
  yhFortGeo.rotateY(Math.PI * 0.25);
  const yhFort = new THREE.Mesh(yhFortGeo, stoneMat);
  yhFort.scale.set(1.36, 1.0, 1.28);
  yhFort.position.set(0, -4.26, 0);
  yhFort.castShadow = true;
  yhFort.receiveShadow = true;
  yuhuangGroup.add(yhFort);

  const yuhuangHall = createClassicalHall({
    width: 12.4,
    depth: 6.6,
    wallH: 4.1,
    plinthH: 0.9,
    roofH: 2.95,
    overhang: 1.24,
    doubleEave: false,
    wallMat: crimsonWallMat,
    stoneMat,
    caihuaMat,
    tileMat: greyTileMat,
    ridgeMat: greyRidgeMat,
    windowMat: windowGlowMat,
    plaqueText: '玉皇頂',
    plaqueStyle: 'royal_blue',
  });
  yuhuangHall.position.set(0, 0.04, -7.2);
  addLanternPair(yuhuangHall, -4.2, 4.2, 4.2, 3.8, true);
  yuhuangGroup.add(yuhuangHall);

  // 东西迎旭亭与望河亭（前移至 z = +2.2, x = ±10.4，与正殿屋檐完全错开零重叠！）
  [-10.4, 10.4].forEach((tx) => {
    const sidePav = createClassicalHall({
      width: 4.2,
      depth: 4.2,
      wallH: 2.95,
      plinthH: 0.6,
      roofH: 1.95,
      overhang: 0.86,
      doubleEave: false,
      wallMat: crimsonWallMat,
      stoneMat,
      caihuaMat,
      tileMat: greyTileMat,
      ridgeMat: greyRidgeMat,
      windowMat: windowGlowMat,
    });
    sidePav.position.set(tx, 0.04, 2.2);
    yuhuangGroup.add(sidePav);
  });

  // 院心「泰山極頂 1545米」石碑与八角祈福护栏
  const jidingTex = createVerticalSteleTexture(['泰', '山', '極', '頂'], ['1', '5', '4', '5', '米'], 1545);
  const jidingStele = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 2.65, 0.45),
    [
      stoneMat, stoneMat, stoneMat, stoneMat,
      new THREE.MeshStandardMaterial({ map: jidingTex, roughness: 0.8 }),
      stoneMat,
    ]
  );
  jidingStele.position.set(0, 1.54, 2.4);
  jidingStele.castShadow = true;
  yuhuangGroup.add(jidingStele);

  const fenceRingMat = balustradeMat.clone();
  fenceRingMat.side = THREE.DoubleSide;
  const fenceRing = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.4, 0.95, 8, 1, true),
    fenceRingMat
  );
  fenceRing.position.set(0, 0.52, 2.4);
  yuhuangGroup.add(fenceRing);

  const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xc92519, roughness: 0.6 });
  for (let a = 0; a < 8; a++) {
    const theta = (a / 8) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.18, 0.24), balustradeMat);
    post.position.set(Math.cos(theta) * 2.34, 0.63, 2.4 + Math.sin(theta) * 2.34);
    yuhuangGroup.add(post);

    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.14), goldenBronzeRidgeMat);
    lock.position.set(Math.cos(theta + 0.35) * 2.32, 0.90, 2.4 + Math.sin(theta + 0.35) * 2.32);
    lock.rotation.y = -theta;
    yuhuangGroup.add(lock);

    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, 0.07), ribbonMat);
    rib.position.set(Math.cos(theta + 0.45) * 2.32, 0.70, 2.4 + Math.sin(theta + 0.45) * 2.32);
    yuhuangGroup.add(rib);
  }

  // 西南侧帝王封禅祭天【古登封臺】（移出正殿外，醒目独立展示！）
  const dengfengAltar = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.05, 3.8), balustradeMat);
  dengfengAltar.position.set(-8.4, 0.56, 8.0);
  dengfengAltar.castShadow = true;
  dengfengAltar.receiveShadow = true;
  yuhuangGroup.add(dengfengAltar);

  const dengfengTex = createVerticalSteleTexture(['古', '登', '封', '臺'], [], 1770);
  const dengfengStele = new THREE.Mesh(
    new THREE.BoxGeometry(0.88, 2.35, 0.4),
    [
      stoneMat, stoneMat, stoneMat, stoneMat,
      new THREE.MeshStandardMaterial({ map: dengfengTex, roughness: 0.82 }),
      stoneMat,
    ]
  );
  dengfengStele.position.set(-8.4, 2.22, 8.0);
  dengfengStele.castShadow = true;
  yuhuangGroup.add(dengfengStele);

  return {
    group: root,
    nightPointLights,
    windowGlowMat,
    lanternGlowMat,
  };
}
