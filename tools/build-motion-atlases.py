"""Pack the original native poses for network-independent gaze playback."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'site/assets/sequence-film'
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
stride = manifest['nativeStride']
rows = list(range(0, len(manifest['grid']['pitch']), stride))
cols = list(range(0, len(manifest['grid']['yaw']), stride))
destination = root / 'motion'
destination.mkdir(exist_ok=True)
atlases = {}
for tier in ['balanced', 'high']:
    w, h = (manifest['tiers'][tier][n] for n in ['width', 'height'])
    files = []
    for row in rows:
        sheet = Image.new('RGBA', (w * 5, h * 4))
        for i, col in enumerate(cols):
            with Image.open(root / tier / f'p{row:02}_y{col:02}.webp') as frame:
                sheet.paste(frame.convert('RGBA'), ((i % 5) * w, (i // 5) * h))
        name = f'{tier}-p{row:02}.webp'
        sheet.save(destination / name, 'WEBP', quality=92, method=5, exact=True)
        files.append('motion/' + name)
        print(name, (destination / name).stat().st_size, flush=True)
    atlases[tier] = {'width': w, 'height': h, 'files': files}
manifest['playerVersion'] = '3.1.0'
manifest['motionAtlas'] = {'version': 1, 'columns': 5, 'rows': 4,
    'grid': {axis: [manifest['grid'][axis][i] for i in indices]
             for axis, indices in [('yaw', cols), ('pitch', rows)]},
    'sourceRows': rows, 'sourceCols': cols, 'tiers': atlases}
(root / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
