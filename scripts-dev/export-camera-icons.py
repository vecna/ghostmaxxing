#!/usr/bin/env python3
"""Export the canonical camera SVGs using the site's CSS and palette.

Run from any directory: python3 scripts-dev/export-camera-icons.py
Requires Inkscape on PATH and Pillow. Produces lossless RGBA WebP files,
600x600, centred with at least 30 transparent pixels on every side.
"""
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def export_icons():
    tokens = dict(re.findall(r'(--gm-[\w-]+)\s*:\s*([^;]+);',
                             (ROOT / 'styles/tokens.css').read_text()))
    css = (ROOT / 'styles/cameras.css').read_text()
    css = re.sub(r'var\((--[\w-]+)(?:,\s*[^)]+)?\)',
                 lambda m: tokens.get(m[1], '0.38' if m[1] == '--cam-glare-opacity' else 'initial'), css)
    # Export the base/live appearance. Inline the component's simple class
    # rules so SVG renderers need neither CSS variables nor page stylesheets.
    css = css.split("/* --- 2. Lens states")[0]
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    rules = re.findall(r"\.([\w-]+)\s*\{([^}]+)\}", css)
    properties = {"fill", "stroke", "stroke-width", "stroke-linecap",
                  "stroke-linejoin", "opacity"}
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    destination = ROOT / 'images/icons/webp'
    destination.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        for source in sorted((ROOT / 'images/icons').glob('cam-*.svg')):
            root = ET.fromstring(source.read_text())
            root.set("width", "100")
            root.set("height", "100")
            for element in root.iter():
                classes = element.get("class", "").split()
                styles = {}
                for selector, declarations in rules:
                    if selector in classes:
                        for key, value in re.findall(r"([\w-]+)\s*:\s*([^;]+)", declarations):
                            if key in properties:
                                styles[key] = value.strip()
                if styles:
                    element.set("style", ";".join(f"{k}:{v}" for k, v in styles.items()))
            svg = ET.tostring(root, encoding="unicode")
            svg_path = Path(temp) / source.name
            png_path = svg_path.with_suffix('.png')
            svg_path.write_text(svg)
            subprocess.run(['inkscape', str(svg_path), '--export-width=1200',
                            '--export-background-opacity=0', f'--export-filename={png_path}'],
                           check=True, capture_output=True)
            with Image.open(png_path) as rendered:
                rgba = rendered.convert('RGBA')
                bbox = rgba.getchannel('A').getbbox()
                if bbox is None:
                    raise ValueError(f'Empty camera: {source}')
                art = rgba.crop(bbox)
                art.thumbnail((540, 540), Image.Resampling.LANCZOS)
                canvas = Image.new('RGBA', (600, 600), (0, 0, 0, 0))
                canvas.paste(art, ((600-art.width)//2, (600-art.height)//2))
                output = destination / (source.stem + '.webp')
                canvas.save(output, 'WEBP', lossless=True, exact=True)
            with Image.open(output) as check:
                assert check.size == (600, 600) and check.mode == 'RGBA'
                left, top, right, bottom = check.getchannel('A').getbbox()
                assert min(left, top, 600-right, 600-bottom) >= 30
                assert any(r != g or g != b for r, g, b, a in (check.get_flattened_data() if hasattr(check, 'get_flattened_data') else check.getdata()) if a)
            print(output.relative_to(ROOT))


if __name__ == '__main__':
    export_icons()
