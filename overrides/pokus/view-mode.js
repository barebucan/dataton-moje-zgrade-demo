/* Keep a usable map when WebGL falls back to a software renderer. */
(function(root){
 function apply(mode,remember=false,animate=false){
  state.mode='3d';
  if(remember)try{localStorage.setItem('mz-map-mode',state.mode)}catch{}
  const flat=state.mode==='2d';
  if(map.getLayer('volumes')){
   map.setPaintProperty('volumes','fill-extrusion-height',flat?0:['get','height']);
   map.setPaintProperty('volumes','fill-extrusion-base',flat?0:['get','base_height']);
  }
  const button=document.querySelector('#map-mode');
  if(button){button.textContent=flat?'3D prikaz':'2D · brže';button.setAttribute('aria-label',flat?'Uključi 3D prikaz':'Uključi brži 2D prikaz')}
  document.body.dataset.mapMode=state.mode;
  const shell=document.querySelector('#map-shell');shell.setAttribute('aria-label',shell.getAttribute('aria-label').replace(/^[23]D/,flat?'2D':'3D'));
  document.querySelector('#tilt').hidden=flat;
  if(animate)map.easeTo({pitch:flat?0:52,bearing:flat?0:-22,duration:150});
  write(true);
 }
 function setup(){
  let software=false;
  try{
   const gl=map.getCanvas().getContext('webgl2')||map.getCanvas().getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');
   const renderer=String(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
   software=/swiftshader|llvmpipe|software|basic render|softpipe/i.test(renderer);
  }catch{}
  document.body.dataset.mapRenderer=software?'software':'hardware';
  apply('3d');
 }
 root.MapViewMode={setup,apply};
})(globalThis);
