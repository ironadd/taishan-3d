import * as THREE from 'three';
import { createSeededRandom } from '../utils/noise.js';

const CALLIGRAPHY_FONT = '"Ma Shan Zheng", "STKaiti", "KaiTi", "Noto Serif SC", "SimSun", serif';
const SERIF_FONT = '"Noto Serif SC", "STKaiti", "KaiTi", "Songti SC", "SimSun", serif';

function finalizeTexture(canvas, { srgb = true, repeatX = 1, repeatY = 1 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 绘制斑驳温润的太古花岗岩与高山地衣基底画布
 */
function paintGraniteBase(ctx, w, h, seed = 101, warmTint = 1.0) {
  const rng = createSeededRandom(seed);
  ctx.fillStyle = '#9d968b';
  ctx.fillRect(0, 0, w, h);

  // 大尺度石英亮斑与钾长石暖肉红斑团
  for (let i = 0; i < 220; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 14 + rng() * (w * 0.14);
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    const kind = rng();
    if (kind < 0.38) {
      g.addColorStop(0, `rgba(${Math.round(182 * warmTint)}, 148, 124, 0.25)`);
      g.addColorStop(1, 'rgba(182, 148, 124, 0)');
    } else if (kind < 0.74) {
      g.addColorStop(0, 'rgba(218, 214, 206, 0.26)');
      g.addColorStop(1, 'rgba(218, 214, 206, 0)');
    } else {
      g.addColorStop(0, 'rgba(72, 73, 75, 0.22)');
      g.addColorStop(1, 'rgba(72, 73, 75, 0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 高山苍绿地衣斑块
  for (let i = 0; i < 85; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const rx = 5 + rng() * 20;
    const ry = 4 + rng() * 16;
    ctx.fillStyle = rng() > 0.45 ? 'rgba(98, 110, 88, 0.24)' : 'rgba(76, 82, 72, 0.24)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // 细密花岗岩矿物结晶颗粒噪点
  for (let i = 0; i < 9000; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const sz = 1 + rng() * 2.1;
    const v = rng();
    if (v < 0.33) ctx.fillStyle = 'rgba(48, 48, 50, 0.30)';
    else if (v < 0.68) ctx.fillStyle = 'rgba(230, 226, 216, 0.30)';
    else ctx.fillStyle = 'rgba(186, 148, 122, 0.24)';
    ctx.fillRect(x, y, sz, sz);
  }
}

function carveCalligraphyChar(ctx, ch, x, y, fontSize, {
  color = '#b2281c',
  font = CALLIGRAPHY_FONT,
  weight = '700',
} = {}) {
  ctx.save();
  ctx.font = `${weight} ${fontSize}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(240, 234, 220, 0.52)';
  ctx.fillText(ch, x + fontSize * 0.024, y + fontSize * 0.024);

  ctx.fillStyle = 'rgba(24, 18, 16, 0.78)';
  ctx.fillText(ch, x - fontSize * 0.026, y - fontSize * 0.026);

  ctx.fillStyle = color;
  ctx.fillText(ch, x, y);
  ctx.restore();
}

function carveRecessedFrame(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(58, 54, 50, 0.20)';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = 'rgba(26, 22, 20, 0.68)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(228, 222, 210, 0.45)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.restore();
}

export function createGraniteTextures() {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  paintGraniteBase(ctx, w, h, 8801, 1.03);

  const b = document.createElement('canvas');
  b.width = w; b.height = h;
  const bctx = b.getContext('2d');
  bctx.filter = 'grayscale(100%) contrast(145%)';
  bctx.drawImage(c, 0, 0);

  return {
    map: finalizeTexture(c, { repeatX: 2, repeatY: 2 }),
    bumpMap: finalizeTexture(b, { srgb: false, repeatX: 2, repeatY: 2 }),
  };
}

export function createAshlarStoneTextures(repeatX = 4, repeatY = 2) {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const rng = createSeededRandom(3312);

  paintGraniteBase(ctx, w, h, 3312, 0.96);

  const rows = 8;
  const rowH = h / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const cols = 4;
    const colW = w / cols;
    const offset = (r % 2) * (colW * 0.5);

    for (let k = -1; k <= cols; k++) {
      const bx = k * colW + offset;
      const shade = (rng() - 0.5) * 24;
      ctx.fillStyle = shade > 0
        ? `rgba(232, 228, 218, ${Math.abs(shade) / 180})`
        : `rgba(42, 43, 45, ${Math.abs(shade) / 170})`;
      ctx.fillRect(bx + 2, y + 2, colW - 4, rowH - 4);

      ctx.fillStyle = 'rgba(44, 42, 40, 0.65)';
      ctx.fillRect(bx - 1.5, y, 3, rowH);
    }
    ctx.fillStyle = 'rgba(40, 38, 36, 0.72)';
    ctx.fillRect(0, y - 1.5, w, 3);
    ctx.fillStyle = 'rgba(232, 228, 218, 0.28)';
    ctx.fillRect(0, y + 2, w, 2);
  }

  const b = document.createElement('canvas');
  b.width = w; b.height = h;
  const bctx = b.getContext('2d');
  bctx.filter = 'grayscale(100%) contrast(165%)';
  bctx.drawImage(c, 0, 0);

  return {
    map: finalizeTexture(c, { repeatX, repeatY }),
    bumpMap: finalizeTexture(b, { srgb: false, repeatX, repeatY }),
  };
}

export function createCrimsonWallTexture() {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const rng = createSeededRandom(5509);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#a33128');
  grad.addColorStop(0.72, '#942a22');
  grad.addColorStop(1, '#75201a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 300; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 10 + rng() * 48;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    const warm = rng() > 0.5;
    g.addColorStop(0, warm ? 'rgba(192, 68, 54, 0.12)' : 'rgba(65, 16, 14, 0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return finalizeTexture(c, { repeatX: 2, repeatY: 1 });
}

export function createRoofTileTextures(style = 'yellow', repeatX = 8, repeatY = 3) {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  const palettes = {
    yellow: { dark: '#7c480d', mid: '#cc841b', bright: '#f5b942' },
    gold_bronze: { dark: '#6b4c14', mid: '#c6942c', bright: '#fce08b' },
    grey: { dark: '#272c31', mid: '#485058', bright: '#6b747e' },
  };
  const pal = palettes[style] || palettes.yellow;

  const cols = 16;
  const colW = w / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * colW;
    const g = ctx.createLinearGradient(x, 0, x + colW, 0);
    g.addColorStop(0.0, pal.dark);
    g.addColorStop(0.28, pal.mid);
    g.addColorStop(0.5, pal.bright);
    g.addColorStop(0.75, pal.mid);
    g.addColorStop(1.0, pal.dark);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, colW, h);
  }

  const rows = 12;
  const rowH = h / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(0, y, w, 3.5);
    ctx.fillStyle = 'rgba(255, 248, 220, 0.16)';
    ctx.fillRect(0, y + 3.5, w, 2);
  }

  const b = document.createElement('canvas');
  b.width = w; b.height = h;
  const bctx = b.getContext('2d');
  bctx.filter = 'grayscale(100%) contrast(170%)';
  bctx.drawImage(c, 0, 0);

  return {
    map: finalizeTexture(c, { repeatX, repeatY }),
    bumpMap: finalizeTexture(b, { srgb: false, repeatX, repeatY }),
  };
}

export function createCaihuaBeamTexture() {
  const w = 512, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#1b3f66';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1c5d49';
  ctx.fillRect(0, 18, w, h - 36);

  ctx.strokeStyle = '#e5be67';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 6, w - 8, h - 12);
  ctx.strokeRect(14, 20, w - 28, h - 40);

  for (let x = 28; x < w - 24; x += 48) {
    ctx.fillStyle = '#254f80';
    ctx.fillRect(x, 26, 32, h - 52);
    ctx.strokeStyle = '#f2d07e';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(x, 26, 32, h - 52);

    ctx.fillStyle = '#c84332';
    ctx.beginPath();
    ctx.arc(x + 16, h / 2, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f5d98e';
    ctx.beginPath();
    ctx.arc(x + 16, h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  return finalizeTexture(c, { repeatX: 3, repeatY: 1 });
}

export function createWuYueDuZunTexture() {
  const w = 512, h = 1024;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  paintGraniteBase(ctx, w, h, 1907, 1.06);
  carveRecessedFrame(ctx, 74, 88, w - 148, h - 172);

  const chars = ['五', '嶽', '獨', '尊'];
  const startY = 225;
  const stepY = 192;
  chars.forEach((ch, idx) => {
    carveCalligraphyChar(ctx, ch, w * 0.5, startY + idx * stepY, 162, {
      color: '#b4281c',
      font: SERIF_FONT,
      weight: '900',
    });
  });

  const rightNotes = ['光', '緒', '丁', '未', '孟', '夏'];
  rightNotes.forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, w - 106, 138 + i * 36, 27, {
      color: '#ad2a1e',
      font: SERIF_FONT,
      weight: '700',
    });
  });

  const leftNotes = ['泰', '安', '府', '宗', '室', '玉', '構', '題'];
  leftNotes.forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, 108, 520 + i * 34, 25, {
      color: '#ad2a1e',
      font: SERIF_FONT,
      weight: '700',
    });
  });

  return finalizeTexture(c);
}

export function createAngTouTianWaiTexture() {
  const w = 512, h = 1024;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  paintGraniteBase(ctx, w, h, 1908, 1.03);
  carveRecessedFrame(ctx, 118, 370, w - 236, 470);

  const chars = ['昂', '頭', '天', '外'];
  chars.forEach((ch, idx) => {
    carveCalligraphyChar(ctx, ch, w * 0.5, 442 + idx * 106, 88, {
      color: '#b4281d',
      font: SERIF_FONT,
      weight: '900',
    });
  });

  const subR = ['光', '緒', '戊', '申', '孟', '夏'];
  subR.forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, w - 144, 480 + i * 28, 21, {
      color: '#aa2a1e',
      font: SERIF_FONT,
    });
  });

  return finalizeTexture(c);
}

export function createVerticalSteleTexture(mainChars, subtitleChars = [], seed = 2020) {
  const w = 384, h = 860;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  paintGraniteBase(ctx, w, h, seed, 0.98);
  carveRecessedFrame(ctx, 36, 46, w - 72, h - 92);

  const count = mainChars.length;
  const usableH = h - 180;
  const step = usableH / count;
  const fontSize = Math.min(118, Math.floor(step * 0.84));

  mainChars.forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, w * 0.5, 100 + step * (i + 0.5), fontSize, {
      color: '#b2271c',
      font: SERIF_FONT,
      weight: '900',
    });
  });

  subtitleChars.forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, 74, h - 290 + i * 30, 23, {
      color: '#a6281e',
      font: SERIF_FONT,
      weight: '700',
    });
  });

  return finalizeTexture(c);
}

export function createTangMoyaCliffTexture() {
  const w = 2048, h = 1024;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const rng = createSeededRandom(726);

  paintGraniteBase(ctx, w, h, 726, 1.08);

  const cracksX = [360, 740, 1135, 1820];
  cracksX.forEach((cx) => {
    ctx.strokeStyle = 'rgba(32, 28, 26, 0.58)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    let px = cx;
    ctx.moveTo(px, 0);
    for (let y = 0; y <= h; y += 64) {
      px += (rng() - 0.5) * 18;
      ctx.lineTo(px, y);
    }
    ctx.stroke();
  });

  ctx.fillStyle = 'rgba(224, 198, 166, 0.26)';
  ctx.fillRect(1185, 78, 595, 865);
  carveRecessedFrame(ctx, 1185, 78, 595, 865);

  ['天', '下', '大', '觀'].forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, 1650 - i * 92, 138, 62, {
      color: '#b22c1f',
      font: SERIF_FONT,
      weight: '900',
    });
  });
  ['紀', '泰', '山', '銘'].forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, 1555 - (i % 2) * 76, 212 + Math.floor(i / 2) * 62, 54, {
      color: '#e5b242',
      font: SERIF_FONT,
      weight: '900',
    });
  });

  const sampleGlyphs = '朕宅帝位十有四載夙夜祗畏欽若天道登封泰嶽萬方咸寧乾坤交泰風雨時若永保鴻圖';
  ctx.font = `700 17px ${SERIF_FONT}`;
  for (let col = 0; col < 22; col++) {
    const gx = 1752 - col * 25.5;
    for (let row = 0; row < 29; row++) {
      const gy = 300 + row * 21.5;
      const ch = sampleGlyphs[(col * 13 + row * 7) % sampleGlyphs.length];
      ctx.fillStyle = 'rgba(202, 146, 46, 0.86)';
      ctx.fillText(ch, gx, gy);
    }
  }

  ['壁', '立', '萬', '仞'].forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, 1218, 175 + i * 96, 84, {
      color: '#b6251a',
      font: SERIF_FONT,
      weight: '900',
    });
  });

  ['天', '地', '同', '攸'].forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, 1218, 615 + i * 62, 52, {
      color: '#b6251a',
      font: SERIF_FONT,
      weight: '900',
    });
  });

  carveRecessedFrame(ctx, 810, 560, 210, 380);
  ['置', '身', '霄', '漢'].forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, 905, 618 + i * 86, 78, {
      color: '#b6251a',
      font: SERIF_FONT,
      weight: '900',
    });
  });

  ['呼', '吸', '宇', '宙'].forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, 935, 360 + i * 46, 40, {
      color: '#b0261c',
      font: SERIF_FONT,
      weight: '900',
    });
  });

  carveRecessedFrame(ctx, 430, 520, 240, 415);
  carveCalligraphyChar(ctx, '雲', 595, 580, 68, { color: '#b4251a', font: CALLIGRAPHY_FONT });
  carveCalligraphyChar(ctx, '峯', 495, 580, 68, { color: '#b4251a', font: CALLIGRAPHY_FONT });
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row < 13; row++) {
      const ch = sampleGlyphs[(col * 5 + row * 3) % sampleGlyphs.length];
      ctx.fillStyle = 'rgba(72, 58, 52, 0.72)';
      ctx.fillText(ch, 635 - col * 28, 650 + row * 20);
    }
  }

  return finalizeTexture(c);
}

export function createPlaqueTexture(text, {
  style = 'royal_blue',
  rtl = true,
} = {}) {
  const w = 512, h = 192;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  const chars = text.split('');
  const ordered = rtl ? [...chars].reverse() : chars;

  if (style === 'royal_blue') {
    ctx.fillStyle = '#1f5468';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e7be62';
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, w - 48, h - 48);

    const step = (w - 110) / ordered.length;
    ordered.forEach((ch, i) => {
      carveCalligraphyChar(ctx, ch, 55 + step * (i + 0.5), h * 0.52, Math.min(92, step * 0.78), {
        color: '#f5cf70',
        font: SERIF_FONT,
        weight: '900',
      });
    });
  } else if (style === 'white_marble') {
    ctx.fillStyle = '#dcd9cf';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8b8578';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.strokeStyle = '#b9995a';
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, w - 44, h - 44);

    const step = (w - 100) / ordered.length;
    ordered.forEach((ch, i) => {
      carveCalligraphyChar(ctx, ch, 50 + step * (i + 0.5), h * 0.53, Math.min(82, step * 0.74), {
        color: '#8f6d2c',
        font: SERIF_FONT,
        weight: '900',
      });
    });
  } else {
    paintGraniteBase(ctx, w, h, 6618, 0.96);
    carveRecessedFrame(ctx, 18, 20, w - 36, h - 40);
    const step = (w - 90) / ordered.length;
    ordered.forEach((ch, i) => {
      carveCalligraphyChar(ctx, ch, 45 + step * (i + 0.5), h * 0.52, Math.min(90, step * 0.75), {
        color: '#b42519',
        font: CALLIGRAPHY_FONT,
        weight: '700',
      });
    });
  }

  return finalizeTexture(c);
}

export function createCoupletTexture(lineText) {
  const w = 128, h = 768;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#1f586b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#dfba62';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, w - 12, h - 12);

  const chars = lineText.split('');
  const step = (h - 56) / chars.length;
  chars.forEach((ch, i) => {
    carveCalligraphyChar(ctx, ch, w * 0.5, 28 + step * (i + 0.5), Math.min(48, step * 0.82), {
      color: '#f5d277',
      font: SERIF_FONT,
      weight: '900',
    });
  });

  return finalizeTexture(c);
}

/**
 * 中国古建筑朱红雕花木格扇门窗贴图 + 宣纸窗芯夜间透光遮罩贴图 (emissiveMap)
 */
export function createLatticeWindowTextures() {
  const w = 256, h = 384;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  const e = document.createElement('canvas');
  e.width = w; e.height = h;
  const ectx = e.getContext('2d');
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#5e1812';
  ctx.fillRect(0, 0, w, h);

  const paneX = 22, paneY = 22, paneW = w - 44, paneH = Math.floor(h * 0.64);
  ctx.fillStyle = '#cfc1a7';
  ctx.fillRect(paneX, paneY, paneW, paneH);

  const eg = ectx.createRadialGradient(w / 2, paneY + paneH / 2, 10, w / 2, paneY + paneH / 2, paneH * 0.65);
  eg.addColorStop(0, '#ffcf87');
  eg.addColorStop(1, '#b86b25');
  ectx.fillStyle = eg;
  ectx.fillRect(paneX, paneY, paneW, paneH);

  const drawMullion = (rx, ry, rw, rh) => {
    ctx.fillStyle = '#6d1d16';
    ctx.fillRect(rx, ry, rw, rh);
    ectx.fillStyle = '#000000';
    ectx.fillRect(rx, ry, rw, rh);
  };

  const cols = 6;
  const rows = 8;
  for (let i = 0; i <= cols; i++) {
    const lx = paneX + (paneW / cols) * i - 2.5;
    drawMullion(lx, paneY, 5, paneH);
  }
  for (let j = 0; j <= rows; j++) {
    const ly = paneY + (paneH / rows) * j - 2.5;
    drawMullion(paneX, ly, paneW, 5);
  }
  drawMullion(w / 2 - 5, 0, 10, h);

  const skirtY = paneY + paneH + 14;
  const skirtH = h - skirtY - 18;
  ctx.strokeStyle = '#a87538';
  ctx.lineWidth = 3;
  ctx.strokeRect(26, skirtY, w / 2 - 36, skirtH);
  ctx.strokeRect(w / 2 + 10, skirtY, w / 2 - 36, skirtH);

  return {
    map: finalizeTexture(c),
    emissiveMap: finalizeTexture(e),
  };
}

/**
 * 泰山油松放射状苍劲松针团簇纹理 + 凹凸贴图
 */
export function createPineNeedleTextures() {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const rng = createSeededRandom(4409);

  ctx.fillStyle = '#162917';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 680; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const needles = 10 + Math.floor(rng() * 10);
    const len = 11 + rng() * 20;
    const bright = rng();

    ctx.fillStyle = 'rgba(9, 18, 10, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();

    const rCol = Math.round(28 + bright * 42);
    const gCol = Math.round(58 + bright * 64);
    const bCol = Math.round(26 + bright * 28);
    ctx.strokeStyle = `rgba(${rCol}, ${gCol}, ${bCol}, 0.90)`;
    ctx.lineWidth = 1.6;

    for (let n = 0; n < needles; n++) {
      const ang = (n / needles) * Math.PI * 2 + rng() * 0.35;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      ctx.stroke();
    }
  }

  const b = document.createElement('canvas');
  b.width = w; b.height = h;
  const bctx = b.getContext('2d');
  bctx.filter = 'grayscale(100%) contrast(175%)';
  bctx.drawImage(c, 0, 0);

  return {
    map: finalizeTexture(c, { repeatX: 3, repeatY: 2 }),
    bumpMap: finalizeTexture(b, { srgb: false, repeatX: 3, repeatY: 2 }),
  };
}
