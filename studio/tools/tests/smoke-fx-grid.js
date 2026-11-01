// چیپ‌های افکت، زمان انتخابی، گرید و بستهٔ پروژه
// اجرا:  npm i jsdom  &&  node studio/tools/tests/smoke-fx-grid.js
// (فقط برای توسعه؛ هیچ وابستگی‌ای در زمان اجرای داشبورد لازم نیست)

const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(require('path').join(__dirname, '..', '..', 'lyrax-studio-pro-v4-weather.html'), 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.test/studio/',

  beforeParse(win) {
    win.URL.createObjectURL = () => 'blob:stub';
    win.URL.revokeObjectURL = () => {};
    // --- canvas 2D stub (jsdom بدون node-canvas) ---
    function makeCtx(canvas) {
      const grad = { addColorStop() {} };
      return new Proxy({ canvas }, {
        get(t, p) {
          if (p in t) return t[p];
          if (p === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
          if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => grad;
          if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
          if (p === 'putImageData') return () => {};
          if (p === 'isPointInPath') return () => false;
          return () => {};
        },
        set(t, p, v) { t[p] = v; return true; }
      });
    }
    win.HTMLCanvasElement.prototype.getContext = function () {
      if (!this._ctx) this._ctx = makeCtx(this);
      return this._ctx;
    };
    win.HTMLCanvasElement.prototype.captureStream = function () { return { getVideoTracks: () => [], getAudioTracks: () => [] }; };
win.AudioContext = function () {
  return { state: 'running', resume: () => Promise.resolve(), createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [] } }),
    createAnalyser: () => ({ fftSize: 2048, frequencyBinCount: 1024, connect(){}, disconnect(){}, getByteFrequencyData(){} }),
    createGain: () => ({ gain: { value: 1, setValueAtTime(){}, linearRampToValueAtTime(){} }, connect(){}, disconnect(){} }),
    createBiquadFilter: () => ({ type:'', frequency:{value:0}, gain:{value:0}, Q:{value:1}, connect(){}, disconnect(){} }),
    createBufferSource: () => ({ buffer:null, connect(){}, start(){}, stop(){} }),
    destination: {}, currentTime: 0, close: () => Promise.resolve(), sampleRate: 44100 };
};
win.MediaRecorder = function () { this.state = 'inactive'; this.start = () => { this.state='recording'; }; this.stop = () => { this.state='inactive'; if (this.onstop) this.onstop(); }; this.requestData = () => {}; };
    win.MediaRecorder.isTypeSupported = () => false;
    win.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,AAA'; };
  },
  virtualConsole: new (require('jsdom').VirtualConsole)()
    .on('jsdomError', e => errors.push('jsdomError: ' + (e.stack || e.message).split('\n').slice(0,4).join(' | ')))
    .on('error', (...a) => errors.push('console.error: ' + a.join(' ').slice(0, 300)))
});

const w = dom.window;
w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
w.HTMLMediaElement.prototype.pause = function () {};



setTimeout(() => {
  const out = [];
  const ok = (n, c, extra) => out.push((c ? '✅' : '❌') + ' ' + n + (extra ? ' → ' + extra : ''));

  // ---- ۱) چیپ‌های افکت در تب ۱
  const chips = [...w.document.querySelectorAll('#quickFxRow .fx-chip')];
  ok('چیپ‌های افکت‌های آماده', chips.length === 7, chips.map(c => c.textContent.trim()).join(' | '));

  // ---- ۲) انتخاب زمان + ثبت افکت در همان ثانیه
  w.setSelectedTimelineTime(12.34);
  ok('چیپ زمان انتخابی', w.document.getElementById('fxTimeChip').textContent.includes('12.34'),
     w.document.getElementById('fxTimeChip').textContent.trim());
  w.fxTriggerFromUI('fireworks');
  const evs = w.LyraxFx.getTimelineEvents();
  ok('افکت در ثانیهٔ انتخابی ثبت شد', evs.length === 1 && Math.abs(evs[0].t - 12.34) < 0.001,
     JSON.stringify(evs.map(e => ({ t: e.t, type: e.type }))));
  w.clearSelectedTimelineTime();
  ok('لغو انتخاب زمان', w.document.getElementById('fxTimeChip').textContent.includes('همین لحظه'));

  // ---- ۳) مدت کلیپ = آخرین رخداد + 2
  const dur = w.getClipDuration();
  const fxEnd = Math.max(...w.LyraxFx.getTimelineEvents().map(e => e.t + (e.duration || 1)));
  const lineEnd = Math.max(0, ...w.eval('recordedScenario').map(r => (r.end_time || r.start_time + 4)));
  const expect = Math.max(10, Math.max(fxEnd, lineEnd) + 2);
  ok('مدت کلیپ = آخرین رخداد + ۲ ثانیه', Math.abs(dur - expect) < 0.05, dur.toFixed(2) + 's → ' + w.formatClock(dur));

  // ---- ۴) گرید: ۷ ستون + دکمهٔ ⏱ + ستون افکت ردیف
  w.renderDataGrid();
  const body = w.document.getElementById('dataGridBody');
  const rows = [...body.querySelectorAll('tr')];
  const heads = [...w.document.querySelectorAll('#dataGridBody')].length;
  const ths = [...w.document.querySelectorAll('.datagrid-container table thead th')].map(t=>t.textContent.trim());
  const dtRow = rows.find(r => r.textContent.includes('آتش‌بازی'));
  ok('ردیف افکت در گرید', !!dtRow);
  ok('ستون‌های گرید شامل «افکت این ردیف»', ths.some(t => t.includes('افکت این ردیف')), ths.join(' / '));
  ok('دکمهٔ ⏱ روی ردیف', !!(dtRow && dtRow.querySelector('td[data-row-start] button')));
  ok('sel+➕ روی ردیف', !!(dtRow && dtRow.querySelector('.row-fx-box select') && dtRow.querySelector('.row-fx-box button')));

  // ---- ۵) ثبت افکت از روی ردیف گرید
  if (dtRow) {
    const sel = dtRow.querySelector('.row-fx-box select');
    sel.value = 'lightning_storm';
    w.addRowEffect(dtRow.querySelector('.row-fx-box button'), 3.5, 'fx', 0);
    const after = w.LyraxFx.getTimelineEvents();
    ok('افکت ردیف در ثانیهٔ ردیف ثبت شد', after.some(e => e.type === 'lightning_storm' && Math.abs(e.t - 3.5) < 0.001),
       JSON.stringify(after.map(e => ({ t: e.t, type: e.type }))));
  }

  // ---- ۶) بستهٔ پروژه
  w.document.getElementById('projectName').value = 'آهنگ تست';
  const proj = w.buildMasterProjectObject();
  ok('JSON پروژه شامل layer_fx', Array.isArray(proj.layer_fx) && proj.layer_fx.length > 0, proj.layer_fx.length + ' افکت');
  ok('JSON پروژه شامل مدت کلیپ', typeof proj.clip_duration === 'number', proj.clip_duration);
  ok('JSON پروژه شامل storm_lightning_defaults', !!proj.storm_lightning_defaults, JSON.stringify(proj.storm_lightning_defaults).slice(0,80));
  ok('اسکریپت MP4 تولید شد', w.eval('typeof MAKE_MP4_SH') === 'string' && w.eval('MAKE_MP4_SH').includes('libx264'));

  console.log(out.join('\n'));
  console.log('\n--- errors (' + errors.length + ') ---');
  errors.slice(0, 8).forEach(e => console.log(e));
  process.exit(errors.length ? 1 : 0);
}, 800);
