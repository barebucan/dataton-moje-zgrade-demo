"""Derive scenario exposure from existing reviewed raster classifications. No risk probabilities inferred."""
SCENARIOS=('velika','srednja','mala')
LABELS={'velika':'Češće poplave','srednja':'Stogodišnji scenarij','mala':'Rijetki / ekstremni scenarij'}
def aggregate(rows):
 data={sc:(rows.get(sc) or {}).get('theme_data',{'category':'outside'}) for sc in SCENARIOS}
 cats={sc:d.get('category','outside') for sc,d in data.items()}
 depth=[sc for sc in SCENARIOS if cats[sc]=='depth' and data[sc].get('depth') in (1,2,3,4)]
 missing=[sc for sc in SCENARIOS if cats[sc] not in ('depth','no_value','edge','water')]
 code='unmapped';known=False
 if depth:
  first=depth[0];prior=SCENARIOS[:SCENARIOS.index(first)]
  code={'velika':'h3','srednja':'h2','mala':'h1'}[first] if all(cats[sc]=='no_value' for sc in prior) else 'incomplete'
  known=code!='incomplete'
 elif all(c=='no_value' for c in cats.values()):code='clear';known=True
 elif any(c=='edge' for c in cats.values()):code='edge'
 elif any(c=='water' for c in cats.values()):code='water'
 # A missing or boundary classification is never converted into a safe class.
 d={'category':'overview','overview_code':code,'scenarios':{sc:{'category':cats[sc],'depth':data[sc].get('depth'),'edge':bool(data[sc].get('edge'))} for sc in SCENARIOS},'missing_scenarios':missing,'method':'Izvedeni sažetak triju izvornih poplavnih scenarija. Klasa dubine zahtijeva najmanje 10 % preklapanja obrisa prema postojećoj obradi.','source':'Hrvatske vode','source_url':'https://www.voda.hr/hr/geoportal','source_period':'Karte 2019.; plan 2022.–2027.; mjerilo 1:25.000'}
 return {'theme_name':'flood','theme_value':code,'theme_known':known,'theme_data':d}
def compact(value):
 return {**value,'theme_data':{'category':'overview','overview_code':value['theme_value']}}
def install(module):
 original=module.values;seed_original=module.seed
 def values(ids,theme,scenario='mala',detail=False,enqueue=True):
  if theme!='flood' or scenario!='overview':return original(ids,theme,scenario,detail,enqueue)
  ids=list(ids);allrows={sc:original(ids,'flood',sc,detail,False) for sc in SCENARIOS}
  result={oid:aggregate({sc:allrows[sc].get(oid) for sc in SCENARIOS}) for oid in ids if any(oid in allrows[sc] for sc in SCENARIOS)}
  return result if detail else {oid:compact(value) for oid,value in result.items()}
 def seed(data):
  result=seed_original(data)
  for f in result.get('features',[]):
   palette=f['properties'].get('theme_seed',{}).get('flood')
   if palette is not None:palette['overview']=compact(aggregate(palette))
  return result
 module.values=values;module.seed=seed
