"""Apply source-first review decisions without overwriting raw source claims."""
from pathlib import Path
import json,hashlib
def apply(projects,root):
 folder=Path(root)/'sources/independent-review-20261107'
 review=json.loads((folder/'decisions.json').read_text())
 refs=json.loads((folder/'fresh-sources.json').read_text())
 for ref in refs:
  assert 'error' not in ref,ref
  assert hashlib.sha256((folder/ref['file']).read_bytes()).hexdigest()==ref['sha256']
 indexed={r['source_id']:r for r in projects}
 for case in review['cases']:
  links=[]
  for sid in case['source_ids']:
   r=indexed[sid]
   if r.get('source_url'):links.append(dict(url=r['source_url'],label=r['source']))
  if case['case_id'] in ('ehrlich','draskovic','vranyczany'):
   links.append(dict(url='https://www.info.hazu.hr/events/redovita-skupstina-hrvatske-akademije-znanosti-i-umjetnosti-5/',label='HAZU · skupština 23. 4. 2026.'))
  for sid in case['source_ids']:
   indexed[sid]['independent_review']=dict(case_id=case['case_id'],classification=case['classification'],title=case['title'],explanation=case['explanation'],reviewed_on=review['reviewed_on'],sources=links)
   r=indexed[sid]
   if sid.startswith('mpgi-private:'):
    r['work_scope']=r['source_fields']['vrsta_obnove']
    r['evidence_rows']=[dict(label='Vrsta postupka u registru',value=r['source_fields']['vrsta_obnove'])]
   if case['case_id']=='visoka' and sid=='state-renewal:blok-visoka':
    r['outline_status_code']='recorded'
    r['outline_status_reason']='Projekt bloka u tijeku; izvor ne utvrđuje fazu radova po pojedinoj zgradi.'
   if sid=='hazu:gliptoteka':
    old=r.pop('source_disagreement',None)
    if old:r['reviewed_previous_warning']=old
   if sid=='hazu:ehrlich':
    r['source_disagreement']['explanation']=case['explanation']
 return review
