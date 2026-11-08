import re,math

def number(raw):
 s=str(raw or '').strip().lower().replace(',','.')
 m=re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)\s*(m|metres?|meters?|ft|feet|')?",s)
 if not m:return None
 v=float(m[1])*(.3048 if m[2] in ['ft','feet',"'"] else 1)
 return v if math.isfinite(v) and 0<=v<=350 else None

def profile(tags,hint=None):
 hint=hint or {};height=number(tags.get('height'));roof=number(tags.get('roof:height'))
 if height and height>1:
  quality='osm_height';basis='Visina upisana u OSM-u: '+str(tags['height'])+'; nije neovisno izmjerena u ovoj aplikaciji.'
 else:
  levels=number(tags.get('building:levels'))
  if levels and levels<=80 and levels.is_integer():
   roof=roof if roof is not None else (number(tags.get('roof:levels')) or 0)*3
   height=levels*3+roof;quality='osm_levels';basis='Procjena iz OSM-a: '+str(tags['building:levels'])+' nadzemnih etaža × 3 m'+(' + '+str(round(roof,1))+' m krova' if roof else '')+'.'
  elif hint.get('certificate_levels'):
   height=hint['certificate_levels']*3+(roof or 0);quality='certificate_levels';basis=hint['certificate_height_basis']+'. Model: 3 m po etaži; procjena, ne izmjerena visina. Zapis '+str(hint['certificate_height_record'])+'.'
  else:
   kind=tags.get('building:part') or tags.get('building','yes');nature=tags.get('building_nature','')
   if kind in ['garage','garages','shed','roof','kiosk','service','container']:height=3
   elif kind in ['apartments','dormitory','hotel','hospital','office'] or nature in ['StambenaZgrada','VisokaZgrada']:height=12
   elif kind in ['school','university','industrial','warehouse','retail','commercial']:height=8
   else:height=6
   quality='symbolic';basis='Simbolični volumen '+str(height)+' m prema vrsti objekta; visina i broj etaža nisu poznati.'
 if height>350 or height<=0:height=6;quality='inconsistent_tags';basis='Neusklađeni izvorni podaci visine/etaža. Prikazan je simboličan volumen 6 m.'
 base=number(tags.get('min_height'))
 if base is None:base=(number(tags.get('building:min_level')) or 0)*3
 if base>=height:base=0;basis+=' Neusklađen donji rub zanemaren.'
 return dict(height=round(height,2),base_height=round(base,2),height_quality=quality,height_basis=basis)

def model(tags,hint=None):
 hint=hint or {};out=profile(tags,hint);parts=[]
 for p in hint.get('parts',[]):
  v=profile(p['tags'])
  if v['height_quality']=='symbolic':
   v['height']=max(out['height'],v['base_height']+3);v['height_quality']=out['height_quality'];v['height_basis']='Dio nema zasebnu visinu; preuzeta je visina matičnog obrisa. '+out['height_basis']
  parts.append(dict(id=p['id'],geometry=p['geometry'],linked_geometry_bid=p.get('linked_geometry_bid'),**v))
 out.update(model_parts=parts,render_parent=not bool(parts),part_count=len(parts),model_geometry='OSM dijelovi pridruženi prostornim sadržavanjem' if parts else 'Prostorni obris i uspravni volumen',roof_basis='Krov je prikazan ravnim gornjim plohama volumena; nagibi i fasade nisu rekonstruirani.')
 if parts:
  if hint.get('remainder_geometry'):
   parts.append(dict(id='unmodeled-remainder',geometry=hint['remainder_geometry'],linked_geometry_bid=None,height=3,base_height=0,height_quality='symbolic_remainder',height_basis='Nepokriveni ostatak izvornog tlocrta. Simbolična baza 3 m, visina nije poznata.'))
  low=min(v['height'] for v in parts);high=max(v['height'] for v in parts);out['height']=max(high,out['base_height']+1);out['height_quality']='mixed_parts';out['height_basis']='Model od '+str(out['part_count'])+' OSM dijelova, gornje visine '+str(round(low,1))+'–'+str(round(high,1))+' m. Nepokriveni ostatak tlocrta ostaje prikazan kao niska simbolična baza. Visine su podaci ili procjene, ne neovisna mjerenja.'
 return out
