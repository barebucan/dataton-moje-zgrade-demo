from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse,parse_qs,unquote
import json,sqlite3,unicodedata,re,argparse,shutil,gzip,os
P=Path(__file__).resolve().parent
def norm(s): return ''.join(c for c in unicodedata.normalize('NFD',s.lower().replace('đ','d')) if unicodedata.category(c)!='Mn')
class Handler(SimpleHTTPRequestHandler):
 protocol_version='HTTP/1.1'
 disable_nagle_algorithm=True
 def __init__(self,*args,**kw): super().__init__(*args,directory=str(P/'web'),**kw)
 def log_message(self,*a): pass
 def json(self,obj,status=200):
  body=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode()
  compressed='gzip' in self.headers.get('Accept-Encoding','') and len(body)>1024
  if compressed:body=gzip.compress(body,compresslevel=3,mtime=0)
  self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','private, max-age=60' if self.path.startswith('/api/spatial/map?') else 'no-cache');self.send_header('Vary','Accept-Encoding')
  if compressed:self.send_header('Content-Encoding','gzip')
  self.end_headers()
  try:self.wfile.write(body)
  except (BrokenPipeError,ConnectionResetError):pass

 def send_head(self):
  # Serve prepared compressed assets without recompressing large map libraries on every request.
  path=Path(self.translate_path(self.path))
  if path.is_dir():path=path/'index.html'
  compressed=path.with_name(path.name+'.gz')
  if 'gzip' in self.headers.get('Accept-Encoding','') and path.suffix in ['.js','.css','.html','.json','.pbf'] and path.is_file() and compressed.is_file() and compressed.stat().st_mtime_ns>=path.stat().st_mtime_ns:
   stat=path.stat();etag='"'+format(stat.st_mtime_ns,'x')+'-'+format(stat.st_size,'x')+'"'
   modified=self.headers.get('If-Modified-Since');unchanged=self.headers.get('If-None-Match')==etag
   if modified and not self.headers.get('If-None-Match'):
    try:unchanged=__import__('email.utils',fromlist=['parsedate_to_datetime']).parsedate_to_datetime(modified).timestamp()>=int(stat.st_mtime)
    except (ValueError,TypeError,OverflowError):pass
   if unchanged:
    self.send_response(304);self.send_header('ETag',etag);self.send_header('Cache-Control','no-cache');self.send_header('Vary','Accept-Encoding');self.end_headers();return None
   self.send_response(200);self.send_header('ETag',etag);self.send_header('Content-Type',self.guess_type(str(path)));self.send_header('Content-Encoding','gzip');self.send_header('Vary','Accept-Encoding');self.send_header('Content-Length',str(compressed.stat().st_size));self.send_header('Last-Modified',self.date_time_string(path.stat().st_mtime));self.send_header('Cache-Control','public, max-age=31536000, immutable' if '/vector/v207/' in self.path or '/map-tiles/v206-small/' in self.path else 'public, max-age=86400' if path.suffix in ['.js','.css'] and '?' in self.path else 'no-cache');self.end_headers();return open(compressed,'rb')
  return super().send_head()
 def do_GET(self):
  path=urlparse(self.path)
  attachment=None;mime=None
  if path.path=='/download':
   release=P/'releases/current.json'
   name=json.loads(release.read_text())['filename'] if release.is_file() else 'moje-zgrade-0.3.0-complete-internal.zip'
   if not re.fullmatch(r'moje-zgrade-[a-zA-Z0-9.-]+[.]zip',name):return self.json(dict(error='Neispravan paket.'),503)
   attachment=P/'releases'/name;mime='application/zip'
  elif path.path in ['/guide','/report','/plan']:
   attachment=P/({'/guide':'README.md','/report':'QA_REPORT.md','/plan':'PLAN.md'}[path.path]);mime='text/plain; charset=utf-8'
  elif path.path.startswith('/evidence/'):
   name=path.path.rsplit('/',1)[1]
   if re.fullmatch(r'final-[a-z0-9-]+[.](png|jpg)',name):attachment=P/'qa'/name;mime='image/png' if name.endswith('.png') else 'image/jpeg'
  if attachment is not None:
   if not attachment.is_file():return self.json(dict(error='Datoteka još nije dostupna.'),404)
   self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(attachment.stat().st_size))
   if mime=='application/zip':self.send_header('Content-Disposition','attachment; filename="'+attachment.name+'"')
   self.end_headers()
   with open(attachment,'rb') as f:shutil.copyfileobj(f,self.wfile)
   return
  if re.fullmatch(r'/map-tiles/v206-small/[0-9]+/[0-9]+[.]json',path.path) and not (P/'web'/path.path.lstrip('/')).is_file():
   return self.json(dict(type='FeatureCollection',features=[]))
  if path.path=='/api/map-tiles/batch':
   keys=parse_qs(path.query).get('cells',[''])[0].split(',')
   if len(keys)>64 or not all(re.fullmatch(r'[0-9]+/[0-9]+',key) for key in keys):return self.json(dict(error='Neispravni dijelovi karte.'),400)
   cells={};features={}
   for key in keys:
    file=P/'web/map-tiles/v206-small'/(key+'.json')
    rows=json.loads(file.read_text())['features'] if file.is_file() else []
    cells[key]=[f['properties']['id'] for f in rows]
    for f in rows:features[f['properties']['id']]=f
   return self.json(dict(cells=cells,features=list(features.values())))
  if re.fullmatch(r'/vector/v207/(15|16)/[0-9]+/[0-9]+[.]pbf',path.path) and not (P/'web'/path.path.lstrip('/')).is_file():
   self.send_response(200);self.send_header('Content-Type','application/vnd.mapbox-vector-tile');self.send_header('Cache-Control','public, max-age=31536000, immutable');self.send_header('Content-Length','0');self.end_headers();return
  if path.path=='/api/vector/overview':
   params=parse_qs(path.query)
   try:
    box=[float(v) for v in params.get('bbox',[''])[0].split(',')]
    if len(box)!=4 or not all(__import__('math').isfinite(v) for v in box):raise ValueError()
   except ValueError:return self.json(dict(error='Neispravan kadar.'),400)
   import themes
   return self.json(themes.overview(box,params.get('quality',['default'])[0] if params.get('theme',['energy'])[0]=='energy' else None))
  if path.path=='/api/map-tiles/index':
   from static_map import index
   data=index()
   return self.json(data if data else dict(unavailable=True))
  if path.path.startswith('/api/spatial/'):
   from spatial_api import handle
   import themes
   import fast_themes
   params=parse_qs(path.query)
   theme=params.get('theme',['energy'])[0];scenario=params.get('scenario',['mala'])[0]
   if theme not in ['energy','solar','renewal','flood'] or scenario not in ['mala','srednja','velika','overview']:return self.json(dict(error='Neispravna tema ili scenarij.'),400)
   result,status=handle(path.path,path.query)
   if status==200:
    if path.path=='/api/spatial/summary':result={**result,'theme_revision':fast_themes.revision(),'map_tiles':__import__('static_map').index(),'vector_tiles':__import__('vector_map').descriptor()}
    elif path.path=='/api/spatial/map':
     result=themes.scoped(result)
     if result.get('clustered'):
      from shapely.geometry import shape,Point
      boundary=shape(json.loads((P/'sources/city-boundary.geojson').read_text()))
      try:box=[float(v) for v in params.get('bbox',['15.77,45.61,16.24,45.97'])[0].split(',')]
      except ValueError:box=[15.77,45.61,16.24,45.97]
      result=themes.overview(box,params.get('quality',['default'])[0] if theme=='energy' else None)
     if theme!='energy':
      if result.get('clustered'):
       try:box=[float(v) for v in params.get('bbox',['15.77,45.61,16.24,45.97'])[0].split(',')]
       except ValueError:box=[15.77,45.61,16.24,45.97]
       result=themes.overview(box)
      result=fast_themes.annotate(result,theme,scenario) if not result.get('clustered') else result
     if theme=='energy' and not result.get('clustered'):result=fast_themes.seed(result)
     if theme=='renewal':
      try:box=[float(v) for v in params.get('bbox',['15.77,45.61,16.24,45.97'])[0].split(',')]
      except ValueError:box=[15.77,45.61,16.24,45.97]
      result={**result,'project_points':fast_themes.project_points(box)}
    elif path.path.startswith('/api/spatial/building/'):
     if result['properties']['id'] not in themes.city():return self.json(dict(error='Obris je izvan administrativnog područja Zagreba.'),404)
     result=fast_themes.seed(dict(type='FeatureCollection',features=[result]))['features'][0]
     if params.get('bundle',['0'])[0]=='1':
      # A single selected-building response supplies all complete cards.
      base=result
      cards={}
      for t,sc in [('solar','mala'),('renewal','mala'),('flood','mala'),('flood','srednja'),('flood','velika'),('flood','overview')]:
       cards[t+(':'+sc if t=='flood' else '')]=fast_themes.annotate(__import__('copy').deepcopy(base),t,sc,detail=True)['properties']
      result={**base,'theme_cards':cards}
     elif theme!='energy':result=fast_themes.annotate(result,theme,scenario,detail=True)
    elif path.path=='/api/spatial/search':
     result={**result,'records':[{**r,'targets':[t for t in r['targets'] if t['id'] in themes.city()]} for r in result['records']]}
     extra=themes.generic_search(params.get('q',[''])[0])+fast_themes.search_outlines(params.get('q',[''])[0])
     seen={t['id'] for r in result['records'] for t in r['targets']}
     deduped=[]
     for r in extra:
      oid=r['targets'][0]['id']
      if oid not in seen:deduped.append(r);seen.add(oid)
     extra=deduped
     records=result['records']+extra
     tokens=re.findall(r'\w+',norm(params.get('q',[''])[0]))
     def relevance(r):
      words=re.findall(r'\w+',norm(r['address']+' '+r['name']))
      matched=sum(any(w==t if t.isdigit() else w.startswith(t) for w in words) for t in tokens)
      exact=sum(t in words for t in tokens)
      names=re.findall(r'\w+',norm(r['name']))
      ignored={'ulica','ul'}
      query_address=[v for v in re.findall(r'\w+(?:/\w+)*',norm(params.get('q',[''])[0])) if v not in ignored]
      address_words=[v for v in re.findall(r'\w+(?:/\w+)*',norm(r['address'])) if v not in ignored]
      address_exact=bool(query_address) and address_words==query_address
      house=query_address[-1] if query_address and re.fullmatch(r'\d+[a-z]?(?:/\d+[a-z]?)?',query_address[-1]) else None
      street=query_address[:-1] if house else query_address
      same_house=bool(house and address_words and address_words[-1]==house and all(v in address_words for v in street))
      return address_exact,same_house,matched,exact,sum(t in names for t in tokens)
     records.sort(key=relevance,reverse=True)
     project_records=fast_themes.search_project_records(params.get('q',[''])[0]) if theme=='renewal' else []
     combined=project_records+records
     combined.sort(key=relevance,reverse=True)
     result={**result,'records':combined,'total':result['total']+len(extra)+len(project_records),'scope':'Grad Zagreb'}
     if theme!='energy':
      try:
       packet=fast_themes.palettes([r['targets'][0]['id'] for r in records if len(r['targets'])==1])
       for r in records:
        if len(r['targets'])==1 and (seed:=packet['values'].get(r['targets'][0]['id'])):r['theme_seed']=seed
       result['theme_revision']=packet['revision']
      except sqlite3.Error:
       result['theme_palette_error']='Boje rezultata trenutačno nisu dostupne.'

   return self.json(result,status)
  if path.path.startswith('/api/themes/project/'):
   import themes
   sid=unquote(path.path.rsplit('/',1)[1])
   import fast_themes
   row=next((r for r in fast_themes.projects() if str(r['source_id'])==sid),None)
   return self.json(row or dict(error='Projekt nije pronađen.'),200 if row else 404)
  if path.path=='/api/themes/revision':
   import fast_themes
   return self.json(dict(revision=fast_themes.revision()))
  if path.path=='/api/themes/coverage':
   import themes
   import fast_themes
   return self.json(fast_themes.report())
  if path.path=='/api/themes/project-points':
   import fast_themes
   params=parse_qs(path.query)
   try:
    box=[float(v) for v in params.get('bbox',[''])[0].split(',')]
    if len(box)!=4 or not all(__import__('math').isfinite(v) for v in box):raise ValueError()
   except ValueError:return self.json(dict(error='Neispravan kadar.'),400)
   return self.json(fast_themes.project_points(box,completed_only=params.get('completed',['0'])[0]=='1',include_footprints=params.get('footprints',['0'])[0]=='1',confirmed_work_only=params.get('work',['0'])[0]=='1'))
  if path.path=='/api/themes/projects':
   import themes
   import fast_themes
   return self.json(fast_themes.compact_projects() if parse_qs(path.query).get('compact',[''])[0]=='1' else dict(projects=fast_themes.projects()))
  if path.path=='/api/facilities':
   return self.json(json.loads((P/'data/facilities.json').read_text()))
  if path.path=='/api/health':
   return self.json(dict(ok=True,registry_ready=(P/'data/iec-processing-report.json').exists(),version='moje-zgrade-0.3.0-complete'))
  if path.path=='/api/certificates':
   if not (P/'data/iec-processing-report.json').exists():return self.json(dict(error='Registar se priprema. Karta Zagreba dostupna je odmah.'),503)
   p=parse_qs(path.query);q=p.get('q',[''])[0][:200];cl=p.get('class',[''])[0];kind=p.get('type',[''])[0];indicator='primary_class' if p.get('indicator',[''])[0]=='primary' else 'heating_class'
   try: offset=max(0,min(250000,int(p.get('offset',['0'])[0])))
   except ValueError:offset=0
   args=[];where=[]
   tokens=re.findall(r'\w+',norm(q))
   if q.strip() and not tokens:where.append('0')
   if tokens:
    where.append('id IN (SELECT rowid FROM search WHERE text MATCH ?)')
    args.append(' AND '.join('"'+t+'"*' for t in tokens))
   if cl in ['A+','A','B','C','D','E','F','G']:where.append(indicator+'=?');args.append(cl)
   if kind in ['Obiteljske kuće','Višestambene zgrade']:where.append('building_type=?');args.append(kind)
   clause=' WHERE '+' AND '.join(where) if where else ''
   con=sqlite3.connect('file:'+str(P/'data/certificates.sqlite')+'?mode=ro&immutable=1',uri=True)
   try:
    total=con.execute('SELECT count(*) FROM certificates'+clause,args).fetchone()[0]
    counts=dict(con.execute('SELECT '+indicator+',count(*) FROM certificates'+clause+' GROUP BY '+indicator,args).fetchall())
    records=[json.loads(r[0]) for r in con.execute('SELECT payload FROM certificates'+clause+' ORDER BY id DESC LIMIT 50 OFFSET ?',args+[offset])]
    return self.json(dict(records=records,total=total,counts=counts,offset=offset,limit=50))
   finally:con.close()
  if path.path.startswith('/api/certificate/'):
   try: rid=int(path.path.rsplit('/',1)[1])
   except ValueError:return self.json(dict(error='Neispravan zapis.'),400)
   if not (P/'data/iec-processing-report.json').exists():return self.json(dict(error='Registar se priprema.'),503)
   con=sqlite3.connect('file:'+str(P/'data/certificates.sqlite')+'?mode=ro&immutable=1',uri=True)
   row=con.execute('SELECT payload FROM certificates WHERE id=?',(rid,)).fetchone();con.close()
   return self.json(json.loads(row[0]) if row else dict(error='Zapis nije pronađen.'),200 if row else 404)
  return super().do_GET()
 def do_POST(self):
  if urlparse(self.path).path=='/api/themes/palettes':
   try:
    n=int(self.headers.get('Content-Length','0'))
    if not 2<=n<=200000:raise ValueError()
    data=json.loads(self.rfile.read(n));ids=data.get('ids')
    if not isinstance(ids,list) or len(ids)>6000 or any(not isinstance(x,(str,int)) for x in ids):raise ValueError()
    import fast_themes
    return self.json(fast_themes.palettes(ids))
   except (ValueError,TypeError,json.JSONDecodeError):return self.json(dict(error='Neispravan zahtjev.'),400)
  if urlparse(self.path).path=='/api/themes/values':
   try:
    n=int(self.headers.get('Content-Length','0'))
    if not 2<=n<=200000:raise ValueError()
    data=json.loads(self.rfile.read(n));ids=data.get('ids',[]);theme=data.get('theme');sc=data.get('scenario','mala')
    if not isinstance(ids,list) or len(ids)>6000 or theme not in ['solar','renewal','flood'] or sc not in ['mala','srednja','velika','overview']:raise ValueError()
    import fast_themes
    if data.get('retry') and theme=='solar':fast_themes.retry(ids)
    values=fast_themes.values(ids,theme,sc)
    pending=sum(v['theme_data'].get('state')=='pending' for v in values.values())
    return self.json(dict(values=values,theme=theme,scenario=sc,pending=pending,revision='fast-20261104-1'))
   except (ValueError,TypeError,json.JSONDecodeError):return self.json(dict(error='Neispravan zahtjev.'),400)
  return self.json(dict(error='Ova interna verzija nema AI pozive.'),403)
def prepare_readers():
 from static_map import index
 from vector_map import descriptor
 index();descriptor()
 import spatial_api,fast_themes,themes
 token=spatial_api.version()
 spatial_api.summaries(token);spatial_api.models(token);spatial_api.part_parents(token);spatial_api.geometry_aliases(token);spatial_api.equivalent_ids(token);themes.city();themes.eligible_records();fast_themes.projects()

if __name__=='__main__':
 prepare_readers()
 parser=argparse.ArgumentParser();parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=8328);a=parser.parse_args()
 print('Moje zgrade: http://'+a.host+':'+str(a.port),flush=True)
 ThreadingHTTPServer((a.host,a.port),Handler).serve_forever()
