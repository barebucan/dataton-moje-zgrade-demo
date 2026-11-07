from pathlib import Path
import sys,os,json
from urllib.parse import urlparse,parse_qs,unquote
BASE=Path(os.environ.get('MZ_RUNTIME',str(Path(__file__).resolve().parent/'runtime')))
sys.path.insert(0,str(BASE))
import server
import fast_themes
fast_themes.queue=lambda ids:None
fast_themes.retry=lambda ids:None
class handler(server.Handler):
 def allowed(self):
  p=unquote(unquote(urlparse(self.path).path))
  return p.startswith('/api/') and not any(x.startswith('.') or x in ('private','runtime') for x in p.split('/') if x) and len(self.path)<8192
 def do_GET(self):
  if not self.allowed():return self.json({'error':'Nije dostupno.'},404)
  if urlparse(self.path).path=='/api/themes/projects' and parse_qs(urlparse(self.path).query).get('compact')!=['1']:return self.json({'error':'Koristite sažeti pregled projekata.'},400)
  return super().do_GET()
 def do_POST(self):
  if not self.allowed():return self.json({'error':'Nije dostupno.'},404)
  return super().do_POST()
 def end_headers(self):
  self.send_header('X-Content-Type-Options','nosniff')
  self.send_header('X-Frame-Options','DENY')
  super().end_headers()
