const VectorRecovery=(()=>{
 const prefix='mz-vector-fallback-';let installed=false,recoveryTimer,catalog;
 function fallback(revision){
  try{const raw=sessionStorage.getItem(prefix+revision),at=Number(raw);
   if(!raw)return false;
   if(raw==='1'||!Number.isFinite(at)||Date.now()-at>=30000){sessionStorage.removeItem(prefix+revision);return false}
   return true;
  }catch{return false}
 }
 function fail(revision){try{sessionStorage.setItem(prefix+revision,String(Date.now()))}catch{}location.reload()}
 function install(){
  if(installed)return;installed=true;
  maplibregl.addProtocol('zgrade-vector',async(params,controller)=>{
   const url=params.url.replace('zgrade-vector://',location.protocol+'//');const key=url.match(/\/(15|16)\/(\d+)\/(\d+)\.pbf/)?.slice(1).join('/');if(catalog&&key&&!catalog.has(key))return {data:new ArrayBuffer(0)};let last;
   for(let attempt=0;attempt<4;attempt++){
    if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    try{
     const response=await fetch(url,{signal:controller.signal,priority:'high'});
     if(!response.ok)throw Error('Zgrade se nisu učitale ('+response.status+').');
     return {data:await response.arrayBuffer(),cacheControl:response.headers.get('Cache-Control'),expires:response.headers.get('Expires')};
    }catch(error){
     if(controller.signal.aborted||error.name==='AbortError')throw error;
     last=error;if(attempt===3)break;
     await new Promise((resolve,reject)=>{
      const signal=controller.signal,abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},[150,350,750][attempt]);
      signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted)abort();
     });
    }
   }
   throw last;
  });
 }
 function tiles(descriptor){catalog=new Set(descriptor.tile_keys||[]);if(!catalog.size)catalog=null;return ['zgrade-vector://'+location.host+descriptor.tiles]}
 function watch(map,descriptor){
  const revision=descriptor.revision,autoKey=prefix+'auto-'+revision;let busy=false;
  const recover=async()=>{
   if(busy||document.hidden)return;
   try{if(Date.now()-Number(sessionStorage.getItem(autoKey)||0)<60000)return}catch{}
   busy=true;
   try{
    const c=map.getCenter(),z=16,n=2**z,lat=Math.max(-85,Math.min(85,c.lat))*Math.PI/180;
    const x=Math.floor((c.lng+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat))/Math.PI)/2*n);
    const key=z+'/'+x+'/'+y,probe=descriptor.tile_keys?.includes(key)?key:descriptor.tile_keys?.[0]||key;const [pz,px,py]=probe.split('/');const path=descriptor.tiles.replace('{z}',pz).replace('{x}',px).replace('{y}',py);
    const response=await fetch(path+'?recovery='+Date.now(),{signal:AbortSignal.timeout(2500),cache:'no-store',priority:'high'});
    if(!response.ok)return;await response.arrayBuffer();
    try{sessionStorage.removeItem(prefix+revision);sessionStorage.setItem(autoKey,String(Date.now()))}catch{}
    clearInterval(recoveryTimer);location.reload();
   }catch{}finally{busy=false}
  };
  recoveryTimer=setInterval(recover,5000);window.addEventListener('online',recover);
 }
 return {fallback,fail,install,tiles,watch};
})();