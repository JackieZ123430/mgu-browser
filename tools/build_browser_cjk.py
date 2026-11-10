"""Rebuild the committed native CJK atlas (Pillow, Node and public OFL font).

Normal Store builds copy the committed atlas and need no font download/Pillow.
The baseline character list preserves the pinned kit's existing glyph coverage.
"""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.request
import zlib
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/ui-fonts'
URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf'
SHA256 = 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da'


def main():
    fontfile = ROOT / '.local/browser-fonts/NotoSansSC.ttf'
    if not fontfile.exists():
        fontfile.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(URL, timeout=60) as response:
            fontfile.write_bytes(response.read())
    if hashlib.sha256(fontfile.read_bytes()).hexdigest() != SHA256:
        raise SystemExit('Noto Sans SC SHA-256 mismatch')
    labels = json.loads(subprocess.check_output([
        'node', '-e', 'process.stdout.write(JSON.stringify(Object.values(require("./src/browser_zh_cn"))))'
    ], cwd=ROOT, encoding='utf-8'))
    titles = '--titles' in sys.argv
    extra = ''
    if titles:
        # GB2312's complete Chinese repertoire, not just translated menu words.
        for high in range(0xb0, 0xf8):
            for low in range(0xa1, 0xff):
                try:
                    extra += bytes([high, low]).decode('gb2312')
                except UnicodeDecodeError:
                    pass
    chars = sorted(set((OUT / 'cjk-baseline.txt').read_text(encoding='utf-8').strip()
                       + ''.join(labels) + '中文网页标题' + extra))
    for size in ((24, 22, 20, 18, 16, 14, 12) if titles else (48, 44, 40, 36, 32)):
        font = ImageFont.truetype(str(fontfile), size)
        font.set_variation_by_axes([500])
        ascent, descent = font.getmetrics()
        glyphs, tiles = {}, []
        x = y = row = 0
        for ch in chars:
            box = font.getbbox(ch, anchor='ls')
            w, h = max(0, box[2]-box[0]), max(0, box[3]-box[1])
            if x+w > 1024:
                x, y, row = 0, y+row+1, 0
            glyphs[ord(ch)] = [x, y, w, h, box[0], box[1], round(font.getlength(ch), 2)]
            if w and h:
                tile = Image.new('L', (w, h), 0)
                ImageDraw.Draw(tile).text((-box[0], -box[1]), ch, font=font, fill=255, anchor='ls')
                tiles.append((tile, (x, y)))
            x += w+1
            row = max(row, h)
        height = y+row+1
        if height <= 2048:
            break
    if height > 2048:
        raise SystemExit('CJK atlas exceeds renderer texture budget')
    atlas = Image.new('L', (1024, height), 0)
    for tile, position in tiles:
        atlas.paste(tile, position)
    data = dict(size=size, ascent=ascent, descent=descent, atlasW=1024, atlasH=height,
                glyphs=glyphs, alpha=base64.b64encode(zlib.compress(atlas.tobytes(), 9)).decode())
    cache = hashlib.sha256(json.dumps(data, separators=(',', ':')).encode()).hexdigest()[:16]
    family = 'cjk-titles' if titles else 'cjk'
    result = dict(family=family, source='Noto Sans SC (OFL-1.1)', cacheKey=cache, sizes=[data])
    (OUT / (family+'.json')).write_text(json.dumps(result, separators=(',', ':'))+'\n', encoding='utf-8')
    print(f'CJK: {len(chars)} glyphs, {size}px, 1024 x {height}')


if __name__ == '__main__':
    main()
