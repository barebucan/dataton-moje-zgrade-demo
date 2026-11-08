from pathlib import Path
import json,hashlib
P=Path(__file__).resolve().parent
_cached=None;_stamp=None
def descriptor():
 global _cached,_stamp
 meta=P/'web/vector/v207/index.json'
 if not meta.is_file():return None
 import spatial_api
 files=[P/'data/theme-view.sqlite',P/'spatial/data/osm.sqlite',spatial_api.link_path()]
 wals=[f.with_name(f.name+'-wal') for f in files]
 wal_stats=[(f.stat().st_mtime_ns,f.stat().st_size) if f.exists() and f.stat().st_size else (0,0) for f in wals]
 stamp=tuple((f.stat().st_mtime_ns,f.stat().st_size) for f in files)+tuple(wal_stats)
 if any(size for _,size in wal_stats):_cached=None;_stamp=stamp;return None
 if stamp==_stamp:return _cached
 d=json.loads(meta.read_text());valid=True
 for f,key in zip(files,['theme_sha256','geometry_sha256','links_sha256']):
  with f.open('rb') as stream:valid=valid and hashlib.file_digest(stream,'sha256').hexdigest()==d[key]
 _cached={k:d[k] for k in ['revision','tiles','minzoom','maxzoom','bounds']} if valid else None
 if _cached is not None:_cached['tile_keys']=list(d['files'])
 _stamp=stamp
 return _cached
