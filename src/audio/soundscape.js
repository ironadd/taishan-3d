// 纯 Web Audio API 程序化合成：泰山松涛山风 + 碧霞祠古铜晨钟 + 幽谷山鸟

export function createTaishanSoundscape() {
  let ctx = null;
  let masterGain = null;
  let enabled = false;
  let bellTimer = null;
  let birdTimer = null;

  function initAudio() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.0001;
    masterGain.connect(ctx.destination);

    // 1. 合成连续粉红/布朗噪声缓冲作为高山松涛声源
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.025 * white) / 1.025;
      lastOut = data[i];
      data[i] *= 2.8;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buffer;
    noiseSrc.loop = true;

    // 低沉穿谷风 + 松针沙沙高频风
    const lowWindFilter = ctx.createBiquadFilter();
    lowWindFilter.type = 'bandpass';
    lowWindFilter.frequency.value = 240;
    lowWindFilter.Q.value = 1.4;

    const pineSighFilter = ctx.createBiquadFilter();
    pineSighFilter.type = 'bandpass';
    pineSighFilter.frequency.value = 780;
    pineSighFilter.Q.value = 2.2;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.24;

    // 慢速阵风 LFO 调制松涛起伏
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(pineSighFilter.frequency);
    lfo.start();

    noiseSrc.connect(lowWindFilter);
    noiseSrc.connect(pineSighFilter);
    lowWindFilter.connect(windGain);
    pineSighFilter.connect(windGain);
    windGain.connect(masterGain);
    noiseSrc.start();
  }

  // 2. 敲响一声浑厚悠远的碧霞祠古铜钟
  function strikeTempleBell() {
    if (!ctx || !enabled) return;
    const now = ctx.currentTime;
    // 中国古钟特有的泛音列（含双音扁钟微拍频余韵）
    const partials = [
      { freq: 146.8, amp: 0.22, decay: 6.8 },
      { freq: 147.4, amp: 0.14, decay: 6.2 }, // 微拍频泛音阵阵回荡
      { freq: 293.6, amp: 0.12, decay: 4.8 },
      { freq: 441.2, amp: 0.07, decay: 3.4 },
      { freq: 712.0, amp: 0.035, decay: 2.0 },
    ];

    partials.forEach((p) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, now);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(p.amp, now + 0.035);
      g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

      osc.connect(g);
      g.connect(masterGain);
      osc.start(now);
      osc.stop(now + p.decay + 0.1);
    });

    bellTimer = setTimeout(strikeTempleBell, 14000 + Math.random() * 9000);
  }

  // 3. 空谷清脆山鸟鸣啭
  function playMountainBird() {
    if (!ctx || !enabled) return;
    const now = ctx.currentTime;
    const baseF = 1850 + Math.random() * 650;
    const notes = 2 + Math.floor(Math.random() * 2);

    for (let i = 0; i < notes; i++) {
      const t0 = now + i * 0.19;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseF, t0);
      osc.frequency.exponentialRampToValueAtTime(baseF * 1.32, t0 + 0.07);
      osc.frequency.exponentialRampToValueAtTime(baseF * 0.94, t0 + 0.14);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.035, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);

      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    }

    birdTimer = setTimeout(playMountainBird, 6500 + Math.random() * 8000);
  }

  function toggle() {
    initAudio();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    enabled = !enabled;
    const now = ctx.currentTime;
    if (enabled) {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), now);
      masterGain.gain.exponentialRampToValueAtTime(0.75, now + 1.2);
      clearTimeout(bellTimer);
      clearTimeout(birdTimer);
      bellTimer = setTimeout(strikeTempleBell, 800);
      birdTimer = setTimeout(playMountainBird, 3200);
    } else {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      clearTimeout(bellTimer);
      clearTimeout(birdTimer);
    }
    return enabled;
  }

  return { toggle, isEnabled: () => enabled };
}
