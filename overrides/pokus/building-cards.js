/* One readable building card per theme. Source records stay intact behind disclosures. */
const BuildingCards=(()=>{
 const stripDisclosure=html=>html.slice(html.indexOf('</summary>')+10,-10);
 const details=(content,extra='')=>'<details class="card-details '+extra+'"><summary>Detalji i izvori</summary><div class="card-details-body">'+content+'</div></details>';
 function result({value='',html='',label='',meaning='',note='',color='#47685b',tag='',context=''}){
  return '<section class="building-result" data-card-summary style="--result-color:'+esc(color)+'">'+
   (tag?'<span class="card-tag'+(tag==='Gradski model'?' source-tag':'')+'">'+esc(tag)+'</span>':'')+
   (context?'<p class="card-context">'+esc(context)+'</p>':'')+
   (label?'<p class="card-label">'+esc(label)+'</p>':'')+
   (html||'<p class="theme-result" data-card-result>'+esc(value)+'</p>')+
   (meaning?'<p class="card-meaning">'+esc(meaning)+'</p>':'')+
   (note?'<p class="card-limit">'+esc(note)+'</p>':'')+'</section>';
 }
 function frame(p,heading,body,theme=activeTheme){
  const address=heading.address||'',parts=address.split(' · '),same=address&&norm(heading.name)===norm(parts[0]);
  const remainder=same?parts.slice(1).join(' · '):address;const shownAddress=norm(remainder)==='zagreb'?'':remainder;
  const shownName=/^zgrada bez (upisanog )?naziva$/i.test(heading.name)?'Odabrana zgrada':heading.name;
  return '<div class="detail-head"><span class="eyebrow">'+esc(({energy:'Energetski razred',solar:'Solarni potencijal',renewal:'Obnova',flood:'Poplave'})[theme])+'</span><button class="close-icon" data-action="close" aria-label="Zatvori detalj">×</button></div>'+
   '<h2 id="building-card-title" class="detail-name" title="'+esc(shownName)+'">'+esc(shownName)+'</h2>'+
   (shownAddress?'<p class="address">'+esc(shownAddress)+'</p>':'')+body+
   '<details class="card-map-data"><summary>Podaci o karti</summary><p>'+esc(p.height_basis||'Visina može biti procjena.')+'</p>'+
   (heading.name.length>90?'<p>Puni naziv: '+esc(heading.name)+'</p>':'')+'<p>Oznaka obrisa: '+esc(p.id||'Nije potvrđen')+'</p>'+
   (p.geometry_source==='DGU'?'<a href="https://dgu.gov.hr/otvoreni-podaci-6596/6596" target="_blank" rel="noreferrer">DGU · izvor obrisa ↗</a>':p.osm_type&&p.osm_id?'<a href="https://www.openstreetmap.org/'+esc(p.osm_type)+'/'+esc(p.osm_id)+'" target="_blank" rel="noreferrer">OpenStreetMap · izvor obrisa ↗</a>':'')+
   '</details>'+actions(!p.noMapLocation);
 }
 function actions(canMap=true){
  return '<div class="card-actions">'+(canMap?'<button data-action="show-map">Pokaži na karti</button>':'')+'<button data-action="share">Kopiraj poveznicu</button></div><input class="share-input" readonly aria-label="Poveznica karte" hidden>';
 }
 function energy(f){
  const p=f.properties,cs=p.certificates||[],uncertain=['probable','ambiguous','weak'].includes(p.quality);
  const years=[...new Set(cs.map(r=>Math.floor(dateKey(r)/10000)).filter(Boolean))].sort((a,b)=>a-b);
  const age=cs.length===1&&useful(cs[0].issued)?' · izdano '+cs[0].issued:years.length?' · '+years[0]+'.'+(years.length>1?'–'+years[years.length-1]+'.':''):'';
  const classValue=c=>c==='multi'?'Više razreda':classes.includes(c)?c:'—';
  const pair='<dl class="card-energy-classes" data-card-result>'+[['Grijanje',p.heating],['Primarna energija',p.primary]].map(([label,c])=>'<div><dt>'+label+'</dt><dd '+(c==='multi'?'data-multi ':'')+'style="--class-color:'+esc(colors[c]||colors.unknown)+'">'+esc(classValue(c))+'</dd></div>').join('')+'</dl>';
  const summary=result({
   label:cs.length?recordCount(cs.length)+age:'',
   html:cs.length?pair:'',
   value:'Nema povezanog certifikata',
   meaning:cs.length?'Razredi iz certifikata mogu vrijediti samo za dio zgrade.':'',
   note:uncertain?'Veza certifikata s ovom zgradom nije potvrđena.':!cs.length?'To ne znači da certifikat ne postoji.':'',
   color:colors[chosenClass(p)]||colors.unknown
  });
  let evidence=cs.length===1?stripDisclosure(singleCertificateSource(cs[0])):cs.length?certificateGroups(cs,preferredSourceAddress||p.address||''):'<p>U dostupnom izvozu nije pronađen certifikat povezan s ovim obrisom.</p><a href="/sources.html" target="_blank" rel="noreferrer">O izvorima podataka ↗</a>';
  if(cs.length)evidence='<p>A+ je najviši, a G najniži energetski razred. Za obuhvat pojedinog certifikata pogledaj zapis ispod.</p>'+evidence;
  if(p.consumption)evidence+='<details class="consumption-disclosure"><summary>Potrošnja javnog objekta</summary>'+consumptionPanel(p.consumption)+'</details>';
  $('#detail').innerHTML=frame(p,{name:detailName(p),address:p.address||''},summary+details(evidence),'energy');
 }
 const projectLabel=code=>({
  done:'Završeni radovi',progress:'Radovi u tijeku',mixed:'Različite faze obnove',partial:'Potvrđen dio radova',
  finance:'Zabilježeno financiranje',recorded:'Evidentiran postupak',removed:'Evidentirano uklanjanje',
  planned:'Planirani radovi',not_renewed:'Bez energetske obnove prema evidenciji',unverified:'Status obnove nije poznat'
 })[code]||'Status nije poznat';
 function date(r){
  const d=r.source_fields||{};
  if(d.handover)return 'Predano '+d.handover;
  if(d.completion_date)return 'Završetak prema izvoru: '+d.completion_date;
  if(d.reference_year)return 'Zahvat iz '+d.reference_year+'.';
  if(d.project_completed_year)return 'Završetak projekta: '+d.project_completed_year+'.';
  if(d.status_date)return 'Stanje '+d.status_date;
  if(d.publication_date)return 'Objavljeno '+d.publication_date;
  return r.snapshot?'Podaci na dan '+r.snapshot:'';
 }
 function projectNote(r){
  const code=projectCode(r),year=Number(r.source_fields?.reference_year);
  if(r.outline_status_code==='recorded'&&r.outline_status_reason)return 'Podatak je za cijeli projekt; faza radova na ovoj zgradi nije potvrđena.';
  if(r.source_disagreement)return 'Izvori se ne slažu o završetku radova.';
  if(year&&year<2020)return 'Ovo je stariji zahvat, prije potresa 2020.';
  if(r.source_fields?.handover&&r.followup_note)return 'Primopredaja je potvrđena.';
  return ({
   done:'Potvrđen je završetak navedenog zahvata.',
   progress:'Izvor navodi radove u tijeku.',
   mixed:'Neke faze su završene, a druge se vode zasebno.',
   partial:'Potvrđen je ograničen zahvat, a ne cjelovita obnova.',
   finance:'Financiranje ne potvrđuje završetak radova.',
   recorded:'Zapis ne potvrđuje početak ni završetak radova.',
   removed:'Izvor navodi uklanjanje ili postupak uklanjanja.',
   planned:'Početak radova nije potvrđen ovim zapisom.',
   not_renewed:'Ovaj zapis odnosi se na energetsku obnovu; drugi zahvati mogu biti navedeni zasebno.'
  })[code]||'Nema dovoljno podataka za potvrdu statusa.';
 }
 function project(r,hideHeading=false,headingAlreadyShown=false){
  const a=r.attributes||{},when=date(r),code=projectCode(r);
  const location=!r.oid?'<p class="card-limit">'+esc(r.project_footprint?'Prikazan je potvrđeni tlocrt zahvata.':r.point?'Lokacija projekta je poznata; obris zgrade nije potvrđen.':'Točna lokacija projekta nije potvrđena.')+'</p>':'';
  return '<article class="project-detail concise-project" data-source-id="'+esc(r.source_id)+'">'+
   (!hideHeading&&!headingAlreadyShown?'<h3>'+esc(a.naziv||r.renewal_kind||'Zahvat')+'</h3><p>'+esc(a.adresa||'')+'</p>':'')+
   '<p class="project-status '+esc(code)+'">'+esc(projectLabel(code))+'</p><p class="project-kind">'+esc(r.renewal_kind||'')+'</p>'+
   (when?'<p class="project-date">'+esc(when)+'</p>':'')+
   '<p>'+esc(projectNote(r))+'</p>'+location+
   (r.source_url?'<p><a href="'+esc(r.source_url)+'" target="_blank" rel="noreferrer">Otvori izvor ↗</a></p>':'')+
   '<details class="project-evidence"><summary>Izvor i potpuni zapis</summary>'+projectEvidenceContent(r,true,true)+'</details></article>';
 }
 function renewal(p,d,preview){
  const rows=d.projects?.length?orderProjectEvidence(d.projects,p.theme_value):[];
  const reviews=rows.map(r=>r.independent_review).filter(Boolean);
  const conflict=!!d.source_disagreements?.length||rows.some(r=>r.source_disagreement);
  const addressScope=reviews.some(r=>r.classification==='address_scope');
  const temporalScope=reviews.some(r=>r.classification==='time_and_scope');
  const code=p.theme_value||'unverified',known=code!=='unverified'&&code!=='unknown';
  let value=conflict?'Izvori se ne slažu':addressScope?'Različiti statusi po adresama':code==='mixed'?'Dio radova je završen':projectLabel(code);
  let meaning=({
   done:'Potvrda se odnosi na navedeni zahvat, ne nužno na cijelu zgradu.',
   progress:'',
   partial:'To nije potvrda cjelovite obnove.',
   finance:'Završetak radova nije potvrđen.',
   recorded:'Faza radova nije potvrđena.',
   removed:'Evidentirano je uklanjanje ili postupak uklanjanja.',
   planned:'Početak radova nije potvrđen.',
   not_renewed:'',
   mixed:'Za istu zgradu postoje različite faze ili zahvati.',
   unverified:''
  })[code]??'';
  if(conflict)meaning='Jedan izvor potvrđuje završetak, a drugi navodi radove u tijeku.';
  else if(addressScope)meaning='Isti obris obuhvaća više adresa s različitim statusima.';
  else if(temporalScope)meaning='Konstrukcija je završena; završetak pročelja nije potvrđen.';
  else if(code==='mixed')meaning='Završene i preostale radove možeš pogledati zasebno.';
  const kinds=[...new Set(rows.map(r=>r.renewal_kind).filter(Boolean))];
  const historic=rows.length&&rows.every(r=>Number(r.source_fields?.reference_year)>0&&Number(r.source_fields.reference_year)<2020);
  const years=historic?[...new Set(rows.map(r=>r.source_fields.reference_year))]:[];
  const note=!known?'Izostanak podatka ne znači da zgrada nije obnovljena.':historic?'Zahvat '+years.join(', ')+'. · prije potresa 2020.':code==='not_renewed'?'Drugi zahvati nisu time isključeni.':kinds.length===1?kinds[0]:'';
  let body=result({value,meaning,note,color:colors[code]||colors.unknown});
  if(preview)return body+'<p data-theme-detail-preview role="status">Učitavam detalje…</p>';
  if(!rows.length)return body+'<button class="card-search" data-open-projects>Pretraži evidenciju obnove</button>';
  const evidence=rows.map(r=>{
   const title=r.attributes?.naziv||r.renewal_kind||'Zahvat',when=date(r);
   if(rows.length===1)return '<h3 class="record-full-name">'+esc(title)+'</h3>'+project(r,true,true);
   return '<div class="renewal-record-wrap"><details class="renewal-record" data-record-source="'+esc(r.source_id)+'"><summary><span><strong>'+esc(title)+'</strong><small>'+esc(projectLabel(projectCode(r)))+(when?' · '+esc(when):'')+'</small></span></summary>'+project(r,true,true)+'</details>'+
    (r.source_url?'<a class="record-source" href="'+esc(r.source_url)+'" target="_blank" rel="noreferrer" aria-label="Otvori izvor za '+esc(title)+'">Izvor ↗</a>':'')+'</div>';
  }).join('');
  return body+details('<p class="card-record-count">'+rows.length+' '+(rows.length===1?'zapis':'zapisa')+' o obnovi</p>'+evidence,'renewal-records');
 }
 function sourceBody(d){
  const kind=d.evidence_kind;
  const label=kind==='footprint_estimate'?'Tlocrt OSM/DGU i lokalna procjena':kind==='overlap_estimate'?'Gradski model i lokalna procjena':kind==='city_model'?'Grad Zagreb · model krova':d.source&&!d.source.startsWith('http')?d.source:'Izvorni podatkovni sloj';
  const links=[];
  if(d.source_url)links.push({url:d.source_url,label:'Izvorni podatak'});
  if(d.source?.startsWith('http'))links.push({url:d.source,label:'Izvorni podatak'});
  if(d.method_reference)links.push({url:d.method_reference,label:kind==='footprint_estimate'?'Metodološka referenca (JRC)':'Referenca metode'});
  links.push(...(d.sources||[]).filter(s=>s.url));
  const unique=links.filter((s,i)=>links.findIndex(x=>x.url===s.url)===i);
  return '<h3>Izvori</h3><p>'+esc(label)+'</p>'+
   (d.source_period||d.snapshot?'<p>'+esc(d.source_period||'Presjek: '+d.snapshot)+'</p>':'')+
   (unique.length?'<ul>'+unique.map(s=>'<li><a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.label||'Dopunski izvor')+' ↗</a></li>').join('')+'</ul>':'<p><a href="/sources.html" target="_blank" rel="noreferrer">O izvorima podataka ↗</a></p>')+
   (kind==='footprint_estimate'?'<p>Ovo je lokalna procjena, a ne službeni JRC podatak za ovu zgradu.</p>':'')+
   '<details><summary>Potpuni izvorni podaci</summary><pre class="source-trace">'+esc(JSON.stringify(d,null,2))+'</pre></details>';
 }
 function solar(p,d,preview){
  const kind=solarEvidence(d),estimated=kind&&kind!=='city_model';
  if(!kind){
   const value=d.state==='pending'?'Podatak se priprema':d.state==='error'?'Podatak se nije učitao':'Nema pouzdanog podatka';
   return result({value,meaning:d.state==='pending'?'Učitavamo podatke za ovu zgradu.':'Za ovaj obris solarna površina nije potvrđena.'})+
    (d.state==='error'?'<button data-theme-retry>Pokušaj ponovno</button>':'')+(preview?'<p data-theme-detail-preview role="status">Učitavam detalje…</p>':details(sourceBody(d)));
  }
  const amount=(estimated?'≈ ':'')+fmt(estimated&&d.useful_m2>=1?Math.round(d.useful_m2):d.useful_m2);
  let body=result({
   label:'Površina za solarne panele',
   html:'<p class="theme-result" data-card-result>'+esc(amount)+' <span class="card-unit">m²</span></p>',
   tag:estimated?'Procjena':'Gradski model',
   meaning:estimated?'Orijentacijska površina. Osunčanost i stanje krova nisu provjereni.':'Prikladna površina prema gradskom modelu. Stanje krova nije provjereno.',
   note:'',
   color:colors[p.theme_value]||'#aa7724'
  });
  if(preview)return body+'<p data-theme-detail-preview role="status">Učitavam detalje…</p>';
  const method=estimated
   ?kind==='overlap_estimate'?'Procjena je raspodijeljena prema preklapanju starijeg gradskog modela i današnjeg obrisa. Spoj pojedinog krova nije potvrđen.'
    :'Tlocrt '+fmt(d.footprint_m2)+' m² × '+fmt(d.assumed_suitable_fraction*100)+' % pretpostavljene raspoložive površine.'+(d.building_use_known?'':' Namjena nije poznata; pretpostavljeno je 25 %.')
   :'Površina krova prema modelu: '+(d.roof_m2==null?'nije navedena':fmt(d.roof_m2)+' m²')+(d.useful_pct==null?'':'; prikladno '+fmt(d.useful_pct)+' %')+'.';
  body+=details('<h3>Kako je dobivena površina?</h3><p>'+esc(method)+'</p><p>Nagib, zasjenjenje, statika, postojeći paneli, priključak i dozvole nisu provjereni za ovu zgradu. Snaga i godišnja proizvodnja nisu izračunate.</p>'+sourceBody(d));
  return body;
 }
 function flood(p,d,preview){
  if(d.category==='overview')return '<div data-flood-summary aria-live="polite">'+floodOverviewSummary(d)+'</div>'+(preview?'<p data-theme-detail-preview role="status">Učitavam detalje…</p>':details('<p>Orijentacijska karta mjerila 1:25.000. Oborinske poplave i odvodnja nisu obuhvaćene.</p>'+sourceBody(d)));

  const depths={1:'manje od 0,5 m',2:'0,5–1,5 m',3:'1,5–2,5 m',4:'više od 2,5 m'};
  const data={
   depth:[depths[d.depth]||'Dubina nije navedena','Dubina se odnosi na dio zgrade zahvaćen vodom.'],
   no_value:['Plavljenje nije prikazano',''],
   edge:['Zgrada je na rubu poplavnog područja','Dodir je premalen za pouzdanu dodjelu dubine.'],
   water:['Stalna vodena površina','Dubina poplavnog scenarija nije dodijeljena.'],
   outside:['Nema podatka za ovu lokaciju','Zgrada je izvan obrađenog područja.']
  }[d.category]||['Podatak nije dostupan','Stanje za ovaj obris nije potvrđeno.'];
  const scenario=$('#scenario option:checked')?.textContent||'Odabrani scenarij';
  const note=d.category==='no_value'?'To nije potvrda da nema rizika od poplave.':['depth','edge'].includes(d.category)?'Ne uključuje poplave od kiše i probleme odvodnje.':'';
  let body='<div data-flood-summary aria-live="polite">'+result({value:data[0],label:d.category==='depth'?'Modelirana dubina vode':'',meaning:data[1],note,context:scenario,color:colors[p.theme_value]||'#457e92'})+'</div>';
  if(preview)return body+'<p data-theme-detail-preview role="status">Učitavam detalje…</p>';
  const extreme=floodScenario==='mala'?'<p>Scenarij male vjerojatnosti uključuje i moguće rušenje nasipa ili visokih brana.</p>':'';
  body+=details('<h3>Što prikazuje scenarij?</h3><p class="scenario-name">'+esc(scenario)+'</p>'+extreme+'<p>Orijentacijska karta mjerila 1:25.000. Zumiranje ne povećava preciznost izvornog podatka. Oborinske poplave i odvodnja nisu obuhvaćene.</p>'+(d.category==='depth'?'<p>Prikazana je najdublja klasa koja prekriva barem 10 % obrisa.</p>':'')+(d.edge?'<p>Granica prelazi preko obrisa; lokacija traži dodatnu provjeru.</p>':'')+sourceBody(d));
  return body;
 }
 function render(f,preview=false){
  $('#detail').dataset.theme=activeTheme;
  if(activeTheme==='energy'){energy(f);return}
  const p=f.properties,d=p.theme_data||{state:'error'};
  const heading=activeTheme==='renewal'?renewalDetailHeading(p,d):{name:detailName(p),address:p.address||''};
  const body=activeTheme==='renewal'?renewal(p,d,preview):activeTheme==='solar'?solar(p,d,preview):flood(p,d,preview);
  $('#detail').innerHTML=frame(p,heading,body);
 }
 function standalone(r){
  const p={theme_value:projectCode(r),height_basis:'Projektna lokacija; obris zgrade nije potvrđen.',noMapLocation:!r.point&&!r.project_footprint};
  const heading={name:r.attributes?.naziv||'Zapis obnove',address:r.attributes?.adresa||''};
  const location=r.project_footprint?'Prikazan je potvrđeni tlocrt zahvata.':r.point?'Lokacija projekta je poznata; obris zgrade nije potvrđen.':'Točna lokacija projekta nije potvrđena.';
  const body=renewal(p,{projects:[r]},false).replace('<details class="card-details','<p class="card-location">'+esc(location)+'</p><details class="card-details');
  $('#detail').innerHTML=frame(p,heading,body,'renewal');
 }
 return {energy,render,project,projectLabel,result,details,actions,standalone};
})();
