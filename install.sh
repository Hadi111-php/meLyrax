#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
#  نصب بستهٔ «باران و صاعقه» روی پروژهٔ LyraX Clip Studio
#  اجرا از ریشهٔ پروژه:   bash install.sh
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"
TAG="bak.باران-و-صاعقه"

if [ ! -f "$TARGET/app.py" ]; then
  echo "⚠️  در مسیر «$TARGET» فایل app.py پیدا نشد."
  echo "    از ریشهٔ 3-LYRAX-CLIP-STUDIO اجرا کن یا مسیر را بده: bash install.sh /path/to/3-LYRAX-CLIP-STUDIO"
  exit 1
fi

backup () {
  local f="$1"
  [ -f "$f" ] && cp -f "$f" "$f.$TAG" && echo "   🗂  پشتیبان: $f.$TAG"
}

echo "📦 نصب در: $TARGET"

echo "۱) رندرر FFmpeg"
backup "$TARGET/backend/renderers.py"
mkdir -p "$TARGET/backend"
cp -f "$HERE/backend/renderers.py" "$TARGET/backend/renderers.py"

echo "۲) ماژول‌های جاوااسکریپت"
mkdir -p "$TARGET/js/modules"
backup "$TARGET/js/modules/lyrax-fx.js"
cp -f "$HERE/studio/js/modules/lyrax-weather.js" "$TARGET/js/modules/lyrax-weather.js"
cp -f "$HERE/studio/js/modules/lyrax-fx.js"       "$TARGET/js/modules/lyrax-fx.js"

echo "۳) داشبورد"
if [ -f "$TARGET/lyrax-studio-pro-v4.html" ]; then
  cp -f "$HERE/studio/lyrax-studio-pro-v4-weather.html" "$TARGET/lyrax-studio-pro-v4-weather.html"
else
  cp -f "$HERE/studio/lyrax-studio-pro-v4-weather.html" "$TARGET/lyrax-studio-pro-v4-weather.html"
fi

echo "۴) پچ models.py"
if [ -f "$TARGET/backend/models.py" ]; then
  backup "$TARGET/backend/models.py"
  python3 - "$TARGET/backend/models.py" <<'PY'
import re, sys, pathlib
p = pathlib.Path(sys.argv[1])
s = p.read_text(encoding="utf-8")
need = ['rain_overlay', 'weather_lightning', 'layer_fx']
if all(('"%s"' % k) in s for k in need):
    print("   ✅ از قبل پچ شده است")
    raise SystemExit(0)
m = re.search(r'(for optional_key in \(\s*)([^)]*?)(\s*\)\s*:)', s, flags=re.S)
if not m:
    print("   ⚠️  بلوک optional_key پیدا نشد. دستی اضافه کن (بخش ۶ فایل README).")
    raise SystemExit(0)
body = m.group(2).rstrip()
if not body.endswith(','):
    body += ','
extra = '\n        "rain_overlay", "weather_lightning", "layer_fx",'
s = s[:m.start(2)] + body + extra + '\n    ' + s[m.end(2):]
p.write_text(s, encoding="utf-8")
print("   ✅ کلیدهای rain_overlay / weather_lightning / layer_fx اضافه شد")
PY
else
  echo "   ⚠️  backend/models.py نبود؛ یادت باشد فیلدهای اختیاری را دستی اضافه کنی."
fi

echo ""
echo "✅ نصب تمام شد."
echo "   داشبورد:  $TARGET/lyrax-studio-pro-v4-weather.html"
echo "   برگشت:    فایل‌های *.$TAG را به نام اصلی برگردان."
