# 🧠 پرامپت کامل معماری — LyraX Clip Studio

> این فایل **خودش یک پرامپت آمادهٔ کپی** است.
> از خط «🟢 شروع پرامپت» تا «🔴 پایان پرامپت» را کپی کن و به هر مدل/دستیار بده.
> انتهای فایل یک «نسخهٔ فشرده» هم هست برای وقتی که context کم داری.

---

## 🟢 شروع پرامپت

### ۰) نقش تو
تو مهندس ارشد یک پروژهٔ تک‌فایلیِ ساخت کلیپ لیریکس (LyraX Clip Studio) هستی.
تخصص تو: Canvas 2D، Web Audio، MediaRecorder، طراحی لایه‌ای افکت، و پورت الگوریتم‌ها به Python/FFmpeg.
قاعدهٔ طلایی پروژه: **بدون `Math.random` در مسیر رندر** (همه‌چیز seed-محور است تا پیش‌نمایش = خروجی نهایی)
و **افکت‌ها فقط «نوع + ثانیه + پارامتر» ذخیره می‌شوند**؛ جزئیات شکل هنگام رسم ساخته می‌شود.

---

### ۱) سیستم در یک پاراگراف
یک داشبورد HTML **تک‌فایلی** (بدون build، بدون npm) که موزیک + متن را می‌گیرد، هر خط را زمان‌بندی می‌کند
(دستی با تپ یا خودکار از LRC)، و روی یک بوم عمودی ۱۰۸۰×۱۹۲۰ چند لایه را کامپوزیت می‌کند:
پس‌زمینه/ویدیو، ماسک شفاف، تصاویر اوورلی زمان‌دار، باران، زیرنویس کارائوکه/مکعب ۳بعدی، افکت‌ها
(آتش‌بازی/موج شوک/جرقه/فلاش/صاعقه/رگبار)، رعد هماهنگ با بیت، برند/امضا و واترمارک.
همان بوم با `captureStream` + صدای Web Audio داخل `MediaRecorder` ضبط می‌شود و فایل ویدیویی
(WebM/MP4) + JSON پروژه تولید می‌شود. همان JSON را رندرر پایتون (`backend/renderers.py`) می‌خواند و
با ساخت فایل ASS + FFmpeg همان کلیپ را سمت سرور می‌سازد.

---

### ۲) درخت فایل‌ها

```
meLyrax/
├─ studio/
│  ├─ lyrax-studio-pro-v4-weather.html   ← کل اپ (۵۴۲KB): CSS + HTML تب‌ها + ۷ بلوک <script>
│  ├─ js/modules/
│  │  ├─ lyrax-fx.js      (v1.2.0)  افکت‌های لایه‌ای + تایم‌لاین افکت + delegate صاعقه/رگبار به Storm
│  │  ├─ lyrax-storm.js   (v1.1.0)  موتور ⚡صاعقه (bolt) و 🌧️باران (drops) — منبع رسم این دو
│  │  └─ lyrax-weather.js (v1.0.0)  موتور قدیمی: تنظیمات باران/صاعقه + fallback (رعد بیت از آن نیست)
│  └─ tools/
│     ├─ inline-modules.py            ← ۳ ماژول روی دیسک را دوباره داخل HTML تزریق می‌کند
│     └─ tests/smoke-*.js             ← تست دودی با jsdom (فقط توسعه)
├─ backend/renderers.py               ← رندرر FFmpeg + پورت الگوریتم‌ها به ASS
├─ install.sh                         ← نصب/کپی + بکاپ
├─ README_FA.md
└─ ARCHITECTURE_PROMPT_FA.md          ← همین فایل
```

⚠️ **نکتهٔ حیاتی:** فقط سه ماژول بالا روی دیسک هستند. دو ماژول `lyrax-lyric-fx.js` و `lyrax-brand.js`
**فقط داخل خود HTML** زندگی می‌کنند (بلوک ۲ و ۳). یعنی منبع حقیقتِ آن دو، خود HTML است.

---

### ۳) بوت و ترتیب اسکریپت‌ها (داخل HTML، به همین ترتیب)

| # | بلوک | حجم | نقش |
|---|---|---|---|
| 0 | JSZip 3.10.1 | ~98KB | ساخت ZIP (بایگانی/بستهٔ پروژه) |
| 1 | `lyrax-fx.js` (تزریق‌شده) | 16KB | `window.LyraxFx` |
| 2 | `lyrax-lyric-fx.js` (فقط اینجا) | 24KB | `window.LyraxLyricFx` (مکعب ۳بعدی + کلمه‌به‌کلمه) |
| 3 | `lyrax-brand.js` (فقط اینجا) | 20KB | `window.LyraxBrand` |
| 4 | `lyrax-weather.js` (تزریق‌شده) | 20KB | `window.LyraxWeather` |
| 5 | `lyrax-storm.js` (تزریق‌شده) | 29KB | `window.LyraxStorm` |
| 6 | اپ اصلی | 204KB | همهٔ state، کامپوزیت، ضبط، UI، خروجی |

اپ اصلی بعد از تعریف ماژول‌ها اجرا می‌شود و در `window.onload → initApp()` راه می‌افتد.

---

### ۴) مدل وضعیت (State) — همه گلوبال در اپ اصلی

**زمان و پخش**
`audioElement` (یک `new Audio()` سراسری)، `audioFileObj`، `bgMediaObj {file,type,elem}`،
`isPlaying`، `isPaused`، `isRecordingActive`، `simulatedTime`، `lastTimestamp`، `animId`،
`currentLineIdx`، `hasAutoTiming` (اگر LRC باشد تپ دستی غیرفعال می‌شود).

**بوم**
`W_FULL/H_FULL` (پیش‌فرض ۱۰۸۰×۱۹۲۰؛ در حالت افقی ۱۹۲۰×۱۰۸۰)، `offCanvas/offCtx` (بوم واقعی رندر)،
`prevCanvas/prevCtx` (بوم پیش‌نمایش ۲۷۰×۴۸۰).

**تایم‌لاین**
`parsedLines[]` (متن خام)، `recordedScenario[] {text,start_time,end_time}` (تایم خطوط)،
`overlayImagesList[]` (تصاویر زمان‌دار + `coord{x,y,w,h,rotation}`)،
`manualLightningTimestamps[] {t,tier}` (رعد دستی)، `selectedTimelineTime` (⏱ زمان انتخابی گرید).

**تنظیمات**
`subStyle` (فونت/رنگ/ضخامت خط/سرعت کلمه/چیدمان/انیمیشن)، `lightningSettings` (رعد بیت)،
`audioEQSettings`، `watermarkSettings`، `rainOverlayEnabled`، `maskImgElement/maskFullCanvas`.

**ضبط**
`mediaRecorder`، `recordedVideoChunks[]`، `lastCreatedVideoUrl/Blob/Ext`.

**صدا**
`sharedAudioCtx` (یک AudioContext برای کل صفحه)، `sharedAudioDest` (MediaStreamDestination برای ترک صدا)،
`liveBassEnergyRatio` (انرژی باس زنده برای ضخامت رعد).

---

### ۵) ماژول‌ها: مسئولیت + API

#### `LyraxFx` (بازوی افکت‌های لایه‌ای)
- `FX_DEFS`: `fireworks` 🎆، `shockwave` 🌊، `ember_rain` ✨، `rain_storm` 🌧️، `lightning_storm` ⚡، `strobe_flash` 💥.
- API: `trigger(type,t)` → رخداد می‌سازد و برمی‌گرداند؛ `getTimelineEvents()`؛ `updateAndReplay(cur,dt)` (پخش مجدد حین رندر تمیز)؛ `drawAll(ctx,cur,W,H,color)`؛ `resetReplay()`؛ `restore(list)`؛ `nudge/update/remove/clearAll`؛ `setEnabled(type,bool)` (نوع ناشناس را نادیده می‌گیرد)؛ `handleKey`؛ `setTriggerHandler`.
- **`rain_storm` و `lightning_storm` خودشان رسم نمی‌شوند**؛ به `LyraxStorm` واگذار می‌شوند.
- `duration` هر افکت داخل `FX_DEFS` است (`lightning_storm = 1.2s`، `strobe_flash = 0.55s`، …).
- پیش‌فرض جداگانهٔ موتور صاعقه (`lightningDefaults.duration = 0.4s`) برای `triggerLightning` مستقیم است.

#### `LyraxStorm` (موتور صاعقه و باران)
- صاعقه: `triggerLightning(t,opts)`، `createLightningEvent`، `renderStormLightning(ctx,ev,cur,W,H)`،
  `drawLightningIfActive`، `setLightningDefaults/getLightningDefaults`، `setLightningEnabled/isLightningEnabled`،
  `resetLightningAlternation`، `drawStormBolt` (رسم فوری با مختصات دلخواه).
- باران: `setRain(cfg)`، `setRainEnabled/toggleRain/isRainEnabled`، `getRainConfig/getRainState`،
  `bakeRainDrops(n)`، `drawRainAt`، `drawRainIfActive`، `drawEffectsIfActive`.
- الگوریتم صاعقه (مهم): `buildBoltSegments` بازگشتی؛ توقف روی `displace < 2.5 || depth > 16`؛
  شاخه با احتمال ۰٫۳۸ در جهت قطعه `±0.95rad`، طول `dist*(0.25+0.42r)`، عرض `0.6×`؛
  شروع از **گوشهٔ دقیق بوم**؛ سه‌پاس `0.55/1.10/1.65` با `shadowBlur=min(24, w*6)`.
- کارایی: هر صاعقه **یک‌بار** در یک بوم مخفی (اسپرایت) بیک می‌شود؛ هر فریم فقط `drawImage` با آلفای متغیر
  (حداکثر ۴ اسپرایت کش، سقف ۸ مگاپیکسل).
- الگوریتم باران: قطره‌ها از `mulberry32(seed)` بیک می‌شوند؛ موقعیت تابعِ خالص زمان با دورهٔ ۸ ثانیه.

#### `LyraxWeather` (موتور قدیمی / تنظیمات)
- `getSettings/setSettings/applyToUI` (منبع `rain_overlay` و `weather_lightning` در JSON)،
  `drawRain` (فقط fallback)، `buildBolt/drawLightning` (استفاده نمی‌شود).
- ⚠️ **رعد هماهنگ با بیت از این ماژول نیست**: اپ خودش `checkBeatAndMaybeTrigger` → `triggerLightningFlash`
  → `drawLightningBolt` را دارد. این مسیر **دست‌نخورده** است.

#### `LyraxLyricFx`
- `cube3d` (مکعب ۳بعدی واقعی: هر خط روی یک وجه)، `wordReveal` (کلمات قطاری)، `parseLine`، `CUBE3D_DURATION`.

#### `LyraxBrand`
- `STYLES` (سناریوهای آماده امضا/لوگو)، `trigger(style,t)`، `getTimelineEvents`، `render(ctx,cur,W,H)`،
  `updateAndReplay`، `resetReplay`، `restore`، `getSettings/setSettings`.

---

### ۶) گراف ارتباط

```
                 ┌──────────────────────── اپ اصلی ────────────────────────┐
                 │  state + drawFrame() + loops + UI + export              │
                 └───┬───────┬────────┬──────────┬───────────┬──────────────┘
      drawFrame()    │       │        │          │           │
        ┌────────────┘       │        │          │           └──────────────┐
        ▼                    ▼        ▼          ▼                          ▼
  LyraxStorm           LyraxFx  LyraxLyricFx  LyraxBrand             (رعد بیت: توکار)
  rain/lightning       drawAll  cube/word     render                 drawActiveLightningFlashes
        ▲                    │
        │  trigger('rain_storm'|'lightning_storm')
        └────────────────────┘

  UI ──(trigger at t)──► LyraxFx / LyraxBrand / LyraxStorm  ──► timeline arrays
  timeline arrays ──(buildMasterProjectObject)──► JSON ──► backend/renderers.py ──► ASS ──► ffmpeg
```

قواعد ارتباط:
- ماژول‌ها **هرگز** state اپ را نمی‌خوانند؛ فقط آرگومان می‌گیرند (`ctx, cur, W, H`) و تایم‌لاین داخلی خودشان را دارند.
- اپ، تنها هماهنگ‌کننده است: `updateAndReplay(cur,dt)` + `drawAll(ctx,cur,W,H)`.
- خروجی همه به `window.Lyrax*` است (بدون import/export، بدون bundler).

---

### ۷) خط لولهٔ کامپوزیت — `drawFrame()` (ترتیب لایه‌ها از پایین به بالا)

1. `clearRect` + کشیدن پس‌زمینه (ویدیو/تصویر با cover و مرکزچین) یا شطرنجی تیره
2. **ماسک شفاف** (`maskFullCanvas`) — سوراخ‌های پرده
3. **تصاویر اوورلی زمان‌دار** با چرخش و کادر راهنما (کادر فقط وقتی `!isRecordingActive`)
4. **باران** (`drawRainOverlay` → `LyraxStorm.drawRainIfActive`)
5. **زیرنویس/لیریکس**: کارائوکه (بولد شدن کلمه‌ها بر اساس `progressRatio`)، یا `LyraxLyricFx.wordReveal`،
   یا مکعب ۳بعدی (`cube3d` + `liveCubeTurnState` برای چرخش دستی)
6. **افکت‌های لایه‌ای** `LyraxFx.drawAll` (شامل صاعقه/رگبار که Storm می‌کشد)
7. **رعد هماهنگ با بیت** `drawActiveLightningFlashes(cur)` (توکار اپ، نه ماژول)
8. **برند/امضا** `LyraxBrand.render`
9. **واترمارک** `drawWatermark(cur)`
10. `prevCtx.drawImage(offCanvas, …)` → پیش‌نمایش

زمان این لایه‌ها از یک منبع می‌آید:
`cur = (audioFileObj && !audioElement.paused) ? audioElement.currentTime : simulatedTime`.

---

### ۸) جریان‌های اجرا

**الف) پیش‌نمایش/ادیت** — بدون ضبط؛ با هر تغییر UI `drawFrame()` صدا زده می‌شود.

**ب) ضبط زنده (`startPlaybackSync`)**
- شرط شروع: لیریکس یا هر رخدادی موجود باشد.
- `MediaRecorder` روی `offCanvas.captureStream(30)` + ترک صدا از `getSharedAudioGraph()`؛
  `mimeCandidates = [webm vp8,opus / mp4 avc1 / webm / mp4]`.
- حلقه: `loop()` با `requestAnimationFrame`؛ در هر فریم `checkBeatAndMaybeTrigger` + `LyraxFx.updateAndReplay`
  + `LyraxBrand.updateAndReplay` + `drawFrame()`؛ پایان با `cur >= totalDur` → `stopPlayback()`.
- تپ دستی (`stepNext`) `start_time` خط را ثبت می‌کند؛ `hasAutoTiming` تپ را غیرفعال می‌کند.

**ج) رندر تمیز (`startCleanReRender`)**
- همان مسیر با `hasAutoTiming = true` و بیت‌ریت ۶Mbps؛ تایم خطوط از `recordedScenario` می‌آید.
- `totalDur` از `getClipDuration()` = طول آهنگ، و اگر آهنگ نبود = آخرین رخداد + ۲ ثانیه.

**د) توقف دستی (`stopPlayback`)**
- `isPlaying=false`، cancelAnimationFrame، `audio.pause()`، `requestData()` + `mediaRecorder.stop()`؛
  `onstop` → ساخت Blob → لینک دانلود + کارت ویدیو.

**ه) خروجی‌ها**
- `exportMasterProjectJSON()` → JSON کامل پروژه
- `downloadClipBundle()` → ZIP: `project.json` + ویدیو + `make_mp4.sh` + `README.txt`
- `saveArchiveAsZip(pkg)` / File System Access → بایگانی تب ۴
- تب ۵ (خروجی ویژه/مقایسه): ضبط دو کلیپ کنار هم

---

### ۹) قرارداد JSON (خروجی به سرور)

```
project_metadata      {project_name, version, base_file, singer_and_credits, orientation, resolution_width/height, fps}
subtitle_defaults     {font,size,color,stroke,sWidth,wordRate,autoSyncSpeed,langOrder,animPreset,verticalAlign}
audio_eq              اکولایزر
watermark             واترمارک
lightning             رعد هماهنگ با بیت
manual_lightning_timestamps [{t,tier}]
rain_overlay          {enabled,density,speed,angle,opacity,length,color}
weather_lightning     {start,branches,thickness,color,intensity}
storm_lightning_defaults {duration,boltCount,branches,hue,alternate,flash,...}
layer_fx              [{t,type,duration,seed,...}]
brand / brand_timeline
mask_overlay          {enabled,image_base64_png,applies_full_duration}
timeline_events       اوورلی‌ها + خطوط لیریکس (start/end/positioning)
lines_sync_data       recordedScenario
clip_duration         مدت واقعی کلیپ
```

---

### ۱۰) قرارداد قطعیت (Determinism)
- هیچ `Math.random` در مسیر رسم نیست؛ فقط `mulberry32(seed)` با **همان ترتیب فراخوانی** در JS و Python.
- seed هر افکت: `hashString(type + "|" + t.toFixed(3))`؛ seed باران: `hashString("lyrax-storm-rain-v1|" + count)`.
- هندسهٔ صاعقه/باران در JS و Python باید **قطعه‌به‌قطعه** یکی باشد (تست شده تا `< 1e-9`).

---

### ۱۱) رندر سروری (Python)
- `RenderEngine` (پایه) → `FFmpegRenderer` (اصلی) و `MoviePyRenderer` (جایگزین).
- `_generate_ass_subtitles(events, subtitle_defaults, watermark, total_duration, lightning, beat_events, rain_windows)`
  فایل ASS می‌سازد: باران با `\move` (لایه ۰)، صاعقه/فلاش لایه ۳، متن کارائوکه با `\k`.
- پورت الگوریتم: `_storm_bake_rain`، `_iter_storm_rain_segments`، `_storm_bolt_paths`، `_storm_bolt_geometry`،
  `_poly_ribbon` (تبدیل مسیر به پلی‌گون ASS)، `_storm_corner_point`، `detect_beat_times`.
- فونت/شکل‌دهی متن فارسی با Pillow + arabic_reshaper + python-bidi.

---

### ۱۲) ابزارها و تست‌ها
- `python3 studio/tools/inline-modules.py` → بعد از هر تغییر در `js/modules/*.js` **باید** اجرا شود
  (idempotent، بر اساس امضای «تزریق‌شده»).
- `node studio/tools/tests/smoke-fx-grid.js` و `smoke-render-bundle.js` (jsdom لازم دارد).
- تست ASS: نمونه‌سازی رندرر و فراخوانی `_generate_ass_subtitles` (باید ~۱۳۸۶ دیالوگ بدهد).

---

### ۱۳) قواعد نشکستنی
1. پنل/کد **رعد هماهنگ با بیت** (`LIGHTNING_TIERS`, `checkBeatAndMaybeTrigger`, `triggerLightningFlash`,
   `drawLightningBolt`, `drawActiveLightningFlashes`) دست‌نخورده می‌ماند؛ فقط صاعقه و باران تغییر می‌کنند.
2. ترتیب ۹ لایه‌ای `drawFrame` جابه‌جا نمی‌شود.
3. افکت‌ها فقط `type + t + duration + پارامترهای تنظیمات` ذخیره می‌کنند (نه پیکسل/نه دانه).
4. کلیدهای JSON موجود حذف/تغییرنام نمی‌شوند (رندرر سروری به آن‌ها وابسته است).
5. هیچ وابستگی npm در زمان اجرا اضافه نمی‌شود؛ اپ باید با `python -m http.server` کار کند.
6. تغییر در `js/modules/*.js` بدون اجرای `inline-modules.py` = تغییر بی‌اثر.

---

### ۱۴) مشکلات شناخته‌شدهٔ فعلی (نقطهٔ شروع اصلاح)
1. **ساعت رندر با `requestAnimationFrame`** است: با خاموش‌شدن صفحه یا رفتن مرورگر به پس‌زمینه، rAF متوقف
   می‌شود ولی موزیک ادامه دارد ⇒ رندر معلق می‌ماند/فایل ناقص می‌شود و «توقف خودکار» هرگز اجرا نمی‌شود.
2. **`totalDur` یک‌بار و ثابت** حساب می‌شود؛ اگر `audio.duration` در آن لحظه `NaN/Infinity` باشد
   (متادیتا هنوز لود نشده) کلیپ خیلی کوتاه تمام می‌شود.
3. **`audioElement.ended`** بین دو رندر بازنشانی نمی‌شود؛ در رندر دوم می‌تواند همان فریم اول را تمام کند.
4. **پایان رندر هیچ دانلود/ذخیرهٔ خودکاری ندارد** (خواستهٔ صریح کاربر: بعد از رندر فایل + تنظیمات با تایم
   باید خودکار ذخیره شود).
5. اگر `new MediaRecorder(...)` یا `captureStream` خطا بدهد، حلقهٔ رندر بی‌صدا تا آخر می‌رود و **هیچ فایلی** تولید نمی‌شود.
6. `requestData()` و `stop()` در یک تیک اجرا می‌شوند؛ ممکن است آخرین چانک از دست برود.

---

### ۱۵) از تو چه می‌خواهم
- هر تغییر را **کوچک و قابل‌تست** بده (تیکه‌تیکه)، با `node --check` + تست دودی بعد از هر تیکه.
- الگوریتم‌های دوطرفه (JS/Python) را هم‌زمان به‌روز کن و هم‌ارزی را با تست عددی نشان بده.
- قبل از کد، اول تحلیل + فهرست یافته‌ها بده.
- زبان پاسخ فارسی، نام‌گذاری کد انگلیسی، کامنت‌های توضیحی فارسی.

## 🔴 پایان پرامپت

---

## ⚡ نسخهٔ فشرده (برای context کم)

```
سیستم: داشبورد تک‌فایلی ساخت کلیپ لیریکس (studio/lyrax-studio-pro-v4-weather.html).
۷ بلوک اسکریپت به ترتیب: JSZip → LyraxFx → LyraxLyricFx → LyraxBrand → LyraxWeather → LyraxStorm → اپ.
۵ ماژول گلوبال (window.Lyrax*)؛ فقط fx/storm/weather روی دیسک هستند و با studio/tools/inline-modules.py
داخل HTML تزریق می‌شوند (lyric-fx و brand فقط داخل HTML زندگی می‌کنند).
اپ: بوم آف‌اسکرین 1080×1920 (offCanvas/offCtx) + پیش‌نمایش (prevCanvas)؛ drawFrame() ۹ لایه را به ترتیب
پس‌زمینه ← ماسک ← اوورلی ← باران ← زیرنویس/مکعب ← افکت‌ها ← رعد بیت ← برند ← واترمارک می‌کشد و بعد
روی پیش‌نمایش blit می‌کند. زمان همه‌چیز از cur = audio.currentTime (یا simulatedTime) می‌آید.
ضبط: offCanvas.captureStream(30) + ترک صدای Web Audio → MediaRecorder (webm/mp4) → Blob.
سه فلو: پیش‌نمایش، ضبط زنده (startPlaybackSync)، رندر تمیز (startCleanReRender)؛ توقف دستی = stopPlayback.
خروجی: JSON کامل پروژه (buildMasterProjectObject) + ZIP بسته (downloadClipBundle) + بایگانی.
رندر سروری: backend/renderers.py → ASS (_generate_ass_subtitles) + FFmpeg؛ الگوریتم صاعقه/باران
قطعه‌به‌قطعه با JS یکی است (mulberry32، بدون Math.random).
قواعد: رعد هماهنگ با بیت دست‌نخورده؛ ترتیب لایه‌ها ثابت؛ افکت‌ها فقط type+t ذخیره می‌شوند؛
بدون وابستگی npm در زمان اجرا؛ بعد از تغییر ماژول‌ها inline-modules.py الزامی است.
```
