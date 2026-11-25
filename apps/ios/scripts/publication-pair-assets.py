"""Shape fixtures made from repository-licensed photos, not user records. Requires Pillow."""
import json
import sys
from pathlib import Path
from PIL import Image

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=False)
base = Path(__file__).resolve().parent.parent / 'assets/first-run'
a = Image.open(base / 'coffee.jpg').convert('RGB')
b = Image.open(base / 'window.jpg').convert('RGB')
c = Image.open(base / 'flowers.jpg').convert('RGB')
small = a.copy()
small.thumbnail((160, 160))
images = {
    'landscape-a': a, 'landscape-b': b.crop((0, 450, 1200, 1200)),
    'portrait-a': b, 'portrait-b': c,
    'square-a': a.crop((234, 0, 1166, 932)),
    'square-b': c.crop((0, 193, 1200, 1393)), 'small': small,
}
meta = {}
for name, im in images.items():
    im.save(root / (name + '.jpg'), quality=92)
    meta[name] = {'width': im.width, 'height': im.height, 'file': name + '.jpg'}
(root / 'dimensions.json').write_text(json.dumps(meta))
