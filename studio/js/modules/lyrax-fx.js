/*!
 * ==============================================================================
 *  LyraX FX Layer  —  js/modules/lyrax-fx.js
 *  لایه‌ی افکت‌های ماژولار روی کلیپ (آتش‌بازی، موج شوک، باران جرقه، فلاش استروب)
 * ------------------------------------------------------------------------------
 *  این فایل کاملاً مستقل و ماژولار است و هیچ‌جای آن به کد اصلی دست نمی‌زند.
 *  کلاس/آبجکت سراسری window.LyraxFx را می‌سازد که سه کار انجام می‌دهد:
 *     ۱) افکت را در «تایم‌لاین» ثبت می‌کند (با زمان دقیق، مثل خطوط لیریکس)
 *     ۲) هر فریم، فقط افکت‌های فعال را مثل یک «لایه» روی کلیپ رسم می‌کند
 *     ۳) همان لحظه‌های ثبت‌شده را در رندر نهایی دوباره و میلی‌ثانیه‌ای پخش می‌کند
 *
 *  چرا تأخیر روی تولید کلیپ نمی‌گذارد؟
 *     • هیچ pass رندر/انکود اضافه‌ای نمی‌سازد؛ همان بوم آف‌اسکرین موجود را نقاشی می‌کند.
 *     • همه‌ی ذرات از یک seed مشتق می‌شوند (بدون Math.random در مسیر رندر) ⇒ پیش‌نمایش و
 *       خروجی نهایی پیکسل‌به‌پیکسل یکسان‌اند و رفتار قابل‌تکرار است.
 *     • تعداد ذرات سقف‌دار و بدون shadowBlur سنگین است تا روی موبایل هم روان بماند.
 * ==============================================================================
 */
(function (global) {
  'use strict';

  /* ---------- ابزارهای پایه ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function easeOutCubic(p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 3); }

  // PRNG قطعی (mulberry32): خروجی همیشه از seed مشتق می‌شود ⇒ پیش‌نمایش == رندر نهایی
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  /* ---------- تعریف افکت‌ها ---------- */
  // هر افکت یک تابع draw(ctx, elapsed, ev, W, H, accent) دارد که فقط وضعیت بوم را
  // در یک بازه‌ی زمانی مشخص تغییر می‌دهد (save/restore کامل، بدون آلودگی state).
  const FX_DEFS = {

    /* 🎆 آتش‌بازی امضا: چند انفجار پشت‌سرهم با جرقه‌های رنگی */
    fireworks: {
      title: '🎆 آتش‌بازی امضا',
      badgeText: '🎆 آتش‌بازی', badgeBg: 'rgba(255,0,85,0.18)', badgeColor: '#ff3b7f',
      duration: 1.6,
      draw: function (ctx, elapsed, ev, W, H, accent) {
        const rnd = mulberry32(ev.seed);
        const bursts = 3;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let b = 0; b < bursts; b++) {
          const startT = 0.04 + b * 0.2;
          const local = elapsed - startT;
          if (local < 0) continue;
          const span = Math.max(0.5, ev.duration - startT);
          const life = clamp(local / span, 0, 1);
          if (life >= 1) continue;

          const cx = (0.2 + rnd() * 0.6) * W;
          const cy = (0.14 + rnd() * 0.34) * H;
          const hue = Math.floor(rnd() * 360);
          const fade = Math.pow(1 - life, 1.5);

          // هاله‌ی مرکزی انفجار (ارزان‌تر از shadowBlur روی هر ذره)
          const haloR = Math.min(W, H) * (0.05 + 0.16 * life);
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
          g.addColorStop(0, 'hsla(' + hue + ',100%,72%,' + (0.42 * fade) + ')');
          g.addColorStop(1, 'hsla(' + hue + ',100%,60%,0)');
          ctx.globalAlpha = 1;
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(cx, cy, haloR, 0, Math.PI * 2); ctx.fill();

          // جرقه‌ها
          const n = 78;
          const speedScale = Math.min(W, H) * 0.4;
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2 + rnd() * 0.35;
            const spd = (0.35 + rnd() * 0.95) * speedScale;
            const rr = spd * easeOutCubic(life);
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr + life * life * Math.min(W, H) * 0.17;
            const size = (2.4 + rnd() * 2.8) * (1 - life * 0.5);
            ctx.globalAlpha = fade * (0.55 + rnd() * 0.45);
            ctx.fillStyle = 'hsl(' + ((hue + i * 4) % 360) + ',100%,' + (60 + Math.floor(rnd() * 16)) + '%)';
            ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      }
    },

    /* 🌊 موج شوک: حلقه‌ی گشادشونده + فلاش مرکزی */
    shockwave: {
      title: '🌊 موج شوک',
      badgeText: '🌊 موج شوک', badgeBg: 'rgba(0,179,255,0.18)', badgeColor: '#00b3ff',
      duration: 0.95,
      draw: function (ctx, elapsed, ev, W, H, accent) {
        const p = clamp(elapsed / ev.duration, 0, 1);
        const cx = W * 0.5, cy = H * 0.46;
        const maxR = Math.hypot(W, H) * 0.62;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let ring = 0; ring < 2; ring++) {
          const rp = clamp(p * 1.18 - ring * 0.12, 0, 1);
          if (rp <= 0) continue;
          const r = easeOutCubic(rp) * maxR;
          ctx.globalAlpha = (1 - rp) * (ring ? 0.32 : 0.82);
          ctx.lineWidth = Math.max(3, 26 * (1 - rp));
          ctx.strokeStyle = ring ? '#00E5FF' : (accent || '#FFF000');
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        }
        const core = Math.max(0, 1 - p * 3.1);
        if (core > 0) {
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.34);
          g.addColorStop(0, 'rgba(255,255,255,' + (0.8 * core) + ')');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
      }
    },

    /* ✨ باران جرقه: شهاب‌های نزولی با تکان ملایم */
    ember_rain: {
      title: '✨ باران جرقه',
      badgeText: '✨ باران جرقه', badgeBg: 'rgba(255,157,0,0.18)', badgeColor: '#ff9d00',
      duration: 2.4,
      draw: function (ctx, elapsed, ev, W, H, accent) {
        const p = clamp(elapsed / ev.duration, 0, 1);
        const rnd = mulberry32(ev.seed);
        const env = Math.sin(Math.PI * clamp(p * 1.08, 0, 1)); // ورود/خروج نرم کل افکت
        if (env <= 0.01) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const n = 130;
        for (let i = 0; i < n; i++) {
          const x0 = rnd() * W;
          const delay = rnd() * 0.55;
          const life = clamp((p - delay) / (1 - delay), 0, 1);
          if (life <= 0 || life >= 1) continue;
          const y = -40 + life * (H + 80);
          const sway = Math.sin((life * 6) + i) * 14;
          const x = x0 + sway;
          const size = 1.6 + rnd() * 2.4;
          const hue = 28 + rnd() * 26; // نارنجی/طلایی
          ctx.globalAlpha = env * Math.pow(1 - life, 0.7) * (0.5 + rnd() * 0.5);
          ctx.fillStyle = 'hsl(' + hue + ',100%,' + (58 + Math.floor(rnd() * 18)) + '%)';
          ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
          // دنباله‌ی کوتاه
          ctx.globalAlpha *= 0.35;
          ctx.beginPath(); ctx.arc(x - sway * 0.4, y - size * 5, size * 0.7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    },

    /* 🌧️ باران طوفانی — افکت مستقل و زمان‌بندی‌پذیر (همان موتور LyraxWeather) */
    rain_storm: {
      title: '🌧️ باران طوفانی',
      badgeText: '🌧️ باران طوفانی', badgeBg: 'rgba(125,211,252,0.18)', badgeColor: '#7dd3fc',
      duration: 8.0,
      draw: function (ctx, elapsed, ev, W, H) {
        const weather = global.LyraxWeather;
        if (!weather || !weather.drawRain) return;
        const cfg = weather.getSettings().rain;
        // زمانِ مطلقِ تایم‌لاین ⇒ فاز باران با «باران پیوسته» و با رندر سروری یکی می‌ماند
        weather.drawRain(ctx, ev.t + elapsed, W, H, Object.assign({}, cfg, { enabled: true }));
      }
    },

    /* ⚡ صاعقه — همان midpoint displacement بازگشتی + شاخه‌های ۰٫۴ نمونهٔ lightning_storm */
    lightning_storm: {
      title: '⚡ صاعقهٔ طوفانی',
      badgeText: '⚡ صاعقه', badgeBg: 'rgba(120,160,255,0.20)', badgeColor: '#a8c0ff',
      duration: 2.4,
      draw: function (ctx, elapsed, ev, W, H) {
        const weather = global.LyraxWeather;
        if (!weather || !weather.drawLightning) return;
        const p = clamp(elapsed / ev.duration, 0, 1);
        weather.drawLightning(ctx, {
          W: W, H: H,
          seed: ev.seed,
          alpha: weather.boltAlphaAt(p),
          flash: weather.flashLevelAt(p),
          thickness: 6.5,
          branches: weather.getSettings().lightning.branches
        });
      }
    },

    /* 💥 فلاش استروب: سه پالس نوری کوتاه روی کل فریم */
    strobe_flash: {
      title: '💥 فلاش استروب',
      badgeText: '💥 فلاش', badgeBg: 'rgba(255,255,255,0.14)', badgeColor: '#ffffff',
      duration: 0.55,
      draw: function (ctx, elapsed, ev, W, H, accent) {
        const p = clamp(elapsed / ev.duration, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pulses = [0.0, 0.14, 0.3];
        pulses.forEach(function (st, i) {
          const lp = (p - st) / 0.14;
          if (lp <= 0 || lp >= 1) return;
          const a = Math.pow(1 - lp, 1.6) * (i === 0 ? 0.5 : 0.3);
          ctx.globalAlpha = a;
          ctx.fillStyle = accent || '#FFF000';
          ctx.fillRect(0, 0, W, H);
        });
        ctx.restore();
      }
    }
  };

  /* ---------- تایم‌لاین افکت‌ها (قابل ویرایش، مثل خطوط لیریکس) ---------- */
  let fxTimeline = [];          // [{ t, type, duration, seed, title, badgeText, badgeBg, badgeColor }]
  let firedKeys = new Set();    // برای پخش مجدد دقیق در رندر نهایی
  let triggerHandler = null;    // تابع ثبت از داخل صفحه (تا کلید میانبر به لحظه‌ی جاری وصل شود)

  function round3(v) { return Math.round(v * 1000) / 1000; }

  // Per-effect switches; lightning can be disabled without deleting its timeline entries.
  let effectEnabled = { lightning_storm: true };

  function trigger(type, t) {
    const def = FX_DEFS[type];
    if (!def || effectEnabled[type] === false) return null;
    const ev = {
      t: round3(Math.max(0, t || 0)),
      type: type,
      duration: def.duration,
      seed: hashString(type + '|' + round3(Math.max(0, t || 0)).toFixed(3)),
      title: def.title,
      badgeText: def.badgeText,
      badgeBg: def.badgeBg,
      badgeColor: def.badgeColor
    };
    fxTimeline.push(ev);
    firedKeys.add(ev.t.toFixed(3) + '|' + ev.type); // همین لحظه در پیش‌نمایش زنده دیده می‌شود
    return ev;
  }

  function getTimelineEvents() {
    return fxTimeline.map(function (e) {
      return {
        t: e.t, type: e.type, duration: e.duration, title: e.title,
        badgeText: e.badgeText, badgeBg: e.badgeBg, badgeColor: e.badgeColor
      };
    });
  }

  function nudge(idx, field, delta) {
    const ev = fxTimeline[idx]; if (!ev) return;
    if (field === 't') ev.t = round3(Math.max(0, ev.t + delta));
    firedKeys = new Set();
  }
  function update(idx, field, val) {
    const ev = fxTimeline[idx]; if (!ev) return;
    if (field === 't') ev.t = round3(Math.max(0, parseFloat(val) || 0));
    firedKeys = new Set();
  }
  function remove(idx) {
    if (idx >= 0 && idx < fxTimeline.length) { fxTimeline.splice(idx, 1); firedKeys = new Set(); }
  }
  function clearAll() { fxTimeline = []; firedKeys = new Set(); }
  function restore(list) {
    if (!Array.isArray(list)) return;
    fxTimeline = list.filter(function (e) { return e && FX_DEFS[e.type]; }).map(function (e) {
      const def = FX_DEFS[e.type];
      return {
        t: round3(parseFloat(e.t) || 0), type: e.type, duration: def.duration,
        seed: hashString(e.type + '|' + (round3(parseFloat(e.t) || 0)).toFixed(3)),
        title: def.title, badgeText: def.badgeText, badgeBg: def.badgeBg, badgeColor: def.badgeColor
      };
    });
    firedKeys = new Set();
  }

  /* ---------- پخش مجدد در رندر نهایی (میلی‌ثانیه‌ای، قطعی) ---------- */
  function resetReplay() { firedKeys = new Set(); }
  function updateAndReplay(cur, dt) {
    if (!fxTimeline.length) return;
    const win = Math.max(0.3, (dt || 0.03) * 2 + 0.08);
    for (let i = 0; i < fxTimeline.length; i++) {
      const ev = fxTimeline[i];
      const key = ev.t.toFixed(3) + '|' + ev.type;
      if (firedKeys.has(key)) continue;
      if (cur >= ev.t && (cur - ev.t) < win) firedKeys.add(key);
      else if (cur >= ev.t + 1.4) firedKeys.add(key);
    }
  }

  /* ---------- رسم لایه‌ای روی کلیپ ---------- */
  function drawAll(ctx, cur, W, H, accent) {
    if (!fxTimeline.length) return;
    for (let i = 0; i < fxTimeline.length; i++) {
      const ev = fxTimeline[i];
      const elapsed = cur - ev.t;
      if (elapsed < 0 || elapsed > ev.duration) continue;
      const def = FX_DEFS[ev.type];
      if (!def || effectEnabled[ev.type] === false) continue;
      try { def.draw(ctx, elapsed, ev, W, H, accent); } catch (err) { /* افکت خراب کل رندر را متوقف نکند */ }
    }
  }

  /* ---------- کلیدهای میانبر (فقط وقتی کاربر داخل کادر متن نیست) ---------- */
  const KEY_MAP = { KeyF: 'fireworks', KeyG: 'shockwave', KeyH: 'ember_rain', KeyJ: 'strobe_flash', KeyR: 'rain_storm', KeyL: 'lightning_storm' };
  function handleKey(e) {
    const type = KEY_MAP[e.code];
    if (!type) return false;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (typeof triggerHandler === 'function') { triggerHandler(type); return true; }
    return false;
  }
  function setTriggerHandler(fn) { triggerHandler = fn; }

  global.LyraxFx = {
    version: '1.1.0',
    FX_DEFS: FX_DEFS,
    getTypes: function () { return Object.keys(FX_DEFS); },
    setEnabled: function (type, enabled) { if (FX_DEFS[type]) effectEnabled[type] = !!enabled; },
    isEnabled: function (type) { return effectEnabled[type] !== false; },
    trigger: trigger,
    getTimelineEvents: getTimelineEvents,
    nudge: nudge,
    update: update,
    remove: remove,
    clearAll: clearAll,
    restore: restore,
    resetReplay: resetReplay,
    updateAndReplay: updateAndReplay,
    drawAll: drawAll,
    handleKey: handleKey,
    setTriggerHandler: setTriggerHandler
  };
})(window);
