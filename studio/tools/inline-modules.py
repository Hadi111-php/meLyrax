#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
inline-modules.py — هم‌گام‌کردن ماژول‌های js/modules با داشبورد تک‌فایلی

داشبورد `studio/lyrax-studio-pro-v4-weather.html` نسخهٔ تزریق‌شده‌ی ماژول‌ها را
داخل خودش دارد (چون باید بدون build و بدون فایل بیرونی اجرا شود). اگر فایل‌های
`studio/js/modules/*.js` را تغییر دادی، این اسکریپت را بزن تا نسخهٔ داخل داشبورد
همان لحظه به‌روز شود:

    python3 studio/tools/inline-modules.py

اسکریپت idempotent است: هر بار اجرا، بلوک هر ماژول را با محتوای تازه‌ی فایل
جای‌گزین می‌کند و اگر بلوکی نبود، آن را می‌سازد.
"""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
STUDIO = ROOT / "studio"
HTML = STUDIO / "lyrax-studio-pro-v4-weather.html"

# (نام ماژول، مسیر فایل، نشانه‌ای که بلوک همان ماژول را در HTML پیدا می‌کند)
MODULES = [
    ("lyrax-storm", "js/modules/lyrax-storm.js",
     "js/modules/lyrax-storm.js (تزریق‌شده)"),
    ("lyrax-fx", "js/modules/lyrax-fx.js",
     "js/modules/lyrax-fx.js (تزریق‌شده)"),
    ("lyrax-weather", "js/modules/lyrax-weather.js",
     "LyraX Weather  —  js/modules/lyrax-weather.js"),
]


def block_for(name, code):
    return ("<script>\n"
            "        /* ---- js/modules/%s.js (تزریق‌شده) ---- */\n"
            "%s\n"
            "    </script>" % (name, code))


def main():
    if not HTML.exists():
        sys.exit("داشبورد پیدا نشد: %s" % HTML)

    html = HTML.read_text(encoding="utf-8")
    changed = []

    for name, rel, signature in MODULES:
        path = STUDIO / rel
        if not path.exists():
            print("— %s پیدا نشد، رد شد" % rel)
            continue

        code = path.read_text(encoding="utf-8").rstrip("\n")
        new_block = block_for(name, code)

        if signature in html:
            i = html.index(signature)
            start = html.rindex("<script>", 0, i)
            end = html.index("</script>", i) + len("</script>")
            if html[start:end] != new_block:
                html = html[:start] + new_block + html[end:]
                changed.append(name)
        else:
            print("— بلوک %s در داشبورد پیدا نشد" % name)

    if changed:
        HTML.write_text(html, encoding="utf-8")
        print("✅ به‌روز شد: " + ", ".join(changed))
    else:
        print("✅ همه‌چیز از قبل هم‌گام بود.")


if __name__ == "__main__":
    main()
