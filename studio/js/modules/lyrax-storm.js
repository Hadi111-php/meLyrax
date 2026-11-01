/*!
 * ==============================================================================
 *  LyraX Storm  —  js/modules/lyrax-storm.js
 *  ماژول «⚡ صاعقه» و «🌧️ بارندگی» برای LyraX Clip Studio
 * ------------------------------------------------------------------------------
 *  این همان ماژولی است که برای دو کلید داشبورد استفاده می‌شود:
 *
 *    ۱) کلید/دکمه‌ی «⚡ صاعقه»  (کلید میانبر L و دکمه‌ی «ثبت صاعقه روی کلیپ»)
 *       → موتور صاعقه‌ی همین فایل: شروع از گوشه‌های بالا، midpoint displacement
 *         بازگشتی، شاخه‌های تصادفیِ قطعی، سه‌بار کشیدن هاله/بدنه/هسته، و فلاش
 *         کوتاه پشت صحنه.
 *
 *    ۲) تیک «🌧️ باران پیوسته روی تصویر» (و رخداد «باران طوفانی» با کلید R)
 *       → موتور بارش همین فایل: قطره‌های مورب با طول/سرعت/شفافیتِ مستقل که
 *         موقعیتشان تابع خالصی از زمان است.
 *
 *  ⚠️ نکته‌ی مهم: «رعدوبرقِ هماهنگ با ضرب آهنگ» (پنل جدا) به این فایل کاری
 *     ندارد و دست‌نخورده می‌ماند. اینجا فقط «صاعقه» و «بارندگی» است.
 *
 *  چرا روی زمان تولید کلیپ تأخیر نمی‌گذارد؟
 *     • هیچ pass رندر/انکود اضافه‌ای نمی‌سازد؛ فقط روی همان بوم آف‌اسکرین موجود
 *       نقاشی می‌کند (لایه‌ای).
 *     • همه‌ی «تصادف»ها از seed قطعی (mulberry32 / FNV-1a) می‌آیند، پس با
 *       اسکراب، توقف، پخش مجدد و رندر سروری همان شکل بازتولید می‌شود
 *       (پیش‌نمایش == خروجی نهایی).
 *
 *  این فایل هیچ‌جای کد اصلی را تغییر نمی‌دهد؛ فقط window.LyraxStorm را می‌سازد.
 * ==============================================================================
 */
(function (global) {
  "use strict";

  var VERSION = "1.1.0";

  /* ============================ ابزارهای پایه ============================ */

  function clamp(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
  }

  function toNumber(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function toInt(v, fallback) {
    var n = Math.round(Number(v));
    return Number.isFinite(n) ? n : fallback;
  }

  function makeSeed() {
    return (Math.random() * 0xffffffff) >>> 0;
  }

  // PRNG قطعی mulberry32 — خروجی بیت‌به‌بیت یکسان با پورت پایتونی رندرر
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // FNV-1a روی کدهای UTF-16 — همان تابع lyrax-fx.js و renderers.py
  function hashString(s) {
    var h = 2166136261 >>> 0;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function easeOutCubic(p) {
    p = clamp(p, 0, 1);
    return 1 - Math.pow(1 - p, 3);
  }

  function hexToRgb(hex) {
    var h = String(hex === undefined || hex === null ? "#ffffff" : hex).replace("#", "").trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!Number.isFinite(n)) n = 0xffffff;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + clamp(a, 0, 1).toFixed(4) + ")";
  }

  /* ============================ وضعیت ماژول ============================ */

  var activeEvents = [];
  var nextCorner = "tl"; // برای صاعقه‌های بدون seed، بین tl و tr می‌چرخد
  var lightningEnabled = true;

  var lightningDefaults = {
    duration: 0.4,
    boltCount: 1,
    branches: 4,
    hue: "#ffffff",
    alternate: true,
    flash: true,
    thickness: 1.0,
    intensity: 80,      // درصد (هم‌گام با پنل رعدوبرق؛ مرجع همان پنل است)
    corner: ""          // خالی = متناوب
  };

  // تنظیمات بارندگی — همان کلیدهای rain_overlay در فایل JSON پروژه
  var rainDefaults = {
    enabled: false,
    density: 150,
    speed: 1.0,
    angle: 8,
    opacity: 30,
    length: 1.0,
    color: "#AEC2E0"
  };

  var rain = {
    enabled: false,
    density: 150,
    speed: 1.0,
    angle: 8,
    opacity: 30,
    length: 1.0,
    color: "#AEC2E0",
    startT: 0,
    endT: Infinity
  };

  var rainDrops = [];
  var rainDropsCount = -1;

  /* ============================ بارندگی ============================ */

  // تولید قطعی قطره‌ها — ترتیب فراخوانی rnd() «قرارداد مشترک» با renderers.py است.
  function bakeRainDrops(count) {
    count = Math.round(clamp(count, 10, 300));
    if (rainDropsCount === count && rainDrops.length) return rainDrops;

    var rnd = mulberry32(hashString("lyrax-storm-rain-v1|" + count));
    var drops = new Array(count);

    for (var i = 0; i < count; i++) {
      var near = rnd() < 0.30;                              // ۱) قطره‌ی درشت/نزدیک
      var x = rnd();                                        // ۲) موقعیت افقی (نسبی)
      var phase = rnd();                                    // ۳) فاز شروع
      var lenUnit = near ? (0.018 + rnd() * 0.014)          // ۴) طول قطره (نسبت به ارتفاع)
                        : (0.009 + rnd() * 0.010);
      var speedUnit = 0.42 + rnd() * 0.80;                  // ۵) سرعت (صفحه بر ثانیه)
      var alpha = near ? (0.72 + rnd() * 0.28)              // ۶) شفافیت قطره
                       : (0.34 + rnd() * 0.40);
      var widthMul = near ? 1.5 : 0.95;                     // ۷) ضخامت خط

      drops[i] = {
        x: x,
        phase: phase,
        len: lenUnit,
        speed: speedUnit,
        alpha: alpha,
        width: widthMul
      };
    }

    rainDrops = drops;
    rainDropsCount = count;
    return rainDrops;
  }

  function normalizeRainCfg(cfg) {
    cfg = cfg || {};
    var out = {
      enabled: Object.prototype.hasOwnProperty.call(cfg, "enabled") ? !!cfg.enabled
             : (Object.prototype.hasOwnProperty.call(cfg, "on") ? !!cfg.on : rain.enabled),
      density: clamp(toInt(
        cfg.density !== undefined ? cfg.density
          : (cfg.intensity !== undefined ? cfg.intensity : rain.density), rain.density), 10, 300),
      speed: clamp(toNumber(cfg.speed, rain.speed), 0.1, 5),
      angle: clamp(toNumber(cfg.angle, rain.angle), -45, 45),
      opacity: clamp(toNumber(cfg.opacity, rain.opacity), 1, 100),
      length: clamp(toNumber(cfg.length, rain.length), 0.2, 3),
      color: cfg.color || rain.color,
      startT: cfg.startT !== undefined ? toNumber(cfg.startT, rain.startT)
            : (cfg.start !== undefined ? toNumber(cfg.start, rain.startT) : rain.startT),
      endT: (cfg.endT === Infinity || cfg.end === Infinity || cfg.endT === null || cfg.end === null)
        ? Infinity
        : toNumber(cfg.endT !== undefined ? cfg.endT : cfg.end, rain.endT)
    };
    return out;
  }

  /**
   * روشن/خاموش یا تغییر تنظیمات بارندگی.
   *   LyraxStorm.setRain(true)                       → روشن
   *   LyraxStorm.setRain(false)                       → خاموش
   *   LyraxStorm.setRain({ density: 200, speed: 1.3 }) → تغییر جزیی
   */
  function setRain(enabledOrConfig, startT, endT, intensity, speed) {
    var cfg;

    if (enabledOrConfig && typeof enabledOrConfig === "object") {
      cfg = enabledOrConfig;
    } else {
      cfg = { enabled: !!enabledOrConfig };
      if (startT !== undefined) cfg.startT = startT;
      if (endT !== undefined) cfg.endT = endT;
      if (intensity !== undefined) cfg.intensity = intensity;
      if (speed !== undefined) cfg.speed = speed;
    }

    var merged = normalizeRainCfg(cfg);
    rain.enabled = merged.enabled;
    rain.density = merged.density;
    rain.speed = merged.speed;
    rain.angle = merged.angle;
    rain.opacity = merged.opacity;
    rain.length = merged.length;
    rain.color = merged.color;
    rain.startT = merged.startT;
    rain.endT = merged.endT;

    if (rainDropsCount !== Math.round(rain.density)) {
      rainDrops = [];
      rainDropsCount = -1;
    }

    return getRainConfig();
  }

  function getRainConfig() {
    return {
      enabled: !!rain.enabled,
      density: Math.round(rain.density),
      speed: rain.speed,
      angle: rain.angle,
      opacity: rain.opacity,
      length: rain.length,
      color: rain.color
    };
  }

  function getRainState() {
    return {
      enabled: !!rain.enabled,
      startT: rain.startT,
      endT: rain.endT,
      density: Math.round(rain.density),
      intensity: Math.round(rain.density),
      speed: rain.speed,
      angle: rain.angle,
      opacity: rain.opacity,
      length: rain.length,
      color: rain.color,
      dropsCount: rainDrops.length
    };
  }

  /**
   * رسم لایه‌ی بارش در یک لحظه‌ی مشخص — تابع خالص از زمان.
   * @param {number} timeSec زمان جاری کلیپ (ثانیه)
   * @param {object} override تنظیمات موقت (مثلاً برای رخداد «باران طوفانی»)
   */
  function drawRainAt(ctx, timeSec, W, H, override) {
    if (!ctx || !(W > 0) || !(H > 0)) return false;

    var cfg = normalizeRainCfg(Object.assign({}, getRainConfig(), override || {}));
    if (!cfg.enabled) return false;

    var t = Math.max(0, toNumber(timeSec, 0) - cfg.startT);
    var drops = bakeRainDrops(cfg.density);
    var minDim = Math.min(W, H);
    var lenScale = H * 1.55 * cfg.length;
    var globally = clamp(cfg.opacity / 100, 0.02, 1);
    var ang = cfg.angle * Math.PI / 180;
    var slantX = Math.sin(ang);
    var slantY = Math.cos(ang);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = cfg.color;
    ctx.lineCap = "round";

    // ضخامت خط با اندازه‌ی تصویر متناسب می‌شود و برای هر قطره جداگانه تنظیم می‌شود
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      var lenPx = Math.max(4, lenScale * d.len);
      var travel = H + lenPx;
      var f = (d.phase + t * d.speed * cfg.speed) % 1;
      if (f < 0) f += 1;
      var y = f * travel - lenPx;
      var x = d.x * W;

      ctx.globalAlpha = clamp(globally * d.alpha, 0, 1);
      ctx.lineWidth = Math.max(1, minDim * 0.0013 * d.width);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - slantX * lenPx, y + slantY * lenPx);
      ctx.stroke();
    }

    ctx.restore();
    return true;
  }

  // فقط وقتی بارش روشن است و داخل بازه‌ی زمانی خودش هستیم رسم می‌کند
  function drawRainIfActive(ctx, cur, W, H, override) {
    if (!rain.enabled) return false;
    cur = toNumber(cur, 0);
    if (cur < rain.startT || cur > rain.endT) return false;
    return drawRainAt(ctx, cur, W, H, override);
  }

  /* ============================ صاعقه ============================ */

  function normalizeCorner(corner) {
    if (corner === undefined || corner === null || corner === "") return null;
    var c = String(corner).toLowerCase().trim();

    if (c === "tl" || c === "top-left" || c === "topleft" || c === "left-top" || c === "left") return "tl";
    if (c === "tr" || c === "top-right" || c === "topright" || c === "right-top" || c === "right") return "tr";
    if (c === "bl" || c === "bottom-left" || c === "bottomleft" || c === "left-bottom") return "bl";
    if (c === "br" || c === "bottom-right" || c === "bottomright" || c === "right-bottom") return "br";
    if (c === "center" || c === "middle" || c === "top-center" || c === "topcenter") return "center";
    if (c === "random" || c === "rand") return "random";
    if (c === "alternate" || c === "auto") return "alternate";

    return null;
  }

  // شروع دقیقاً از گوشهٔ بوم (مثل صاعقه.html) — نه با حاشیه
  function cornerPoint(corner, W, H) {
    switch (corner) {
      case "tl": return { x: 0, y: 0 };
      case "tr": return { x: W, y: 0 };
      case "bl": return { x: 0, y: H };
      case "br": return { x: W, y: H };
      case "center": return { x: W * 0.5, y: 0 };
      default: return { x: W, y: 0 };
    }
  }

  function isTopCorner(corner) {
    return corner === "tl" || corner === "tr" || corner === "center";
  }

  function chooseNextCorner() {
    var c = nextCorner;
    nextCorner = nextCorner === "tl" ? "tr" : "tl";
    return c;
  }

  function resolveCorner(corner, seed) {
    if (corner === "alternate") {
      // قطعی از seed تا رندر سروری هم همان گوشه را انتخاب کند
      if (seed !== undefined && seed !== null) {
        return ((seed >>> 3) & 1) === 0 ? "tl" : "tr";
      }
      return chooseNextCorner();
    }
    return corner;
  }

  // ساخت مسیر صاعقه — دقیقاً مثل صاعقه.html:
  //   • تنه تا وقتی displace < 2.5 یا عمق > 16 ادامه می‌دهد (پس صاعقه «خط» نمی‌شود)
  //   • شمارندهٔ branches فقط درِ شاخه‌هاست، نه عمق تنه
  //   • شاخه در جهت حرکتِ همان قطعه ± ۰٫۹۵ رادیان بیرون می‌زند
  function buildBoltSegments(x1, y1, x2, y2, displace, branches, width, color, rnd, out, depth) {
    depth = depth || 0;

    if (displace < 2.5 || depth > 16) {
      out.push({
        x1: x1, y1: y1, x2: x2, y2: y2,
        width: Math.max(0.35, width),
        color: color || "#ffffff"
      });
      return;
    }

    var midX = (x1 + x2) / 2;
    var midY = (y1 + y2) / 2;
    var nx = midX + (rnd() - 0.5) * displace;
    var ny = midY + (rnd() - 0.5) * displace;

    buildBoltSegments(x1, y1, nx, ny, displace / 2, branches - 1, width * 0.92, color, rnd, out, depth + 1);
    buildBoltSegments(nx, ny, x2, y2, displace / 2, branches - 1, width * 0.92, color, rnd, out, depth + 1);

    if (branches > 0 && rnd() < 0.38) {
      var ddy = (ny - y1) || 1;
      var ddx = (nx - x1) || 1;
      var angle = Math.atan2(ddy, ddx) + (rnd() - 0.5) * 1.9;
      var branchLen = Math.hypot(x2 - x1, y2 - y1) * (0.25 + rnd() * 0.42);
      var bx = nx + Math.cos(angle) * branchLen;
      var by = ny + Math.sin(angle) * branchLen;
      var branchColor = (color === "#ffffff" || color === "#fff") ? "#a8c0ff" : "#ffffff";

      buildBoltSegments(nx, ny, bx, by, displace * 0.7, branches - 2, width * 0.6, branchColor, rnd, out, depth + 1);
    }
  }

  /**
   * ساخت یک رخداد صاعقه.
   * @param {number} t   زمان شروع روی تایم‌لاین (ثانیه)
   * @param {object} options { seed, corner/start, duration, branches, thickness,
   *                           intensity, color/hue, boltCount, flash }
   */
  function createLightningEvent(t, options) {
    options = options || {};

    var seed = options.seed !== undefined && options.seed !== null
      ? (toInt(options.seed, 0) >>> 0)
      : makeSeed();

    var rawCorner = normalizeCorner(
      options.corner !== undefined ? options.corner
        : (options.startCorner !== undefined ? options.startCorner : options.start)
    );
    if (!rawCorner) rawCorner = lightningDefaults.alternate ? "alternate" : "random";

    var corner = resolveCorner(rawCorner, seed);

    var duration = clamp(toNumber(options.duration, lightningDefaults.duration), 0.05, 10);
    var boltCount = clamp(toInt(options.boltCount, lightningDefaults.boltCount), 1, 8);
    var branches = clamp(
      toInt(options.branches !== undefined ? options.branches : lightningDefaults.branches, 4), 0, 8);
    var hue = options.color || options.hue || lightningDefaults.hue;
    var flash = options.flash !== undefined ? !!options.flash : lightningDefaults.flash;
    var thickness = clamp(
      toNumber(options.thickness !== undefined ? options.thickness : lightningDefaults.thickness, 1), 0.2, 4);
    var intensity = clamp(
      toNumber(options.intensity !== undefined ? options.intensity : lightningDefaults.intensity, 80), 0, 100);

    return {
      type: "storm_lightning",
      title: "صاعقه",
      badgeText: "⚡ صاعقه",
      badgeBg: "linear-gradient(135deg,#263d9b,#a8c0ff)",
      badgeColor: "#fff",
      t: toNumber(t, 0),
      duration: duration,
      corner: corner,
      seed: seed,
      boltCount: boltCount,
      branches: branches,
      hue: hue,
      flash: flash,
      thickness: thickness,
      intensity: intensity,
      _geom: null,
      _geomKey: ""
    };
  }

  function ensureLightningGeometry(ev, W, H) {
    if (!ev || !(W > 0) || !(H > 0)) return null;

    var key = Math.round(W) + "x" + Math.round(H) + ":" + ev.seed + ":" + ev.boltCount + ":" +
      ev.branches + ":" + ev.corner + ":" + ev.thickness + ":" + ev.intensity;

    if (ev._geom && ev._geomKey === key) return ev._geom;

    var rnd = mulberry32(ev.seed || 1);
    var bolts = [];
    var baseCorner = ev.corner || "random";
    // مقیاس ضخامت/هاله نسبت به اندازهٔ بوم (نمونهٔ صاعقه.html در ۳۸۰×۷۰۰ کشیده شده بود)
    var scale = clamp(Math.max(W, H) / 700, 0.8, 3.0);
    var intenMul = 0.70 + 0.55 * clamp((ev.intensity === undefined ? 80 : ev.intensity) / 100, 0, 1);
    var thicknessMul = clamp(ev.thickness === undefined ? 1 : ev.thickness, 0.2, 4);
    var boltCount = clamp(ev.boltCount === undefined ? 1 : ev.boltCount, 1, 8);
    var branches = clamp(ev.branches === undefined ? 4 : ev.branches, 0, 8);

    for (var i = 0; i < boltCount; i++) {
      var corner = baseCorner;

      if (corner === "random") {
        var arr = ["tl", "tr", "bl", "br"];
        corner = arr[Math.floor(rnd() * arr.length) % arr.length];
      }

      var start = cornerPoint(corner, W, H);

      if (i > 0) {
        start.x += (rnd() - 0.5) * W * 0.12;
        start.y += (rnd() - 0.5) * H * 0.04;
        start.x = clamp(start.x, 0, W);
        start.y = clamp(start.y, 0, H);
      }

      // مقصد: مثل randomTarget در نمونه — همیشه داخل کادر
      var endX = W * (0.12 + rnd() * 0.76);
      var endY = isTopCorner(corner)
        ? H * (0.54 + rnd() * 0.43)
        : H * (0.03 + rnd() * 0.43);

      var baseDisplace = Math.min(W, H) * 0.26 + 26;
      var width = (1.2 + rnd() * 1.6) * scale * thicknessMul * intenMul;
      var color = rnd() > 0.62 ? "#a8c0ff" : (ev.hue || "#ffffff");

      var segments = [];
      buildBoltSegments(start.x, start.y, endX, endY, baseDisplace, branches, width, color, rnd, segments, 0);

      bolts.push({ segments: segments, start: start, endX: endX, endY: endY, color: color });
    }

    var geom = { W: W, H: H, scale: scale, bolts: bolts };
    ev._geom = geom;
    ev._geomKey = key;
    return geom;
  }

  // سه‌پاس ضربه‌قلم روی یک مسیر (هاله / بدنه / مغز) — مثل حلقهٔ سه‌بارهٔ نمونه
  var BOLT_PASSES = [0.55, 1.10, 1.65];

  function paintSegments(ctx, segments, scale, alpha) {
    if (!segments || !segments.length) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (var p = 0; p < BOLT_PASSES.length; p++) {
      ctx.globalAlpha = alpha;
      for (var i = 0; i < segments.length; i++) {
        var s = segments[i];
        var w = Math.max(0.35, s.width * BOLT_PASSES[p]);
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.lineWidth = w;
        ctx.strokeStyle = s.color;
        ctx.shadowBlur = Math.min(24 * scale, w * 6);
        ctx.shadowColor = s.color;
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  }

  /* ---------- کش کردن هر ضربه در یک اسپرایت (تصویر آماده) ----------
     چرا؟ صاعقهٔ شاخه‌دار ~۵۰۰ قطعه دارد و ۳ پاس = ~۱۵۰۰ ضربه‌قلم با shadowBlur
     در هر فریم. یک‌بار روی بوم مخفی کشیده می‌شود و بعد هر فریم فقط drawImage
     با آلفای متغیر انجام می‌شود ⇒ همان جزئیات، بدون سنگینی روی گوشی. */

  var spriteOwners = [];
  var SPRITE_MAX = 4;

  function createSpriteCanvas(w, h) {
    if (typeof document !== "undefined" && document.createElement) {
      var c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    }
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    return null;
  }

  function ensureLightningSprite(ev, W, H) {
    var geom = ensureLightningGeometry(ev, W, H);
    if (!geom) return null;

    if (ev._sprite && ev._spriteKey === ev._geomKey) return ev._sprite;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
    for (var b = 0; b < geom.bolts.length; b++) {
      var segs = geom.bolts[b].segments;
      for (var i = 0; i < segs.length; i++) {
        var sg = segs[i];
        if (sg.x1 < minX) minX = sg.x1;
        if (sg.x2 < minX) minX = sg.x2;
        if (sg.x1 > maxX) maxX = sg.x1;
        if (sg.x2 > maxX) maxX = sg.x2;
        if (sg.y1 < minY) minY = sg.y1;
        if (sg.y2 < minY) minY = sg.y2;
        if (sg.y1 > maxY) maxY = sg.y1;
        if (sg.y2 > maxY) maxY = sg.y2;
        any = true;
      }
    }
    if (!any) return null;

    var pad = Math.round(geom.scale * 26) + 12;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;

    var cw = Math.max(1, Math.round(maxX - minX));
    var ch = Math.max(1, Math.round(maxY - minY));

    // سقف حافظه: اگر اسپرایت بزرگ شد، با نسبت کوچک‌تر ساخته می‌شود (کیفیت عملاً یکی است)
    var MAX_SPRITE_PIXELS = 8e6;
    var kScale = 1;
    if (cw * ch > MAX_SPRITE_PIXELS) kScale = Math.sqrt(MAX_SPRITE_PIXELS / (cw * ch));

    var canvas = createSpriteCanvas(Math.max(1, Math.round(cw * kScale)),
                                   Math.max(1, Math.round(ch * kScale)));
    if (!canvas) return null;
    var c2 = canvas.getContext("2d");
    if (!c2) return null;

    if (kScale !== 1) c2.scale(kScale, kScale);
    c2.translate(-minX, -minY);
    for (var b2 = 0; b2 < geom.bolts.length; b2++) {
      paintSegments(c2, geom.bolts[b2].segments, geom.scale, 1);
    }

    var sprite = { canvas: canvas, x: minX, y: minY, w: cw, h: ch };
    ev._sprite = sprite;
    ev._spriteKey = ev._geomKey;

    // فقط ۴ اسپرایت آخر نگه داشته می‌شود
    spriteOwners.push(ev);
    while (spriteOwners.length > SPRITE_MAX) {
      var old = spriteOwners.shift();
      if (old && old !== ev) { old._sprite = null; old._spriteKey = ""; }
    }

    return sprite;
  }

  function drawSegments(ctx, segments, alpha) {
    if (!segments || !segments.length || alpha <= 0.003) return;
    ctx.save();
    paintSegments(ctx, segments, 1, clamp(alpha, 0, 1));
    ctx.restore();
  }

  // رسم رخداد صاعقه در زمان جاری (cur = زمان مطلق کلیپ)
  function renderStormLightning(ctx, ev, cur, W, H) {
    if (!ctx || !ev || ev.type !== "storm_lightning" || !(W > 0) || !(H > 0)) return false;

    cur = toNumber(cur, 0);
    var p = (cur - ev.t) / ev.duration;
    if (p < 0 || p > 1) return false;

    var geom = ensureLightningGeometry(ev, W, H);
    if (!geom) return false;

    var intenMul = 0.70 + 0.55 * clamp((ev.intensity === undefined ? 80 : ev.intensity) / 100, 0, 1);

    // ۱) فلاش کوتاه و لرزان پشت صحنه
    if (ev.flash !== false) {
      var flashP = clamp(1 - p / 0.38, 0, 1);

      if (flashP > 0) {
        var flicker = 0.5 + 0.5 * Math.sin((p * 45 + (ev.seed % 1000) * 0.001) * Math.PI * 2);
        var flashAlpha = flashP * (0.1 + 0.1 * flicker) * intenMul;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(200,220,255," + flashAlpha.toFixed(4) + ")";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    // ۲) خود صاعقه: از اسپرایت آماده بلیت می‌شود (سبک)، وگرنه مستقیم کشیده می‌شود
    var alpha = Math.pow(1 - p, 1.25);
    if (alpha <= 0.004) return true;

    var sprite = ensureLightningSprite(ev, W, H);
    if (sprite) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.drawImage(sprite.canvas, sprite.x, sprite.y, sprite.w, sprite.h);
      ctx.restore();
    } else {
      for (var i = 0; i < geom.bolts.length; i++) {
        drawSegments(ctx, geom.bolts[i].segments, alpha);
      }
    }

    return true;
  }

  // رسم فوری یک صاعقه با مختصات دلخواه (سازگاری با کدهای قبلی)
  function drawStormBolt(ctx, x1, y1, x2, y2, color, alpha, width, displace, branches) {
    if (!ctx) return;

    color = color || "#ffffff";
    alpha = alpha === undefined || alpha === null ? 1 : alpha;
    width = width === undefined || width === null ? 1.5 : width;
    if (displace === undefined) displace = Math.hypot(x2 - x1, y2 - y1) * 0.45;
    if (branches === undefined) branches = 4;

    var segments = [];
    var rnd = mulberry32(1);
    buildBoltSegments(x1, y1, x2, y2, displace, branches, width, color, rnd, segments, 0);
    drawSegments(ctx, segments, clamp(alpha, 0, 1));
  }

  /* ---------- صاعقه‌های فعال (برای استفاده‌ی مستقل از تایم‌لاین FX) ---------- */

  function triggerLightning(t, options) {
    if (!lightningEnabled) return null;
    var ev = createLightningEvent(t, options);
    activeEvents.push(ev);
    return ev;
  }

  function drawLightningIfActive(ctx, cur, W, H) {
    if (!ctx || !lightningEnabled) return false;

    cur = toNumber(cur, 0);
    var drew = false;

    for (var i = activeEvents.length - 1; i >= 0; i--) {
      var ev = activeEvents[i];
      if (!ev) continue;
      if (cur > ev.t + ev.duration) {
        activeEvents.splice(i, 1);
        continue;
      }
      if (cur < ev.t) continue;
      if (renderStormLightning(ctx, ev, cur, W, H)) drew = true;
    }
    return drew;
  }

  function drawEffectsIfActive(ctx, cur, W, H, accentColor) {
    var a = drawRainIfActive(ctx, cur, W, H, accentColor ? { color: accentColor } : null);
    var b = drawLightningIfActive(ctx, cur, W, H);
    return a || b;
  }

  /* ---------- تنظیمات پیش‌فرض صاعقه ---------- */

  function getLightningDefaults() {
    return {
      duration: lightningDefaults.duration,
      boltCount: lightningDefaults.boltCount,
      branches: lightningDefaults.branches,
      hue: lightningDefaults.hue,
      alternate: lightningDefaults.alternate,
      flash: lightningDefaults.flash,
      thickness: lightningDefaults.thickness,
      intensity: lightningDefaults.intensity,
      corner: lightningDefaults.corner
    };
  }

  function setLightningDefaults(opts) {
    if (!opts) return getLightningDefaults();

    if (opts.duration !== undefined) {
      lightningDefaults.duration = clamp(toNumber(opts.duration, lightningDefaults.duration), 0.05, 10);
    }
    if (opts.boltCount !== undefined) {
      lightningDefaults.boltCount = clamp(toInt(opts.boltCount, lightningDefaults.boltCount), 1, 8);
    }
    if (opts.branches !== undefined) {
      lightningDefaults.branches = clamp(toInt(opts.branches, lightningDefaults.branches), 0, 8);
    }
    if (opts.hue !== undefined) lightningDefaults.hue = opts.hue || lightningDefaults.hue;
    if (opts.color !== undefined) lightningDefaults.hue = opts.color || lightningDefaults.hue;
    if (opts.alternate !== undefined) lightningDefaults.alternate = !!opts.alternate;
    if (opts.flash !== undefined) lightningDefaults.flash = !!opts.flash;
    if (opts.thickness !== undefined) {
      lightningDefaults.thickness = clamp(toNumber(opts.thickness, lightningDefaults.thickness), 0.2, 4);
    }
    if (opts.intensity !== undefined) {
      lightningDefaults.intensity = clamp(toNumber(opts.intensity, lightningDefaults.intensity), 0, 100);
    }
    if (opts.corner !== undefined || opts.start !== undefined) {
      var c = normalizeCorner(opts.corner !== undefined ? opts.corner : opts.start);
      lightningDefaults.corner = c && c !== "alternate" ? c : "";
    }

    return getLightningDefaults();
  }

  function setLightningEnabled(on) {
    lightningEnabled = !!on;
    if (!lightningEnabled) activeEvents.length = 0;
    return lightningEnabled;
  }

  /* ============================ API سراسری ============================ */

  var api = global.LyraxStorm = global.LyraxStorm || {};

  api.VERSION = VERSION;
  api.name = "LyraxStorm";

  // صاعقه
  api.trigger = triggerLightning;
  api.triggerLightning = triggerLightning;
  api.createLightningEvent = createLightningEvent;
  api.renderStormLightning = renderStormLightning;
  api.drawLightningIfActive = drawLightningIfActive;
  api.drawStormBolt = drawStormBolt;
  api.setLightningEnabled = setLightningEnabled;
  api.isLightningEnabled = function () { return !!lightningEnabled; };
  api.setLightningDefaults = setLightningDefaults;
  api.getLightningDefaults = getLightningDefaults;
  api.setDefaultLightningDuration = function (duration) {
    return setLightningDefaults({ duration: duration });
  };
  api.resetLightningAlternation = function (corner) {
    var c = normalizeCorner(corner);
    nextCorner = c === "tr" ? "tr" : "tl";
  };
  api.getNextCorner = function () { return nextCorner; };

  // بارندگی
  api.setRain = setRain;
  api.setRainEnabled = function (on) { return setRain({ enabled: !!on }).enabled; };
  api.isRainEnabled = function () { return !!rain.enabled; };
  api.toggleRain = function () { return setRain({ enabled: !rain.enabled }).enabled; };
  api.getRainConfig = getRainConfig;
  api.getRainState = getRainState;
  api.bakeRainDrops = bakeRainDrops;
  api.drawRainAt = drawRainAt;
  api.drawRainIfActive = drawRainIfActive;

  // هر دو با هم
  api.drawEffectsIfActive = drawEffectsIfActive;

  // ابزارها
  api.hashString = hashString;
  api.mulberry32 = mulberry32;
  api.easeOutCubic = easeOutCubic;
  api.getActiveEvents = function () { return activeEvents.slice(); };
  api.clearActiveEvents = function () { activeEvents.length = 0; };
  api.DEFAULTS = { rain: rainDefaults, lightning: lightningDefaults };
})(typeof window !== "undefined" ? window : this);
