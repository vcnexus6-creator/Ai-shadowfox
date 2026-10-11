"""Build one self-contained HTML file of the phone app (app/www/index.html + engine.js).

The result opens straight from a phone or laptop with no other files, so it can be
downloaded, emailed or shared. Usage:  python tools/build_single_html.py [out_path]
"""
import base64
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / "app" / "www"
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "plant-ops-optimiser.html"

html = (WWW / "index.html").read_text(encoding="utf-8")
engine = (WWW / "engine.js").read_text(encoding="utf-8")
icon = base64.b64encode((WWW / "icons" / "icon-192.png").read_bytes()).decode()


def swap(old, new):
    global html
    if html.count(old) != 1:
        sys.exit(f"build_single_html: expected exactly one {old!r} in index.html")
    html = html.replace(old, new)


# inline the engine, and flag the build so links to sibling pages are hidden
swap('<script src="engine.js"></script>', f"<script>window.SINGLE_FILE = true;\n{engine}\n</script>")
# links to files that will not sit next to a downloaded copy
swap('<link rel="manifest" href="manifest.webmanifest">\n', "")
swap('<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">', f'<link rel="icon" type="image/png" href="data:image/png;base64,{icon}">')
swap('<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">', f'<link rel="apple-touch-icon" href="data:image/png;base64,{icon}">')

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size // 1024} KB)")
