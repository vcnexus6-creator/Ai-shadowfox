"""Build the two downloadable, self-contained HTML files.

  plant-ops-optimiser.html  the phone app (app/www/index.html + engine.js), phone layout only
  plant-ops-website.html    the full analysis page (app/www/classic.html), for laptops and desktops

Each opens straight from a phone or computer with no other files.
Usage:  python tools/build_single_html.py [out_dir]     (default: dist/)
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / "app" / "www"
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist"
RELEASE = "https://github.com/vcnexus6-creator/Ai-shadowfox/releases/download/apk-latest/"
ICON = "data:image/png;base64," + base64.b64encode((WWW / "icons" / "icon-192.png").read_bytes()).decode()


def swap(html, old, new, name):
    if html.count(old) != 1:
        sys.exit(f"build_single_html: expected exactly one {old!r} in {name}")
    return html.replace(old, new)


OPERON = {
    "icons/operon-mark.png": "data:image/png;base64," + base64.b64encode((WWW / "icons" / "operon-mark.png").read_bytes()).decode(),
    "icons/operon-logo.webp": "data:image/webp;base64," + base64.b64encode((WWW / "icons" / "operon-logo.webp").read_bytes()).decode(),
}


def standalone(html, name):
    """Drop links to files that will not sit next to a downloaded copy, and embed the Operon AI images."""
    for path, uri in OPERON.items():
        html = html.replace(path, uri)
    html = swap(html, '<link rel="manifest" href="manifest.webmanifest">\n', "", name)
    html = re.sub(r'<link rel="icon"[^>]*>', f'<link rel="icon" type="image/png" href="{ICON}">', html, count=1)
    html = re.sub(r'<link rel="apple-touch-icon"[^>]*>', f'<link rel="apple-touch-icon" href="{ICON}">', html, count=1)
    return html


def build_mobile():
    html = (WWW / "index.html").read_text(encoding="utf-8")
    engine = (WWW / "engine.js").read_text(encoding="utf-8")
    html = swap(html, '<script src="engine.js"></script>', f"<script>window.SINGLE_FILE = true;\n{engine}\n</script>", "index.html")
    # phone layout only: cut the wide-screen website styles
    start = html.index("/* ===== Website layout for wide screens")
    end = html.index("/* ===== end website layout ===== */\n") + len("/* ===== end website layout ===== */\n")
    html = html[:start] + html[end:]
    return standalone(html, "index.html")


def build_website():
    html = (WWW / "classic.html").read_text(encoding="utf-8")
    html = standalone(html, "classic.html")
    html = swap(html, '<a class="hdr-mark" href="index.html" aria-label="Back to the app" title="Back to the app"',
                f'<a class="hdr-mark" href="{RELEASE}plant-ops-optimiser.html" target="_blank" rel="noopener" aria-label="Mobile version" title="Mobile version"', "classic.html")
    html = re.sub(r"\nif \('serviceWorker' in navigator[^\n]*\n[^\n]*\n\}\n", "\n", html, count=1)
    if "serviceWorker" in html:
        sys.exit("build_single_html: service worker registration still present in the website build")
    return html


OUT.mkdir(parents=True, exist_ok=True)
for name, html in (("plant-ops-optimiser.html", build_mobile()), ("plant-ops-website.html", build_website())):
    path = OUT / name
    path.write_text(html, encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")
