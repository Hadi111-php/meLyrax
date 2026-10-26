/*!
 * ==============================================================================
 *  LyraX Weather  —  js/modules/lyrax-weather.js
 *  دو افکتِ مستقل، ماژولار و لایه‌ای روی کلیپ:   «🌧️ باران»   و   «⚡ صاعقه»
 * ------------------------------------------------------------------------------
 *  این دو افکت به هم وابسته نیستند: باران تیک و تنظیمات خودش را دارد، صاعقه هم
 *  از پنل «رعدوبرق هماهنگ با ضرب آهنگ» (رنگ/شدت) و همین‌جا (شکل/شاخه/ضخامت)
 *  تنظیم می‌شود. می‌توان فقط یکی، یا هر دو را هم‌زمان روی کلیپ داشت.
 *
 *  الگوریتم‌ها مستقیماً از نمونهٔ lightning_storm.html بازتولید شده‌اند:
 *
 *   • صاعقه  (نمونه: drawLightning = recursive midpoint displacement + branches،
 *             و strike() که سه بار با ضخامت‌های مختلف روی همان مسیر می‌کشد،
 *             به‌همراه فلاش چندپالسی پس‌زمینه)
 *       → همان بازگشتی، همان احتمال انشعاب ۰٫۴ با طول ۰٫۴ قطعه، همان سه‌بار
 *         کشیدن (هاله / بدنه / هستهٔ سفید) و همان منحنی پالس فلاش.
 *
 *   • باران  (نمونه: آرایه‌ی drops با x/y/len/speed و رسم خط مورب در هر فریم)
 *       → همان قطره‌های مورب با طول و درخشندگی متفاوت؛ قطره‌ها در ۳ گروه سرعت
 *         دسته‌بندی می‌شوند و هر گروه در هر «دورهٔ ۸ ثانیه‌ای» تعداد صحیحی دور
 *         کامل می‌زند ⇒ حرکت دقیقاً دوره‌ای است و رندر سروری FFmpeg هم می‌تواند
 *         عیناً همین فرمول را بازتولید کند (پیش‌نمایش == خروجی نهایی).
 *
 *  چرا روی زمان تولید کلیپ تأخیر نمی‌گذارد؟
 *     • هیچ pass رندر/انکود اضافه‌ای نمی‌سازد؛ همان بوم آف‌اسکرینِ موجود نقاشی می‌شود.
 *     • تمام «تصادف»ها از یک seed مشتق می‌شوند (mulberry32) و فرمول‌ها فقط تابع
 *       زمان کلیپ‌اند ⇒ با اسکراب، توقف، یا رندر مجدد همان شکل بازتولید می‌شود.
 *
 *  این فایل هیچ‌جای کد اصلی را تغییر نمی‌دهد؛ فقط window.LyraxWeather را می‌سازد.
 * ==============================================================================
 */
(function (global) {
  'use strict';

  /* ============================ ابزارهای پایه ============================ */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // PRNG قطعی (mulberry32) — خروجی همیشه از seed مشتق می‌شود
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
  function hexToRgb(hex) {
    let h = String(hex === undefined || hex === null ? '#AEC2E0' : hex).replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    let n = parseInt(h, 16);
    if (isNaN(n)) n = 0xAEC2E0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + clamp(a, 0, 1) + ')';
  }

  /* ============================ تنظیمات ============================ */
  // منبع یگانهٔ حقیقت برای هر دو افکت؛ در فایل JSON پروژه ذخیره و بازیابی می‌شود.
  // نکته: رنگ/شدت صاعقه اینجا فقط «کپی همگام» از پنل رعدوبرق است؛ مرجع اصلی همان پنل است.
  const DEFAULTS = {
    rain: {
      enabled: false,
      density: 150,     // تعداد قطره (نمونه: ۱۰۰)
      speed: 1.0,       // ضریب سرعت کلی
      angle: 8,         // درجه؛ ۰ = کاملاً عمودی مثل نمونه
      opacity: 30,      // درصد شفافیت کلی
      length: 1.0,      // ضریب طول قطره
      color: '#AEC2E0'  // رنگ نمونه
    },
    lightning: {
      start: 'alternate', // alternate | left | right | center | tl | tr | bl | br | random
      intensity: 80,      // (همگام با پنل رعدوبرق) شدت فلاش و ضخامت — درصد
      color: '#FFF700',   // (همگام با پنل رعدوبرق) رنگ صاعقه
      branches: 3,        // تعداد انشعاب‌ها
      thickness: 1.0      // ضریب ضخامت
    }
  };

  const settings = {
    rain: Object.assign({}, DEFAULTS.rain),
    lightning: Object.assign({}, DEFAULTS.lightning)
  };

  function getSettings() {
    return {
      rain: Object.assign({}, settings.rain),
      lightning: Object.assign({}, settings.lightning)
    };
  }
  function setSettings(patch) {
    if (patch && patch.rain) {
      Object.keys(patch.rain).forEach(function (k) {
        if (!(k in DEFAULTS.rain)) return;
        const v = patch.rain[k];
        if (v === undefined || v === null) return;
        settings.rain[k] = (k === 'enabled') ? !!v : v;
      });
      rainBake = null; rainBakeCount = -1; rainLoopCache = { period: 0, key: '', maxLen: 0 };
    }
    if (patch && patch.lightning) {
      Object.keys(patch.lightning).forEach(function (k) {
        if (!(k in DEFAULTS.lightning)) return;
        const v = patch.lightning[k];
        if (v === undefined || v === null) return;
        settings.lightning[k] = v;
      });
    }
    return getSettings();
  }
  function resetSettings() {
    settings.rain = Object.assign({}, DEFAULTS.rain);
    settings.lightning = Object.assign({}, DEFAULTS.lightning);
    rainBake = null; rainBakeCount = -1; rainLoopCache = { period: 0, key: '', maxLen: 0 };
    return getSettings();
  }

  /* ======================================================================
     🌧️  افکت ۱ — باران
     ----------------------------------------------------------------------
     قطره‌ها در ۳ گروه سرعت دسته‌بندی می‌شوند؛ هر گروه در هر «دورهٔ ۸ ثانیه‌ای»
     تعداد صحیحی دور کامل می‌زند، پس حرکت کاملاً دوره‌ای و بدون پرش است و
     رندر سروری هم می‌تواند عیناً همین تصویر را بسازد.
     ترتیب فراخوانی rnd() در bakeRain «قرارداد مشترک» با رندر پایتون است؛
     اگر تغییرش دهی، پیش‌نمایش و رندر نهایی از هم جدا می‌شوند.
     ====================================================================== */
  const RAIN_LOOP_SEC = 8;              // دورهٔ پایه (ثانیه)
  const RAIN_SPEED_TIERS = [1, 2, 3];   // تعداد دور هر گروه سرعت در هر دوره

  let rainBake = null;
  let rainBakeCount = -1;

  function bakeRain(count) {
    if (rainBake && rainBakeCount === count) return rainBake;
    const rnd = mulberry32(hashString('lyrax-rain-v2|' + count));
    const drops = new Array(count);
    for (let i = 0; i < count; i++) {
      const near = rnd() < 0.30;                      // ۱:_near → درشت‌تر و روشن‌تر
      const x = rnd();                                // 2:x → موقعیت افقی (نسبی)
      const phase = rnd();                            // 3:phase → فاز شروع
      const tier = Math.floor(rnd() * 3) % 3;         // 4:tier → گروه سرعت ۰/۱/۲
      const len = near ? (0.016 + rnd() * 0.014) : (0.008 + rnd() * 0.010);  // 5:len
      const alpha = near ? (0.72 + rnd() * 0.28) : (0.34 + rnd() * 0.40);    // 6:alpha
      const width = near ? 1.5 : 0.95;
      drops[i] = { x: x, phase: phase, tier: tier, len: len, alpha: alpha, width: width };
    }
    rainBake = drops;
    rainBakeCount = count;
    return drops;
  }

  // طول مؤثر یک قطره به پیکسل
  function rainLenPx(lenUnit, H, lengthSetting) {
    return Math.max(4, H * 1.55 * lenUnit * (lengthSetting || 1));
  }

  // دورهٔ عمودی مشترک: ارتفاع بوم + بلندترین قطره (تا همهٔ گروه‌ها هم‌فاز بمانند)
  let rainLoopCache = { period: 0, key: '', maxLen: 0 };
  function rainLoops(drops, H, lengthSetting) {
    const key = H + '|' + (lengthSetting || 1) + '|' + drops.length;
    if (rainLoopCache.key === key) return rainLoopCache;
    let maxLen = 1;
    for (let i = 0; i < drops.length; i++) {
      const lp = rainLenPx(drops[i].len, H, lengthSetting);
      if (lp > maxLen) maxLen = lp;
    }
    rainLoopCache = { period: H + maxLen, key: key, maxLen: maxLen };
    return rainLoopCache;
  }

  /**
   * فهرست قطره‌های یک گروه سرعت با موقعیت دقیق روی بوم (تابع خالص از زمان).
   * قطره فقط عمودی می‌افتد (x ثابت) و «کجی» از شکل خط می‌آید؛ به همین دلیل
   * حرکت دقیقاً دوره‌ای است و در رندر سروری هم بدون پرش بازتولید می‌شود.
   */
  function rainDropsAt(tier, count, timeSec, W, H, override) {
    const s = Object.assign({}, settings.rain, override || {});
    const drops = bakeRain(Math.round(clamp(count || s.density || 150, 10, 700)));
    const loops = rainLoops(drops, H, s.length);
    const P = loops.period;
    const t = Number(timeSec) || 0;
    const speedMul = Math.max(0.5, Number(s.speed) || 1);
    const turns = Math.max(1, Math.round(RAIN_SPEED_TIERS[tier] * speedMul));
    const local = ((t % RAIN_LOOP_SEC) + RAIN_LOOP_SEC) % RAIN_LOOP_SEC;
    const out = [];
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (d.tier !== tier) continue;
      const lp = rainLenPx(d.len, H, s.length);
      let f = (d.phase + (local / RAIN_LOOP_SEC) * turns) % 1;
      if (f < 0) f += 1;
      out.push({ x: d.x * W, y: f * P - lp, len: lp, alpha: d.alpha, width: d.width });
    }
    return out;
  }

  /**
   * رسم لایهٔ باران روی هر بوم (پیش‌نمایش، ضبط مرورگر یا رندر نهایی).
   * @param {number} timeSec  زمان جاری کلیپ (ثانیه) — تنها منبع حرکت
   */
  function drawRain(ctx, timeSec, W, H, override) {
    if (!ctx || !W || !H) return false;
    const s = Object.assign({}, settings.rain, override || {});
    if (!s.enabled) return false;

    const count = Math.round(clamp(s.density || 150, 10, 700));
    const minDim = Math.min(W, H);
    const ang = (Number(s.angle) || 0) * Math.PI / 180;
    const slantX = Math.sin(ang), slantY = Math.cos(ang);
    const globalAlpha = clamp((s.opacity || 30) / 100, 0.02, 1);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color || '#AEC2E0';
    ctx.lineCap = 'round';
    for (let tier = 0; tier < RAIN_SPEED_TIERS.length; tier++) {
      const list = rainDropsAt(tier, count, timeSec, W, H, s);
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        ctx.globalAlpha = globalAlpha * clamp(d.alpha, 0, 1);
        ctx.lineWidth = Math.max(1, minDim * 0.0013 * d.width);
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - slantX * d.len, d.y + slantY * d.len);
        ctx.stroke();
      }
    }
    ctx.restore();
    return true;
  }

  /* ======================================================================
     ⚡  افکت ۲ — صاعقه (midpoint displacement بازگشتی + انشعاب)
     ====================================================================== */

  // ساخت مسیر صاعقه، دقیقاً الگوریتم نمونه: هر نیمه بازگشتی جابه‌جا می‌شود و
  // با احتمال ۰٫۴ یک شاخه با طول ۰٫۴ قطعه از نقطهٔ میانی جدا می‌شود.
  // br=True یعنی قطعه متعلق به شاخه است (برای تفکیک تنه/شاخه‌ها هنگام رسم).
  function buildBolt(x1, y1, x2, y2, displace, branches, width, rnd, out, depth, br) {
    depth = depth || 0;
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    if (displace < 2 || width < 0.55 || depth > 12 || segLen < 1.5) {
      out.push({ x1: x1, y1: y1, x2: x2, y2: y2, w: Math.max(0.9, width), br: !!br });
      return;
    }
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const nx = midX + (rnd() - 0.5) * displace;
    const ny = midY + (rnd() - 0.5) * displace;

    buildBolt(x1, y1, nx, ny, displace / 2, branches - 1, width, rnd, out, depth + 1, br);
    buildBolt(nx, ny, x2, y2, displace / 2, branches - 1, width, rnd, out, depth + 1, br);

    if (branches > 0 && rnd() < 0.4) {
      const angle = rnd() * Math.PI * 2;
      const branchLen = segLen * 0.4;
      const bx = nx + Math.cos(angle) * branchLen;
      const by = ny + Math.sin(angle) * branchLen;
      buildBolt(nx, ny, bx, by, displace / 2, branches - 2, width * 0.6, rnd, out, depth + 1, true);
    }
  }

  function strokeSegments(ctx, segments, color, widthMul, alpha, glow) {
    if (!segments.length) return;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    let currentW = -1;
    ctx.beginPath();
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const w = Math.max(0.9, s.w * widthMul);
      if (Math.abs(w - currentW) > 0.35) {
        if (currentW > 0) ctx.stroke();
        ctx.lineWidth = w;
        currentW = w;
        ctx.beginPath();
      }
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // نقطهٔ شروع بر اساس تنظیم «نقطه شروع» — قطعی از seed
  function startPoint(mode, W, H, seed) {
    const margin = W * 0.05;
    const topY = H * 0.015;
    let m = mode || settings.lightning.start || 'alternate';
    if (m === 'random') {
      const opts = ['tl', 'tr', 'bl', 'br'];
      const rnd = mulberry32((seed >>> 0) + 0x51ED270B);
      m = opts[Math.floor(rnd() * 4) % 4];
    }
    switch (m) {
      case 'tl': return { x: margin, y: topY };
      case 'tr': return { x: W - margin, y: topY };
      case 'bl': return { x: margin, y: H * 0.97 };
      case 'br': return { x: W - margin, y: H * 0.97 };
      case 'left': return { x: margin, y: topY };
      case 'right': return { x: W - margin, y: topY };
      case 'center': return { x: W * 0.5, y: topY };
      case 'alternate':
      default: {
        const left = ((seed >>> 3) & 1) === 0;
        return { x: left ? margin : W - margin, y: topY };
      }
    }
  }

  /**
   * رسم یک ضربهٔ کامل صاعقه: فلاش چندپالسی + هاله + بدنه + هستهٔ سفید
   * @param {object} o { W, H, seed, startX?, startY?, start?, alpha=1, color?,
   *                     intensity?, thickness?, branches?, displace?, flash=0 }
   */
  function drawLightning(ctx, o) {
    if (!ctx || !o || !o.W || !o.H) return false;
    const W = o.W, H = o.H, minDim = Math.min(W, H);
    const alpha = clamp(o.alpha === undefined ? 1 : o.alpha, 0, 1);
    if (alpha <= 0.003) return false;

    const s = settings.lightning;
    const seed = (o.seed === undefined ? 1 : o.seed) >>> 0;
    const rnd = mulberry32(seed + 0x9E3779B9);

    const sp = (o.startX !== undefined && o.startY !== undefined)
      ? { x: o.startX, y: o.startY }
      : startPoint(o.start, W, H, seed);

    const sx = clamp(sp.x, 0, W);
    const sy = clamp(sp.y, 0, H);

    // مقصد: قطعی از seed، همیشه داخل کادر (مثل randomTarget نمونه)
    const ex = clamp(sx + (rnd() - 0.5) * W * 0.95, W * 0.06, W * 0.94);
    const ey = clamp(sy + H * (0.38 + rnd() * 0.42), H * 0.22, H * 0.95);

    const intensity = clamp((o.intensity === undefined ? (s.intensity / 100) : o.intensity), 0, 1);
    const thicknessBase = ((o.thickness === undefined ? 6.5 : o.thickness) * (0.70 + 0.55 * intensity))
      * (s.thickness || 1);
    const displace = minDim * (o.displace === undefined ? 0.16 : o.displace);
    const branches = (o.branches === undefined ? (s.branches || 3) : o.branches);
    const color = o.color || s.color || '#FFF700';

    const core = [];
    buildBolt(sx, sy, ex, ey, displace, branches, thicknessBase, rnd, core, 0, false);

    // ۱) فلاش چندپالسی پس‌زمینه (قبل از خود صاعقه، مثل نمونه)
    const flash = clamp(o.flash === undefined ? 0 : o.flash, 0, 1);
    if (flash > 0.005) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.30, flash * 0.40);
      ctx.fillStyle = '#d9e7ff';
      ctx.fillRect(0, 0, W, H);
      if (ctx.createRadialGradient) {
        const g = ctx.createRadialGradient(ex, ey, minDim * 0.02, ex, ey, minDim * 0.90);
        g.addColorStop(0, rgba(color, Math.min(0.30, flash * 0.34)));
        g.addColorStop(1, rgba(color, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    // ۲) سه‌بار کشیدن روی همان مسیر: هاله / بدنه / هستهٔ سفید (مثل strike نمونه)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const glow = minDim * 0.022;
    strokeSegments(ctx, core, color, 2.6, alpha * 0.20, glow * 1.8);  // هالهٔ پهن
    strokeSegments(ctx, core, color, 1.0, alpha * 0.92, glow);        // بدنهٔ اصلی
    strokeSegments(ctx, core, '#ffffff', 0.36, alpha, glow * 0.45);   // هستهٔ سفید
    ctx.restore();
    return { ex: ex, ey: ey };
  }

  /* ---- پوش پالس‌ها (از نمونهٔ strike/loop) ---- */
  function boltAlphaAt(p) {
    p = clamp(p, 0, 1);
    if (p < 0.025) return 1;
    if (p > 0.82) return clamp((1 - p) / 0.18, 0, 1);
    return 1;
  }
  function flashLevelAt(p) {
    p = clamp(p, 0, 1);
    if (p < 0.045) return 0.62;
    if (p < 0.120) return 0.18;
    if (p < 0.190) return 0.46;
    if (p < 0.270) return 0.08;
    if (p < 0.340) return 0.30;
    if (p < 0.430) return 0.05;
    if (p < 0.490) return 0.15;
    return 0;
  }

  /**
   * رسم یک «ضربه» بر اساس رکورد تایم‌لاین {startTime, tier, seed, side, energyFactor}
   * @param {number} curSec   زمان جاری کلیپ
   * @param {number} duration عمر ضربه (ثانیه) — از LIGHTNING_TIERS تیر مربوطه
   */
  function drawStrike(ctx, flash, curSec, W, H, duration) {
    if (!flash || !ctx) return false;
    const dur = Math.max(0.1, duration || 0.75);
    const elapsed = curSec - flash.startTime;
    if (elapsed < 0 || elapsed > dur) return false;
    const p = elapsed / dur;
    const a = boltAlphaAt(p);
    if (a <= 0.003) return false;

    const tier = flash.tier === 2 ? 2 : 1;
    const s = settings.lightning;
    const inten = clamp(s.intensity / 100, 0, 1);
    const ef = clamp((typeof flash.energyFactor === 'number' && isFinite(flash.energyFactor)) ? flash.energyFactor : 1, 0.7, 1.8);

    const selectedStart = (s.start && s.start !== 'alternate')
      ? s.start
      : (flash.side === 'left' ? 'left' : (flash.side === 'right' ? 'right' : 'alternate'));
    return drawLightning(ctx, {
      W: W, H: H,
      seed: flash.seed,
      start: selectedStart,
      alpha: a,
      flash: flashLevelAt(p) * inten,
      thickness: (tier === 2 ? 9.5 : 6.5) * (0.75 + 0.25 * ef),
      branches: tier === 2 ? Math.max(4, s.branches || 3) : Math.max(2, (s.branches || 3) - 1)
    });
  }

  /* ---- خواندن/نوشتن مقادیر پنل (برای بازیابی JSON) ---- */
  function applyToUI(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return;
    const setV = function (id, val) { const el = d.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
    const setC = function (id, val) { const el = d.getElementById(id); if (el) el.checked = !!val; };
    const setT = function (id, txt) { const el = d.getElementById(id); if (el) el.innerText = txt; };
    const r = settings.rain, l = settings.lightning;

    setC('rainOverlayEnabledToggle', r.enabled);
    setC('wRainEnabled', r.enabled);
    setV('wRainDensity', Math.round(r.density));
    setV('wRainSpeed', r.speed);
    setV('wRainAngle', r.angle);
    setV('wRainOpacity', Math.round(r.opacity));
    setV('wRainLength', r.length);
    setV('wRainColor', r.color);
    setT('lblWRainDensity', Math.round(r.density) + ' قطره');
    setT('lblWRainSpeed', Number(r.speed).toFixed(1) + '×');
    setT('lblWRainAngle', Math.round(r.angle) + '°');
    setT('lblWRainOpacity', Math.round(r.opacity) + '%');
    setT('lblWRainLength', Number(r.length).toFixed(1) + '×');

    setV('wLightningStart', l.start);
    setV('wLightningBranches', l.branches);
    setV('wLightningThickness', l.thickness);
    setT('lblWLightningBranches', Math.round(l.branches));
    setT('lblWLightningThickness', Number(l.thickness).toFixed(1) + '×');
    // رنگ و شدت نور در پنل «رعدوبرق هماهنگ با ضرب آهنگ» مقدار می‌گیرند
    setV('lightningColor', l.color);
    setV('lightningIntensity', Math.round(l.intensity));
    if (typeof updateLightningFromUI === 'function') { try { updateLightningFromUI(); } catch (e) {} }
  }

  /* ---- API سراسری ---- */
  global.LyraxWeather = {
    version: '1.0.0',
    RAIN_LOOP_SEC: RAIN_LOOP_SEC,
    RAIN_SPEED_TIERS: RAIN_SPEED_TIERS,
    DEFAULTS: DEFAULTS,
    getSettings: getSettings,
    setSettings: setSettings,
    resetSettings: resetSettings,
    setRainEnabled: function (on) { settings.rain.enabled = !!on; return settings.rain.enabled; },
    isRainEnabled: function () { return !!settings.rain.enabled; },
    bakeRain: bakeRain,
    rainDropsAt: rainDropsAt,
    rainLoops: rainLoops,
    rainLenPx: rainLenPx,
    drawRain: drawRain,
    buildBolt: buildBolt,
    drawLightning: drawLightning,
    drawStrike: drawStrike,
    boltAlphaAt: boltAlphaAt,
    flashLevelAt: flashLevelAt,
    startPoint: startPoint,
    applyToUI: applyToUI,
    hashString: hashString,
    mulberry32: mulberry32
  };
})(typeof window !== 'undefined' ? window : this);
