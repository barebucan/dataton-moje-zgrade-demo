from pathlib import Path
from urllib.parse import urlencode
import urllib.request,json,sqlite3,math,threading,concurrent.futures,functools
from shapely.geometry import shape
from shapely.ops import transform
from shapely import STRtree,make_valid
from pyproj import Transformer
P=Path(__file__).resolve().parent
SOLAR='https://gis.zagreb.hr/server/rest/services/Hosted/Objekti/FeatureServer/7'
TR=Transformer.from_crs(4326,3765,always_xy=True).transform
LOCK=threading.RLock()
def db():return sqlite3.connect('file:'+str(P/'data/themes.sqlite')+'?mode=ro&immutable=1',uri=True)
@functools.lru_cache(maxsize=1)
def city():
 c=db();r={r[0]:r[1:] for r in c.execute('select oid,bid,x,y from city')};c.close();return r
def report():
 c=db();r=json.loads(c.execute("select payload from meta where key='report'").fetchone()[0]);c.close();return r
def renewal_projects():
 c=db();rows=[json.loads(v) for v, in c.execute('select payload from renewal')];c.close();return rows
def tile(tx,ty):
 path=P/'sources'/('solar-tile-%s-%s.json'%(tx,ty))
 with LOCK:
  if path.exists():return json.loads(path.read_text())
 params=dict(where='1=1',geometry=f'{tx/100},{ty/100},{(tx+1)/100},{(ty+1)/100}',geometryType='esriGeometryEnvelope',spatialRel='esriSpatialRelIntersects',inSR=4326,outSR=4326,outFields='objectid,povrsina,korisna_povrsina,id',f='geojson',resultRecordCount=2000,orderByFields='objectid')
 features=[];offset=0
 for _ in range(20):
  params['resultOffset']=offset
  with urllib.request.urlopen(SOLAR+'/query?'+urlencode(params),timeout=18) as r:j=json.load(r)
  if 'error' in j or 'features' not in j:raise RuntimeError('Solarni izvor nije dostupan')
  features.extend(j['features'])
  if len(j['features'])<2000:break
  offset+=len(j['features'])
 else:raise RuntimeError('Prevelik izvorni kadar; približi kartu')
 result=dict(type='FeatureCollection',features=features,snapshot='2026-11-04',source=SOLAR,tile=[tx,ty])
 with LOCK:
  tmp=path.with_suffix('.'+str(threading.get_ident())+'.tmp');tmp.write_text(json.dumps(result));tmp.replace(path)
 return result
@functools.lru_cache(maxsize=12)
def owner_index(keys):
 import spatial_api
 x0=min(x for x,y in keys)/100;y0=min(y for x,y in keys)/100;x1=(max(x for x,y in keys)+1)/100;y1=(max(y for x,y in keys)+1)/100
 c=spatial_api.connect('osm.sqlite')
 rows=c.execute('select b.oid,b.geometry from spatial s join buildings b on b.id=s.id where s.maxx>=? and s.minx<=? and s.maxy>=? and s.miny<=?',(x0,x1,y0,y1)).fetchall();c.close()
 rows=[r for r in rows if r[0] in city()]
 geoms=[transform(TR,make_valid(shape(json.loads(g)))) for oid,g in rows]
 return [oid for oid,g in rows],geoms,STRtree(geoms)
def solar_features(features):
 if not features:return
 boxes=[shape(f['geometry']).bounds for f in features]
 x0=min(b[0] for b in boxes);x1=max(b[2] for b in boxes);y0=min(b[1] for b in boxes);y1=max(b[3] for b in boxes)
 keys=[(x,y) for x in range(math.floor(x0*100),math.floor(x1*100)+1) for y in range(math.floor(y0*100),math.floor(y1*100)+1)]
 if len(keys)>24:
  for f in features:f['properties']['theme_data']=dict(state='zoom',message='Približi kartu za solarne podatke.')
  return
 try:
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:tiles=list(ex.map(lambda k:tile(*k),keys))
 except Exception as e:
  for f in features:f['properties']['theme_data']=dict(state='error',message='Solarni servis trenutačno nije dostupan. Pokušaj ponovno.',detail=str(e))
  return
 roofs={f['properties']['objectid']:f for t in tiles for f in t['features']}
 owner_ids,owner_geoms,owners=owner_index(tuple(keys))
 entries=list(roofs.values());gs=[transform(TR,make_valid(shape(f['geometry']))) for f in entries];tree=STRtree(gs)
 for f in features:
  g=transform(TR,make_valid(shape(f['geometry'])));matches=[];ambiguous=[]
  for idx in tree.query(g,predicate='intersects'):
   r=entries[idx];rg=gs[idx];area=g.intersection(rg).area
   rf=area/max(rg.area,1e-9);bf=area/max(g.area,1e-9)
   if rf<.2 and bf<.2:continue
   a=r['properties'];e=dict(source_id=a['objectid'],povrsina=a.get('povrsina'),korisna_povrsina=a.get('korisna_povrsina'),roof_overlap=round(rf,4),outline_overlap=round(bf,4),projected_footprint_m2=round(rg.area,2),method='full footprint overlap in EPSG:3765')
   if rf>=.8:
    competing=[owner_ids[int(i)] for i in owners.query(rg,predicate='intersects') if owner_geoms[int(i)].intersection(rg).area/max(rg.area,1e-9)>=.8]
    e['owner_candidates']=competing
    if competing==[f['properties']['id']]:matches.append(e)
    else:ambiguous.append(e)
   else:ambiguous.append(e)
  values=[m['korisna_povrsina'] for m in matches]
  valid=bool(matches) and not ambiguous and all(isinstance(v,(int,float)) and math.isfinite(v) and v>=0 for v in values)
  total=round(sum(values),2) if valid else None
  roof_total=sum(m['povrsina'] for m in matches) if matches and all(isinstance(m['povrsina'],(int,float)) and m['povrsina']>0 for m in matches) else None
  if total is not None and roof_total is not None and total>roof_total*1.01:valid=False;total=None
  code='s0' if total==0 else 's1' if total is not None and total<25 else 's2' if total is not None and total<100 else 's3' if total is not None and total<500 else 's4' if total is not None else 'unknown'
  f['properties'].update(theme_value=code,theme_known=valid,theme_data=dict(state='known' if valid else 'ambiguous' if ambiguous or matches else 'no_match',useful_m2=total,roof_m2=round(roof_total,2) if roof_total else None,useful_pct=round(total/roof_total*100,1) if valid and roof_total else None,matches=matches,ambiguous=ambiguous,method='sum original korisna_povrsina only for source footprints >=80% contained; no allocation of partial roofs',source=SOLAR,snapshot='2026-11-04',source_period='model 2008.; dopune 2012./2019.; sloj 24052024',production_kwh_year=None,power_kwp=None))

def annotate(data,theme,scenario='mala'):
 if data.get('clustered'):return data
 data=json.loads(json.dumps(data));fs=data.get('features',[])
 for f in fs:f['properties'].update(theme_value='unknown',theme_known=False,theme_name=theme)
 if theme=='solar':solar_features(fs)
 else:
  c=db()
  for f in fs:
   if theme=='flood':
    r=c.execute('select payload from flood where oid=? and scenario=?',(f['properties']['id'],scenario)).fetchone()
    v=json.loads(r[0]) if r else dict(category='outside',depth=None,edge=False)
    f['properties'].update(theme_value='f'+str(v['depth']) if v.get('depth') else 'edge' if v['category']=='edge' else 'water' if v['category']=='water' else 'unknown',theme_known=v['category'] in ['depth','edge','water','no_value'],theme_data=v)
   elif theme=='renewal':
    rows=[json.loads(v) for v, in c.execute('select payload from renewal where oid=?',(f['properties']['id'],))]
    statuses={r['attributes']['status'] for r in rows}
    code='done' if statuses=={'ENERGETSKA OBNOVA ZAVRŠENA'} else 'progress' if statuses=={'ENERGETSKA OBNOVA U TIJEKU'} else 'not_renewed' if statuses=={'NIJE OBNOVLJENO'} else 'mixed' if statuses else 'unknown'
    f['properties'].update(theme_value=code,theme_known=bool(rows),theme_data=dict(state='known' if rows else 'no_data',projects=rows))
  c.close()
 if theme=='solar' and any(f['properties'].get('theme_data',{}).get('state') in ['error','zoom'] for f in fs):data['note']='Solarni podaci nisu učitani. Približi kartu ili pokušaj ponovno.'
 data['theme']=theme;data['revision']='mz-20261104-1'
 return data
def scoped(data):
 if data.get('type')=='FeatureCollection' and not data.get('clustered'):
  data={**data,'features':[f for f in data['features'] if f['properties']['id'] in city()]}
 return data
def generic_search(q):
 import spatial_api
 tokens=__import__('re').findall(r'\w+',spatial_api.norm(q))[:20]
 if not tokens:return []
 c=db()
 rows=c.execute("select oid,name,address from city_search where city_search match ? limit 30",(' AND '.join('"'+t+'"*' for t in tokens),)).fetchall();c.close()
 return [dict(record='outline:'+oid,certificate='',name=name or address,unit='',address=address or name,city='Zagreb',heating='unknown',primary='unknown',issued='',status='unknown',reason='Izvorni obris bez nužnog certifikata',targets=[dict(id=oid,x=city()[oid][1],y=city()[oid][2],quality='unknown',method='OSM outline address/name')]) for oid,name,address in rows]
ANNOTATIONS={}
def annotate_cached(data,theme,scenario):
 import hashlib
 key=(theme,scenario,hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest())
 with LOCK:
  if key in ANNOTATIONS:return ANNOTATIONS[key]
 result=annotate(data,theme,scenario)
 if not any(f['properties'].get('theme_data',{}).get('state')=='error' for f in result.get('features',[])):
  with LOCK:
   ANNOTATIONS[key]=result
   if len(ANNOTATIONS)>24:ANNOTATIONS.pop(next(iter(ANNOTATIONS)))
 return result
def project_points(box):
 rows=[]
 for r in renewal_projects():
  x,y=r['point']
  if box[0]<=x<=box[2] and box[1]<=y<=box[3]:
   a=r['attributes'];rows.append(dict(type='Feature',geometry=dict(type='Point',coordinates=[x,y]),properties=dict(sid=r['source_id'],name=a['naziv'],address=a['adresa'],status=a['status'],oid=r['oid'] or '',code='done' if a['status']=='ENERGETSKA OBNOVA ZAVRŠENA' else 'progress' if a['status']=='ENERGETSKA OBNOVA U TIJEKU' else 'not_renewed' if a['status']=='NIJE OBNOVLJENO' else 'recorded')))
 return dict(type='FeatureCollection',features=rows)

@functools.lru_cache(maxsize=1)
def eligible_records():
 c=db();r={r for r, in c.execute('select record from city_records')};c.close();return r

def overview(box,quality=None):
 import collections
 groups=collections.defaultdict(list)
 import spatial_api
 summary=spatial_api.summaries(spatial_api.version()) if quality else None
 for oid,(bid,x,y) in city().items():
  if quality and not spatial_api.group(summary.get(bid),quality):continue
  if box[0]<=x<=box[2] and box[1]<=y<=box[3]:groups[(round(x/.02)*.02,round(y/.02)*.02)].append((x,y))
 return dict(type='FeatureCollection',clustered=True,features=[dict(type='Feature',geometry=dict(type='Point',coordinates=[sum(x for x,y in v)/len(v),sum(y for x,y in v)/len(v)]),properties=dict(count=len(v))) for v in groups.values()],note='Zagreb · kanonski obrisi s kandidatskim energetskim zapisima. Približi za zgrade.' if quality else 'Zagreb · broj kanonskih obrisa, ne broj rezultata teme. Približi za tematske podatke.')
