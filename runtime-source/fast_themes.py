"""Indexed values only: no network/geometric work in the HTTP process."""
from pathlib import Path
import json,sqlite3,hashlib,subprocess,time,threading
P=Path(__file__).resolve().parent
J=Path('/tmp/moje-zgrade-solar-jobs');J.mkdir(parents=True,exist_ok=True)
LOCK=threading.Lock()
def connect():return sqlite3.connect('file:'+str(P/'data/theme-view.sqlite')+'?mode=ro&immutable=1',uri=True,timeout=2)
def values(ids,theme,scenario='mala',detail=False,enqueue=True):
 import themes
 ids=list(dict.fromkeys(str(i) for i in ids if str(i) in themes.city()))[:6000]
 result={};c=connect()
 sc=scenario if theme=='flood' else ''
 for offset in range(0,len(ids),500):
  part=ids[offset:offset+500]
  rows=c.execute('select oid,code,known,compact,'+('detail' if detail else 'NULL')+' from values_map where theme=? and scenario=? and oid in ('+','.join('?' for _ in part)+')',[theme,sc]+part)
  for oid,code,known,compact,full in rows:
   d=json.loads(full) if detail and full else json.loads(compact)
   if detail and theme=='flood':
    old=themes.db();r=old.execute('select payload from flood where oid=? and scenario=?',(oid,sc)).fetchone();old.close()
    if r:d=json.loads(r[0])
   result[oid]=dict(theme_name=theme,theme_value=code,theme_known=bool(known),theme_data=d)
 c.close();missing=[]
 for oid in ids:
  if oid not in result:
   if theme=='solar':d=dict(state='pending',message='Pripremam solarne podatke za ovo područje.');missing.append(oid)
   elif theme=='renewal':d=dict(state='no_data',projects=[]) if detail else dict(state='no_data')
   else:d=dict(category='outside',depth=None,edge=False)
   result[oid]=dict(theme_name=theme,theme_value='unknown',theme_known=False,theme_data=d)
 if missing and enqueue:queue(missing)
 return result
def queue(ids):
 key=hashlib.sha256('|'.join(sorted(ids)).encode()).hexdigest()[:20];path=J/('job-'+key+'.json')
 with LOCK:
  if not path.exists():
   tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(dict(ids=ids,created=time.time())));tmp.replace(path)
  # The worker uses flock: one process performs data work, all others exit promptly.
  with open(P/'runtime/solar-worker.log','ab') as log:
   subprocess.Popen([str(P/'.venv/bin/python'),str(P/'scripts/solar_worker.py')],cwd=P,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
def annotate(data,theme,scenario='mala',detail=False):
 import copy
 result=copy.deepcopy(data)
 fs=result.get('features',[]) if result.get('type')=='FeatureCollection' else [result]
 lookup=values([f['properties']['id'] for f in fs],theme,scenario,detail)
 for f in fs:f['properties'].update(lookup.get(f['properties']['id'],{}))
 return result
def retry(ids):
 c=sqlite3.connect(P/'data/theme-view.sqlite',timeout=3)
 for oid in ids:
  r=c.execute("select compact from values_map where oid=? and theme='solar' and scenario=''",(oid,)).fetchone()
  if r and json.loads(r[0]).get('state')=='error':c.execute("delete from values_map where oid=? and theme='solar'",(oid,))
 c.commit();c.close()
 # Failed job requests can be explicitly retried by a new queue key token.
 for path in J.glob('job-*.done'):
  try:
   r=json.loads(path.read_text())
   if set(r.get('ids',[]))&set(ids):path.unlink()
  except (OSError,json.JSONDecodeError):pass

_projects_cache=None
_projects_stamp=None
def projects():
 global _projects_cache,_projects_stamp
 stamp=revision()
 if stamp!=_projects_stamp or _projects_cache is None:
  import themes
  c=connect();row=c.execute("select payload from meta where key='renewal-projects'").fetchone();c.close()
  _projects_cache=json.loads(row[0]) if row else themes.renewal_projects();_projects_stamp=stamp
 return _projects_cache

def project_points(box,completed_only=False,include_footprints=False,confirmed_work_only=False):
 rows=[r for r in projects() if (not completed_only or r['status_code']=='done') and (not confirmed_work_only or r['status_code'] in {'done','partial'}) and not r.get('oid') and r.get('point') and box[0]<=r['point'][0]<=box[2] and box[1]<=r['point'][1]<=box[3]]
 limited=len(rows)>1000
 if limited:
  # Keep confirmed work visible when a wide viewport exceeds the marker limit.
  priority={'done':0,'partial':1,'mixed':2,'progress':3}
  rows.sort(key=lambda record:priority.get(record.get('status_code'),4))
 result=dict(type='FeatureCollection',total=len(rows),limited=limited,features=[dict(type='Feature',geometry=dict(type='Point',coordinates=r['point']),properties=dict(sid=r['source_id'],code=r.get('status_code','recorded'),name=r['attributes']['naziv'])) for r in rows[:1000]])
 if include_footprints:
  footprints=[]
  for record in projects():
   geometry=record.get('project_footprint')
   if not geometry or record.get('oid') or (completed_only and record['status_code']!='done') or (confirmed_work_only and record['status_code'] not in {'done','partial'}):
    continue
   ring=geometry['coordinates'][0]
   xs,ys=zip(*ring)
   if min(xs)<=box[2] and max(xs)>=box[0] and min(ys)<=box[3] and max(ys)>=box[1]:
    footprints.append(dict(type='Feature',geometry=geometry,properties=dict(sid=record['source_id'],code=record['status_code'])))
  result['footprints']=footprints
 return result

def seed(data):
 """Small viewport-only palettes supplied with the one geometry response."""
 import copy
 result=copy.deepcopy(data)
 fs=result.get('features',[])
 ids=[f['properties']['id'] for f in fs]
 solar=values(ids,'solar',enqueue=False);renewal=values(ids,'renewal',enqueue=False)
 floods={sc:values(ids,'flood',sc,enqueue=False) for sc in ['mala','srednja','velika']}
 for f in fs:
  oid=f['properties']['id']
  f['properties']['theme_seed']=dict(solar=solar.get(oid),renewal=renewal.get(oid),flood={sc:floods[sc].get(oid) for sc in floods})
 return result
def report():
 import themes
 data=themes.report();c=connect()
 for key,name in [('complete-state-report','complete_states'),('renewal-audit-current','renewal_audit')]:
  r=c.execute('select payload from meta where key=?',(key,)).fetchone()
  if r:data[name]=json.loads(r[0])
 c.close();return data

def search_project_records(q):
 import re,spatial_api
 tokens=re.findall(r'\w+(?:/\w+)*',spatial_api.norm(q))[:20]
 if not tokens:return []
 matches=[]
 for r in projects():
  if r.get('oid'):continue
  if r.get('project_footprint'):location='footprint'
  elif r.get('point'):location='point'
  elif (r.get('renewal_kind') or '').startswith('Blokovska '):location='block'
  else:location='unlocated'
  a=r['attributes']
  # Boundary street names do not establish that an address belongs to a block.
  search_text=a['naziv'] if location=='block' else a['adresa']+' '+a['naziv']
  if address_proof:=(r.get('source_fields') or {}).get('identity_evidence',{}).get('verified_registry_address_points'):
   search_text+=' '+' '.join(address['matched_address'] for address in address_proof['addresses'])

  words=re.findall(r'\w+(?:/\w+)*',spatial_api.norm(search_text))
  if all(any(w==t if t[0].isdigit() else w.startswith(t) for w in words) for t in tokens):
   matches.append(dict(record='renewal-project:'+str(r['source_id']),project_id=r['source_id'],
                       address=a['adresa'],name=a['naziv'],city='Zagreb',targets=[],
                       project_code=r['status_code'],
                       project_location=location))
 return matches

def search_outlines(q):
 import re,spatial_api,themes
 tokens=re.findall(r'\w+',spatial_api.norm(q))[:20]
 if not tokens:return []
 c=connect()
 try:rows=c.execute('select oid,name,address from renewal_search where renewal_search match ? limit 30',(' AND '.join('"'+t+'"*' for t in tokens),)).fetchall()
 except sqlite3.OperationalError:rows=[]
 c.close()
 return [dict(record='renewal-outline:'+oid,certificate='',name=name,unit='',address=address,city='Zagreb',heating='unknown',primary='unknown',issued='',status='unknown',reason='Obris identificiran u evidenciji obnove; detalj prikazuje izvor i opseg.',targets=[dict(id=oid,x=themes.city()[oid][1],y=themes.city()[oid][2],quality='unknown',method='cited renewal record identity')]) for oid,name,address in rows]

def revision():
 path=P/'data/theme-view.sqlite'
 stat=path.stat()
 stamp=f'{stat.st_mtime_ns}-{stat.st_size}'
 # A reader can delay checkpoints even after new theme data has been committed.
 try:wal=path.with_name(path.name+'-wal').stat()
 except FileNotFoundError:return stamp
 return f'{stamp}-{wal.st_mtime_ns}-{wal.st_size}' if wal.st_size else stamp
def palettes(ids):
 import themes
 stamp=revision();ids=list(dict.fromkeys(str(x) for x in ids if str(x) in themes.city()))[:6000]
 data=seed(dict(type='FeatureCollection',features=[dict(type='Feature',properties=dict(id=oid)) for oid in ids]))
 return dict(revision=stamp,values={f['properties']['id']:f['properties']['theme_seed'] for f in data['features']})

def compact_projects():
 stamp=revision();rows=[]
 for r in projects():
  a=r['attributes']
  rows.append(dict(source_id=r['source_id'],source_family=r.get('source_family'),oid=r.get('oid'),location_kind='outline' if r.get('oid') else 'footprint' if r.get('project_footprint') else 'point' if r.get('point') else 'unlocated',renewal_kind=r.get('renewal_kind','Energetska obnova'),status_code=r.get('status_code'),status_label=r.get('status_label'),compact=True,attributes={k:a.get(k) for k in ['naziv','adresa','status']}))
 return dict(projects=rows,revision=stamp)
