from pathlib import Path
import subprocess,sys,json,time,urllib.request,os,signal,argparse,socket
P=Path(__file__).resolve().parent
a=argparse.ArgumentParser();a.add_argument('--restart',action='store_true');a.add_argument('--stop',action='store_true');args=a.parse_args()
(P/'runtime').mkdir(exist_ok=True)
if not args.stop:
 subprocess.run([str(P/'.venv/bin/python'),str(P/'scripts/prepare_reviewed_outlines.py')],cwd=P,check=True,stdout=subprocess.DEVNULL)
info=P/'runtime/service.json'
owned=[];workers=[]
for proc in Path('/proc').iterdir():
 if proc.name.isdigit():
  try:
   if (proc/'cwd').resolve()==P:
    cmd=(proc/'cmdline').read_bytes().split(b'\0')
    if str(P/'server.py').encode() in cmd:owned.append(int(proc.name))
    if str(P/'scripts/solar_worker.py').encode() in cmd:workers.append(int(proc.name))
  except OSError:pass
if args.restart or args.stop:
 for pid in owned+(workers if args.stop else []):
  try:os.kill(pid,signal.SIGTERM)
  except ProcessLookupError:pass
 time.sleep(.3);owned=[]
if args.stop:print('Moje zgrade stopped.');sys.exit()
if owned:print(info.read_text());sys.exit()
s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
try:s.bind(('100.103.73.54',8328))
finally:s.close()
with open(P/'runtime/server.log','ab') as log:
 child=subprocess.Popen([str(P/'.venv/bin/python'),str(P/'server.py'),'--host','100.103.73.54','--port','8328'],cwd=P,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
data=dict(pid=child.pid,url='http://100.103.73.54:8328/',port=8328,directory=str(P))
info.write_text(json.dumps(data,indent=2))
for i in range(40):
 try:
  urllib.request.urlopen(data['url']+'api/health',timeout=1);print(json.dumps(data));break
 except OSError:time.sleep(.25)
else:raise SystemExit('Not ready: runtime/server.log')
