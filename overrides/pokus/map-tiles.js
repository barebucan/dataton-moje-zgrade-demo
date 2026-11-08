/* Reuse immutable small map cells across pans. Never delay geometry on IndexedDB. */
(function(root){
 const cells=new Map(),MAX=256;

 const stats={requests:0,hits:0,views:0};const bounds=new WeakMap();
 function intersects(f,box){
  let b=bounds.get(f);if(!b){b=[Infinity,Infinity,-Infinity,-Infinity];const scan=a=>{if(typeof a[0]==='number'){b[0]=Math.min(b[0],a[0]);b[1]=Math.min(b[1],a[1]);b[2]=Math.max(b[2],a[0]);b[3]=Math.max(b[3],a[1])}else for(const v of a)scan(v)};scan(f.geometry.coordinates);bounds.set(f,b)}
  return b[0]<=box[2]&&b[2]>=box[0]&&b[1]<=box[3]&&b[3]>=box[1];
 }
 function cell(meta,key){
  if(cells.has(key)){stats.hits++;return cells.get(key)}
  stats.requests++;
  const pending=fetch(meta.path+key+'.json',{signal:AbortSignal.timeout(15000),priority:'high'}).then(r=>{if(!r.ok)throw Error('Map cell unavailable');return r.json()}).catch(e=>{cells.delete(key);throw e});
  cells.set(key,pending);
  while(cells.size>MAX)cells.delete(cells.keys().next().value);
  return pending;
 }
 async function load(box,signal,revision,meta,onFirst,center){
  if(!meta||meta.theme_revision!==revision)return null;
  const x0=Math.floor(box[0]/meta.dx),x1=Math.floor(box[2]/meta.dx),y0=Math.floor(box[1]/meta.dy),y1=Math.floor(box[3]/meta.dy);
  if((x1-x0+1)*(y1-y0+1)>256)return null;
  const keys=[];
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+'/'+y;keys.push(key)}
  const cx=(center?.lng??(box[0]+box[2])/2)/meta.dx,cy=(center?.lat??(box[1]+box[3])/2)/meta.dy;
  keys.sort((a,b)=>{const [x,y]=a.split('/').map(Number),[u,v]=b.split('/').map(Number);return (x+.5-cx)**2+(y+.5-cy)**2-(u+.5-cx)**2-(v+.5-cy)**2});
  // The central roof starts immediately; group the other missing cells in a few requests.
  if(keys.length)cell(meta,keys[0]);
  const missing=keys.filter(key=>!cells.has(key));
  for(let i=0;i<missing.length;i+=64){
   const part=missing.slice(i,i+64);stats.requests++;
   const batch=fetch('/api/map-tiles/batch?revision='+meta.revision+'&cells='+encodeURIComponent(part.join(',')),{signal:AbortSignal.timeout(15000),priority:'high'}).then(r=>{if(!r.ok)throw Error('Map cells unavailable');return r.json()}).then(d=>{d.byId=new Map(d.features.map(f=>[f.properties.id,f]));return d});
   for(const key of part)cells.set(key,batch.then(d=>({type:'FeatureCollection',features:d.cells[key].map(id=>d.byId.get(id))})).catch(e=>{cells.delete(key);throw e}));
  }
  while(cells.size>MAX)cells.delete(cells.keys().next().value);
  let first=false;
  const results=await Promise.all(keys.map(key=>cell(meta,key).then(d=>{
   if(!first&&!signal.aborted&&onFirst){const fs=d.features.filter(f=>intersects(f,box));if(fs.length){first=true;onFirst({type:'FeatureCollection',features:fs})}}
   return d;
  })));
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const features=new Map();
  for(const result of results)for(const f of result.features){if(intersects(f,box))features.set(f.properties.id,f)};
  stats.views++;
  const all=[...features.values()].sort((a,b)=>Number(!!b.properties.record_count)-Number(!!a.properties.record_count)||a.properties.id.localeCompare(b.properties.id));
  return {type:'FeatureCollection',features:all.slice(0,6000),clustered:false,truncated:all.length>6000,note:all.length>6000?'Približi za sve obrise.':'',static_cells:true};
 }
 root.MapTiles={load,stats};
})(globalThis);
