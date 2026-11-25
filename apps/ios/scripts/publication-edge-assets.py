"""Synthetic boundary fixtures, never user photos. Requires Pillow; output is new."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=False)
source = Path(__file__).resolve().parent.parent / 'assets/first-run/coffee.jpg'
src = Image.open(source).convert('RGB')
small = src.copy()
small.thumbnail((160, 160))
small.save(root / 'small.jpg', quality=75)
w, h = src.size
src.crop((0, h // 2 - 85, w, h // 2 + 90)).save(root / 'panorama.jpg', quality=95)
src.save(root / 'unknown.jpg', quality=95)
font_path = sys.argv[2] if len(sys.argv) > 2 else '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc'
font, title = ImageFont.truetype(font_path, 26), ImageFont.truetype(font_path, 40)
im = Image.new('RGB', (600, 3600), '#faf9f5')
d = ImageDraw.Draw(im)
d.text((45, 55), '一个缓慢的周末', font=title, fill='#345e5b')
for i in range(6):
    y = 180 + i * 550
    d.line((45, y, 555, y), fill='#96b0a5', width=2)
    d.text((45, y + 24), f'{i + 1:02d}  留住这一天', font=title, fill='#345e5b')
    for j, line in enumerate(['早晨的光落在窗边，', '我们一起走过熟悉的小路。', '听见风，也听见家人的笑声。', '这些普通的片刻，慢慢留下来。']):
        d.text((45, y + 110 + j * 62), line, font=font, fill='#35423d')
d.text((45, 3520), '记录的末尾 · 完整保留', font=font, fill='#345e5b')
im.save(root / 'long.png')
meta = {}
for p in root.iterdir():
    if p.suffix in ['.jpg', '.png']:
        with Image.open(p) as decoded:
            meta[p.stem] = {'width': decoded.width, 'height': decoded.height, 'file': p.name}
(root / 'dimensions.json').write_text(json.dumps(meta))
