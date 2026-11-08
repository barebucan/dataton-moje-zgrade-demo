"""Read-only spatial layer. Only retained offline OSM + IEC data."""
from pathlib import Path
from urllib.parse import parse_qs
import json,sqlite3,re,math,unicodedata,functools,threading
from building_model import model
from consumption_api import lookup as consumption_lookup
P=Path(__file__).resolve().parent;R=P/'linking/20261029-national'
release=P/'active-spatial-release.json'
if release.exists():R=P/json.loads(release.read_text())['path']
@functools.lru_cache(maxsize=4)
def summaries(version):
 c=connect('links.sqlite');d={bid:json.loads(payload) for bid,payload in c.execute('SELECT bid,payload FROM building_summary')};c.close();return d
@functools.lru_cache(maxsize=4)
def models(token):
 path=R/'data/models.sqlite'
 if not path.exists():return {}
 c=sqlite3.connect('file:'+str(path)+'?mode=ro&immutable=1',uri=True);data={bid:json.loads(payload) for bid,payload in c.execute('select bid,payload from models')};c.close();return data
@functools.lru_cache(maxsize=4)
def part_parents(token):return {p['id']:bid for bid,v in models(token).items() for p in v.get('parts',[])}
def modeled(oid,tags,g,bid,quality='default'):
 props=properties(oid,tags,g);props.update(model(tags,models(version()).get(bid)))
 # Independently linked parts are rendered as their own source footprints and colours.
 props['model_parts']=[part for part in props['model_parts'] if not group(summaries(version()).get(part.get('linked_geometry_bid')),quality)]
 return props
@functools.lru_cache(maxsize=4)
def geometry_aliases(token):
 c=connect('links.sqlite')
 try:rows=c.execute('select alias_bid,canonical_bid,source_oid,canonical_oid from geometry_aliases').fetchall()
 except sqlite3.OperationalError:rows=[]
 c.close();return {a:b for a,b,_,_ in rows}
@functools.lru_cache(maxsize=4)
def equivalent_ids(token):
 c=connect('links.sqlite');d={}
 try:
  for a,b,oid,canonical in c.execute('select alias_bid,canonical_bid,source_oid,canonical_oid from geometry_aliases'):d.setdefault(b,[canonical]).append(oid)
 except sqlite3.OperationalError:pass
 c.close();return d
def version():return (str(R),link_path().stat().st_mtime_ns)

def link_path():return R/'data/published.sqlite' if (R/'data/published.sqlite').exists() else R/'data/links.sqlite'
def connect(name):
 path=link_path() if name=='links.sqlite' else R/'data'/name
 if name=='osm.sqlite':
  pointer=P/'runtime/reviewed-osm.json'
  if pointer.exists():
   reviewed=json.loads(pointer.read_text())
   if reviewed['base']==str(path):
    path=Path(reviewed['path'])
 return sqlite3.connect('file:'+str(path)+'?mode=ro&immutable=1',uri=True)
def norm(s):return ''.join(c for c in unicodedata.normalize('NFD',s.lower().replace('đ','d')) if unicodedata.category(c)!='Mn')
def tier(p):return p.get('quality',['default'])[0] if p.get('quality',['default'])[0] in ['default','strong','all'] else 'default'
def group(payload,quality):
 return (json.loads(payload) if isinstance(payload,str) else payload).get(quality) if payload else None
def height(tags):
 try:
  if tags.get('height'):
   h=float(re.search('[0-9]+(?:[.,][0-9]+)?',tags['height'])[0].replace(',','.'))
   if 1<h<200:return h,'Visina navedena u OSM-u: '+tags['height']
  if tags.get('building:levels'):
   lv=float(tags['building:levels'])
   if 0<lv<50:return lv*3,'Procjena: '+tags['building:levels']+' etaža × 3 m'
 except (TypeError,ValueError):pass
 return 8,'Simbolična visina 8 m; stvarna nije navedena'
def properties(oid,tags,g):
 address=' '.join(filter(None,[tags.get('addr:street',tags.get('addr:place','')),tags.get('addr:housenumber','')]))
 h,basis=height(tags)
 return dict(id=oid,osm_id=int(oid[1:]) if oid[0] in 'wr' else None,osm_type=('relation' if oid[0]=='r' else 'way') if oid[0] in 'wr' else None,geometry_source=tags.get('source','OSM'),source_id=tags.get('source_id',oid),source_snapshot=tags.get('source_snapshot','2026-10-27'),name=tags.get('name') or address or (g or {}).get('name') or 'Zgrada bez upisanog naziva',address=address or (g or {}).get('address',''),city=(g or {}).get('city',tags.get('addr:city','')),heating=(g or {}).get('heating','unknown'),primary=(g or {}).get('primary','unknown'),quality=(g or {}).get('quality','unknown'),record_count=(g or {}).get('records',0),height=h,height_basis=basis,status='candidate' if g else 'unknown',scope_confirmed=False,methods=(g or {}).get('methods',[]))
def uncached_handle(path,query):
 p=parse_qs(query)
 if not (R/'data/published-link-report.json').exists():return dict(error='Prostorni sloj se još obrađuje.'),503
 if path=='/api/spatial/summary':
  r=json.loads((R/'data/published-link-report.json').read_text());r['osm']=json.loads((R/'data/osm-extraction.json').read_text());return r,200
 if path=='/api/spatial/map':
  try:
   bb=[float(v) for v in p.get('bbox',['15.98,45.79,15.99,45.80'])[0].split(',')]
   if len(bb)!=4 or not all(math.isfinite(v) for v in bb):raise ValueError()
   xmin,ymin,xmax,ymax=bb
   if not(-180<=xmin<xmax<=180 and -90<=ymin<ymax<=90):raise ValueError()
  except ValueError:return dict(error='Neispravan obuhvat.'),400
  q=tier(p);only=p.get('only',['0'])[0]=='1'
  if xmax-xmin>.13 or ymax-ymin>.10:
   clusters=json.loads((R/'data/published-clusters.json').read_text())
   features=[]
   for f in clusters['features']:
    n=f['properties'].get('counts_by_quality',{}).get(q,f['properties']['count'])
    if n and xmin<=f['geometry']['coordinates'][0]<=xmax and ymin<=f['geometry']['coordinates'][1]<=ymax:
     f['properties']['count']=n;features.append(f)
   return dict(type='FeatureCollection',features=features,clustered=True,total_clusters=len(features),note='Brojevi su agregati kandidatski povezanih obrisa. Približi za pojedine zgrade.'),200
  o=connect('osm.sqlite');l=connect('links.sqlite')
  summary=summaries(version())
  rows=o.execute('SELECT b.id,b.oid,b.geometry,b.tags FROM spatial s JOIN buildings b ON b.id=s.id WHERE minx<=? AND maxx>=? AND miny<=? AND maxy>=? LIMIT 16001',(xmax,xmin,ymax,ymin)).fetchall()
  fs=[];seen_bids=set();aliases=geometry_aliases(version())
  for bid,oid,geo,tags in rows:
   if bid in aliases:
    bid=aliases[bid];oid,geo,tags=o.execute('select oid,geometry,tags from buildings where id=?',(bid,)).fetchone()
   if bid in seen_bids:continue
   seen_bids.add(bid)
   g=group(summary.get(bid),q)
   if only and not g:continue
   if oid in part_parents(version()) and not g:continue
   prop=modeled(oid,json.loads(tags),g,bid,q)
   if p.get('compact',['0'])[0]=='1':
    prop={k:v for k,v in prop.items() if k in ['id','name','address','city','heating','primary','quality','record_count','height','base_height','height_quality','render_parent','model_parts']}
    prop['model_parts']=[{k:v for k,v in part.items() if k in ['id','geometry','height','base_height','height_quality']} for part in prop['model_parts']]
   fs.append(dict(type='Feature',id=bid,geometry=json.loads(geo),properties=prop))
  fs.sort(key=lambda f:(not f['properties']['record_count'],f['properties']['id']))
  truncated=len(fs)>6000 or len(rows)>16000;fs=fs[:6000]
  o.close();l.close()
  return dict(type='FeatureCollection',features=fs,clustered=False,truncated=truncated,quality=q,note='Približi za sve obrise.' if truncated else ''),200
 if path.startswith('/api/spatial/building/'):
  oid=path.rsplit('/',1)[1]
  if not re.fullmatch('(?:[wr][0-9]+|dHRTTB[0-9]+|dkp[0-9]+|zt[0-9]+)',oid):return dict(error='Neispravna oznaka obrisa.'),400
  o=connect('osm.sqlite');l=connect('links.sqlite')
  row=o.execute('SELECT * FROM buildings WHERE oid=?',(oid,)).fetchone()
  if not row:o.close();l.close();return dict(error='Obris nije pronađen.'),404
  bid,oid,x,y,geo,tags=row
  requested_id=path.rsplit('/',1)[1]
  if bid in geometry_aliases(version()):bid,oid,x,y,geo,tags=o.execute('select * from buildings where id=?',(geometry_aliases(version())[bid],)).fetchone()
  payload=l.execute('SELECT payload FROM building_summary WHERE bid=?',(bid,)).fetchone()
  g=group(payload[0] if payload else None,tier(p))
  prop=modeled(oid,json.loads(tags),g,bid,tier(p));prop.update(equivalent_outline_ids=equivalent_ids(version()).get(bid,[oid]),requested_id=requested_id);certs=[]
  c=sqlite3.connect('file:'+str(P/'data/certificates.sqlite')+'?mode=ro&immutable=1',uri=True)
  for rec,quality,score,method,evidence in l.execute('SELECT record,quality,score,method,evidence FROM links WHERE bid=? ORDER BY record DESC',(bid,)):
   record=json.loads(c.execute('SELECT payload FROM certificates WHERE id=?',(rec,)).fetchone()[0])
   candidates=json.loads(l.execute('SELECT candidates FROM outcomes WHERE record=?',(rec,)).fetchone()[0])
   record.update(link_quality=quality,link_method=method,link_evidence=json.loads(evidence),other_candidate_count=max(0,len(candidates)-1))
   certs.append(record)
  consumption_addresses=[prop.get('address','')]+[r.get('address','') for r in certs if r.get('city','').lower()=='zagreb']
  consumption_names=[prop.get('name','')]+[r.get('building_name','') for r in certs]+[r.get('unit_name','') for r in certs]
  consumption_city='Zagreb' if any(r.get('city','').lower()=='zagreb' for r in certs) else prop.get('city','')
  heated_area=certs[0].get('heated_area') if len(certs)==1 else None
  prop['consumption']=consumption_lookup(consumption_addresses,consumption_city,heated_area,consumption_names)
  prop.update(certificates=certs,facilities=[],reason='Spoj je izveden iz dostupnih adresa, geometrije i naziva. Nije službena potvrda da certifikat vrijedi za cijeli obris.',evidence='Svaki pridruženi zapis ima zasebno objašnjenje povezivanja.',tags=json.loads(tags))
  o.close();l.close();c.close()
  return dict(type='Feature',id=bid,geometry=json.loads(geo),properties=prop),200
 if path=='/api/spatial/search':
  q=p.get('q',[''])[0][:200];tokens=re.findall(r'\w+',norm(q))
  if not tokens:return dict(records=[],total=0),200
  c=sqlite3.connect('file:'+str(P/'data/certificates.sqlite')+'?mode=ro&immutable=1',uri=True);l=connect('links.sqlite');o=connect('osm.sqlite')
  c.execute('ATTACH DATABASE ? AS spatial',('file:'+str(link_path())+'?mode=ro&immutable=1',))
  c.execute('ATTACH DATABASE ? AS themes',('file:'+str(P/'data/themes.sqlite')+'?mode=ro&immutable=1',))
  expression=' AND '.join('"'+t+'"*' for t in tokens)
  from themes import eligible_records
  matched=sorted((r[0] for r in c.execute('SELECT rowid FROM search WHERE text MATCH ?',(expression,)) if r[0] in eligible_records()),reverse=True)
  total=len(matched)
  rows=[(rid,c.execute('SELECT payload FROM certificates WHERE id=?',(rid,)).fetchone()[0]) for rid in matched[:40]]
  results=[]
  for rec,payload in rows:
   r=json.loads(payload);outcome=l.execute('SELECT status,reason FROM outcomes WHERE record=?',(rec,)).fetchone();targets=[]
   for bid,quality,method in l.execute('SELECT bid,quality,method FROM links WHERE record=?',(rec,)):
    oid,x,y,target_tags=o.execute('SELECT oid,x,y,tags FROM buildings WHERE id=?',(bid,)).fetchone();targets.append(dict(id=oid,x=x,y=y,quality=quality,method=method,name=json.loads(target_tags).get('name','')))
   results.append(dict(display_name=targets[0].get('name','') if len(targets)==1 else '',record=rec,certificate=r['certificate'],name=r['building_name'],unit=r['unit_name'],address=r['address'],city=r['city'],heating=r['heating_class'],primary=r['primary_class'],issued=r['issued'],status=outcome[0],reason=outcome[1],targets=targets))
  c.close();l.close();o.close()
  return dict(records=results,total=total,limit=40),200
 if path.startswith('/api/spatial/outcome/'):
  try:rec=int(path.rsplit('/',1)[1])
  except ValueError:return dict(error='Neispravan redak.'),400
  l=connect('links.sqlite');row=l.execute('SELECT status,method,reason,candidates FROM outcomes WHERE record=?',(rec,)).fetchone();l.close()
  if not row:return dict(error='Nije pronađeno.'),404
  return dict(record=rec,status=row[0],method=row[1],reason=row[2],candidates=json.loads(row[3])),200
 return dict(error='Nepoznata prostorna radnja.'),404

@functools.lru_cache(maxsize=48)
def cached_map(token,query):return uncached_handle('/api/spatial/map',query)
def handle(path,query):
 if path=='/api/spatial/map':return cached_map(version(),query)
 return uncached_handle(path,query)
