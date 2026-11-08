/* Tile-native rendering: colors and filters stay in the GPU, no viewport geometry uploads. */
(function(root){
 let paintKey='',total=0;
 const unpackData=(raw,key)=>{try{return JSON.parse(raw[key]||'{}')}catch{return {}}};
 function value(raw,theme,sc){
  const stem=theme==='flood'?'flood_'+sc:theme;
  return {theme_name:theme,theme_value:raw[stem+'_code']||'unknown',theme_known:!!raw[stem+'_known'],theme_data:unpackData(raw,stem+'_data')};
 }
function overview(raw){
 const scenarios={},codes=['velika','srednja','mala'].map(sc=>{const v=value(raw,'flood',sc);scenarios[sc]=v.theme_data;return v.theme_value});
 let code='unmapped';
 const depth=c=>/^f[1-4]$/.test(c);
 const first=codes.findIndex(depth);
 if(first>=0)code=codes.slice(0,first).every(c=>c==='clear')?['h3','h2','h1'][first]:'incomplete';
 else if(codes.every(c=>c==='clear'))code='clear';
 else if(codes.includes('edge'))code='edge';
 else if(codes.includes('water'))code='water';
 return {theme_name:'flood',theme_value:code,theme_known:['h1','h2','h3','clear'].includes(code),theme_data:{category:'overview',overview_code:code,scenarios}};
}
function overviewCode(){
 const g=sc=>['get','flood_'+sc+'_code'],dep=sc=>['in',g(sc),['literal',['f1','f2','f3','f4']]],clear=sc=>['==',g(sc),'clear'];
 return ['case',dep('velika'),'h3',dep('srednja'),['case',clear('velika'),'h2','incomplete'],dep('mala'),['case',['all',clear('velika'),clear('srednja')],'h1','incomplete'],['all',...['velika','srednja','mala'].map(clear)],'clear',['any',...['velika','srednja','mala'].map(sc=>['==',g(sc),'edge'])],'edge',['any',...['velika','srednja','mala'].map(sc=>['==',g(sc),'water'])],'water','unmapped'];
}

 function collect(maximum=80){
  const found=new Map();
  for(const f of map.queryRenderedFeatures({layers:['volumes']}))if(!found.has(f.properties.oid))found.set(f.properties.oid,f);
  total=found.size;
  const list=[...found.values()].sort((a,b)=>Number(b.properties['record_count_'+state.quality]>0)-Number(a.properties['record_count_'+state.quality]>0));
  return list.slice(0,maximum).map(f=>{
   const raw=f.properties,p={id:raw.oid,height:raw.height,base_height:raw.base_height||0,render_parent:true,model_parts:[]};
   for(const key of ['name','address','city','heating','primary','quality','record_count'])p[key]=raw[key+'_'+state.quality];
   const seed={};Object.defineProperty(seed,'solar',{enumerable:true,get:()=>value(raw,'solar')});Object.defineProperty(seed,'renewal',{enumerable:true,get:()=>value(raw,'renewal')});
   seed.flood={overview:overview(raw)};for(const sc of ['mala','srednja','velika'])Object.defineProperty(seed.flood,sc,{enumerable:true,get:()=>value(raw,'flood',sc)});
   p.theme_seed=seed;
   if(activeTheme!=='energy')Object.assign(p,activeTheme==='flood'?seed.flood[floodScenario]:seed[activeTheme]);
   return {type:'Feature',id:f.id,geometry:f.geometry,properties:p};
  });
 }
 function paint(){
  const key=[activeTheme,floodScenario,state.indicator,state.quality,state.only].join('|');
  if(key===paintKey)return;paintKey=key;
  const code=activeTheme==='energy'?state.indicator+'_'+state.quality:activeTheme==='flood'?'flood_'+floodScenario+'_code':activeTheme+'_code';
  const color=['match',activeTheme==='flood'&&floodScenario==='overview'?overviewCode():['get',code],...Object.entries(colors).flat(),colors.unknown];
  const solar=activeTheme==='solar',renewal=activeTheme==='renewal';
  const known=['in',['get',code],['literal',['done','planned','not_renewed','progress','mixed','partial']]];
  map.setPaintProperty('volumes','fill-extrusion-color',activeTheme==='energy'?'#ffffff':color);
  map.setPaintProperty('volumes','fill-extrusion-pattern',activeTheme==='energy'?['concat','hatch-',['get',code]]:solar?['concat',['case',['get','solar_estimated'],'solar-est-','solar-source-'],['get','solar_class']]:null);
  map.setPaintProperty('edges','line-color',activeTheme==='energy'?'#52695e':solar?['case',['get','solar_estimated'],'#8e4fba','#71827b']:renewal?['match',['get',code],'done','#006348','partial','#146f66','not_renewed','#842a21','planned','#765718','progress','#a75c08','mixed','#a75c08','#71827b']:'#71827b');
  map.setPaintProperty('edges','line-width',solar?['case',['get','solar_estimated'],1,.45]:renewal?['case',known,2.2,.45]:activeTheme==='energy'?.6:.45);
  const show=['==',['get','show_'+state.quality],true];
  const only=activeTheme==='energy'&&state.only?['>', ['get','record_count_'+state.quality],0]:['literal',true];
  map.setFilter('volumes',['all',show,only,['==',['get','render_parent'],true]]);
  map.setFilter('edges',['all',show,only,['==',['get','part'],false]]);
 }
 root.VectorView={collect,paint,get total(){return total}};
})(globalThis);
