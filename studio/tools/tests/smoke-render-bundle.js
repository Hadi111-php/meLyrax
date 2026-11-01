// رندر بدون لیریکس، مدت کلیپ، توقف دستی و دانلود بسته
// اجرا:  npm i jsdom  &&  node studio/tools/tests/smoke-render-bundle.js
// (فقط برای توسعه؛ هیچ وابستگی‌ای در زمان اجرای داشبورد لازم نیست)

const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(require('path').join(__dirname, '..', '..', 'lyrax-studio-pro-v4-weather.html'), 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/studio/',
  beforeParse(win) {
    win.URL.createObjectURL = () => 'blob:stub';
    win.URL.revokeObjectURL = () => {};
    function makeCtx(canvas) {
      const grad = { addColorStop() {} };
      return new Proxy({ canvas }, { get(t, p) {
        if (p in t) return t[p];
        if (p === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => grad;
        if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        return () => {};
      }, set(t, p, v) { t[p] = v; return true; } });
    }
    win.HTMLCanvasElement.prototype.getContext = function () { if (!this._ctx) this._ctx = makeCtx(this); return this._ctx; };
    win.HTMLCanvasElement.prototype.captureStream = function () { return { getVideoTracks: () => [{ kind: 'video' }], getAudioTracks: () => [] }; };
    win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
    win.HTMLMediaElement.prototype.play = () => Promise.resolve();
    win.HTMLMediaElement.prototype.pause = () => {};
    win.AudioContext = function () {
      return { state: 'running', resume: () => Promise.resolve(), createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [] } }),
        createAnalyser: () => ({ fftSize: 2048, frequencyBinCount: 1024, connect(){}, disconnect(){}, getByteFrequencyData(){} }),
        createGain: () => ({ gain: { value: 1, setValueAtTime(){}, linearRampToValueAtTime(){} }, connect(){}, disconnect(){} }),
        createBiquadFilter: () => ({ frequency:{value:0}, gain:{value:0}, Q:{value:1}, connect(){}, disconnect(){} }),
        createBufferSource: () => ({ connect(){}, start(){}, stop(){} }), destination: {}, currentTime: 0, close: () => Promise.resolve(), sampleRate: 44100 };
    };
    win.MediaStream = function (tracks) { this._tracks = tracks || []; this.getTracks = () => this._tracks; this.getVideoTracks = () => this._tracks.filter(t => t.kind === 'video'); this.getAudioTracks = () => this._tracks.filter(t => t.kind === 'audio'); };
    win.MediaRecorder = function () { this.state = 'inactive'; this.start = () => { this.state = 'recording'; }; this.stop = () => { this.state = 'inactive'; try { if (this.ondataavailable) this.ondataavailable({ data: new win.Blob([new Uint8Array([1,2,3,4])], { type: 'video/webm' }) }); } catch(e) {} try { if (this.onstop) this.onstop(); } catch(e) { errors.push('onstop: ' + e.message); } }; this.requestData = () => {}; };
    win.MediaRecorder.isTypeSupported = (m) => true;
    win.alert = (m) => errors.push('ALERT: ' + m);
  },
  virtualConsole: new (require('jsdom').VirtualConsole)()
    .on('jsdomError', e => errors.push('jsdomError: ' + (e.message || e).toString().slice(0, 200)))
    .on('error', (...a) => errors.push('console.error: ' + a.join(' ').slice(0, 200)))
});
const w = dom.window;
setTimeout(() => {
  w.eval('recordedScenario.length = 0; parsedLines.length = 0;');
  w.fxTriggerFromUI('lightning_storm');
  w.fxTriggerFromUI('rain_storm');
  console.log('افکت‌ها:', JSON.stringify(w.LyraxFx.getTimelineEvents().map(e => ({t:e.t, type:e.type}))));
  w.startCleanReRender();
  console.log('در حال رندر؟', w.eval('isPlaying'), '| rec:', w.eval('isRecordingActive'), '| مدت:', w.eval('getClipDuration()').toFixed(2));
  setTimeout(() => {
    w.stopPlayback();
    setTimeout(() => {
      console.log('بعد از توقف → isPlaying:', w.eval('isPlaying'), '| blob:', w.eval('lastCreatedVideoBlob ? lastCreatedVideoBlob.size : null'), '| ext:', w.eval('lastCreatedVideoExt'));
      console.log('کارت دانلود نمایش:', w.document.getElementById('recordedVideoContainer').style.display);
      console.log('خط مدت:', w.document.getElementById('clipDurationLine').textContent);
      console.log('chunks:', w.eval('recordedVideoChunks.length'), '| recorder state:', w.eval('mediaRecorder && mediaRecorder.state'), '| errors so far:', errors);
      // بستهٔ کامل پروژه
      w.document.getElementById('projectName').value = 'آهنگ_تست';
      console.log('typeof downloadClipBundle:', typeof w.downloadClipBundle);
      let pr;
      try { pr = w.downloadClipBundle(); } catch (e) { console.log('sync throw:', e.message); }
      Promise.resolve(pr).then(() => setTimeout(() => {
        console.log('بسته ساخته شد؟', w.eval('lastManualFile.filename'), '| حجم:', w.eval('lastManualFile.blob ? lastManualFile.blob.size : 0'));
        console.log('errors:', errors.length ? errors.slice(0,5) : 'none');
        process.exit(0);
      }, 400)).catch(e => { console.log('bundle error:', e.message); process.exit(1); });
    }, 300);
  }, 500);
}, 800);
