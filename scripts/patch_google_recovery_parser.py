#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).with_name('recover_google_inventory_basic.py')
text = path.read_text(encoding='utf-8')
old = """def load_production():\n    text = (DATA / 'production_area1.js').read_text(encoding='utf-8')\n    m = re.search(r'window\\.PRODUCTION_RESTAURANTS\\s*=\\s*(\\[.*\\])\\s*;?\\s*$', text, re.S)\n    if not m:\n        raise RuntimeError('Cannot parse production_area1.js')\n    return json.loads(m.group(1))\n"""
new = """def load_production():\n    text = (DATA / 'production_area1.js').read_text(encoding='utf-8')\n    prefix = 'window.PRODUCTION_RESTAURANTS='\n    start = text.find(prefix)\n    end = text.find(';\\nwindow.PRODUCTION_STATS=', start)\n    if start < 0 or end < 0:\n        raise RuntimeError('Cannot parse production_area1.js')\n    return json.loads(text[start + len(prefix):end])\n"""
if old not in text:
    raise SystemExit('Expected recovery parser block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('patched recovery parser')
