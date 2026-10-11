"""Build the downloadable, self-contained HTML files from the app page (app/www/index.html).

  plant-ops-optimiser.html  for phones
  plant-ops-website.html    for laptops and desktops

Both are the same page: it switches to its phone layout (bottom tab bar) on narrow
screens and uses the full width on wide ones. Each opens with no other files.
Usage:  python tools/build_single_html.py [out_dir]     (default: dist/)
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / "app" / "www"
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist"


def data_uri(name, mime):
    return f"data:{mime};base64," + base64.b64encode((WWW / "icons" / name).read_bytes()).decode()


EMBED = {
    "icons/operon-mark.png": data_uri("operon-mark.png", "image/png"),
    "icons/operon-logo.webp": data_uri("operon-logo.webp", "image/webp"),
}
ICON = data_uri("icon-192.png", "image/png")


def build():
    html = (WWW / "index.html").read_text(encoding="utf-8")
    # drop links to files that will not sit next to a downloaded copy, and embed the images
    if html.count('<link rel="manifest" href="manifest.webmanifest">\n') != 1:
        sys.exit("build_single_html: manifest link not found in index.html")
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', "")
    html = re.sub(r'<link rel="icon"[^>]*>', f'<link rel="icon" type="image/png" href="{ICON}">', html, count=1)
    html = re.sub(r'<link rel="apple-touch-icon"[^>]*>', f'<link rel="apple-touch-icon" href="{ICON}">', html, count=1)
    for path, uri in EMBED.items():
        html = html.replace(path, uri)
    html = re.sub(r"\nif \('serviceWorker' in navigator[^\n]*\n[^\n]*\n\}\n", "\n", html, count=1)
    if "serviceWorker" in html or "icons/" in html:
        sys.exit("build_single_html: a reference to a sibling file is still present")
    return html


OUT.mkdir(parents=True, exist_ok=True)
page = build()
for name in ("plant-ops-optimiser.html", "plant-ops-website.html"):
    path = OUT / name
    path.write_text(page, encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")
