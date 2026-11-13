// 确定性伪随机数与多尺度地质噪声工具库

export function createSeededRandom(seed = 1545) {
  let s = seed >>> 0;
  return function rand() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 构建固定置换表以保证所有地形、岩石、树木完全确定且可复现
const PERM = new Uint8Array(512);
const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];
const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

(function initPerm() {
  const rng = createSeededRandom(20261545);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// 2D 梯度柏林噪声 [-1, 1]
export function noise2D(x, y) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[X] + Y] % 12;
  const ab = PERM[PERM[X] + Y + 1] % 12;
  const ba = PERM[PERM[X + 1] + Y] % 12;
  const bb = PERM[PERM[X + 1] + Y + 1] % 12;

  const gAA = GRAD2[aa][0] * xf + GRAD2[aa][1] * yf;
  const gBA = GRAD2[ba][0] * (xf - 1) + GRAD2[ba][1] * yf;
  const gAB = GRAD2[ab][0] * xf + GRAD2[ab][1] * (yf - 1);
  const gBB = GRAD2[bb][0] * (xf - 1) + GRAD2[bb][1] * (yf - 1);

  return lerp(lerp(gAA, gBA, u), lerp(gAB, gBB, u), v) * 1.42;
}

// 3D 梯度柏林噪声 [-1, 1]
export function noise3D(x, y, z) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);
  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const A = PERM[X] + Y;
  const AA = PERM[A] + Z;
  const AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y;
  const BA = PERM[B] + Z;
  const BB = PERM[B + 1] + Z;

  const dot3 = (gi, dx, dy, dz) => {
    const g = GRAD3[gi % 12];
    return g[0] * dx + g[1] * dy + g[2] * dz;
  };

  return lerp(
    lerp(
      lerp(dot3(PERM[AA], xf, yf, zf), dot3(PERM[BA], xf - 1, yf, zf), u),
      lerp(dot3(PERM[AB], xf, yf - 1, zf), dot3(PERM[BB], xf - 1, yf - 1, zf), u),
      v
    ),
    lerp(
      lerp(dot3(PERM[AA + 1], xf, yf, zf - 1), dot3(PERM[BA + 1], xf - 1, yf, zf - 1), u),
      lerp(dot3(PERM[AB + 1], xf, yf - 1, zf - 1), dot3(PERM[BB + 1], xf - 1, yf - 1, zf - 1), u),
      v
    ),
    w
  );
}

// 标准分形布朗运动 FBM
export function fbm2D(x, y, octaves = 5, lacunarity = 2.05, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, y * freq);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}

// 山脊多倍频噪声 Ridged Multifractal [0, 1] —— 塑造泰山硬朗山脊与岩石节理棱线
export function ridged2D(x, y, octaves = 5, lacunarity = 2.12, gain = 0.52) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let weight = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise2D(x * freq, y * freq));
    n = n * n * weight;
    weight = clamp(n * 1.8, 0.15, 1);
    sum += n * amp;
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}

// 块状断层阶梯化函数 —— 赋予泰山太古片麻岩特有的断块抬升台阶感
export function blockyStrata(h, stepSize = 8.0, sharpness = 0.55) {
  const idx = Math.floor(h / stepSize);
  const frac = h / stepSize - idx;
  const shaped = lerp(frac, smoothstep(0.5 - (1 - sharpness) * 0.45, 0.5 + (1 - sharpness) * 0.45, frac), sharpness);
  return (idx + shaped) * stepSize;
}

// 计算二维点 (px, pz) 到三维折线段 (ax, ay, az) -> (bx, by, bz) 的水平投影距离与插值高度
export function distAndHeightToSegment(px, pz, ax, ay, az, bx, by, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 1e-6 ? clamp((wx * vx + wz * vz) / lenSq, 0, 1) : 0;
  const cx = ax + vx * t;
  const cz = az + vz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return {
    dist: Math.sqrt(dx * dx + dz * dz),
    y: ay + (by - ay) * t,
    t,
  };
}
