"""Versioned, precomputed map cells. Detail APIs remain authoritative."""
from pathlib import Path
import json,hashlib
P=Path(__file__).resolve().parent
INDEX=None;STAMP=None
def index():
 global INDEX,STAMP
 path=P/'data/theme-view.sqlite'
 stamp=(path.stat().st_mtime_ns,path.stat().st_size)
 if stamp==STAMP:return INDEX
 meta=P/'web/map-tiles/v206-small/index.json'
 if not meta.exists():return None
 data=json.loads(meta.read_text())
 with path.open('rb') as f:valid=hashlib.file_digest(f,'sha256').hexdigest()==data['theme_sha256']
 with (P/'spatial/data/osm.sqlite').open('rb') as f:valid=valid and hashlib.file_digest(f,'sha256').hexdigest()==data['geometry_sha256']
 INDEX={k:data[k] for k in ['revision','dx','dy','path']}

 INDEX['theme_revision']=__import__('fast_themes').revision()
 if not valid:INDEX=None
 STAMP=stamp
 return INDEX
