let searchBusy=false,lastSearchInputAt=0;
let vectorMode=false,vectorNeedsRefresh=false,recoveringVector=false;
let activeTheme='energy',floodScenario='overview',themeSequence=0,colorController,colorTimer,colorSequence=0;const colorCache=new Map();let focusedProject=null;let renewalPoints=[],renewalFootprints=[],pointSequence=0,pointController;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const classes=['A+','A','B','C','D','E','F','G'],colors={'A+':'#157646',A:'#238742',B:'#6e912b',C:'#c9ad27',D:'#dc8a25',E:'#d7632b',F:'#c54238',G:'#a92b3b',multi:'#73568f',unknown:'#a3ada7'};
const light=c=>['B','C','D','E','unknown'].includes(c)?'light':'';
const fmt=n=>new Intl.NumberFormat('hr-HR').format(n);
const norm=s=>String(s??'').toLocaleLowerCase('hr').replaceAll('đ','d').normalize('NFD').replace(/[̀-ͯ]/g,'');
const qualityNames={strong_address:'Adresa se podudara',probable:'Moguća lokacija',ambiguous:'Više mogućih zgrada',weak:'Slab prijedlog',unknown:'Bez povezanog zapisa',unresolved:'Lokacija nije pronađena',address_only:'Adresa pronađena, bez obrisa'};
const areas={kruge:[15.9869,45.798],selska:[15.9433,45.7963],zagreb:[15.976,45.811],split:[16.443,43.511],rijeka:[14.442,45.328],osijek:[18.683,45.554],zadar:[15.231,44.116],varazdin:[16.337,46.306],hr:[16.1,45.05]};
let state={mode:'3d',area:'kruge',indicator:'heating',quality:'default',q:'',only:false,id:'',rec:''},visible=[],byId=new Map(),map,ready=false,limit=30,previousFocus,selected=null,searchResults=[],searchTotal=0,clusters=[],mapController,searchController,mapSequence=0,searchSequence=0,moveTimer,typingTimer,summary;
function chosenClass(p){return activeTheme==='energy'?(p[state.indicator]||'unknown'):(p.theme_name===activeTheme?p.theme_value||'unknown':'unknown')}
function badge(c,hatched=true){return '<span class="swatch '+light(c)+(hatched&&c!=='unknown'?' hatched':'')+'" style="--c:'+colors[c]+'">'+(c==='unknown'?'—':c==='multi'?'≋':c)+'</span>'}
function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,4200)}
const initialMapView=history.state?.mzView;
function mapView(){
 if(!ready||!map)return history.state?.mzView;
 const c=map.getCenter();
 return {center:[c.lng,c.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),view:mobileView};
}
function rememberMapView(){if(ready)history.replaceState({...history.state,mzView:mapView()},'',location.href)}
function restoreMapView(view){
 if(!view||!Array.isArray(view.center)||view.center.length!==2||!view.center.every(Number.isFinite)||!Number.isFinite(view.zoom))return false;
 map.jumpTo({center:view.center,zoom:view.zoom,pitch:view.pitch,bearing:view.bearing});
 if(innerWidth<=720)setView(view.view==='list'&&!state.id?'list':'map');
 loadMap();return true;
}
function write(replace=false){
 const p=new URLSearchParams({mode:state.mode,area:state.area,indicator:state.indicator});
 if(activeTheme!=='energy')p.set('theme',activeTheme);if(activeTheme==='flood'&&floodScenario!=='overview')p.set('scenario',floodScenario);
 if(state.quality!=='default')p.set('quality',state.quality);if(state.id)p.set('id',state.id);if(state.rec)p.set('record',state.rec);if(state.q)p.set('q',state.q);if(state.only)p.set('known','1');
 const hash='#'+p;const entry={...history.state,mzView:mapView()};if(location.hash!==hash){if(!replace)history.replaceState(entry,'',location.href);history[replace?'replaceState':'pushState'](entry,'',hash);}
}
function read(){
 const p=new URLSearchParams(location.hash.slice(1));
 const theme=p.get('theme')||p.get('indicator');
 activeTheme=['solar','renewal','flood'].includes(theme)?theme:'energy';
 floodScenario=['mala','srednja','velika'].includes(p.get('scenario'))?p.get('scenario'):'overview';
 state={mode:'3d',area:['kruge','selska','zagreb'].includes(p.get('area'))?p.get('area'):'kruge',indicator:p.get('indicator')==='primary'?'primary':'heating',quality:['strong','all'].includes(p.get('quality'))?p.get('quality'):'default',q:p.get('q')||'',only:p.get('known')==='1',id:p.get('id')||'',rec:p.get('record')||''}}
function sync(){
 $('#area').value=state.area;$('#indicator').value=state.indicator;$('#quality').value=state.quality;$('#search').value=state.q;$('#known-only').checked=state.only;
 $('#view-title').textContent=state.q.trim()?'Rezultati pretrage':'Na karti';
 $('#view-help').textContent='Pretraži adresu ili približi kartu za pojedine zgrade.';
 updateFilterCount();
}
function row(f){
 const p=f.properties,c=chosenClass(p);
 return '<button class="row '+(p.id===state.id?'selected':'')+'" data-id="'+p.id+'">'+(activeTheme==='energy'?badge(c):themeRowBadge(p))+'<span><strong>'+esc(p.name)+'</strong><small>'+esc(p.address||'Adresa nije upisana na obrisu')+'</small><small>'+(activeTheme==='energy'?esc(qualityNames[p.quality]||p.quality)+(p.record_count?' · '+p.record_count+' zapisa':''):esc(themeOutlineHint(p)))+'</small></span><span aria-hidden="true">›</span></button>';
}
function searchRow(r,index,count=1,visibleById){
 if(r.project_id!==undefined){
  const status=themeConfig('renewal').bands.find(([code])=>code===r.project_code)?.[1]||'Status nije provjeren';
  const location=r.project_location==='block'?'Zapis na razini bloka':r.project_location==='point'?'Lokacija projekta · obris nije potvrđen':r.project_location==='unlocated'?'Položaj na karti nije potvrđen':'Potvrđeni projektni tlocrt';
  const symbol=r.project_location==='block'?'≡':r.project_location==='point'?'●':r.project_location==='unlocated'?'?':'▧';
  return '<button class="row" data-record-index="'+index+'"><span class="theme-row-value" style="background:'+colors[r.project_code]+'" aria-hidden="true">'+symbol+'</span><span><strong>'+esc(r.address||r.name)+'</strong><small>'+esc(r.name)+'</small><small>'+esc(status)+' · '+esc(location)+'</small></span><span aria-hidden="true">›</span></button>';
 }
 const target=activeTheme!=='energy'&&r.targets.length===1?visibleById?.get(r.targets[0].id):null;
 const palette=(target&&themePalette(target.properties))||themePalette(r);
 const themed=palette?.theme_data&&palette.theme_value!=='unknown'?palette:null;
 const themeHint=(themed&&['probable','ambiguous','weak'].includes(r.status)?'Mogući obris · ':'')+(themed?themeOutlineHint(themed):r.targets.length===1?'Odaberi za podatke ove teme':r.targets.length?'Više mogućih obrisa':'Obris nije povezan');
 return '<button class="row '+(!r.targets.length?'unresolved':'')+'" data-record-index="'+index+'">'+(activeTheme==='energy'?badge(r[state.indicator]):themed?themeRowBadge(themed):'<span class="theme-row-value" aria-hidden="true">⌕</span>')+'<span><strong>'+esc(r.address||r.name)+'</strong><small>'+esc(r.city)+' · '+esc(useful(r.unit)||r.display_name||useful(r.name)||'Adresa na obrisu')+'</small><small>'+(activeTheme!=='energy'?esc(themeHint):count>1?recordCount(count)+' pronađeno':(String(r.record).startsWith('outline:')?'Adresa na obrisu · bez certifikata':esc(qualityNames[r.status]||r.status)+' · '+esc(r.issued)))+'</small></span><span aria-hidden="true">›</span></button>';
}
function renderList(){
 if(vectorMode&&ready&&map.getZoom()>=15&&!state.q.trim()){visible=VectorView.collect(Math.max(80,limit));byId=new Map(visible.map(f=>[f.properties.id,f]))}
 const wasSearching=document.body.classList.contains('searching');document.body.classList.toggle('searching',Boolean(state.q.trim()));if(ready&&wasSearching!==Boolean(state.q.trim()))map.resize();
 $('#view-title').textContent=state.q.trim()?'Rezultati pretrage':'Na karti';
 const overview=clusters.length>0&&!state.q.trim();if(document.body.classList.contains('overview')!==overview){document.body.classList.toggle('overview',overview);if(ready&&innerWidth>720)map.resize()}
 if(state.q.trim()){
  if(searchBusy){$('#stats').textContent='Pretražujem adrese u Zagrebu…';$('#list').innerHTML='<div class="empty" role="status">Pretražujem adrese…</div>';$('#more').hidden=true;return}
  $('#stats').textContent=fmt(searchTotal)+' rezultata u Zagrebu';
  const groups=new Map();
  searchResults.forEach((r,index)=>{const key=r.targets.length===1?r.targets[0].id:'record:'+r.record;if(!groups.has(key))groups.set(key,{r,index,count:0});groups.get(key).count++});
  const visibleById=activeTheme==='energy'?null:new Map(visible.map(feature=>[feature.properties.id,feature]));
  $('#list').innerHTML=searchResults.length?[...groups.values()].map(g=>searchRow(g.r,g.index,g.count,visibleById)).join(''):'<div class="empty">Nema rezultata za ovaj upit.<br><button data-action="reset">Očisti pretragu</button></div>';
  $('#more').hidden=true;return;
 }
 const known=visible.filter(f=>activeTheme==='energy'?f.properties.record_count>0:f.properties.theme_name===activeTheme&&f.properties.theme_known).length;
 $('#stats').textContent=vectorMode&&map.getZoom()>=15?fmt(VectorView.total)+' zgrada u prikazanom kadru':clusters.length?fmt(clusters.reduce((n,c)=>n+c.count,0))+' obrisa u grupnom prikazu · približi za pojedine zgrade':fmt(visible.length)+' učitanih obrisa · '+fmt(known)+' s podacima ovog prikaza';
 const sorted=[...visible].sort((a,b)=>Number(activeTheme==='energy'?b.properties.record_count>0:b.properties.theme_known)-Number(activeTheme==='energy'?a.properties.record_count>0:a.properties.theme_known)||a.properties.name.localeCompare(b.properties.name,'hr'));
 $('#list').innerHTML=sorted.length?sorted.slice(0,limit).map(row).join(''):'<div class="empty">'+(clusters.length?'Približi kartu ili pretraži adresu za pojedine zgrade.':'U ovom kadru nema prikazanih obrisa. Pokušaj približiti ili promijeniti područje.')+'</div>';
 $('#more').hidden=limit>=sorted.length;
}
function patterns(){
 for(const [c,color] of Object.entries(colors)){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,16,16);
  if(classes.includes(c)||c==='multi'){ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=2;for(let x=-16;x<32;x+=8){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+16,16);ctx.stroke()}}
  map.addImage('hatch-'+c,ctx.getImageData(0,0,16,16));
 }
 for(const code of ['s0','s1','s2','s3','s4','unmodelled']){
  for(const estimated of [false,true]){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=20;const ctx=canvas.getContext('2d');ctx.fillStyle=colors[code];ctx.fillRect(0,0,20,20);
   if(estimated){ctx.strokeStyle='rgba(108,48,145,.32)';ctx.lineWidth=1.2;for(let x=-20;x<40;x+=10){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+20,20);ctx.stroke()}}
   map.addImage('solar-'+(estimated?'est-':'source-')+code,ctx.getImageData(0,0,20,20));
  }
 }

}
let themeRevision='',summaryReady=Promise.resolve(),refreshingThemes=false;
let basemapStarted=false,lastMapMotion=0,lastProjectGeometry='',lastSelectionGeometry='';
function startBasemap(){if(basemapStarted||!ready)return;basemapStarted=true;map.addSource('osm',basemapDefinition.sources.osm);map.addLayer(basemapDefinition.layers[0],'volumes')}
let geometryDirty=true,lastGeometryKey='',lastPaint='',coverage=null,pendingMap=null,mapCache=new Map();
let renderedVolumeIds=new Set(),renderedGeometryQuality='';const retainedVolumes=new Map(),retainedOutlines=new Map(),appliedMapStates=new Map();
function mapData(){
 const shown=selected&&state.id&&!visible.some(f=>f.properties.id===state.id)?visible.concat([selected]):visible;
 return {type:'FeatureCollection',features:shown.flatMap(f=>{
  const p=f.properties,common={oid:p.id,class:chosenClass(p),heating:p.heating,primary:p.primary,pattern:'hatch-'+(p[state.indicator]||'unknown'),quality:p.quality,solar_class:(p.theme_seed?.solar?.theme_value||(p.theme_name==='solar'?p.theme_value:'unmodelled')),solar_estimated:!!(p.theme_seed?.solar?.theme_data.estimated||(p.theme_name==='solar'&&p.theme_data?.estimated))};
  const root={type:'Feature',id:f.id,geometry:f.geometry,properties:{...common,volume_id:p.id,height:p.height,base_height:p.base_height||0,part:false,render_parent:p.render_parent!==false}};
  return [root,...(p.model_parts||[]).map(v=>({type:'Feature',id:p.id+'-'+v.id,geometry:v.geometry,properties:{...common,volume_id:p.id+'-'+v.id,height:v.height,base_height:v.base_height||0,part:true,part_id:v.id,render_parent:true}}))];
 })};
}

function renderMap(){
 if(!ready)return;
 if(vectorMode){
  VectorView.paint();
  const key=selected?.properties.id||'';
  if(map.getSource('selected-building')&&key!==lastSelectionGeometry){
   map.getSource('selected-building').setData({type:'FeatureCollection',features:selected?[{type:'Feature',geometry:selected.geometry,properties:{oid:key,part:false}}]:[]});
   lastSelectionGeometry=key;
  }
 }
 else{
 const geometryKey=selected&&state.id&&!visible.some(f=>f.properties.id===state.id)?selected.properties.id:'';
 if(geometryDirty||geometryKey!==lastGeometryKey){
  let data=mapData();const context=state.quality+'|'+themeRevision,reset=renderedGeometryQuality!==context||clusters.length>0;
  if(reset){retainedVolumes.clear();retainedOutlines.clear()}
  for(const f of data.features)retainedVolumes.set(f.properties.volume_id,f);
  for(const f of visible)retainedOutlines.set(f.properties.id,f);
  if(selected&&state.id)retainedOutlines.set(selected.properties.id,selected);
  if(retainedVolumes.size>12000){
   const current=new Set(data.features.map(f=>f.properties.volume_id));
   for(const id of retainedVolumes.keys())if(!current.has(id))retainedVolumes.delete(id);
   const currentOutlines=new Set([...visible,...(selected?[selected]:[])].map(f=>f.properties.id));
   for(const id of retainedOutlines.keys())if(!currentOutlines.has(id))retainedOutlines.delete(id);
  }
  data={type:'FeatureCollection',features:[...retainedVolumes.values()]};
  const nextIds=new Set(retainedVolumes.keys());
  const source=map.getSource('buildings');
  if(!renderedVolumeIds.size||reset){source.setData(data);appliedMapStates.clear()}
  else{
   const remove=[...renderedVolumeIds].filter(id=>!nextIds.has(id));
   const add=data.features.filter(f=>!renderedVolumeIds.has(f.properties.volume_id));
   if(remove.length||add.length)source.updateData({remove,add});
   for(const id of remove)appliedMapStates.delete(id);
   window.lastGeometryDiff={added:add.length,removed:remove.length,reused:data.features.length-add.length};
  }
  renderedVolumeIds=nextIds;renderedGeometryQuality=context;geometryDirty=false;lastGeometryKey=geometryKey;window.geometryUploads=(window.geometryUploads||0)+1;
 }
 const paintKey=state.indicator+'|'+activeTheme;
 if(lastPaint!==paintKey){
  map.setPaintProperty('volumes','fill-extrusion-pattern',activeTheme==='energy'?['concat','hatch-',['get',state.indicator]]:activeTheme==='solar'?['concat',['case',['get','solar_estimated'],'solar-est-','solar-source-'],['get','solar_class']]:null);
  lastPaint=paintKey;
 }
 {
  const fs=[...retainedOutlines.values()];
  for(const f of fs){
   const p=f.properties,v=themePalette(p)||p,color=activeTheme==='energy'?'#ffffff':v.theme_name===activeTheme?colors[v.theme_value]||colors.unknown:colors.unknown;
   const estimated=activeTheme==='solar'&&v.theme_data?.estimated;
   const knownRenewal=activeTheme==='renewal'&&['done','planned','not_renewed','progress','mixed','partial'].includes(v.theme_value);
   const outlineColor=activeTheme==='energy'?'#52695e':estimated?'#8e4fba':knownRenewal?(v.theme_value==='done'?'#006348':v.theme_value==='not_renewed'?'#842a21':v.theme_value==='planned'?'#765718':v.theme_value==='partial'?'#146f66':'#a75c08'):'#71827b';
   const value={themeColor:color,outlineColor,outlineWidth:activeTheme==='energy'?.6:knownRenewal?2.2:estimated?1.0:.45},signature=JSON.stringify(value);
   for(const id of [p.id,...(p.model_parts||[]).map(part=>p.id+'-'+part.id)]){
    if(appliedMapStates.get(id)!==signature){map.setFeatureState({source:'buildings',id},value);appliedMapStates.set(id,signature)}
   }
  }
 }
 }
 if(map.getSource('projects')){
  const points=[];
  if(activeTheme==='renewal'){
   const footprints=[...renewalFootprints];
   if(focusedProject?.project_footprint&&!focusedProject.oid&&!footprints.some(f=>String(f.properties.sid)===String(focusedProject.source_id)))footprints.push({
    type:'Feature',geometry:focusedProject.project_footprint,
    properties:{sid:focusedProject.source_id,code:projectCode(focusedProject)}
   });
   const footprintIds=new Set(footprints.map(f=>String(f.properties.sid)));
   points.push(...renewalPoints.filter(f=>!footprintIds.has(String(f.properties.sid))),...footprints);
   if(focusedProject?.point&&!focusedProject.oid&&!points.some(f=>String(f.properties.sid)===String(focusedProject.source_id)))points.push({
    type:'Feature',geometry:{type:'Point',coordinates:focusedProject.point},
    properties:{sid:focusedProject.source_id,code:projectCode(focusedProject)}
   });
  }
  const data={type:'FeatureCollection',features:points},key=JSON.stringify(data);if(key!==lastProjectGeometry){map.getSource('projects').setData(data);lastProjectGeometry=key}
 }

 map.setFilter('selection',['all',['==',['get','oid'],state.id||''],['==',['get','part'],false]]);
}
async function json(url,signal){const r=await fetch(url,{signal});const d=await r.json();if(!r.ok)throw Error(d.error||'Podatci nisu dostupni.');return d}
function clusterGroups(features){
 const groups=[],radius=innerWidth<720?78:70;
 for(const f of [...features].sort((a,b)=>b.properties.count-a.properties.count)){
  const point=map.project(f.geometry.coordinates);let nearest=null,distance=radius;
  for(const g of groups){const d=Math.hypot(point.x-g.point.x,point.y-g.point.y);if(d<distance){nearest=g;distance=d}}
  if(nearest)nearest.feature.properties.count+=f.properties.count;
  else groups.push({point,feature:{...f,properties:{...f.properties}}});
 }
 return groups.map(g=>g.feature);
}
let overviewPromise=null,mapRetryAttempts=0;
async function mapPayload(box,signal,quality,only){
 if(box[0]>=box[2]||box[1]>=box[3])return {type:"FeatureCollection",features:[],clustered:true,note:"Pretraži adresu u Hrvatskoj ili vrati početni pogled."};
 if(quality==='default'&&!only){try{const tiled=await MapTiles.load(box,signal,themeRevision,summary?.map_tiles,d=>{
  if(!signal.aborted&&!visible.length&&!clusters.length&&d.features.length){
   visible=d.features;byId=new Map(visible.map(f=>[f.properties.id,f]));geometryDirty=true;applyThemeSeed();renderMap();$('#loading').hidden=true;
  }
 },map.getCenter());if(tiled)return tiled}catch(e){if(signal.aborted)throw e}}
 return json('/api/spatial/map?'+new URLSearchParams({bbox:box.join(','),quality,only:only?'1':'0',dataset:String(summary?.release_version||'audited-20261029-3'),app:'final-v213-flood-overview',theme_rev:themeRevision,compact:'1',theme:'energy',scenario:'mala'}),signal);
}
async function refreshThemeData(){
 if(!ready||refreshingThemes||document.hidden)return;
 refreshingThemes=true;
 try{
  const d=await json('/api/themes/revision',AbortSignal.timeout(3000));
  if(d.revision===themeRevision)return;
  if(vectorMode){toast('Podaci su osvježeni. Ponovno učitaj kartu.');return}
  const ids=[...new Set(visible.map(f=>f.properties.id).concat(selected?[selected.properties.id]:[]))];
  const before=geometryUploads;
  const response=await fetch('/api/themes/palettes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)return;
  const payload=await response.json();
  if(ids.some(id=>!payload.values?.[id]))return;
  const current=[...visible];if(selected&&!current.some(f=>f.properties.id===selected.properties.id))current.push(selected);
  if(current.some(f=>!payload.values?.[f.properties.id])){setTimeout(refreshThemeData,0);return}
  const updates=[];
  for(const f of current){
   const p=f.properties,old=p.theme_seed?.solar,next=payload.values[p.id]?.solar;
   if(next&&(old?.theme_value!==next.theme_value||!!old?.theme_data?.estimated!==!!next.theme_data?.estimated)){
    const addOrUpdateProperties=[{key:'solar_class',value:next.theme_value},{key:'solar_estimated',value:!!next.theme_data?.estimated}];
    for(const id of [p.id,...(p.model_parts||[]).map(part=>p.id+'-'+part.id)])updates.push({id,addOrUpdateProperties});
   }
  }
  if(updates.length&&!vectorMode){map.getSource('buildings').updateData({update:updates});window.solarPatternUpdates=(window.solarPatternUpdates||0)+updates.length}
  themeRevision=payload.revision||d.revision;geometryDirty=true;projectsRevision='';mapCache.clear();colorCache.clear();detailCache.clear();
  for(const f of visible)if(payload.values[f.properties.id])f.properties.theme_seed=payload.values[f.properties.id];
  if(selected&&payload.values[selected.properties.id])selected.properties.theme_seed=payload.values[selected.properties.id];
  applyThemeSeed();renderMap();renderList();loadRenewalPoints();
  if(state.q.trim())search();
  window.lastThemeRefresh={revision:themeRevision,ids:ids.length,at:performance.now(),geometryUploadsBefore:before,geometryUploadsAfter:geometryUploads};
  if(state.id&&!detailSuppressed)choose(state.id,false,false,preferredSourceAddress);
  else if(activeTheme==='renewal'&&focusedProject){
   const currentProject=focusedProject,sequence=detailSequence;
   const project=await json('/api/themes/project/'+encodeURIComponent(currentProject.source_id),AbortSignal.timeout(3000));
   if(activeTheme==='renewal'&&focusedProject===currentProject&&sequence===detailSequence&&JSON.stringify(project)!==JSON.stringify(currentProject)){
    showMarkerProject(project,false);
    if(project.oid)write(true);
   }
  }
 }catch(e){/* Keep current colors; the next foreground check retries. */}
 finally{refreshingThemes=false}
}
setInterval(refreshThemeData,60000);
window.addEventListener('focus',refreshThemeData);
async function loadRenewalPoints(){
 const seq=++pointSequence;
 pointController?.abort();
 if(activeTheme!=='renewal'||!ready){renewalPoints=[];renewalFootprints=[];if(ready)renderMap();return}
 const b=map.getBounds(),box=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],zoom=map.getZoom();
 if(zoom<15&&renewalFootprints.length){renewalFootprints=[];renderMap()}
 const controller=pointController=new AbortController();
 try{
  const d=await json('/api/themes/project-points?bbox='+box.join(',')+(zoom<14?'&work=1':zoom>=15?'&footprints=1':''),controller.signal);
  if(seq!==pointSequence||activeTheme!=='renewal')return;
  renewalPoints=d.features;
  renewalFootprints=d.footprints||[];
  renderMap();
 }catch{
  // Keep the last verified project markers and outlines while the request is unavailable.
 }finally{
  if(pointController===controller)pointController=null;
 }
}
async function loadVectorMap(){
 if(!ready)return;
 $('#map-recovery').hidden=true;
 if(map.getZoom()>=15){
  mapController?.abort();pendingMap=null;
  for(const c of clusters)c.marker.remove();clusters=[];
  VectorView.paint();renderList();
  if(map.isSourceLoaded('buildings')){
   $('#loading').hidden=true;$('#map-badge').textContent='Zgrade · odaberi zgradu.';
   if(!basemapStarted)startBasemap();
  }
  return;
 }
 mapController?.abort();const controller=mapController=new AbortController(),seq=++mapSequence;
 const b=map.getBounds(),box=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
 pendingMap={seq};
 try{
  const d=await json('/api/vector/overview?'+new URLSearchParams({bbox:box.join(','),quality:state.quality,theme:activeTheme}),controller.signal);
  if(seq!==mapSequence)return;
  for(const c of clusters)c.marker.remove();clusters=[];visible=[];
  for(const f of clusterGroups(d.features)){
   const el=document.createElement('button');el.className='cluster-button';el.textContent=fmt(f.properties.count);el.setAttribute('aria-label',fmt(f.properties.count)+' grupiranih obrisa. Približi za pojedine zgrade.');
   const marker=new maplibregl.Marker({element:el}).setLngLat(f.geometry.coordinates).addTo(map);
   el.onclick=()=>map.easeTo({center:f.geometry.coordinates,zoom:16.5,pitch:state.mode==='2d'?0:52,duration:350});
   clusters.push({marker,count:f.properties.count});
  }
  $('#loading').hidden=true;$('#map-badge').textContent='Približi kartu za pojedine zgrade.';renderList();if(!basemapStarted)startBasemap();
 }catch(e){if(e.name!=='AbortError'){$('#map-recovery').hidden=false;$('#loading').hidden=true}}
 finally{if(pendingMap?.seq===seq)pendingMap=null}
}
async function loadMap(){
 if(!ready)return;
 if(vectorMode)return loadVectorMap();
 if(!themeRevision)await summaryReady;
 $('#map-recovery').hidden=true;
 const b=map.getBounds(),view=[Math.max(-180,b.getWest()),Math.max(-85.051,b.getSouth()),Math.min(180,b.getEast()),Math.min(85.051,b.getNorth())],filter=state.quality+'|'+(activeTheme==='energy'&&state.only);
 const inside=(box)=>view[0]>=box[0]&&view[1]>=box[1]&&view[2]<=box[2]&&view[3]<=box[3];
 if(coverage&&coverage.filter===filter&&inside(coverage.box)){if(pendingMap){mapController?.abort();mapSequence++;pendingMap=null}$('#loading').hidden=true;if(activeTheme==='energy'||!applyThemeSeed())$('#map-badge').textContent=clusters.length?'Približi kartu ili pretraži adresu.':'Zgrade · odaberi zgradu.';return;}
 if(pendingMap&&pendingMap.filter===filter&&pendingMap.detailed===(view[2]-view[0]<.07&&view[3]-view[1]<.055)&&inside(pendingMap.box))return;
 const detailed=view[2]-view[0]<.07&&view[3]-view[1]<.055,step=.0005;
 const box=detailed?[Math.floor(view[0]/step)*step-step,Math.floor(view[1]/step)*step-step,Math.ceil(view[2]/step)*step+step,Math.ceil(view[3]/step)*step+step]:view;
 if(mapController)mapController.abort();mapController=new AbortController();const seq=++mapSequence;pendingMap={filter,box,seq,detailed};
 const bbox=box.map(x=>x.toFixed(6)).join(','),key=filter+'|'+bbox;
 let cached=mapCache.get(key);
 if(!cached&&detailed)for(const item of mapCache.values()){if(item.filter===filter&&inside(item.box)&&!item.data.clustered&&!item.data.truncated){cached=item;break}}
 $('#map-badge').textContent='Učitavam…';
 let requestTimer;
 try{
  const requestedRevision=themeRevision;
  const persistentKey='mz-systematic-geometry-v206|'+requestedRevision+'|'+key;
  let stored=null;
  if(seq!==mapSequence)return;
  const d=cached?cached.data:stored||await Promise.race([mapPayload(box,mapController.signal,state.quality,activeTheme==='energy'&&state.only),new Promise((_,reject)=>{requestTimer=setTimeout(()=>reject(Error('Učitavanje je predugo trajalo.')),activeTheme==='solar'?30000:12000)})]);
  if(seq!==mapSequence)return;
  if(requestedRevision&&requestedRevision!==themeRevision){
   pendingMap=null;
   loadMap();
   return;
  }
  const thematicError=(d.features||[]).some(f=>f.properties.theme_data?.state==='error');
  $('#theme-source-error').hidden=!thematicError;
  if(!thematicError&&!cached&&!stored&&detailed&&requestedRevision&&requestedRevision===summary?.theme_revision&&!d.clustered&&!d.truncated&&!d.static_cells)MapViewCache.write(persistentKey,d);
  if(seq!==mapSequence)return;
  mapRetryAttempts=0;$('#map-recovery').hidden=true;
  if(!thematicError&&!cached){mapCache.set(key,{filter,box,data:d});if(mapCache.size>10)mapCache.delete(mapCache.keys().next().value)}
  coverage=!thematicError&&detailed&&!d.clustered&&!d.truncated?{filter,box:cached?cached.box:box}:null;geometryDirty=true;
  if(seq!==mapSequence)return;
  for(const c of clusters)c.marker.remove();clusters=[];
  if(d.clustered){
   visible=[];
   for(const f of clusterGroups(d.features)){
    const el=document.createElement('button');el.className='cluster-button';el.textContent=fmt(f.properties.count);el.setAttribute('aria-label',fmt(f.properties.count)+' grupiranih obrisa. Približi za pojedine zgrade.');
    const marker=new maplibregl.Marker({element:el}).setLngLat(f.geometry.coordinates).addTo(map);
    el.onclick=()=>map.easeTo({center:f.geometry.coordinates,zoom:16.5,pitch:state.mode==='2d'?0:52,duration:500});
    clusters.push({marker,count:f.properties.count});
   }
  }else {visible=d.features;byId.clear();for(const f of visible)byId.set(f.properties.id,f)}
  window.projectPoints=d.project_points||{type:'FeatureCollection',features:[]};limit=30;const seeded=applyThemeSeed();renderMap();renderList();
  if(activeTheme==='energy'||!seeded)$('#map-badge').textContent=d.note||'3D zgrade · klikni za podatke i razlog spoja';
  $('#loading').hidden=true;if(!basemapStarted)map.once('idle',startBasemap);if(activeTheme!=='energy'&&!seeded)loadThemeColors();
 }catch(e){if(e.name!=='AbortError'&&seq===mapSequence){$('#loading').hidden=true;$('#stats').textContent='Pregled podataka trenutačno nije dostupan.';if(mapRetryAttempts<1){mapRetryAttempts++;$('#map-badge').textContent='Ponovno pokušavam učitati podatke…';setTimeout(()=>{if(seq===mapSequence)loadMap()},600)}else{$('#map-badge').textContent='Podaci se nisu učitali.';$('#map-recovery').hidden=false}}}finally{clearTimeout(requestTimer);if(pendingMap?.seq===seq)pendingMap=null}
}
async function search(){
 const searchStarted=lastSearchInputAt||performance.now();lastSearchInputAt=0;
 if(searchController)searchController.abort();searchController=new AbortController();const seq=++searchSequence;
 if(!state.q.trim()){searchBusy=false;searchResults=[];searchTotal=0;renderList();if(innerWidth<=720)setView('map');return}
 searchBusy=true;renderList();
 try{const d=await json('/api/spatial/search?q='+encodeURIComponent(state.q)+(activeTheme!=='energy'?'&theme='+activeTheme:''),searchController.signal);if(seq!==searchSequence)return;searchBusy=false;searchResults=d.records;searchTotal=d.total;renderList();document.body.dataset.searchReadyMs=String(Math.round(performance.now()-searchStarted));if(innerWidth<=720&&state.q.trim()&&$('#detail').hidden)setView('list')}
 catch(e){if(e.name!=='AbortError'&&seq===searchSequence){searchBusy=false;$('#stats').textContent='Pretraga nije dostupna';toast(e.message)}}
}
function home(){
 if(!ready)return;
 if(state.area==='hr'){map.fitBounds([[13.4,42.3],[19.55,46.65]],{padding:{top:40,bottom:130,left:24,right:24},pitch:30,bearing:0,duration:0});loadMap();return}
 const center=areas[state.area]||areas.kruge;
 map.jumpTo({center,zoom:state.area==='hr'?6.5:state.area==='zagreb'?12.5:17.2,pitch:state.mode==='2d'?0:52,bearing:state.mode==='2d'?0:-22});loadMap();
}
function evidenceText(r){
 const e=r.link_evidence||{},m=r.link_method||'';let lines=[];
 if(m.startsWith('DGU_')){lines.push('Službena DGU adresa: '+(e.official_address||'')+'.');lines.push(e.position_method==='near_site'?'Prijedlog bliskog obrisa '+e.distance_m+' m od adresne točke.':e.position_method==='DGU_inside_OSM_overlap'?'Adresa leži u službenom DGU obrisu. Prikazani OSM obris odabran je prema prostornom preklapanju; točka ne mora biti unutar njega.':'Službena adresna točka leži unutar ovog obrisa.');lines.push('Izvor obrisa: '+e.geometry_source+'. Adresa je lokacija, a ne potvrda opsega certifikata.')}
 else if(m.includes('building_address'))lines.push('Adresa je upisana na OSM obrisu.');
 else if(m.includes('official_facility'))lines.push('Službena gradska točka ustanove leži u obrisu; adresa se podudara.');
 else if(m.includes('address_point_8_25m'))lines.push('Slabiji prijedlog: jedinstveni bliski obris na '+(e.distance_metres||'?')+' m od adresne točke. Nije uspostavljen izravan spoj.');
 else if(m.includes('near_outline'))lines.push('OSM adresna točka nalazi se neposredno uz obris, a ne unutar njega.');
 else if(m.includes('address_node_inside'))lines.push('OSM adresna točka leži unutar obrisa.');
 if(m.includes('associatedStreet'))lines.push('Ulica je utvrđena OSM vezom adrese i ulice.');
 if(m.includes('street_alias'))lines.push('Korišten je izvorno upisan alternativni ili stari OSM naziv ulice.');
 if(m.includes('street_inferred'))lines.push('Ulica je procijenjena prema obližnjoj imenovanoj prometnici; to je slabiji trag.');
 if(m.includes('initials'))lines.push('Ulica je povezana preko inicijala, prezimena i istog kućnog broja.');
 if(m.includes('fuzzy'))lines.push('Nazivi ulica vrlo su slični; kućni broj i lokalitet se podudaraju.');
 if(m.includes('distinctive_name'))lines.push('Podudaraju se prepoznatljiv naziv objekta i lokalitet.');
 if(e.locality_evidence==='nearby')lines.push('Lokalitet je poduprt obližnjim OSM naseljima, ne izravnom adresnom oznakom.');
 else if(e.locality_evidence==='strong')lines.push('Lokalitet je poduprt adresnom oznakom ili OSM administrativnim obuhvatom.');
 if(e.source_field==='house_subunit_alternative')lines.push('Isprobana je alternativa glavnog kućnog broja bez podbroja. To je slabiji prijedlog, ne izravno podudaranje.');
 else if(e.source_field&&e.source_field!=='address')lines.push('Dodatni adresni trag uzet je iz naziva zgrade/cjeline ili raspona brojeva.');
 if(e.use_disagreement)lines.push('TTB sloj označava poljoprivrednu namjenu, a certifikat stambenu. Adresa se podudara, ali namjena i starost izvora zahtijevaju dodatnu provjeru.');
 if(e.locality_conflict)lines.push('Grad u izvornom zapisu i grad službene adrese nisu usklađeni. Ovo je slabiji prijedlog dobiven iz dodatnog naziva objekta.');
 if(m.includes('slash_unit_weak'))lines.push('Podbroj je probno protumačen kao oznaka stana; nije potvrđen kućni podbroj.');
 if(m.includes('multiple_house_numbers'))lines.push('Izvorna adresa sadrži više kućnih brojeva; sačuvani su mogući obrisi.');
 if(r.other_candidate_count)lines.push('Isti zapis ima još '+r.other_candidate_count+' mogućih obrisa. Nije proizvoljno izabran samo jedan.');
 if(e.metadata?.unit_label)lines.push('Provjeren je i naziv zgrade/krila iz izvornog zapisa.');
 return lines.length?lines.join(' '):'Obrazloženje je spremljeno u tehničkom tragu povezivanja.';
}
function dateText(r){return 'Izdano '+esc(r.issued)+' · navedeni istek '+esc(r.expires)}
function useful(value){return value&&value.trim()&&value.trim()!=='-'?value.trim():''}
function metric(value,label,unit=''){
 const shown=useful(value)||'—';
 return '<div class="profile-metric"><span>'+esc(label)+'</span><strong>'+esc(shown)+'</strong>'+(shown==='—'?'':'<small>'+esc(unit)+'</small>')+'</div>';
}
function classScale(label,value,amount){
 return '<div class="profile-scale"><div><span>'+esc(label)+'</span><b>'+esc(value||'—')+'</b></div><div class="profile-scale-bands" aria-label="'+esc(label)+': razred '+esc(value||'nije naveden')+'">'+classes.map(c=>'<i class="'+(c===value?'active ':'')+light(c)+'" style="--c:'+colors[c]+'">'+c+'</i>').join('')+'</div><small>'+esc(useful(amount)||'Vrijednost nije navedena')+(useful(amount)?' kWh/(m²·a)':'')+'</small></div>';
}
function certificateProfile(r,compact=false){
 return '<div class="certificate-profile '+(compact?'compact':'')+'">'+classScale('Potrebna toplina za grijanje',r.heating_class,r.heating_demand)+classScale('Primarna energija',r.primary_class,r.primary_energy)+'<div class="profile-metrics">'+metric(r.heated_area,'Grijana površina','m²')+metric(r.gross_area,'Bruto površina','m²')+metric(r.construction_year,'Godina izgradnje')+metric(r.co2,'CO₂ · vrijednost iz izvoda')+'</div></div>';
}
// Group only by the explicit source scope label. No inferred apartment or floor mapping.
function scopeLabel(r){return useful(r.unit_name).replace(/\s+/g,' ')}
function scopeKey(r){return scopeLabel(r).toLocaleLowerCase('hr')}
function groupCertificates(records){return CertificateOrganization.group(records)}
function recordCount(n){return n+' '+(n%10===1&&n%100!==11?'certifikat':'certifikata')}
function recordClasses(r){return '<div class="record-classes"><span>Grijanje <b>'+esc(useful(r.heating_class)||'—')+'</b></span><span>Primarna energija <b>'+esc(useful(r.primary_class)||'—')+'</b></span></div>'}
function dateKey(r){const m=String(r.issued||'').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);return m?Number(m[3])*10000+Number(m[2])*100+Number(m[1]):0}
function detailName(p){
 const generic=/^(?:osnovna škola|srednja škola|škola|obiteljska kuća|stambena zgrada|višestambena zgrada|zgrada|poslovna zgrada|poslovni prostor|stan u višestambenoj zgradi|stan|stambena građevina)$/i;
 const sourceName=useful(p.tags?.name)||useful(p.name);
 if(sourceName&&!generic.test(sourceName)&&!/^\d{5}\b/.test(sourceName))return sourceName;
 const candidates=(p.certificates||[]).flatMap(r=>[useful(r.unit_name),useful(r.building_name)]).filter(n=>/^(?:osnovna škola|srednja škola|dječji vrtić|dom zdravlja|bolnica|muzej|fakultet|sveučilište|knjižnica)\b/i.test(n)&&!generic.test(n));
 const unique=[...new Set(candidates)];return unique.length===1?unique[0]:sourceName&&!generic.test(sourceName)?sourceName:p.address||sourceName||'Zgrada bez naziva';
}
function certificateCard(r){
 return '<article class="cert" data-source-record="'+r.record+'"><p class="cert-date">Izdano '+esc(useful(r.issued)||'Datum nije naveden')+'</p>'+recordClasses(r)+'<p class="certificate-ref">Certifikat <code>'+esc(r.certificate)+'</code></p><details class="cert-extra"><summary>Brojke i izvor certifikata</summary>'+certificateProfile(r,true)+'<p><b>Naziv građevine iz izvoda:</b> '+esc(useful(r.building_name)||'Nije naveden')+'</p><p><b>Obuhvat iz izvoda:</b> '+esc(useful(r.unit_name)||'Nije naveden')+'</p><p>'+esc(r.address)+' · '+esc(r.city)+'</p><p>Navedeni istek: '+esc(useful(r.expires)||'Nije naveden')+'. Sam datum ne potvrđuje zamjenu ili opoziv.</p><p>Oznaka: <code>'+esc(r.certificate)+'</code></p><p><a href="/certificate.html?id='+r.record+'" target="_blank">Pohranjeni zapis · izvorni PDF str. '+r.source_page+' ↗</a></p><details><summary>Zašto je ovaj zapis ovdje?</summary><div class="quality-note '+esc(r.link_quality||'')+'">'+esc(evidenceText(r))+'</div><details><summary>Tehnički trag povezivanja</summary><p>'+esc(r.link_method||'')+'</p><p>'+esc(JSON.stringify(r.link_evidence||{}))+'</p></details></details></details></article>';
}
function certificateGroups(records,selectedAddress=''){
 const addresses=groupCertificates(records),selectedKey=CertificateOrganization.house(selectedAddress)?.key||CertificateOrganization.normalizedAddress(selectedAddress);
 const preferred=addresses.findIndex(a=>a.rows.some(r=>(CertificateOrganization.house(r.address)?.key||CertificateOrganization.normalizedAddress(r.address))===selectedKey));
 const first=Math.max(0,preferred);
 const preview=rows=>{
  const pairs=[...new Set(rows.map(r=>(useful(r.heating_class)||'—')+'|'+(useful(r.primary_class)||'—')))];
  return pairs.length===1?'Grijanje '+esc(pairs[0].split('|')[0])+' · Primarna '+esc(pairs[0].split('|')[1]):'Različiti razredi';
 };
 return '<section class="certificate-groups"><div class="group-intro"><h3>Certifikati po adresi i katu</h3><details class="group-method"><summary>Kako je složen pregled?</summary><p>Varijante iste adrese objedinjene su uz čuvanje izvornog teksta. Katovi i oznake stanova pročitani su iz naziva cjeline; kad toga nema, podatak ostaje nepoznat. Isti naziv ili broj nije potvrda istog fizičkog stana. Svi certifikati ostaju odvojeni, najnoviji datum prvi. Ovo nije potpuni tlocrt ni popis svih stanova zgrade.</p></details></div>'+(addresses.length>1?'<label class="entrance-picker">Adresa u odabranoj zgradi<select id="detail-entrance" aria-label="Adresa u odabranoj zgradi">'+addresses.map((a,i)=>'<option value="'+i+'" '+(i===first?'selected':'')+'>'+esc(a.address)+(a.city?' · '+esc(a.city):'')+' · '+recordCount(a.rows.length)+'</option>').join('')+'</select></label>':'')+addresses.map((a,i)=>'<section class="cert-address" data-entrance="'+i+'" '+(i!==first?'hidden':'')+'>'+(addresses.length===1?'<h4 class="organized-address">'+esc(a.address)+(a.city?' · '+esc(a.city):'')+'</h4>':'')+'<p class="floor-help">Katovi od viših prema nižima · samo navedeni podaci</p>'+a.floors.map(f=>'<section class="cert-floor" data-floor="'+esc(f.key)+'"><h4>'+esc(f.label)+'</h4>'+f.groups.map(u=>'<details class="cert-group" data-unit="'+esc(u.key)+'"><summary><span>'+esc(u.label)+'<small class="group-preview">'+preview(u.rows)+(u.rows.length===1?'<br>Izdano '+esc(useful(u.rows[0].issued)||'Datum nije naveden'):'')+'</small></span><b>'+recordCount(u.rows.length)+'</b></summary>'+u.rows.map(certificateCard).join('')+'</details>').join('')+'</section>').join('')+'</section>').join('')+'</section>';
}
const fuelColors={'Električna energija':'#e0a72d','Prirodni plin':'#4c7eaa','Toplina':'#c95f43',Para:'#865b93','Loživo ulje ekstra lako':'#7d6755','Loživo ulje lako':'#7d6755',Peleti:'#63904d','Plin u boci':'#648893',UNP:'#648893'};
const compact=n=>n==null?'—':new Intl.NumberFormat('hr-HR',{notation:'compact',maximumFractionDigits:1}).format(n);
function consumptionChart(c){
 const source=c.monthly||[],last=source.length?Number(source[source.length-1].period.replace('-','')):0;
 const shown=source.filter(m=>Number(m.period.replace('-',''))<=last).slice(-24),max=Math.max(1,...shown.map(m=>Math.max(0,m.energy_kwh||0))),anomalyPeriods=new Set((c.anomalies||[]).map(a=>a.period));
 const totals={};for(const m of shown)for(const [fuel,value] of Object.entries(m.fuels||{}))if(value>0)totals[fuel]=(totals[fuel]||0)+value;
 const legend=Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([fuel])=>'<span><i style="--fuel:'+esc(fuelColors[fuel]||'#7b8d84')+'"></i>'+esc(fuel)+'</span>').join('');
 const bars=shown.map((m,index)=>{const value=Math.max(0,m.energy_kwh||0),height=value/max*100,segments=Object.entries(m.fuels||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([fuel,v])=>'<i style="height:'+(v/value*100).toFixed(2)+'%;--fuel:'+esc(fuelColors[fuel]||'#7b8d84')+'"></i>').join(''),label=m.period.slice(5)==='01'||index===0||index===shown.length-1?m.period.slice(2).replace('-','/'):'';
  return '<div class="consumption-month"><div class="consumption-bar '+(anomalyPeriods.has(m.period)?'is-anomaly ':'')+(m.energy_kwh==null?'is-missing':'')+'" data-period="'+m.period+'" role="img" aria-label="'+esc(m.period+': '+(m.energy_kwh==null?'potrošnja nije navedena':fmt(Math.round(m.energy_kwh))+' kWh'))+'" title="'+esc(m.period+' · '+(m.energy_kwh==null?'nema kWh podatka':fmt(Math.round(m.energy_kwh))+' kWh'))+'"><span style="height:'+Math.max(value?2:0,height).toFixed(2)+'%">'+segments+'</span></div><small>'+label+'</small></div>';
 }).join('');
 return '<div class="consumption-chart" aria-label="Mjesečna potrošnja energije u posljednja 24 mjeseca">'+bars+'</div><div class="fuel-legend">'+legend+'</div>';
}
function anomalyVisual(a){
 const overallMax=Math.max(1,a.value_kwh||0,a.baseline_kwh||0),overall='<div class="anomaly-compare" role="img" aria-label="Stvarna potrošnja '+fmt(Math.round(a.value_kwh))+' kWh, sezonski medijan '+fmt(Math.round(a.baseline_kwh))+' kWh"><span>Ukupna potrošnja</span><div><i class="actual" style="width:'+(a.value_kwh/overallMax*100).toFixed(1)+'%"></i><b>'+compact(a.value_kwh)+'</b></div><div><i class="baseline" style="width:'+(a.baseline_kwh/overallMax*100).toFixed(1)+'%"></i><b>'+compact(a.baseline_kwh)+' medijan</b></div></div>';
 const fuels=(a.visual?.fuels||[]),fuelMax=Math.max(1,...fuels.flatMap(f=>[f.current_kwh||0,f.baseline_kwh||0])),fuelRows=fuels.map(f=>'<div class="fuel-diff-row"><span>'+esc(f.fuel)+'</span><div class="fuel-pair"><i class="actual" style="width:'+(f.current_kwh/fuelMax*100).toFixed(1)+'%"></i><small>'+compact(f.current_kwh)+'</small></div><div class="fuel-pair"><i class="baseline" style="width:'+(f.baseline_kwh/fuelMax*100).toFixed(1)+'%"></i><small>'+compact(f.baseline_kwh)+'</small></div></div>').join('');
 const fuelChart=fuels.length?'<div class="anomaly-mini"><h5>Odakle dolazi razlika</h5><div class="mini-legend"><span><i class="actual"></i>taj mjesec</span><span><i class="baseline"></i>medijan</span></div>'+fuelRows+'</div>':'';
 const w=a.visual?.weather,weatherMax=w?Math.max(1,w.observed,w.baseline):1,weatherChart=w?'<div class="anomaly-mini weather-mini"><h5>'+esc(w.metric)+' · vremenski kontekst</h5><div class="weather-bars"><div><span>Taj mjesec</span><i class="actual" style="width:'+(w.observed/weatherMax*100).toFixed(1)+'%"></i><b>'+fmt(w.observed)+'</b></div><div><span>Medijan</span><i class="baseline" style="width:'+(w.baseline/weatherMax*100).toFixed(1)+'%"></i><b>'+fmt(w.baseline)+'</b></div></div></div>':'';
 return '<div class="anomaly-visuals">'+overall+fuelChart+weatherChart+'</div>';
}
function consumptionPanel(c){
 if(c.match_status==='ambiguous')return '<section class="consumption-panel consumption-ambiguous"><div class="consumption-heading"><span>ISGE · Grad Zagreb</span><h3>Potrošnja nije automatski spojena</h3></div><p>'+esc(c.message)+'</p></section>';
 const l=c.latest_12||{},energyChange=l.energy_change_pct,costChange=l.cost_change_pct,changeClass=energyChange==null?'neutral':energyChange>0?'up':'down';
 const reasonLabel={data:'Iz podataka',supporting:'Vrijeme',not_supporting:'Vrijeme',hypothesis:'Hipoteza'};
 const anomalyHtml=(c.anomalies||[]).length?'<div class="consumption-anomalies"><h4>Mjeseci koji odskaču od vlastitog sezonskog obrasca</h4>'+c.anomalies.map(a=>'<article class="anomaly-row '+a.direction+'"><b>'+esc(a.period)+'</b><span>'+Math.abs(a.difference_pct).toLocaleString('hr-HR')+'% '+(a.direction==='high'?'iznad':'ispod')+' medijana za taj mjesec</span><small>'+fmt(Math.round(a.value_kwh))+' prema '+fmt(Math.round(a.baseline_kwh))+' kWh · '+a.comparison_years+' ranije godine</small>'+anomalyVisual(a)+'<div class="anomaly-reasons">'+(a.reasons||[]).map(r=>'<div class="reason-row '+esc(r.confidence)+'"><em class="reason-badge">'+esc(reasonLabel[r.confidence]||'Kontekst')+'</em><div><b>'+esc(r.title)+'</b><p>'+esc(r.detail)+'</p></div></div>').join('')+'</div><div class="anomaly-agent"><button data-action="research-anomaly" data-period="'+esc(a.period)+'">🌐 Pretraži mogući razlog na internetu</button><div class="anomaly-agent-result" role="status"></div></div></article>').join('')+'<p>Ovo su mogući razlozi za provjeru, ne dokaz uzroka, kvara ili rasipanja.</p></div>':'';
 return '<section class="consumption-panel"><div class="consumption-heading"><span>Stvarna mjesečna očitanja · ISGE Grad Zagreb</span><h3>Potrošnja javnog objekta</h3><p>'+esc(c.object_names.join(' · '))+' · '+esc(c.matched_address)+'</p></div><div class="consumption-kpis"><div><span>Zadnjih 12 mjeseci</span><strong>'+compact(l.energy_kwh)+'</strong><small>kWh · '+l.energy_months+'/12 mjeseci</small></div><div class="'+changeClass+'"><span>Promjena potrošnje</span><strong>'+(energyChange==null?'—':(energyChange>0?'+':'')+energyChange.toLocaleString('hr-HR')+'%')+'</strong><small>prema prethodnih 12 mjeseci</small></div><div><span>Trošak energije</span><strong>'+compact(l.energy_cost_eur)+' €</strong><small>'+(costChange==null?'usporedba nije potpuna':(costChange>0?'+':'')+costChange.toLocaleString('hr-HR')+'% prema ranije')+'</small></div>'+(l.orientation_kwh_m2==null?'<div><span>Mjerna mjesta</span><strong>'+fmt(c.meter_count)+'</strong><small>objedinjeno po adresi</small></div>':'<div><span>Orijentacijski intenzitet</span><strong>'+fmt(l.orientation_kwh_m2)+'</strong><small>kWh/m² · obuhvat nije potvrđen</small></div>')+'</div><div class="consumption-subhead"><h4>Mjesečni profil</h4><span>'+esc(c.period.first)+' – '+esc(c.period.last)+'</span></div>'+consumptionChart(c)+anomalyHtml+'<details class="consumption-source"><summary>Kako čitati ove podatke?</summary><p>Prikaz zbraja '+fmt(c.meter_count)+' mjernih mjesta javnog ISGE objekta na istoj adresi. Negativne korekcije računa netirane su unutar mjeseca; prazna potrošnja nije pretvorena u nulu.</p>'+(c.area_basis?'<p>Intenzitet koristi površinu iz certifikata samo kao orijentaciju. '+esc(c.area_basis)+'</p>':'')+'<p>Vrijeme koristi dnevnu NASA POWER temperaturu za jednu točku Zagreba i izvedene HDD18/CDD22. To je mrežna procjena, ne mjerenje na objektu. <a href="'+esc(c.source.weather_url)+'" target="_blank" rel="noreferrer">NASA POWER · metodologija ↗</a></p><p>Skup obuhvaća javne objekte Grada Zagreba, ne privatna kućanstva. <a href="'+esc(c.source.url)+'" target="_blank" rel="noreferrer">Grad Zagreb · otvoreni podaci ↗</a></p></details></section>';
}
async function researchAnomaly(button){
 const period=button.dataset.period,box=button.closest('.anomaly-agent').querySelector('.anomaly-agent-result');button.disabled=true;button.textContent='Pretražujem službene i javne izvore…';box.innerHTML='<p>GPT-6 Luna pretražuje internet za '+esc(period)+'. Ovo može potrajati.</p>';
 try{
  const response=await fetch('/api/anomaly-research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({building_id:state.id,period})}),data=await response.json();
  if(!response.ok)throw Error(data.error||'Internetska pretraga nije uspjela.');
  const links=(data.sources||[]).map(source=>'<li><a href="'+esc(source.url)+'" target="_blank" rel="noreferrer">'+esc(source.title||source.url)+' ↗</a></li>').join('');
  box.innerHTML='<div class="agent-answer"><span>GPT-6 Luna · dinamička web pretraga</span><p>'+esc(data.text).replaceAll('\n','<br>')+'</p>'+(links?'<h5>Izvori koje je agent otvorio</h5><ul>'+links+'</ul>':'<small>Agent nije vratio zaseban popis izvora; tvrdnje bez izvora nisu potvrđene.</small>')+'</div>';
  button.textContent='↻ Ponovi internetsku pretragu';
 }catch(error){box.innerHTML='<p class="agent-error">'+esc(error.message)+'</p>';button.textContent='🌐 Pokušaj ponovno';}
 finally{button.disabled=false}
}
function singleCertificateSource(r){
 return '<details class="cert-source"><summary>Brojke i izvor certifikata</summary>'+certificateProfile(r)+'<p class="certificate-ref">Oznaka certifikata <code>'+esc(r.certificate)+'</code></p><p>'+esc(r.building_type||'Vrsta zgrade nije navedena')+'. Navedeni istek: '+esc(r.expires)+'. Sam datum ne potvrđuje da certifikat nije zamijenjen ili opozvan.</p><p><a href="/certificate.html?id='+r.record+'" target="_blank">Pohranjeni zapis · izvorni PDF str. '+r.source_page+' ↗</a></p><details><summary>Zašto je zapis povezan?</summary><div class="quality-note '+esc(r.link_quality||'')+'">'+esc(evidenceText(r))+'</div><details><summary>Tehnički trag</summary><p>'+esc(r.link_method||'')+'</p><p>'+esc(JSON.stringify(r.link_evidence||{}))+'</p></details></details></details>';
}
function certificateSummary(p,cs){
 if(cs.length>1){
  const mixed=p.heating==='multi'||p.primary==='multi';
  return '<div class="certificate-summary"><strong>'+cs.length+' certifikata'+(mixed?' · različiti razredi':'')+'</strong>'+(mixed?'':'<div class="compact-classes"><span>Grijanje <b>'+esc(p.heating==='unknown'?'—':p.heating)+'</b></span><span>Primarna energija <b>'+esc(p.primary==='unknown'?'—':p.primary)+'</b></span></div>')+'</div>';
 }
 return '<div class="class-pair"><div><small>Grijanje</small><b>'+esc(p.heating==='unknown'?'—':p.heating)+'</b></div><div><small>Primarna energija</small><b>'+esc(p.primary==='unknown'?'—':p.primary)+'</b></div></div><p class="record-summary">'+(cs.length?'Izdano '+esc(cs[0].issued):'Nema pridruženog certifikata')+'</p>';
}
function renderEnergyDetail(f){BuildingCards.energy(f)}
let preferredSourceAddress='',detailSequence=0,detailSuppressed=false,detailController;
const detailCache=new Map();
function beginDetailRequest(){
 const sequence=++detailSequence;
 detailController?.abort();
 detailController=undefined;
 return sequence;
}
let mobileView='map';
function setView(view){mobileView=view;document.body.classList.toggle('mobile-results',view==='list');$('#view-map').setAttribute('aria-pressed',view==='map');$('#view-list').setAttribute('aria-pressed',view==='list');if(ready&&view==='map'){map.resize();loadMap()}}
function updateFilterCount(){const n=Number(state.quality!=='default')+Number(state.only);$('#filter-count').textContent=n?' · '+n:''}

function selectedMapOffset(){
 if(innerWidth>1100)return [-175,0];
 if(innerWidth>720)return [0,-30];
 const shell=$('#map-shell').getBoundingClientRect(),panel=$('#detail').getBoundingClientRect();
 const top=shell.top+62,bottom=$('#detail').hidden?shell.bottom-35:panel.top-8;
 return [0,top+Math.max(0,bottom-top)*0.68-(shell.top+shell.height/2)];
}
function addLegendControl(){
 const legend=$('.legend');
 if(!legend.querySelector('.legend-toggle'))legend.insertAdjacentHTML('afterbegin','<button class="legend-toggle" data-action="toggle-legend" aria-expanded="false" aria-label="Prikaži legendu karte">Legenda</button>');
 legend.classList.remove('legend-expanded');
}
function openDetail(){
 const keepScenarioFocus=!$('#detail').hidden&&document.activeElement===$('#scenario');
 if(innerWidth<=720)setView('map');$('#detail').hidden=false;$('#map-shell').classList.add('detail-open');document.body.classList.add('has-detail');if(ready)map.resize();
 if(innerWidth<=720){$('#detail').setAttribute('role','region');$('#detail').removeAttribute('aria-modal');document.body.style.overflow='hidden'}else{$('#detail').setAttribute('role','region');$('#detail').removeAttribute('aria-modal')}
 const head=$('#detail .detail-head');
 const back=head?.querySelector('[data-action="close"]');if(back){back.textContent=state.q.trim()?'← Rezultati':'← Karta';back.classList.remove('close-icon');back.classList.add('detail-back');back.setAttribute('aria-label',state.q.trim()?'Natrag na rezultate pretrage':'Natrag na kartu');}
 if(head&&!head.querySelector('[data-action="expand-detail"]'))head.querySelector('[data-action="close"]')?.insertAdjacentHTML('beforebegin','<button class="detail-expand" data-action="expand-detail" aria-expanded="'+document.body.classList.contains('detail-expanded')+'">'+(document.body.classList.contains('detail-expanded')?'Smanji':'Proširi')+'</button>');
 $('.legend').classList.remove('legend-expanded');const legendToggle=$('.legend-toggle');if(legendToggle){legendToggle.setAttribute('aria-expanded','false');legendToggle.setAttribute('aria-label','Prikaži legendu karte');legendToggle.textContent='Legenda'}
 const entrance=$('#detail-entrance'),savedEntrance=history.state?.mzEntrances?.[state.id];if(entrance&&savedEntrance&&Array.from(entrance.options).some(o=>o.value===savedEntrance)){entrance.value=savedEntrance;entrance.dispatchEvent(new Event('change',{bubbles:true}));}
 $('#detail').scrollTop=0;if(!keepScenarioFocus)$('#detail [data-action="close"]')?.focus({preventScroll:true});
}
function center(f){const rings=f.geometry.type==='Polygon'?f.geometry.coordinates:f.geometry.coordinates.flat();const pts=rings.flat();return [pts.reduce((a,p)=>a+p[0],0)/pts.length,pts.reduce((a,p)=>a+p[1],0)/pts.length]}
async function choose(id,push=true,fly=true,sourceAddress='',revisionRetry=0){
 const cardStarted=performance.now();
 detailSuppressed=false;
 focusedProject=null;
 preferredSourceAddress=sourceAddress;
 const detailRequest=beginDetailRequest(),quality=state.quality,requestedRevision=themeRevision;
 previousFocus=document.activeElement;$('#area').value='';state.id=id;state.rec='';if(push)write();
 let showedPreview=false,detailTimeout,timedOut=false,controller,revisionChanged=false;
 try{
  const detailKey=id+'|'+quality+'|'+activeTheme+'|'+floodScenario;
  const cached=detailCache.get(detailKey);
  if(!cached&&activeTheme!=='energy'){
   const building=visible.find(feature=>feature.properties.id===id)||(selected?.properties.id===id?selected:null);
   if(building){
    const palette=themePalette(building.properties);
    const data=palette?.theme_data;
    const canPreview=activeTheme==='flood'||
     (activeTheme==='renewal'&&!!data)||
     (activeTheme==='solar'&&Number.isFinite(data?.useful_m2)&&['estimate','known'].includes(data.state));
    if(canPreview){
     const preview={...building,properties:{...building.properties,...(palette||{theme_name:'flood',theme_value:'unknown',theme_data:{}})}};
     if(activeTheme!=='renewal')selected=preview;
     else if(selected?.properties.id!==id)selected=null;
     renderDetail(preview,true);showedPreview=true;openDetail();renderMap();renderList();
    }
   }
   if(!showedPreview){
    selected=null;
    $('#detail').innerHTML='<div class="detail-head"><span class="eyebrow">'+esc(themeConfig().title)+'</span><button data-action="close" aria-label="Zatvori detalj">×</button></div><h2 class="detail-name">'+esc(sourceAddress||'Detalji zgrade')+'</h2><p data-theme-detail-preview role="status">Učitavam podatke za odabranu zgradu…</p>';
    openDetail();
    renderMap();
    renderList();
   }
   controller=new AbortController();
   detailController=controller;
   detailTimeout=setTimeout(()=>{timedOut=true;controller.abort()},8000);
  }
  let f=cached;
  if(!f){
   const packet=await json('/api/spatial/building/'+encodeURIComponent(id)+'?quality='+quality+'&theme=energy&bundle=1',controller?.signal);
   if(packet.theme_cards){
    const base={...packet};delete base.theme_cards;
    for(const sc of ['mala','srednja','velika','overview'])detailCache.set(id+'|'+quality+'|energy|'+sc,base);
    for(const [key,properties] of Object.entries(packet.theme_cards)){
     const [theme,scenario='mala']=key.split(':');
     for(const sc of (theme==='flood'?[scenario]:['mala','srednja','velika','overview']))detailCache.set(id+'|'+quality+'|'+theme+'|'+sc,{...base,properties});
    }
    while(detailCache.size>288)detailCache.delete(detailCache.keys().next().value);
    f=detailCache.get(detailKey);
   }else f=packet;
  }
  if(state.id!==id||state.quality!==quality||detailRequest!==detailSequence)return;
  if(requestedRevision&&requestedRevision!==themeRevision){
   detailCache.delete(detailKey);
   if(revisionRetry<1)return choose(id,false,fly,sourceAddress,revisionRetry+1);
   revisionChanged=true;
   throw Error('Podaci su osvježeni tijekom učitavanja. Ponovno učitaj detalje.');
  }
  if(requestedRevision&&!detailCache.has(detailKey)){detailCache.set(detailKey,f);if(detailCache.size>288)detailCache.delete(detailCache.keys().next().value)}
  if(f.properties.id!==id){state.id=f.properties.id;write(true)}selected=f;byId.set(id,f);renderDetail(f);openDetail();renderMap();renderList();
  document.body.dataset.cardReadyMs=String(Math.round(performance.now()-cardStarted));
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(detailRequest===detailSequence)document.body.dataset.cardFrameMs=String(Math.round(performance.now()-cardStarted))}));
  if(fly)map.easeTo({center:center(f),zoom:Math.max(17,map.getZoom()),pitch:state.mode==='2d'?0:52,offset:selectedMapOffset(),duration:450});
 }catch(e){
  if(detailRequest!==detailSequence||state.id!==id)return;
  if(activeTheme==='energy'){toast(e.message);return}
  const pending=$('#detail [data-theme-detail-preview]');
  if(!pending){toast(e.message);return}
  pending.textContent=revisionChanged?e.message:timedOut?'Učitavanje detalja traje predugo. ':'Puni detalji trenutačno nisu dostupni. ';
  const retry=document.createElement('button');
  retry.type='button';
  retry.textContent='Ponovno učitaj detalje';
  retry.onclick=()=>choose(id,false,fly,sourceAddress);
  pending.append(retry);
 }finally{
  clearTimeout(detailTimeout);
  if(detailController===controller)detailController=undefined;
 }
}
function chooseRecord(r,push=true){
 previousFocus=document.activeElement;
 if(r.targets.length===1){choose(r.targets[0].id,push,true,r.address);return}
 beginDetailRequest();
 state.id='';state.rec=String(r.record);if(push)write();selected=null;
 $('#detail').innerHTML='<div class="detail-head"><span class="eyebrow">'+esc(qualityNames[r.status]||r.status)+'</span><button data-action="close" aria-label="Zatvori detalj">×</button></div><h2>'+esc(r.address)+'</h2><p>'+esc(r.city)+' · '+esc(useful(r.unit)||r.display_name||useful(r.name)||'Adresa na obrisu')+'</p><div class="status-box">'+(r.targets.length?'Pronađeno je više mogućih obrisa. Odaberi jedan za pregled tragova; nijedan nije proglašen potvrđenim.':r.status==='address_only'?'Pronađena je moguća adresa, ali nema pouzdanog pripadajućeg obrisa. Zapis nije postavljen na proizvoljno mjesto.':'Za ovaj zapis nije uspostavljen prostorni spoj u raspoloživim podatcima. To nije dokaz da objekt ili certifikat ne postoji.')+'</div><div class="class-pair"><div><small>Grijanje</small><b>'+esc(r.heating)+'</b></div><div><small>Primarna</small><b>'+esc(r.primary)+'</b></div></div>'+r.targets.map(t=>'<button class="target-button" data-id="'+t.id+'">'+esc(t.id)+' · '+esc(qualityNames[t.quality])+' ↗</button>').join('')+'<p>'+esc(r.certificate)+' · '+esc(r.issued)+'</p><a href="/certificate.html?id='+r.record+'" target="_blank">Otvori izvorni zapis ↗</a><button class="share" data-action="share">Kopiraj poveznicu ↗</button><input class="share-input" readonly aria-label="Poveznica zapisa" hidden>';
 openDetail();renderMap();
}
async function restoreRecord(id){
 if(id.startsWith('renewal-project:')){if(activeTheme==='renewal')openProjectMarkers([id.slice('renewal-project:'.length)],true,false);return}
 try{const r=await json('/api/certificate/'+id);const d=await json('/api/spatial/search?q='+encodeURIComponent(r.certificate));const result=d.records.find(v=>v.record===Number(id));if(result)chooseRecord(result,false)}catch(e){toast(e.message)}
}
function close(push=true,restoreFocus=true){focusedProject=null;beginDetailRequest();state.id='';state.rec='';selected=null;$('#detail').hidden=true;$('#map-shell').classList.remove('detail-open');document.body.classList.remove('has-detail','detail-expanded');document.body.style.overflow='';if(ready)map.resize();if(push)write();renderMap();renderList();if(innerWidth<=720&&state.q.trim())setView('list');rememberMapView();if(restoreFocus){if(previousFocus?.isConnected&&previousFocus.getClientRects().length)previousFocus.focus({preventScroll:true});else $('#search').focus({preventScroll:true})}}
const basemapDefinition={version:8,sources:{osm:{type:'raster',tiles:['zgrade-osm://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> suradnici · <a href="https://dgu.gov.hr/otvoreni-podaci-6596/6596">DGU</a> AD 25.10.2026 / BU 7.3.2024 · izvedeni spojevi'}},layers:[{id:'base',type:'raster',source:'osm',paint:{'raster-saturation':-.65,'raster-contrast':-.08,'raster-opacity':.72}}]};
async function init(){
 read();
 sync();write(true);$('#scale').innerHTML=classes.map(c=>'<span class="'+light(c)+'" style="--c:'+colors[c]+'">'+c+'</span>').join('')+'<span style="--c:'+colors.multi+'">≋</span>';
 window.energyLegend=$('.legend').innerHTML;
 if(activeTheme!=='energy')themeLegend();
 try{
  summaryReady=(window.mzBootstrap?Promise.resolve(window.mzBootstrap):json('/api/spatial/summary',AbortSignal.timeout(5000))).then(d=>{summary=d;themeRevision=d.theme_revision||('session-'+Date.now());$('#source-summary').textContent='Obrađeno '+fmt(summary.total_records)+' IEC zapisa. S obrisima povezano '+fmt(summary.total_records-(summary.outcomes.unresolved||0)-(summary.outcomes.address_only||0))+' zapisa ('+((summary.total_records-(summary.outcomes.unresolved||0)-(summary.outcomes.address_only||0))/summary.total_records*100).toFixed(1)+'%). Kandidati za '+fmt(summary.building_candidates)+' obrisa OSM/DGU. To nisu službeno potvrđeni obuhvati certifikata cijelih zgrada. Izvadak obuhvaća IEC certifikate izdane od 1. 10. 2017.; ne sadrži sve povijesne certifikate.'}).catch(()=>{themeRevision='session-'+Date.now();$('#source-summary').textContent='Sažetak nije dostupan; pokušaj ponovno.'});
  VectorRecovery.install();
  maplibregl.addProtocol('zgrade-osm',async(params,controller)=>{
   // Keep raster downloads behind building data, including after a pan.
   const started=performance.now();
   while(pendingMap||map?.isMoving()||(vectorMode&&map.getZoom()>=15&&!map.isSourceLoaded('buildings'))||performance.now()-lastMapMotion<200){
    if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    if(performance.now()-started>30000)break;
    await new Promise(resolve=>setTimeout(resolve,40));
   }
   const response=await fetch(params.url.replace('zgrade-osm://','https://'),{signal:controller.signal,priority:'low'});
   if(!response.ok)throw Error('Kartografska podloga nije dostupna.');
   return {data:await response.arrayBuffer(),cacheControl:response.headers.get('Cache-Control'),expires:response.headers.get('Expires')};
  });
  map=new maplibregl.Map({container:'map',style:{version:8,transition:{duration:0,delay:0},sources:{},layers:[]},center:areas[state.area],zoom:17,pitch:state.mode==='2d'?0:52,bearing:state.mode==='2d'?0:-22,minPitch:0,maxPitch:68,renderWorldCopies:false,attributionControl:{compact:false},pixelRatio:Math.min(window.devicePixelRatio||1,1.5),canvasContextAttributes:{antialias:false}});
  MapViewMode.setup();
  map.addControl(new maplibregl.NavigationControl({showCompass:true}),'top-right');
  map.on('error',e=>{
   if(e.sourceId==='osm')$('#tile-warning').hidden=false;
   if(e.sourceId==='buildings'&&vectorMode&&!recoveringVector&&e.error?.name!=='AbortError'){
    recoveringVector=true;
    try{VectorRecovery.fail(summary.vector_tiles.revision)}
    catch{const url=new URL(location.href);url.searchParams.set('legacy-map','1');location.replace(url)}
   }
  });
  map.once('load',async()=>{
   await summaryReady;
   const tileFallback=VectorRecovery.fallback(summary?.vector_tiles?.revision);
   vectorMode=!!summary?.vector_tiles&&!tileFallback&&!new URLSearchParams(location.search).has('legacy-map');patterns();
   if(vectorMode)map.addSource('buildings',{type:'vector',tiles:VectorRecovery.tiles(summary.vector_tiles),minzoom:15,maxzoom:16,bounds:summary.vector_tiles.bounds,promoteId:'volume_id'});
   else map.addSource('buildings',{type:'geojson',generateId:false,promoteId:'volume_id',maxzoom:16,tolerance:.1,data:{type:'FeatureCollection',features:[]}});
   map.addLayer({id:'volumes',type:'fill-extrusion',source:'buildings',...(vectorMode?{'source-layer':'buildings',minzoom:15}:{}),filter:['==',['get','render_parent'],true],paint:{'fill-extrusion-color':['coalesce',['feature-state','themeColor'],'#ffffff'],'fill-extrusion-pattern':['get','pattern'],'fill-extrusion-height':['get','height'],'fill-extrusion-base':['get','base_height'],'fill-extrusion-opacity':.94}});
   map.addLayer({id:'edges',type:'line',source:'buildings',...(vectorMode?{'source-layer':'buildings',minzoom:15}:{}),filter:['==',['get','part'],false],paint:{'line-color':['coalesce',['feature-state','outlineColor'],'#52695e'],'line-width':['coalesce',['feature-state','outlineWidth'],.6],'line-opacity':.65}});
   if(vectorMode)map.addSource('selected-building',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
   map.addLayer({id:'selection',type:'line',source:vectorMode?'selected-building':'buildings',filter:['==',['get','oid'],''],paint:{'line-color':'#ffbb25','line-width':4}});
   map.addSource('projects',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
   const projectColor=['match',['get','code'],...themeConfig('renewal').bands.flatMap(([code])=>[code,colors[code]]),colors.unverified];
   map.addLayer({id:'project-footprint-interior',type:'fill',source:'projects',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-opacity':0}});
   map.addLayer({id:'project-footprint',type:'line',source:'projects',filter:['==',['geometry-type'],'Polygon'],paint:{
    'line-color':projectColor,'line-width':4,'line-dasharray':[2,1]
   }});
   map.addLayer({id:'project-points',type:'circle',source:'projects',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':6,'circle-color':projectColor,'circle-stroke-color':'#173d36','circle-stroke-width':2}});
   ready=true;document.body.dataset.buildingDelivery=vectorMode?'vector':'fallback';if(tileFallback&&!vectorMode)VectorRecovery.watch(map,summary.vector_tiles);MapViewMode.apply(state.mode);if(vectorMode)VectorView.paint();if(!restoreMapView(initialMapView))home();if(state.q)search();
   const initialState=state,initialId=state.id,initialRecord=state.rec;
   if(state===initialState&&detailSequence===0){
    if(initialId&&state.id===initialId)choose(initialId,false,!initialMapView);
    else if(initialRecord&&state.rec===initialRecord)restoreRecord(initialRecord);
   }
  });
  map.on('sourcedata',e=>{if(vectorMode&&e.sourceId==='buildings')vectorNeedsRefresh=true});
  map.on('idle',()=>{if(vectorMode&&ready&&vectorNeedsRefresh&&map.getZoom()>=15){vectorNeedsRefresh=false;loadVectorMap()}});
  map.on('render',()=>{if(vectorMode&&ready){if(vectorNeedsRefresh&&map.getZoom()>=15&&!map.isMoving()&&map.isSourceLoaded('buildings')){vectorNeedsRefresh=false;loadVectorMap()}if(!document.body.dataset.mapFirstFrameMs&&map.queryRenderedFeatures({layers:['volumes']}).length)document.body.dataset.mapFirstFrameMs=String(Math.round(performance.now()));if(!$('#loading').hidden&&map.queryRenderedFeatures({layers:['volumes']}).length){$('#loading').hidden=true;$('#map-badge').textContent='Zgrade · odaberi zgradu.'}}});
  map.on('movestart',()=>{lastMapMotion=performance.now()});
  map.on('moveend',()=>{rememberMapView();lastMapMotion=performance.now();clearTimeout(moveTimer);moveTimer=setTimeout(()=>{loadMap();loadRenewalPoints()},130)});
  map.on('click',e=>{
   if(!ready)return;
   if(activeTheme==='renewal'){
    const projects=map.queryRenderedFeatures(e.point,{layers:['project-points','project-footprint','project-footprint-interior']});
    if(!projects.length){
     const {x,y}=e.point;
     projects.push(...map.queryRenderedFeatures([[x-3,y-3],[x+3,y+3]],{layers:['project-footprint']}));
    }
    if(projects.length){openProjectMarkers([...new Set(projects.map(f=>String(f.properties.sid)))]);return}
   }
   // Rendered roofs remain selectable while the next geometry upload is pending.
   const fs=map.queryRenderedFeatures(e.point,{layers:['volumes']});
   if(fs[0])choose(fs[0].properties.oid,true,false);
  });
  map.on('mousemove',e=>{if(ready)map.getCanvas().style.cursor=map.queryRenderedFeatures(e.point,{layers:['project-points','project-footprint','project-footprint-interior','volumes']}).length?'pointer':''});
 }catch(e){$('#loading').innerHTML='<div>Prikaz se nije učitao: '+esc(e.message)+'<p><button onclick="location.reload()">Pokušaj ponovno</button></p></div>'}
}
$('#area').onchange=e=>{close(false);state.area=e.target.value;state.q='';sync();write();home()};
$('#indicator').onchange=e=>{state.indicator=e.target.value;geometryDirty=true;write();renderMap();renderList()};
$('#quality').onchange=e=>{state.quality=e.target.value;updateFilterCount();write();loadMap();if(state.id)choose(state.id,false,false)};
$('#search').oninput=e=>{if(!$('#detail').hidden)close(false,false);state.q=e.target.value;if(innerWidth<=720&&!state.q.trim())setView('map');lastSearchInputAt=performance.now();write(true);searchController?.abort();searchSequence++;searchBusy=!!state.q.trim();searchResults=[];searchTotal=0;renderList();clearTimeout(typingTimer);typingTimer=setTimeout(search,120)};
$('#known-only').onchange=e=>{state.only=e.target.checked;updateFilterCount();write();loadMap()};
$('#home').onclick=resetView;$('#home-map').onclick=resetView;$('#more').onclick=()=>{limit+=30;renderList()};
$('#rotate-left').onclick=()=>map?.easeTo({bearing:map.getBearing()-30,duration:300});$('#rotate-right').onclick=()=>map?.easeTo({bearing:map.getBearing()+30,duration:300});$('#tilt').onclick=()=>map?.easeTo({pitch:map.getPitch()>45?30:60,duration:300});
$('#about-link').onclick=e=>{e.preventDefault();$('#about').showModal()};$('#close-about').onclick=()=>$('#about').close();
function resetView(){close(false);state.q='';sync();renderList();write();home();setView('map')}
function mapShareUrl(){const url=new URL(location.href),hash=new URLSearchParams(url.hash.slice(1));hash.delete('id');hash.delete('record');url.hash=hash.toString();return url.href}
document.addEventListener('change',e=>{
 if(e.target.id==='detail-entrance'){
  if(state.id)history.replaceState({...history.state,mzEntrances:{...history.state?.mzEntrances,[state.id]:e.target.value}},'',location.href);
  document.querySelectorAll('.cert-address[data-entrance]').forEach(section=>section.hidden=section.dataset.entrance!==e.target.value);
 }
});
document.addEventListener('click',async e=>{
 const id=e.target.closest('[data-id]')?.dataset.id;if(id){choose(id);return}
 const ri=e.target.closest('[data-record-index]')?.dataset.recordIndex;if(ri!==undefined){const record=searchResults[Number(ri)];if(record.project_id!==undefined)openProjectMarkers([record.project_id],true);else chooseRecord(record);return}
 const a=e.target.closest('[data-action]')?.dataset.action;if(a==='toggle-legend'){const legend=$('.legend'),expanded=legend.classList.toggle('legend-expanded'),button=legend.querySelector('.legend-toggle');button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',expanded?'Sakrij legendu karte':'Prikaži legendu karte');button.textContent=expanded?'Sakrij':'Legenda';if(expanded&&document.body.classList.contains('detail-expanded')){document.body.classList.remove('detail-expanded');const detailButton=$('#detail [data-action="expand-detail"]');detailButton.setAttribute('aria-expanded','false');detailButton.textContent='Proširi'}}
 if(a==='expand-detail'){const expanded=document.body.classList.toggle('detail-expanded'),button=$('#detail [data-action="expand-detail"]');button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'Smanji':'Proširi';if(expanded){$('.legend').classList.remove('legend-expanded');const legendButton=$('.legend-toggle');legendButton.setAttribute('aria-expanded','false');legendButton.setAttribute('aria-label','Prikaži legendu karte');legendButton.textContent='Legenda'}if(!expanded&&selected&&ready)map.easeTo({center:center(selected),offset:selectedMapOffset(),duration:250})}
 if(a==='close')close();if(a==='show-map'){detailSuppressed=true;beginDetailRequest();$('#detail').hidden=true;$('#map-shell').classList.remove('detail-open');document.body.classList.remove('has-detail','detail-expanded');document.body.style.overflow='';setView('map');map.resize();renderMap();}if(a==='reset'){state.q='';sync();write();search()}
 if(a==='research-anomaly'){researchAnomaly(e.target.closest('[data-action]'));return}
 if(a==='share'){try{await navigator.clipboard.writeText(mapShareUrl());toast('Poveznica je kopirana.')}catch{const i=$('.share-input');i.hidden=false;i.value=mapShareUrl();i.select();toast('Kopiraj označenu poveznicu.')}}
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&$('#filters').open){e.preventDefault();$('#filters').open=false;return}
 if(e.key==='Escape'&&!$('#detail').hidden&&!$('#about').open){e.preventDefault();close()}
 if(false&&e.key==='Tab'&&!$('#detail').hidden&&innerWidth<=720){const es=[...$('#detail').querySelectorAll('button,a,summary,input:not([hidden])')].filter(x=>x.getClientRects().length);if(e.shiftKey&&document.activeElement===es[0]){e.preventDefault();es.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===es.at(-1)){e.preventDefault();es[0].focus()}}
});
$('#retry-map').onclick=()=>{coverage=null;mapRetryAttempts=0;loadMap()};$('#example-search').onclick=()=>{state.q='Vankina 2';sync();write();search();if(innerWidth<=720)setView('list')};
$('#view-map').onclick=()=>setView('map');$('#view-list').onclick=()=>setView('list');
document.addEventListener('click',e=>{if($('#filters').open&&!e.target.closest('#filters'))$('#filters').open=false});
window.addEventListener('popstate',()=>{
 const savedView=history.state?.mzView;
 close(false);read();sync();MapViewMode.apply(state.mode);themeLegend();
 themeSequence++;clearTimeout(colorTimer);colorController?.abort();
 const seeded=applyThemeSeed();renderMap();renderList();
 if(!restoreMapView(savedView))home();loadRenewalPoints();
 if(activeTheme!=='energy'&&!seeded)loadThemeColors();
 if(state.q)search();
 if(state.id)choose(state.id,false,false);
 else if(state.rec)restoreRecord(state.rec);
});
setupThemes();
init();

function themeConfig(theme=activeTheme){return {
 energy:{caption:'Razredi iz pridruženih certifikata · obuhvat cijele zgrade nije potvrđen'},
 solar:{caption:'Solarna površina · gradski podaci + označene procjene za sve zgrade',title:'Površina za panele · m²',bands:[['s0','0'],['s1','>0–<25'],['s2','25–<100'],['s3','100–<500'],['s4','≥500']],note:'Ljubičasta šrafura i rub znače procjenu. Kad nema pouzdanog gradskog spoja, koristi se djelomično preklapanje ili 25% tlocrta (40% za poznatu nestambenu namjenu); nepoznata namjena pretpostavlja 25%. To ne potvrđuje osunčanost, nagib, statiku ili postojeće panele. Veća površina nije bolja osunčanost po m².'},
 renewal:{caption:'Obnova · gradski, državni i EU izvori',title:'Status obnove',bands:[['done','Završeni radovi'],['progress','Radovi u tijeku'],['mixed','Više faza ili neslaganje'],['partial','Ograničeni zahvat'],['finance','Financiranje'],['recorded','Postupak'],['removed','Uklanjanje'],['planned','Planirani radovi'],['not_renewed','Bez energetske obnove · evidencija'],['unverified','Status nije provjeren']],note:'Zeleno označava potvrđen završetak radova u opsegu iz izvora. Tirkizno označava pojedinačni ili ograničeni zahvat. Vrsta obnove i izvor navedeni su uz zgradu. Potresna obnova nije nužno energetska. Plavo označava financiranje bez potvrde završetka; ljubičasto više faza ili neslaganje izvora. Žutosmeđe označava planirane radove. Crveno označava gradski zapis bez provedene energetske obnove, uz zasebne potvrde drugih ili kasnijih zahvata. Svijetlo znači neprovjeren status. Približi kartu za više projektnih točaka i zasebne projektne tlocrte. Izostanak iz registra nije dokaz da zgrada nije obnovljena.'},
 flood:floodScenario==='overview'?{caption:'Boja pokazuje u kojem scenariju je prikazano plavljenje · klikni zgradu za sva tri',title:'Poplavna izloženost · sažetak scenarija',bands:[['h3','Plavljenje u češćem scenariju'],['h2','Plavljenje u stogodišnjem scenariju'],['h1','Plavljenje u rijetkom / ekstremnom scenariju'],['clear','Bez prikaza u sva tri scenarija'],['incomplete','Nepotpuna usporedba'],['edge','Rubni dodir'],['water','Stalne vode'],['unmapped','Nedostupan podatak']],note:'Sažetak povezuje postojeće karte Hrvatskih voda. Boja označava najčešći scenarij u kojem je na obrisu prikazana klasa dubine. Klik na zgradu pokazuje sva tri rezultata. Rijetki scenarij uključuje i moguće rušenje nasipa ili visokih brana. Prikaz se odnosi na riječnu poplavnu opasnost; oborinska odvodnja je zasebna tema.'}:{caption:'Boja = modelirana dubina vode · '+({mala:'rijetka / ekstremna poplava',srednja:'stogodišnja poplava',velika:'češće poplave'}[floodScenario])+' · Poplavni scenarij · svaki obris ima prikazano stanje',title:'Stanje u poplavnom scenariju',bands:[['clear','Plavljenje nije prikazano'],['f1','Dubina <0,5 m'],['f2','Dubina 0,5–1,5 m'],['f3','Dubina 1,5–2,5 m'],['f4','Dubina >2,5 m'],['edge','Rubni dodir'],['water','Stalne vode'],['unmapped','Izvan obrađenog rastera']],note:'Svijetlo: u ovom scenariju na karti nije prikazano plavljenje; nije dokaz odsutnosti rizika. Rub znači mali dodir obrisa s područjem. Izvan obrađenog rastera dubina nije dostupna. Karte 1:25.000 ne procjenjuju štetu pojedine zgrade ni oborinsku odvodnju. Rijetki scenarij može uključivati rušenje nasipa.'}
}[theme]}
function themeLegend(){
 const c=themeConfig();$('#theme-caption').textContent=c.caption;
 $('#scenario').value=floodScenario;$('#scenario-control').hidden=activeTheme!=='flood';$('#projects-button').hidden=activeTheme!=='renewal';
 $('#filters').hidden=activeTheme!=='energy';if($('.scope-note'))$('.scope-note').hidden=activeTheme!=='energy';
 document.querySelectorAll('button[data-theme]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.theme===activeTheme));
 document.body.dataset.theme=activeTheme;$('#map-shell').setAttribute('aria-label',(state.mode==='2d'?'2D':'3D')+' karta Zagreba · '+({energy:'energetski razred',solar:'solarni potencijal',renewal:'obnova',flood:'poplave'}[activeTheme]));
 if(activeTheme==='energy'){$('.legend').innerHTML=window.energyLegend;addLegendControl();return}
 $('.legend').innerHTML='<strong>'+c.title+'</strong><div class="theme-scale">'+c.bands.map(([key,label])=>'<span><i style="background:'+colors[key]+'"></i>'+esc(label)+'</span>').join('')+(activeTheme==='solar'?'<span class="estimate-key"><i></i>Šrafura: procjena</span>':'')+'</div>'+(activeTheme==='renewal'?'<div class="renewal-point-key"><i aria-hidden="true"></i><span>Krug: lokacija projekta</span></div><div class="renewal-point-key renewal-footprint-key"><i aria-hidden="true"></i><span>Isprekidani rub: potvrđeni projektni tlocrt</span></div>':'')+(activeTheme==='flood'?'<small class="map-scale-note">Hrvatske vode · poplavna opasnost · 1:25.000</small>':'')+'<details><summary>Kako čitati kartu</summary><p>'+c.note+'</p></details>';
 addLegendControl();
}
async function changeTheme(theme){
 if(activeTheme===theme)return;
 const pendingSelection=!!state.id&&!selected;
 if(state.rec.startsWith('renewal-project:'))close(false);
 activeTheme=theme;write();themeSequence++;clearTimeout(colorTimer);colorController?.abort();$('#theme-source-error').hidden=true;themeLegend();
 if(!state.id&&!$('#detail').hidden)close(false);
 const seedReady=applyThemeSeed();renderMap();renderList();loadRenewalPoints();
 if(state.q.trim())search();
 if(state.only){coverage=null;loadMap()}else if(activeTheme!=='energy'){if(!seedReady)loadThemeColors()}else $('#map-badge').textContent='Zgrade · odaberi zgradu.';
 if(state.id)choose(state.id,false,pendingSelection,preferredSourceAddress);
}
async function loadThemeColors(retry=false){
 if(!ready||activeTheme==='energy')return;
 if(vectorMode){VectorView.paint();return}
 clearTimeout(colorTimer);colorController?.abort();colorController=new AbortController();
 const controller=colorController;let timedOut=false,waitTimer;
 const theme=activeTheme,scenario=floodScenario,seq=++colorSequence,ids=visible.map(f=>f.properties.id);
 if(!ids.length){$('#map-badge').textContent='Približi kartu za obojene zgrade.';return}
 const key=theme+'|'+scenario+'|'+ids.join(',');
 let d=colorCache.get(key);
 try{
  if(!d||retry){
   $('#map-badge').textContent='Učitavam boje zgrada…';
   waitTimer=setTimeout(()=>{timedOut=true;controller.abort()},6000);
   const response=await fetch('/api/themes/values',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,theme,scenario,retry}),signal:controller.signal});
   d=await response.json();if(!response.ok)throw Error(d.error||'Boje nisu dostupne.');
  }
  if(seq!==colorSequence||theme!==activeTheme||scenario!==floodScenario)return;
  let failures=0;
  for(const f of visible){const value=d.values[f.properties.id];if(value)Object.assign(f.properties,value);if(value?.theme_data.state==='error')failures++}
  if(!d.pending&&!failures){colorCache.set(key,d);if(colorCache.size>16)colorCache.delete(colorCache.keys().next().value)}
  renderMap();renderList();
  $('#theme-source-error').hidden=!failures;
  $('#map-badge').textContent=d.pending?'Pripremam solarne podatke za '+fmt(d.pending)+' zgrada…':failures?'Solarni izvor nije dostupan za dio zgrada.':'Zgrade · odaberi zgradu.';
  window.lastColorLoad={theme,scenario,pending:d.pending||0,failures,at:performance.now()};
  if(selected?.properties.theme_data?.state==='pending'&&d.values[selected.properties.id]?.theme_data.state!=='pending'){
   detailCache.delete(state.id+'|'+state.quality+'|'+activeTheme+'|'+floodScenario);choose(state.id,false,false);
  }
  if(d.pending)colorTimer=setTimeout(()=>{if(activeTheme===theme&&floodScenario===scenario)loadThemeColors()},1000);
 }catch(e){
  if(e.name==='AbortError'&&!timedOut)return;
  if(seq!==colorSequence)return;
  $('#map-badge').textContent='Boje se nisu učitale. Pokušaj ponovno.';
  $('#theme-source-error').hidden=false;
 }finally{clearTimeout(waitTimer)}
}
function sourceDisclosure(d){
 const supplements=(d.sources||[]).filter((r,i,a)=>r.url&&r.url!==d.source_url&&a.findIndex(x=>x.url===r.url)===i);
 const extraLinks=supplements.length?'<p>Dopunski izvori:</p><ul>'+supplements.map(r=>'<li><a href="'+esc(r.url)+'" target="_blank" rel="noreferrer">'+esc(r.label||'Dopunska službena provjera')+' ↗</a></li>').join('')+'</ul>':'';
 return '<details class="detail-section"><summary>Izvor, datum i metoda</summary>'+(d.source_url?'<p><a href="'+esc(d.source_url)+'" target="_blank" rel="noreferrer">Službena objava izdavača ↗</a></p>':'')+extraLinks+'<p>'+(d.source?.startsWith('http')?'<a href="'+esc(d.source)+'" target="_blank" rel="noreferrer">Grad Zagreb · izvorni solarni sloj ↗</a>':esc(d.source||'Grad Zagreb / Hrvatske vode'))+'</p><p>'+esc(d.source_period||d.snapshot||'Preuzeto 4. 11. 2026.; datum projekta pogledaj niže')+'</p><p>'+esc(d.method||'Podaci i izvorne oznake u tehničkom tragu.')+'</p><details><summary>Izvorni ID i prostorni trag</summary><pre class="source-trace">'+esc(JSON.stringify(d,null,2))+'</pre></details></details>';
}
function projectCode(r){return r.status_code||({'ENERGETSKA OBNOVA ZAVRŠENA':'done','ENERGETSKA OBNOVA U TIJEKU':'progress','NIJE OBNOVLJENO':'not_renewed'}[r.attributes.status])||'recorded'}
function renewalStatusSummary(data){
 const superseded=new Set((data.projects||[]).map(project=>project.supersedes).filter(Boolean));
 const statuses=new Set(data.statuses||(data.projects||[])
  .filter(project=>!superseded.has(project.source_id))
  .map(project=>project.outline_status_code||projectCode(project)));
 const bands=themeConfig('renewal').bands.filter(([code])=>statuses.has(code));
 if(bands.length<2)return '';
 return '<ul class="renewal-status-summary" aria-label="Statusi zasebnih zahvata">'+bands.map(([code,label])=>
  '<li data-renewal-stage="'+esc(code)+'"><i style="background:'+colors[code]+'" aria-hidden="true"></i>'+esc(label)+'</li>'
 ).join('')+'</ul>';
}
function orderProjectEvidence(rows,currentCode){
 const date=r=>{const d=r.source_fields||{},m=String(d.publication_date||d.status_date||d.completion_date||d.source_snapshot||'').match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})/);return m?Number(m[3]+m[2].padStart(2,'0')+m[1].padStart(2,'0')):Number(d.project_completed_year||0)*10000};
 const priority=r=>r.source_disagreement?0:projectCode(r)===currentCode?0:currentCode==='mixed'&&['done','progress','mixed'].includes(projectCode(r))?1:2;
 return [...rows].sort((a,b)=>priority(a)-priority(b)||date(b)-date(a));
}
function projectEvidenceDate(r){
 const d=r.source_fields||{},dates=[];
 if(d.source_snapshot)dates.push('Presjek projektnog popisa: '+d.source_snapshot);
 if(d.status_date)dates.push('Stanje u izvornom presjeku: '+d.status_date);
 if(d.stage_completion_date)dates.push('Završetak faze ('+(d.completed_stage||'navedeni opseg')+') prema izvoru: '+d.stage_completion_date);
 if(d.work_start_date)dates.push('Početak cjelovite i energetske faze: '+d.work_start_date);
 if(d.completion_date)dates.push('Završetak radova prema izvoru: '+d.completion_date);
 if(d.handover)dates.push('FSB preuzeo zgradu od izvođača '+d.handover);
 if(d.project_completed_year)dates.push('Godina završetka projekta: '+d.project_completed_year);
 if(d.publication_date)dates.push('Potvrda objavljena '+d.publication_date);
 const workYear=d.reference_year?'<p class="project-date project-work-year"><strong>Godina zahvata u referenci: '+esc(d.reference_year)+'</strong></p>':'';
 return workYear+dates.map(text=>'<p class="project-date">'+esc(text)+'</p>').join('');
}
function projectStages(r){
 const rows=r.evidence_rows||Object.entries(r.source_fields||{}).filter(([k])=>['status_o','status_s','status_nekon','vrsta_obnove'].includes(k)).map(([k,v])=>({label:({status_o:'Organizirana obnova',status_s:'Samoobnova',status_nekon:'Nekonstrukcijska obnova',vrsta_obnove:'Vrsta u registru'})[k],value:v==='-'?'Nema oznake':v}));
 return rows.length?'<dl class="source-stages">'+rows.map(row=>'<dt>'+esc(row.label)+'</dt><dd>'+esc(row.value)+'</dd>').join('')+'</dl>':'';
}
function projectStageHistory(r){
 const history=r.source_fields?.stage_history;
 if(!history?.length)return '';
 return '<details class="detail-section"><summary>Datirane faze zahvata</summary><ul>'+history.map(stage=>
  '<li><b>'+esc(stage.date)+'</b> · '+esc(stage.stage)+
  (stage.source_url?' <a href="'+esc(stage.source_url)+'" target="_blank" rel="noreferrer">Izvor ↗</a>':'')+'</li>'
 ).join('')+'</ul></details>';
}
function projectLocation(r){
 const evidence=r.source_fields?.identity_evidence;
 const discrepancy=r.source_fields?.location_discrepancy;
 let heading,description;
 if(r.project_footprint&&r.oid&&r.link_version==='reviewed-cadastral-city-topography-1'){
  heading='Potvrđeni katastarski obris zgrade.';
  description='Obris je povezan s adresom i potvrđen gradskim topografskim podacima.';
 }else if(r.project_footprint){
  heading=r.project_footprint_kind==='topographic'?'Potvrđeni topografski tlocrt zahvata.':'Potvrđeni katastarski tlocrt zahvata.';
  description=discrepancy?.marker==='address'
   ? 'Tlocrt je prikazan na potvrđenoj adresi. Izvorna točka registra udaljena je '+fmt(discrepancy.distance_m)+' m.'
   : 'Prikazuje se kao zaseban projektni tlocrt u sloju Obnova.';
 }else if(!r.oid&&!r.point&&r.renewal_kind?.startsWith('Blokovska ')){
  heading='Zapis na razini bloka.';
  description='Navedene ulice opisuju područje. Pojedinačni obrisi nisu potvrđeni.';
 }else if(r.oid){
  if(!discrepancy)return '';
  heading='Obris povezan prema potvrđenoj adresi.';
  description='Izvorna točka registra udaljena je '+fmt(discrepancy.distance_m)+' m.';
 }else{
  heading='Obris zgrade nije potvrđen.';
  if(!r.point)description='Izvor nema pouzdanu točku ove zgrade.';
  else if(discrepancy){
   description=discrepancy.marker==='address'
    ? 'Prikazana je potvrđena adresna točka. Izvorna točka registra udaljena je '+fmt(discrepancy.distance_m)+' m.'
    : 'Prikazana je izvorna točka registra. Gradska adresna točka udaljena je '+fmt(discrepancy.distance_m)+' m.';
  }else if(evidence?.verified_registry_address_points){
   const proof=evidence.verified_registry_address_points,anchor=proof.addresses[proof.anchor_index];
   description=(proof.addresses.length>1?'Projekt navodi više adresa; oznaka je na adresi ':'Oznaka je na službenoj adresi ')+anchor.matched_address+'. Obuhvat zgrada nije potvrđen.';
  }else if(evidence?.verified_project_address)description='Točka označava zajedničku adresu kompleksa.';
  else if(r.point_method?.startsWith('Reprezentativna točka potvrđene čestice'))description='Točka potvrđene čestice označava lokaciju kompleksa.';
  else if(evidence?.verified_site?.reviewed_aerial_point)description='Točka označava položaj zgrade prema zračnoj snimci.';
  else if(evidence?.reviewed_connector_point)description='Točka označava spojni most između krila.';
  else description='Točka prikazuje lokaciju iz registra.';
 }
 return '<p class="status-box"><b>'+esc(heading)+'</b> '+esc(description)+'</p>';
}
function independentReview(r){
 const v=r.independent_review;
 if(!v)return '';
 return '<section class="status-box independent-review" aria-label="Provjera izvora"><b>'+esc(v.title)+'</b><p>'+esc(v.explanation)+'</p><small>Izvori ponovno provjereni '+esc(v.reviewed_on)+'</small><p>'+v.sources.map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.label)+' ↗</a>').join(' · ')+'</p></section>';
}
function projectEvidenceContent(r,hideHeading=false,headingAlreadyShown=false){
 const a=r.attributes,code=projectCode(r),done=code==='done';
 const value=v=>v===null||v===undefined||v===''?'—':esc(v);
 const status=r.status_label||a.status||'Status prema izvoru';
 const scopeNote=r.source_fields?.completed_project_record
  ? 'Ovaj zapis potvrđuje financiranje. Potvrda dovršetka dostupna je u zasebnom izvoru.'
  : ({
     done:'Izvor potvrđuje dovršetak navedenog zahvata. Podaci o izmjerenoj potrošnji navode se zasebno kad su dostupni.',
     progress:'Izvor navodi radove u tijeku.',
     partial:'Izvor potvrđuje radove u navedenom opsegu.',
     finance:'Izvor potvrđuje financiranje. Dovršetak radova nije potvrđen ovim zapisom.',
     recorded:'Izvor evidentira postupak. Faza izvedbe nije potvrđena ovim zapisom.',
     mixed:'Za ovaj zapis evidentirano je više faza ili različite potvrde izvora.',
     removed:'Izvor evidentira uklanjanje ili postupak uklanjanja.',
     planned:'Izvor navodi planiranu obnovu. Početak radova nije potvrđen.',
     not_renewed:'Gradska evidencija navodi da energetska obnova nije provedena. To nije potvrda da nije bilo drugih radova. Kasnije potvrde prikazane su zasebno.'
    })[code]||'Status zahvata nije potvrđen.';
 const classesPresent=a.energetski_razred_pr||a.energetski_razred_nr;
 const targets=r.building_targets?.length>1
  ? '<div class="status-box"><b>Obrisi obuhvaćeni projektom</b><ul>'+r.building_targets.map(target=>{
     const addresses=esc(target.addresses.join(' · '));
     return '<li>'+(target.oid===state.id?'<strong aria-current="true">'+addresses+'</strong>':'<button type="button" data-id="'+esc(target.oid)+'">'+addresses+'</button>')+'</li>';
    }).join('')+'</ul></div>' : '';
 return '<div class="project-evidence-content">'+projectLocation(r)+independentReview(r)+(r.method?.includes('candidate')?'<div class="status-box">Moguća prostorna veza: projektna točka udaljena '+esc(r.distance_m)+' m od obrisa. Identitet zgrade nije potvrđen.</div>':'')+(headingAlreadyShown||hideHeading&&!r.systematic?'':'<h3>'+esc(a.naziv||a.vrsta||'Projekt')+'</h3><p>'+esc(a.adresa)+'</p>')+(r.source_disagreement?'<div class="source-disagreement status-box" role="note"><b>Različite potvrde izvora</b><p>'+esc(r.source_disagreement.explanation)+'</p><a href="'+esc(r.source_disagreement.source_url)+'" target="_blank" rel="noreferrer">Usporedi objavu Ministarstva ↗</a></div>':'')+'<p class="eyebrow">'+esc(r.renewal_kind||a.vrsta||'Vrsta zahvata nije navedena')+'</p>'+projectEvidenceDate(r)+targets+(r.access_evidence?.length?'<section class="status-box access-evidence" aria-label="Uporaba prostora i posjet"><b>Uporaba prostora i posjet</b>'+r.access_evidence.map(e=>'<p><strong>'+esc(e.label)+'</strong> · '+esc(e.event_date||'Provjereno '+e.checked_on)+'<br>'+esc(e.note)+' <a href="'+esc(e.url)+'" target="_blank" rel="noreferrer">Izvor ↗</a></p>').join('')+'</section>':'')+'<p class="project-status '+code+'" data-status="'+esc(a.status)+'">'+esc(status)+'</p>'+(a.datum_otvaranja?'<p><b>Ponovno otvoreno:</b> '+esc(a.datum_otvaranja)+'</p>':'')+(classesPresent?'<div class="class-pair"><div><small>Razred prije · izvor</small><b>'+value(a.energetski_razred_pr)+'</b></div><div><small>'+(done?'Razred nakon · izvor':'Ciljani razred · plan')+'</small><b>'+value(a.energetski_razred_nr)+'</b></div></div>':'<p>Razred prije i poslije nije objavljen u ovom izvoru.</p>')+'<p>'+esc(scopeNote)+'</p>'+projectStages(r)+(r.source_stage_note?'<p>'+esc(r.source_stage_note)+'</p>':'')+(r.followup_note?'<p class="status-box">'+(r.source_fields?.handover?'<b>Nakon primopredaje</b><br>':'')+esc(r.followup_note)+'</p>':'')+projectStageHistory(r)+'<details><summary>Pokazatelji i projekt</summary>'+(a.potrebna_energija_pr!=null||a.potrebna_energija_nr!=null?'<p>Potrebna energija prije: '+value(a.potrebna_energija_pr)+' '+esc(a.jedinica_pr||'jedinica nije navedena')+'.</p><p>Potrebna energija '+(done?'nakon':'planirana')+': '+value(a.potrebna_energija_nr)+' '+esc(a.jedinica_nr||'jedinica nije navedena')+'.</p>':'<p>Usporedivi pokazatelji potrošnje nisu objavljeni u ovom izvoru.</p>')+(a.dokumentacija_godina?'<p>Godina dokumentacije: '+value(a.dokumentacija_godina)+'. Nije nužno godina završetka.</p>':'')+'<p>'+esc(a.dokumentacija||'')+'</p><p>'+esc(a.rekonstrukcija||'')+'</p></details>'+sourceDisclosure(r)+'</div>';
}
function projectContent(r,hideHeading=false,headingAlreadyShown=false){return BuildingCards.project(r,hideHeading,headingAlreadyShown)}
function floodSummary(d){
 if(d.category==='overview')return floodOverviewSummary(d);

 const labels={1:'manje od 0,5 m',2:'0,5–1,5 m',3:'1,5–2,5 m',4:'više od 2,5 m'};
 const descriptions={
  depth:['Modelirana dubina '+labels[d.depth],'Prikazana je najdublja klasa koja pokriva barem 10 % obrisa.'],
  edge:['Rubni dodir poplavnog područja','Preklapanje je premalo za pouzdanu dodjelu dubine.'],
  water:['Stalne vode u podlozi','Izvor prikazuje stalnu vodenu površinu na obrisu. Dubina za ovaj scenarij nije dodijeljena.'],
  no_value:['U scenariju nije prikazano plavljenje','Karta ne prikazuje plavljenje ovog obrisa u odabranom scenariju. Oborinske poplave i odvodnja nisu obuhvaćene.'],
  outside:['Izvan obrađenog rastera','Za ovaj obris i scenarij nema podatka o dubini.']
 };
 const [title,description]=descriptions[d.category]||['Podatak nije dostupan','Stanje obrisa za ovaj scenarij nije potvrđeno.'];
 const scenarioNote=floodScenario==='mala'
  ? '<p class="scenario-note">Scenarij male vjerojatnosti uključuje i moguće rušenje nasipa ili visokih brana. <a href="https://www.voda.hr/hr/geoportal" target="_blank" rel="noreferrer">Hrvatske vode ↗</a></p>'
  : '';
 return '<p class="scenario-name">'+esc($('#scenario option:checked').textContent)+'</p><p class="theme-result">'+title+'</p><p>'+description+'</p>'+scenarioNote+(d.edge?'<div class="status-box">Rubni ili miješani slučaj · granica prelazi preko obrisa. Lokacija traži dodatnu provjeru.</div>':'');
}
function solarEvidence(d){
 if(!Number.isFinite(d.useful_m2)||d.useful_m2<0)return '';
 if(d.state==='known'&&d.evidence_kind==='city_model')return 'city_model';
 if(d.state==='estimate'&&['overlap_estimate','footprint_estimate'].includes(d.evidence_kind))return d.evidence_kind;
 return '';
}
function solarResult(d){
 const kind=solarEvidence(d);
 if(!kind)return '<p class="theme-result">Solarni podatak nije dostupan</p>';
 const estimated=kind!=='city_model';
 const evidence=estimated?'PROCJENA · '+(d.evidence_kind==='overlap_estimate'?'preklapanje modela':'iz tlocrta'):'GRADSKI MODEL KROVA';
 const amount=estimated?'≈ '+fmt(d.useful_m2<1?d.useful_m2:Math.round(d.useful_m2)):fmt(d.useful_m2);
 const unit=estimated?'m² orijentacijske površine za panele':'m² prikladnog krova';
 return '<p class="evidence-pill'+(estimated?'':' source-pill')+'">'+evidence+'</p><p class="theme-result">'+amount+' <small>'+unit+'</small></p>';
}
function renewalDetailHeading(p,d){
 const heading={name:detailName(p),address:p.address||'',sourceLabel:''};
 const projects=(d.projects||[]).filter(r=>r.systematic&&!r.method?.includes('candidate')&&(r.oid===p.id||r.building_targets?.some(target=>target.oid===p.id)));
 if(!projects.length)return heading;
 const names=[...new Set(projects.map(r=>useful(r.attributes?.naziv)).filter(Boolean))];
 const addresses=[...new Set(projects.flatMap(r=>{
  const target=r.building_targets?.find(target=>target.oid===p.id);
  return target?target.addresses||[]:r.oid===p.id?[r.attributes?.adresa]:[];
 }).map(useful).filter(Boolean))];
 const unnamed=/^(?:zgrada|zgrada bez (?:upisanog )?naziva)$/i.test(heading.name)||!!p.address&&norm(heading.name)===norm(p.address);
 const named=unnamed&&names.length===1,addressed=!heading.address&&addresses.length===1;
 if(named)heading.name=names[0];
 if(addressed)heading.address=addresses[0];
 if(named||addressed)heading.sourceLabel=named&&addressed?'Naziv projekta i adresa iz zapisa obnove':named?'Naziv projekta iz zapisa obnove':'Adresa iz zapisa obnove';
 return heading;
}
function renderDetail(f,preview=false){BuildingCards.render(f,preview)}
function showMarkerProject(project,push=true){
 if(project.oid){choose(project.oid,push,false);return}
 close(false);
 focusedProject=project;
 state.rec='renewal-project:'+project.source_id;
 if(push)write();
 BuildingCards.standalone(project);
 openDetail();
 renderMap();
}
async function openProjectMarkers(ids,locate=false,push=true){
 const sequence=beginDetailRequest();
 if(ids.length===1){
  const id=String(ids[0]),controller=new AbortController();
  detailController=controller;
  detailSuppressed=false;
  previousFocus=document.activeElement;
  focusedProject=null;selected=null;state.id='';state.rec='renewal-project:'+id;
  if(push)write();
  const known=(window.projectsData||[]).find(project=>String(project.source_id)===id);
  const seed=[...renewalPoints,...renewalFootprints].find(feature=>String(feature.properties.sid)===id);
  const title=seed?.properties.name||known?.attributes?.naziv||'Zapis obnove';
  const head='<div class="detail-head"><span class="eyebrow">Evidencija obnove</span><button data-action="close" aria-label="Zatvori detalj">×</button></div><h2 class="detail-name">'+esc(title)+'</h2>';
  $('#detail').innerHTML=head+'<p data-project-loading role="status">Učitavam zapis obnove…</p>';
  openDetail();renderMap();renderList();
  let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;controller.abort()},8000);
  try{
   const project=await json('/api/themes/project/'+encodeURIComponent(id),controller.signal);
   if(activeTheme==='renewal'&&sequence===detailSequence){showMarkerProject(project,push);if(locate&&project.point)map.easeTo({center:project.point,zoom:17,pitch:52})}
  }catch{
   if(activeTheme!=='renewal'||sequence!==detailSequence)return;
   $('#detail').innerHTML=head+'<p role="status">'+(timedOut?'Učitavanje zapisa traje predugo. Pokušaj ponovno.':'Zapis obnove trenutačno nije dostupan.')+'</p><button data-retry-project>Ponovno učitaj zapis</button>';
   $('#detail [data-retry-project]').onclick=e=>{
    e.currentTarget.disabled=true;
    openProjectMarkers(ids,locate,false);
   };
   openDetail();
  }finally{
   clearTimeout(timeout);
   if(detailController===controller)detailController=undefined;
  }
  return;
 }
 const dialog=$('#theme-dialog'),body=$('#theme-dialog-body');
 $('#theme-dialog-title').textContent='Projekti pod oznakom na karti';
 const list=document.createElement('div');
 list.textContent='Učitavam zapise…';
 body.replaceChildren(list);
 dialog.showModal();
 const requests=new Set();
 let pending=0,loaded=0,failed=0;
 const current=()=>dialog.open&&list.isConnected&&sequence===detailSequence;
 const status=document.createElement('p');
 status.setAttribute('role','status');
 list.replaceChildren(status);
 const updateStatus=()=>{
  if(!current())return;
  status.textContent=(loaded?'Odaberi zapis za prikaz statusa i izvora. ':'')+
   (pending?'Učitavam još '+pending+' '+(pending===1?'zapis.':'zapisa.'):'')+
   (failed?' Neuspjele zapise možeš ponovno učitati pojedinačno.':'');
 };
 dialog.addEventListener('close',()=>{for(const controller of requests)controller.abort()},{once:true});
 const seeds=new Map([...renewalPoints,...renewalFootprints].map(feature=>[String(feature.properties.sid),feature.properties]));
 const load=async(id,button,title,retry=false)=>{
  if(!current())return;
  if(retry)failed--;
  pending++;
  button.disabled=true;
  button.removeAttribute('data-retry-project-marker');
  button.innerHTML='<b>'+esc(title)+'</b><small>Učitavam podatke…</small>';
  updateStatus();
  const controller=new AbortController();
  requests.add(controller);
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
   const project=await json('/api/themes/project/'+encodeURIComponent(id),controller.signal);
   if(!current())return;
   loaded++;
   button.disabled=false;
   button.style.borderLeft='4px solid '+colors[projectCode(project)];
   button.innerHTML='<b>'+esc(project.attributes.naziv)+'</b><span>'+esc(project.attributes.adresa)+'</span><small>'+esc(project.status_label)+'</small>';
   button.onclick=()=>{dialog.close();showMarkerProject(project)};
  }catch{
   if(!current())return;
   failed++;
   button.disabled=false;
   button.dataset.retryProjectMarker=id;
   button.innerHTML='<b>'+esc(title)+'</b><small>Zapis trenutačno nije dostupan. Pokušaj ponovno.</small>';
   button.onclick=()=>load(id,button,title,true);
  }finally{
   clearTimeout(timeout);
   requests.delete(controller);
   pending--;
   updateStatus();
  }
 };
 for(const id of ids){
  const button=document.createElement('button');
  button.type='button';
  button.className='project-row';
  button.dataset.projectMarker=id;
  const known=(window.projectsData||[]).find(project=>String(project.source_id)===id);
  const title=seeds.get(id)?.name||known?.attributes?.naziv||'Projekt na ovoj lokaciji';
  list.append(button);
  load(id,button,title);
 }
}
let projectLimit=60,projectsRevision='';
const projectLocationLabels={outline:'Povezan 3D obris',footprint:'Zaseban tlocrt',point:'Oznaka na karti',unlocated:'Bez položaja na karti'};

function renderProjects(reset=true){
 if(reset)projectLimit=60;
 const q=norm($('#project-search')?.value),code=$('#project-stage')?.value,kind=$('#project-kind')?.value,source=$('#project-source')?.value,location=$('#project-location')?.value;
 const rows=(window.projectsData||[]).map((r,i)=>({r,i})).filter(({r})=>(!q||norm([r.attributes.naziv,r.attributes.adresa,r.source_family].join(' ')).includes(q))&&(!code||projectCode(r)===code)&&(!kind||r.renewal_kind===kind)&&(!source||(r.source_family||'Grad Zagreb')===source)&&(!location||r.location_kind===location));
 const counts={outline:0,footprint:0,point:0,unlocated:0};
 for(const {r} of rows)counts[r.location_kind]++;
 $('#project-count').textContent=fmt(rows.length)+' zapisa · prikazano '+Math.min(rows.length,projectLimit)+'. '+fmt(counts.outline)+' s 3D obrisom, '+fmt(counts.footprint)+' sa zasebnim tlocrtom, '+fmt(counts.point)+' s oznakom, '+fmt(counts.unlocated)+' bez položaja. Broje se zapisi.';
 $('#projects-list').innerHTML=rows.slice(0,projectLimit).map(({r,i})=>'<button class="project-row" data-project="'+i+'" data-status="'+esc(r.attributes.status)+'" style="border-left:4px solid '+colors[projectCode(r)]+'"><b>'+esc(r.attributes.naziv)+'</b><span>'+esc(r.attributes.adresa)+'</span><small>'+esc(r.status_label||r.attributes.status)+' · '+esc(r.source_family||'Grad Zagreb')+' · '+esc(projectLocationLabels[r.location_kind])+'</small></button>').join('')+(rows.length>projectLimit?'<button data-project-more>Prikaži još 60</button>':'');
}
async function showProjects(){
 $('#theme-dialog-title').textContent='Evidencija obnove';$('#theme-dialog-body').textContent='Učitavam…';$('#theme-dialog').showModal();
 try{const d=window.projectsData&&projectsRevision===themeRevision?{projects:window.projectsData}:await json('/api/themes/projects?compact=1');window.projectsData=d.projects;projectsRevision=d.revision||themeRevision;
 const opts=items=>items.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
 $('#theme-dialog-body').innerHTML='<p>'+fmt(d.projects.length)+' zapisa iz gradskog, državnog i EU pregleda. Filtriraj po statusu radova, vrsti obnove, izvoru ili položaju na karti.</p><div class="project-filters"><input id="project-search" type="search" placeholder="Naziv ili adresa" aria-label="Filtriraj projekte"><select id="project-stage" aria-label="Status radova"><option value="">Svi statusi</option><option value="done">Završeni radovi</option><option value="progress">Radovi u tijeku</option><option value="mixed">Više faza</option><option value="partial">Provedeni zahvati bez potvrde punog završetka</option><option value="finance">Financiranje bez potvrde završetka</option><option value="recorded">Evidentiran postupak</option><option value="removed">Uklanjanje</option><option value="planned">Planirani radovi</option><option value="not_renewed">Bez energetske obnove prema evidenciji</option></select><select id="project-kind" aria-label="Vrsta obnove"><option value="">Sve vrste obnove</option>'+opts([...new Set(d.projects.map(r=>r.renewal_kind))])+'</select><select id="project-source" aria-label="Izvor podataka"><option value="">Svi izvori</option>'+opts([...new Set(d.projects.map(r=>r.source_family||'Grad Zagreb'))])+'</select><select id="project-location" aria-label="Položaj na karti"><option value="">Svi položaji</option>'+Object.entries(projectLocationLabels).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('')+'</select></div><p id="project-count" role="status"></p><div id="projects-list"></div>';renderProjects();
 }catch(e){$('#theme-dialog-body').textContent='Popis nije dostupan. Pokušaj ponovno.'}
}
function viewportCoverage(theme,scenario){
 if(clusters.length){
  const count=clusters.reduce((total,cluster)=>total+cluster.count,0);
  return '<p><b>'+fmt(count)+'</b> obrisa u grupnom prikazu. Približi kartu za pokrivenost po pojedinim zgradama.</p>';
 }
 const count=visible.length;
 const intro='<p><b>'+fmt(count)+'</b> trenutačno učitanih kanonskih obrisa. Broj se odnosi na učitani kadar.</p>';
 if(theme!=='energy'){
  const counts={};
  for(const {properties:p} of visible){
   const seed=theme==='flood'?p.theme_seed?.flood?.[scenario]:p.theme_seed?.[theme];
   const data=seed?.theme_data;
   const key=theme==='solar'?solarEvidence(data||{}):seed?.theme_value;
   counts[key]=(counts[key]||0)+1;
  }
  const labels=theme==='solar'
   ? {city_model:'Gradski model krova',overlap_estimate:'Procjena preklapanjem',footprint_estimate:'Procjena iz tlocrta'}
   : Object.fromEntries(themeConfig(theme).bands);
  const assigned=Object.keys(labels).reduce((sum,key)=>sum+(counts[key]||0),0);
  const heading=theme==='flood'?'<p>Scenarij: '+esc($('#scenario option:checked').textContent)+'</p>':'';
  const explanation=theme==='renewal'?'<p>„Planirani radovi” zahtijeva izvorni plan. „Bez energetske obnove · evidencija” zasebno prikazuje gradske zapise s oznakom neobnovljeno; to nije tvrdnja da nije bilo drugih radova. „Status nije provjeren” znači da dostupni izvori ne daju potvrđen status za obris. Brojevi obuhvaćaju samo obrise zgrada.</p>':theme==='flood'?'<p>„Plavljenje nije prikazano” opisuje rezultat odabranog scenarija. Oborinske poplave i odvodnja nisu obuhvaćene.</p>':'<p>Procjena iz tlocrta ili preklapanja označena je šrafurom. Procjena daje orijentacijsku površinu za panele.</p>';
  return intro+heading+'<ul>'+Object.entries(labels).map(([key,label])=>'<li data-coverage-count="'+key+'"><b>'+fmt(counts[key]||0)+'</b> '+esc(label)+'</li>').join('')+
   (assigned<count?'<li data-coverage-count="pending"><b>'+fmt(count-assigned)+'</b> Podatak još nije učitan</li>':'')+'</ul>'+explanation;
 }
 const known=visible.filter(({properties:p})=>p.record_count>0).length;
 return intro+'<p><b>'+fmt(known)+'</b> s poznatim podatkom ovog prikaza.</p>';
}
async function showCoverage(){
 const theme=activeTheme,scenario=floodScenario,dialog=$('#theme-dialog'),body=$('#theme-dialog-body');
 $('#theme-dialog-title').textContent='Pokrivenost · '+({energy:'Energetski razred',solar:'Solarni potencijal',renewal:'Obnova',flood:'Poplave'}[theme]);
 body.innerHTML='<section aria-label="Pokrivenost kadra">'+viewportCoverage(theme,scenario)+'</section><section data-city-coverage aria-live="polite">Učitavam gradski pregled…</section>';
 const city=body.querySelector('[data-city-coverage]');
 dialog.showModal();
 try{
  const d=await json('/api/themes/coverage');
  const solar=d.complete_states?.solar||{};
  let text='<p>Gradski indeks: '+fmt(d.city_outlines)+' kanonskih obrisa u 17 gradskih četvrti.</p>';
  if(theme==='solar')text+='<p>Svi obrisi imaju prikaz: '+fmt(solar.city_model||0)+' izravnih veza gradskog modela, '+fmt(solar.overlap_estimate||0)+' procjena preklapanjem i '+fmt(solar.footprint_estimate||0)+' orijentacijskih procjena iz tlocrta. Ljubičasti rub razlikuje procjene. To nije stopa terenske točnosti ni izmjera krova.</p>';
  else if(theme==='renewal'){const r=d.renewal_audit||{};text+='<p>'+fmt(r.project_records||0)+' zapisa: '+fmt(r.private_locations||0)+' privatnih lokacija potresne obnove, '+fmt(r.public_fseu_projects||0)+' projekata FSEU i '+fmt(r.historic_energy_projects||0)+' povijesnih projekata energetske obnove OPKK i '+fmt(r.cultural_heritage_projects||0)+' pojedinačnih projekata kulturne baštine te '+fmt(r.university_projects||0)+' sveučilišnih zapisa te '+fmt(r.municipal_reviewed_projects||0)+' pojedinačnih gradskih potvrda, '+fmt(r.city_eu_location_records||0)+' lokacijskih zapisa iz '+fmt(r.city_eu_completed_projects||0)+' provedenih EU projekata te '+fmt(r.apn_records||0)+' APN zapisa i '+fmt(r.cultural_current_records||0)+' novijih kulturnih potvrda i '+fmt(r.hazu_records||0)+' HAZU zapisa i '+fmt(r.education_records||0)+' pojedinačnih obrazovnih zahvata, '+fmt(r.capital_execution_records||0)+' potvrđenih zahvata iz izvješća o izvršenju i '+fmt(r.state_renewal_records||0)+' potvrda državnih i javnih ustanova, uz 134 izvorna gradska zapisa i 3 institucionalne dopune.</p><p>'+fmt(r.mapped_records||0)+' zapisa povezano je s '+fmt(r.mapped_outlines||0)+' obrisa; ostali ostaju pretraživi u evidenciji. Financiranje i očekivani datum nisu potvrda završetka radova. Izvori ne pokrivaju sve privatno financirane i neprijavljene obnove.</p>';}
  else if(theme==='flood')text+='<p>Svaki obris ima stanje za sva tri scenarija. „Nije prikazano” znači da raster ne prikazuje plavljenje tog obrisa u odabranom scenariju; nije jamstvo sigurnosti. Rub i stalne vode odvojeni su.</p>';
  else text+='<p>245.851 zapis u nacionalnom izvoru nije broj zagrebačkih zgrada. Izvorni certifikati nisu promijenjeni.</p>';
  if(dialog.open&&city.isConnected)city.innerHTML=text+'<p><a href="/sources.html">Izvori, pretpostavke i ograničenja →</a></p>';
 }catch(e){if(dialog.open&&city.isConnected)city.textContent='Gradski pregled trenutačno nije dostupan.'}
}
function setupThemes(){
 Object.assign(colors,{h3:'#d5473b',h2:'#ed9b37',h1:'#e5ce68',incomplete:'#9d90b5',s0:'#fff4d6',s1:'#ffcf52',s2:'#f3a725',s3:'#dc6c19',s4:'#a94116',done:'#00b975',progress:'#ffac24',planned:'#dbbe7a',not_renewed:'#e45242',partial:'#2bb6ac',finance:'#448bdd',recorded:'#b5a0d4',removed:'#5a5b67',mixed:'#806995',unverified:'#e1e8e5',clear:'#e7e4bd',unmapped:'#b5a4d0',unmodelled:'#b5a4d0',f1:'#bee8ff',f2:'#73dfff',f3:'#73b2ff',f4:'#7a8ef5',edge:'#d4b8d5',water:'#004da8'});
 window.energyLegend=$('.legend').innerHTML;
 document.querySelectorAll('button[data-theme]').forEach(b=>b.onclick=()=>changeTheme(b.dataset.theme));
 $('#retry-theme').onclick=()=>{colorCache.clear();loadThemeColors(true);if(state.id){detailCache.clear();choose(state.id,false,false)}};
 $('#scenario').onchange=()=>{
  const pendingSelection=!!state.id&&!selected;
  floodScenario=$('#scenario').value;write();themeLegend();
  const seeded=applyThemeSeed();
  renderMap();renderList();
  if(!seeded)loadThemeColors();
  if(state.id)choose(state.id,false,pendingSelection,preferredSourceAddress);
 };
 $('#projects-button').onclick=showProjects;$('#coverage-button').onclick=showCoverage;$('#close-theme-dialog').onclick=()=>$('#theme-dialog').close();
 document.addEventListener('click',async e=>{
  if(e.target.closest('[data-open-projects]'))showProjects();
  if(e.target.closest('[data-project-more]')){projectLimit+=60;renderProjects(false)}
  if(e.target.closest('[data-theme-retry]')){detailCache.clear();coverage=null;loadMap();if(state.id)choose(state.id,false,false)}
  const b=e.target.closest('[data-project]');
  if(b){let r=window.projectsData[Number(b.dataset.project)];if(r.compact&&!r.oid){b.disabled=true;try{r=await json('/api/themes/project/'+encodeURIComponent(r.source_id))}catch(e){b.disabled=false;toast('Zapis se nije učitao. Pokušaj ponovno.');return}b.disabled=false;if(!b.isConnected||!$('#theme-dialog').open)return}$('#theme-dialog').close();state.q='';sync();renderList();setView('map');if(r.oid){choose(r.oid)}else{if(r.point)map.easeTo({center:r.point,zoom:17,pitch:52});showMarkerProject(r)}}
 });
 document.addEventListener('input',e=>{if(e.target.id==='project-search')renderProjects()});
 document.addEventListener('change',e=>{if(['project-stage','project-kind','project-source','project-location'].includes(e.target.id))renderProjects()});
 themeLegend();
}

function themeOutlineHint(p){
 if(activeTheme==='flood'&&floodScenario==='overview')return floodOverviewLabels[chosenClass(p)]||'Podatak još nije učitan';

 const code=chosenClass(p),data=p.theme_data||{};
 if(activeTheme==='solar'){
  return ({
   city_model:'Gradski model krova',
   overlap_estimate:'Procjena preklapanjem s modelom',
   footprint_estimate:'Procjena iz tlocrta'
  })[solarEvidence(data)]||'Solarni podatak nije dostupan';
 }
 if(activeTheme==='renewal'){
  return ({
   done:'Završetak radova potvrđen za opseg iz izvora',
   progress:'Potvrđeni radovi u tijeku',
   partial:'Potvrđen pojedinačni zahvat',
   finance:'Evidentirano financiranje',
   recorded:'Evidentiran postupak',
   mixed:'Više faza ili različite potvrde',
   removed:'Evidentirano uklanjanje',
   planned:'Planirani radovi · početak nije potvrđen',
   not_renewed:'Energetska obnova nije provedena prema gradskoj evidenciji',
   unverified:'Status obnove nije provjeren'
  })[code]||'Podatak o obnovi nije dostupan';
 }
 return ({
  clear:'Plavljenje nije prikazano u scenariju',
  water:'Stalna vodena površina',
  edge:'Rubni dodir poplavnog područja',
  unmapped:'Izvan obrađenog rastera'
 })[code]||(data.depth?'Modelirana dubina u scenariju':'Poplavni podatak nije dostupan');
}
function themeRowBadge(p){
 const d=p.theme_data||{},code=chosenClass(p);
 const value=activeTheme==='flood'&&floodScenario==='overview'?(floodOverviewShort[code]||'—'):activeTheme==='solar'?(!solarEvidence(d)?'—':(d.state==='estimate'?'≈ ':'')+(d.useful_m2<1?fmt(d.useful_m2):compact(d.useful_m2))+' m²'):activeTheme==='renewal'?({done:'Završena',progress:'U tijeku',planned:'Planirano',not_renewed:'Bez energetske obnove',unverified:'Nije provjereno',mixed:'Više faza',partial:'Dio radova',finance:'Financiranje',recorded:'Postupak',removed:'Uklanjanje'}[code]||'—'):d.depth?({1:'<0,5 m',2:'0,5–1,5 m',3:'1,5–2,5 m',4:'>2,5 m'}[d.depth]):code==='edge'?'Rub':code==='water'?'Stalne vode':code==='clear'?'Nije prikazano':code==='unmapped'?'Izvan obuhvata':'—';
 return '<span class="theme-row-value" style="border-color:'+colors[code]+'">'+esc(value)+'</span>';
}

function applyThemeSeed(){
 if(vectorMode){$('#map-badge').textContent='Zgrade · odaberi zgradu.';return true}
 if(activeTheme==='energy')return true;
 let count=0;
 const fs=visible;
 for(const f of fs){
  const seed=f.properties.theme_seed;
  const v=activeTheme==='flood'?seed?.flood?.[floodScenario]:seed?.[activeTheme];
  if(v){Object.assign(f.properties,v);count++}
 }
 const complete=fs.length>0&&count===fs.length;
 if(complete){
  window.lastColorLoad={theme:activeTheme,scenario:floodScenario,pending:0,failures:0,fromSeed:true,at:performance.now()};
  if(activeTheme==='renewal'){
   const counts={done:0,partial:0,unverified:0};
   for(const f of fs){
    const status=f.properties.theme_value;
    if(Object.hasOwn(counts,status))counts[status]++;
   }
   $('#map-badge').textContent='Završeni radovi: '+counts.done+' · ograničeni zahvati: '+counts.partial+' · neprovjereno: '+counts.unverified;
  }else if(activeTheme==='solar'){
   const counts={model:0,estimate:0,unavailable:0};
   for(const f of fs){
    const evidence=solarEvidence(f.properties.theme_data||{});
    if(evidence==='city_model')counts.model++;
    else if(evidence)counts.estimate++;
    else counts.unavailable++;
   }
   $('#map-badge').textContent='Gradski model: '+counts.model+' · procjena: '+counts.estimate+(counts.unavailable?' · bez podatka: '+counts.unavailable:'');
  }else if(activeTheme==='flood'){
   const counts={clear:0,unmapped:0,water:0,edge:0,depth:0};
   for(const f of fs){
    const code=f.properties.theme_value;
    if(Object.hasOwn(counts,code))counts[code]++;
    else if(['f1','f2','f3','f4','h1','h2','h3','incomplete'].includes(code))counts.depth++;
   }
   $('#map-badge').textContent='Plavljenje: '+counts.depth+' · rubni dodir: '+counts.edge+' · nije prikazano: '+counts.clear+' · izvan obuhvata: '+counts.unmapped+(counts.water?' · stalne vode: '+counts.water:'');
  }
 }
 return complete;
}

function themePalette(p){
 if(activeTheme==='energy')return null;
 return activeTheme==='flood'?p.theme_seed?.flood?.[floodScenario]:p.theme_seed?.[activeTheme];
}

const floodOverviewLabels={h3:'Plavljenje prikazano u češćem scenariju',h2:'Plavljenje prikazano u stogodišnjem scenariju',h1:'Plavljenje prikazano u rijetkom / ekstremnom scenariju',clear:'Plavljenje nije prikazano ni u jednom od tri scenarija',incomplete:'Prikazana dubina uz nepotpunu usporedbu scenarija',edge:'Rubni dodir poplavnog područja',water:'Stalna vodena površina',unmapped:'Nedostupan podatak za usporedbu'};
const floodOverviewShort={h3:'Češći scenarij',h2:'Stogodišnji',h1:'Rijetki / ekstremni',clear:'Bez prikaza',incomplete:'Nepotpuno',edge:'Rub',water:'Stalne vode',unmapped:'Nema podatka'};
function floodOverviewSummary(d){
 if(!d.scenarios)return '<p class="theme-result flood-outcome" data-flood-outcome>'+esc(floodOverviewLabels[d.overview_code]||'Podatak se učitava')+'</p><p>Učitavam usporedbu scenarija…</p>';

 const names={velika:'Češće poplave',srednja:'Stogodišnja poplava',mala:'Rijetka / ekstremna poplava'},depth={1:'<0,5 m',2:'0,5–1,5 m',3:'1,5–2,5 m',4:'>2,5 m'};
 return '<p class="theme-result flood-outcome" data-flood-outcome>'+esc(floodOverviewLabels[d.overview_code]||'Podatak se učitava')+'</p><table class="flood-comparison"><thead><tr><th>Scenarij</th><th>Rezultat na obrisu</th></tr></thead><tbody>'+['velika','srednja','mala'].map(sc=>{const r=d.scenarios[sc];const label=r.category==='depth'?'Dubina '+(depth[r.depth]||'nepoznata'):({no_value:'Plavljenje nije prikazano',edge:'Rubni dodir',water:'Stalne vode',outside:'Nema podatka'}[r.category]||'Nema podatka');return '<tr><th><button type="button" data-flood-scenario="'+sc+'">'+names[sc]+'</button></th><td>'+label+'</td></tr>'}).join('')+'</tbody></table><p class="scenario-note">Rijetki / ekstremni scenarij uključuje i moguća rušenja nasipa ili visokih brana. Dubina je modelirana za područje obrisa u odabranom scenariju.</p>';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-flood-scenario]');if(b){$('#scenario').value=b.dataset.floodScenario;$('#scenario').dispatchEvent(new Event('change'));}});
