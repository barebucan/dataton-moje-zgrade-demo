"""Read-only analytics for the public City of Zagreb monthly ISGE extract."""
from pathlib import Path
import json,math,re,sqlite3,statistics,unicodedata

P=Path(__file__).resolve().parent
DB=P/'data/zagreb-consumption.sqlite'
WEATHER=P/'data/zagreb-weather-monthly.json'
ENERGY_FUELS={'Električna energija','Toplina','Prirodni plin','Para','Loživo ulje ekstra lako','Peleti','Loživo ulje lako','Plin u boci','UNP'}
HEATING_FUELS={'Toplina','Prirodni plin','Para','Loživo ulje ekstra lako','Peleti','Loživo ulje lako','Plin u boci','UNP'}

def norm(value):
 value=unicodedata.normalize('NFD',(value or '').lower().replace('đ','d'))
 return ' '.join(''.join(c if c.isalnum() else ' ' for c in value if unicodedata.category(c)!='Mn').split())

def period_index(year,month):return year*12+month-1
def period_label(index):return f'{index//12:04d}-{index%12+1:02d}'
def finite(value):return value if value is not None and math.isfinite(value) else None

def window(months,end,size=12):
 selected=[m for m in months if end-size<m['index']<=end]
 energy=[m for m in selected if m['energy_kwh'] is not None]
 cost=[m for m in selected if m['energy_cost_eur'] is not None]
 return dict(
  energy_kwh=round(sum(m['energy_kwh'] for m in energy),1) if energy else None,
  energy_cost_eur=round(sum(m['energy_cost_eur'] for m in cost),2) if cost else None,
  energy_months=len(energy),cost_months=len(cost),from_period=period_label(end-size+1),to_period=period_label(end)
 )

def change(current,previous,key,coverage_key):
 a,b=current.get(key),previous.get(key)
 if a is None or b is None or b<=0 or current[coverage_key]<10 or previous[coverage_key]<10:return None
 return round((a/b-1)*100,1)

def weather_months():
 if not WEATHER.exists():return {}
 payload=json.loads(WEATHER.read_text())
 return {row['period']:row for row in payload.get('monthly',[])}

def anomaly_reasons(current,history,weather):
 reasons=[]
 fuels=set(current.get('fuels',{}))
 for month in history:fuels.update(month.get('fuels',{}))
 differences=[]
 for fuel in fuels:
  past=[month.get('fuels',{}).get(fuel,0) for month in history]
  baseline=statistics.median(past) if past else 0
  difference=current.get('fuels',{}).get(fuel,0)-baseline
  differences.append((abs(difference),fuel,difference,baseline))
 fuel_differences=[]
 for _,fuel,difference,baseline in sorted(differences,reverse=True)[:4]:
  current_value=current.get('fuels',{}).get(fuel,0)
  fuel_differences.append(dict(fuel=fuel,current_kwh=round(current_value,1),baseline_kwh=round(baseline,1),difference_kwh=round(difference,1),difference_pct=round(difference/baseline*100,1) if baseline>0 else None))
 driver=max(differences,default=None)
 if driver and driver[0]>=500:
  _,fuel,difference,baseline=driver
  direction='više' if difference>0 else 'manje'
  reasons.append(dict(type='fuel',confidence='data',title='Najveća razlika: '+fuel,detail=f'{abs(difference):,.0f} kWh {direction} od medijana istog mjeseca ({baseline:,.0f} kWh).'.replace(',','.')))
 meter_history=[m.get('meter_count',0) for m in history if m.get('meter_count')]
 meter_baseline=statistics.median(meter_history) if meter_history else None
 if meter_baseline and current.get('meter_count') and current['meter_count']!=meter_baseline:
  reasons.append(dict(type='meter',confidence='data',title='Promijenjen broj mjernih mjesta',detail=f"Mjesec ima {current['meter_count']}, a usporedni medijan {meter_baseline:g}; moguća je promjena obuhvata podataka."))
 current_weather=weather.get(current['period'])
 historical_weather=[weather[m['period']] for m in history if m['period'] in weather]
 weather_detail=None;weather_comparison=None
 if current_weather and historical_weather and driver:
  fuel=driver[1]
  if fuel in HEATING_FUELS:
   metric,label='hdd18','stupanj-dana grijanja (HDD18)'
  elif fuel=='Električna energija' and current['month'] in (6,7,8,9):
   metric,label='cdd22','stupanj-dana hlađenja (CDD22)'
  else:metric=label=None
  if metric:
   baseline=statistics.median(row[metric] for row in historical_weather)
   observed=current_weather[metric]
   weather_change=(observed/baseline-1)*100 if baseline>0 else (100 if observed>0 else 0)
   consumption_high=current['energy_kwh']>statistics.median(m['energy_kwh'] for m in history)
   weather_high=observed>baseline
   supports=consumption_high==weather_high and abs(weather_change)>=10
   title='Vrijeme podupire dio odstupanja' if supports else 'Vrijeme ne objašnjava jasno odstupanje'
   weather_detail=f'{label}: {observed:.1f}, medijan usporednih godina {baseline:.1f} ({weather_change:+.0f}%). Srednja temperatura {current_weather["mean_temp_c"]:.1f} °C.'
   weather_comparison=dict(metric=metric.upper(),label=label,observed=round(observed,1),baseline=round(baseline,1),difference_pct=round(weather_change,1))
   reasons.append(dict(type='weather',confidence='supporting' if supports else 'not_supporting',title=title,detail=weather_detail))
 if not weather_detail:
  reasons.append(dict(type='weather',confidence='not_supporting',title='Vrijeme nije dovoljno za ovo objašnjenje',detail='Dostupna temperatura nije izravno povezana s glavnim energentom ili nema dovoljno usporednih godina.'))
 reasons.append(dict(type='operations',confidence='hypothesis',title='Za provjeru: način korištenja objekta',detail='Radno vrijeme, broj korisnika, radovi ili promjena opreme mogu utjecati na potrošnju, ali otvoreni podaci ih ne sadrže.'))
 return reasons,current_weather,dict(fuels=fuel_differences,weather=weather_comparison)

def anomalies(months,weather=None):
 weather=weather or {}
 found=[]
 for current in months:
  value=current['energy_kwh']
  if value is None or value<=0 or current['negative_rows']:continue
  history=[m for m in months if m['index']<current['index'] and m['month']==current['month'] and m['energy_kwh'] is not None and m['energy_kwh']>0 and not m['negative_rows']]
  values=[m['energy_kwh'] for m in history]
  if len(values)<3:continue
  baseline=statistics.median(values);mad=statistics.median(abs(v-baseline) for v in values)
  difference=value-baseline;threshold=max(baseline*.35,mad*3,500)
  if abs(difference)<threshold:continue
  reasons,weather_row,visual=anomaly_reasons(current,history,weather)
  found.append(dict(period=current['period'],direction='high' if difference>0 else 'low',value_kwh=round(value,1),baseline_kwh=round(baseline,1),difference_pct=round(difference/baseline*100,1),comparison_years=len(values),reasons=reasons,weather=weather_row,visual=visual))
 return sorted(found[-24:],key=lambda a:abs(a['difference_pct']),reverse=True)[:4]

def name_words(value):
 value=' '+norm(value)+' '
 replacements={' os ':' osnovna skola ',' dv ':' djecji vrtic ',' ss ':' srednja skola ',' src ':' sportsko rekreacijski centar '}
 for old,new in replacements.items():value=value.replace(old,new)
 return set(value.split())

def category(words):
 tests=[('kindergarten',{'djecji','vrtic'}),('school',{'skola'}),('museum',{'muzej'}),('sport',{'sportsko','sport','rekreacijski'}),('health',{'bolnica','klinika','poliklinika','zdravlja'}),('administration',{'policija','uprava','gradski','ured'})]
 for label,tokens in tests:
  if words&tokens:return label
 return None

def compatible_name(source_names,candidate_names):
 generic={'zgrada','objekt','javne','namjene','ustanova','zagreb','ulica','cesta','centar'}
 best=0
 for source in source_names:
  a=name_words(source);ca=category(a)
  for candidate in candidate_names:
   b=name_words(candidate);cb=category(b)
   if not ca or ca!=cb:continue
   distinctive=(a&b)-generic-{'osnovna','srednja','skola','djecji','vrtic','sportsko','rekreacijski'}
   score=len(a&b)/max(1,len(a|b))
   if distinctive or score>=.35:best=max(best,score)
 return round(best,3)

def lookup(addresses,city='',heated_area=None,names=None):
 if not DB.exists():return None
 if norm(city)!='zagreb':return None
 candidates=[]
 for address in addresses:
  key=norm(address)
  if key and key not in candidates:candidates.append(key)
 if not candidates:return None
 db=sqlite3.connect('file:'+str(DB)+'?mode=ro&immutable=1',uri=True);db.row_factory=sqlite3.Row
 placeholders=','.join('?'*len(candidates))
 objects=db.execute(f'SELECT * FROM objects WHERE address_norm IN ({placeholders})',candidates).fetchall()
 if not objects:db.close();return None
 named=[]
 for row in objects:
  source_names=json.loads(row['object_names']);score=compatible_name(source_names,names or [])
  if score:named.append((row,score))
 objects=[item[0] for item in named]
 if not objects:db.close();return None
 # More than one source address for one outline is not silently combined.
 if len(objects)>1:
  db.close();return dict(match_status='ambiguous',message='Pronađeno je više mogućih ISGE adresa za ovaj obris; potrošnja nije zbrojena.',candidate_addresses=[r['address'] for r in objects])
 obj=objects[0];match_score=named[0][1];rows=db.execute('SELECT * FROM monthly WHERE address_norm=? ORDER BY year,month,fuel',(obj['address_norm'],)).fetchall();db.close()
 by_period={};fuel_totals={};quality={'source_rows':0,'negative_rows':0,'missing_kwh_rows':0}
 for row in rows:
  idx=period_index(row['year'],row['month']);month=by_period.setdefault(idx,dict(index=idx,period=period_label(idx),year=row['year'],month=row['month'],energy_kwh=None,energy_cost_eur=None,water_quantity=None,fuels={},meter_count=0,negative_rows=0,missing_kwh_rows=0,source_rows=0))
  month['source_rows']+=row['source_rows'];month['negative_rows']+=row['negative_rows'];month['missing_kwh_rows']+=row['missing_kwh_rows']
  for key in quality:quality[key]+=row[key]
  if row['fuel'] in ENERGY_FUELS:
   month['meter_count']+=row['meter_count']
   if row['kwh'] is not None:
    month['energy_kwh']=(month['energy_kwh'] or 0)+row['kwh'];month['fuels'][row['fuel']]=round(row['kwh'],1);fuel_totals[row['fuel']]=fuel_totals.get(row['fuel'],0)+row['kwh']
   if row['cost'] is not None:month['energy_cost_eur']=(month['energy_cost_eur'] or 0)+row['cost']
  elif row['fuel']=='Voda' and row['quantity'] is not None:month['water_quantity']=(month['water_quantity'] or 0)+row['quantity']
 months=list(by_period.values())
 for month in months:
  for key in ['energy_kwh','energy_cost_eur','water_quantity']:month[key]=round(month[key],2) if month[key] is not None else None
 if not months:return None
 end=max(m['index'] for m in months if m['energy_kwh'] is not None);current=window(months,end);previous=window(months,end-12)
 current['energy_change_pct']=change(current,previous,'energy_kwh','energy_months');current['cost_change_pct']=change(current,previous,'energy_cost_eur','cost_months')
 area=None
 try:
  parsed=float(str(heated_area).replace('.','').replace(',','.'))
  if 5<=parsed<=100000:area=parsed
 except (TypeError,ValueError):pass
 current['orientation_kwh_m2']=round(current['energy_kwh']/area,1) if area and current['energy_kwh'] is not None and current['energy_months']>=10 else None
 top_fuel=max(fuel_totals,key=fuel_totals.get) if fuel_totals else None
 return dict(
  match_status='address_and_name',match_score=match_score,matched_address=obj['address'],city=obj['city'],object_names=json.loads(obj['object_names']),meter_count=obj['meter_count'],
  period=dict(first=months[0]['period'],last=months[-1]['period']),latest_12=current,previous_12=previous,top_fuel=top_fuel,
  monthly=[{k:v for k,v in m.items() if k!='index'} for m in months],anomalies=anomalies(months,weather_months()),quality=quality,
  area_basis='Grijana površina jedinog povezanog certifikata; obuhvat nije potvrđen.' if area else None,
  source=dict(publisher='Grad Zagreb',dataset='Podaci o potrošnji i trošku za objekte Grada Zagreba',period='01/2019.–06/2024.',license='Otvorena dozvola (OD)',url='https://data.gov.hr/ckan/hr/dataset/podaci-o-potrosnji-i-trosku-za-objekte-grada-zagreba',weather_publisher='NASA POWER',weather_url='https://power.larc.nasa.gov/docs/services/api/temporal/daily/'),
  limitations=['Potrošnja pripada javnom ISGE objektu i može obuhvatiti više dijelova ili brojila.','Negativne korekcije računa netirane su unutar mjeseca.','Vremenski kontekst je mrežna procjena za jednu točku Zagreba, ne senzor na objektu.','Odstupanje je statistički signal, ne potvrda kvara ili rasipanja.']
 )
