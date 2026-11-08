"""Bounded OpenAI web-search agent for one already detected consumption anomaly."""
import json,os,re,urllib.error,urllib.request

API_URL='https://api.openai.com/v1/responses'
MODEL='gpt-6-luna'

class AgentError(Exception):
 def __init__(self,message,status=502):super().__init__(message);self.status=status

def configured():return bool(os.environ.get('OPENAI_API_KEY','').strip())

def _text_and_sources(response):
 texts=[];sources=[];seen=set()
 for item in response.get('output',[]):
  if item.get('type')!='message':continue
  for content in item.get('content',[]):
   if content.get('type')!='output_text':continue
   if content.get('text'):texts.append(content['text'].strip())
   for annotation in content.get('annotations',[]):
    if annotation.get('type')!='url_citation':continue
    url=annotation.get('url','').strip()
    if not url.startswith(('https://','http://')) or url in seen:continue
    seen.add(url);sources.append(dict(title=(annotation.get('title') or url)[:240],url=url))
 text='\n\n'.join(filter(None,texts))
 text=re.sub(r'(?m)^#{1,6}\s*','',text)
 text=re.sub(r'\s*\(\[[^\]]+\]\(https?://[^)]+\)\)','',text)
 return text.strip(),sources

def research(building,anomaly,api_key=None,opener=urllib.request.urlopen):
 key=(api_key if api_key is not None else os.environ.get('OPENAI_API_KEY','')).strip()
 if not key:raise AgentError('Internetski agent nije konfiguriran: OPENAI_API_KEY nije dostupan servisu.',503)
 prompt=f"""Istraži moguće javno dokumentirane razloge odstupanja potrošnje energije za ovu zgradu i mjesec.

Zgrada: {building['name']}
Adresa: {building['address']}, Zagreb
Razdoblje: {anomaly['period']}
Potrošnja: {anomaly['value_kwh']} kWh
Sezonski medijan: {anomaly['baseline_kwh']} kWh
Odstupanje: {anomaly['difference_pct']}%
Lokalni podatkovni kontekst: {json.dumps(anomaly.get('reasons',[]),ensure_ascii=False)}

Obavezno pretraži web. Prioritet daj službenoj stranici ustanove, Gradu Zagrebu, državnim izvorima i vjerodostojnim arhivskim objavama. Traži događaje vremenski vezane uz navedeni mjesec: zatvaranje, promjenu radnog vremena, obnovu, radove, kvar, preseljenje, veći program ili promjenu načina korištenja. Ne predstavljaj vremensku korelaciju kao uzrok. Ako nema izravnog dokaza, to jasno napiši.

Odgovori na hrvatskom, najviše 220 riječi, u tri kratka odjeljka: "Pronađeno", "Što to može značiti" i "Ograničenje". Svaku konkretnu tvrdnju potkrijepi citatom web izvora."""
 body=json.dumps(dict(
  model=MODEL,store=False,reasoning=dict(effort='low'),tools=[dict(type='web_search',external_web_access=True)],
  tool_choice='required',max_tool_calls=4,max_output_tokens=900,
  include=['web_search_call.action.sources'],input=prompt
 ),ensure_ascii=False).encode()
 request=urllib.request.Request(API_URL,data=body,method='POST',headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','User-Agent':'Razred-na-karti/working-copy anomaly research'})
 try:
  with opener(request,timeout=90) as response:payload=json.loads(response.read())
 except urllib.error.HTTPError as error:
  detail=''
  try:detail=json.loads(error.read()).get('error',{}).get('message','')
  except Exception:pass
  raise AgentError('OpenAI pretraga nije uspjela'+(': '+detail[:240] if detail else '.'),502) from error
 except (OSError,ValueError,json.JSONDecodeError) as error:raise AgentError('OpenAI pretraga trenutačno nije dostupna.',502) from error
 if payload.get('status') not in (None,'completed'):raise AgentError('OpenAI pretraga nije dovršena.',502)
 text,sources=_text_and_sources(payload)
 if not text:raise AgentError('Agent nije vratio čitljiv odgovor.',502)
 return dict(model=payload.get('model',MODEL),text=text,sources=sources,response_id=payload.get('id'))
