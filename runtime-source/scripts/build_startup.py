from pathlib import Path
import re,json,gzip,sys
P=Path(__file__).resolve().parents[1];sys.path.insert(0,str(P))
import server,spatial_api,fast_themes,static_map,vector_map
server.prepare_readers()
summary=spatial_api.handle('/api/spatial/summary','')[0]
summary={**summary,'theme_revision':fast_themes.revision(),'map_tiles':static_map.index(),'vector_tiles':vector_map.descriptor()}
template=(P/'web/index.template.html').read_text()
scripts=[]
def script(m):
 path=m.group(1).split('?')[0]
 scripts.append((P/'web'/path.lstrip('/')).read_text())
 return ''
template=re.sub(r'<script defer src="([^"]+)"></script>',script,template)
def css(m):
 return '<style>'+(P/'web'/m.group(1).split('?')[0].lstrip('/')).read_text()+'</style>'
template=re.sub(r'<link rel="stylesheet" href="([^"]+)">',css,template)
code=chr(10).join(';'+part for part in scripts).replace('</script','<'+chr(92)+'/script')
bootstrap='<script>window.mzBootstrap='+json.dumps(summary,ensure_ascii=False,separators=(',',':')).replace('<',chr(92)+'u003c')+';</script>'
template=template.replace('</body>',bootstrap+'<script>'+code+'</script></body>')
target=P/'web/index.html';target.write_text(template)
target.with_suffix('.html.gz').write_bytes(gzip.compress(target.read_bytes(),compresslevel=6,mtime=0))
print('startup bytes',target.stat().st_size,'gzip',target.with_suffix('.html.gz').stat().st_size)

for name in ['index.html','index.html.gz']:
 (P/'web/pokus'/name).write_bytes((P/'web'/name).read_bytes())
