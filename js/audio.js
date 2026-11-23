/* 背景音乐：用 Web Audio 实时合成的轻快小调循环（不依赖外部音频文件）。默认关闭，点击「♪」开启。 */
const Music = (function () {
  const MELODY = [523, 0, 659, 0, 784, 659, 523, 0, 587, 0, 698, 0, 880, 784, 698, 0];
  const BASS   = [131, 0, 0, 0, 147, 0, 0, 0, 110, 0, 0, 0, 123, 0, 0, 0];
  const STEP = 60 / 120 / 2; // 120 BPM，八分音符
  let ctx = null, master = null, timer = null, next = 0, step = 0, on = false;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.06;
    master.connect(ctx.destination);
    return true;
  }

  function tone(freq, t, dur, type, vol) {
    if (!freq) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function pump() {
    while (next < ctx.currentTime + 0.25) {
      tone(MELODY[step], next, STEP * 0.9, 'square', 0.5);
      tone(BASS[step], next, STEP * 1.8, 'triangle', 0.7);
      next += STEP;
      step = (step + 1) % MELODY.length;
    }
  }

  function start() {
    if (!ensure()) return false;
    ctx.resume();
    next = ctx.currentTime + 0.1;
    timer = setInterval(pump, 100);
    on = true;
    return true;
  }

  function stop() {
    clearInterval(timer);
    on = false;
    if (ctx) ctx.suspend();
  }

  return {
    toggle() { on ? stop() : start(); return on; },
    isOn() { return on; }
  };
})();
