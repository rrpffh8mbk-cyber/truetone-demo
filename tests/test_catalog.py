"""Check full-corpus coverage, usage marks, SKU isolation and UI media eligibility."""
import collections, csv, json, pathlib, subprocess
root=pathlib.Path(__file__).resolve().parents[1]
ref=json.loads((root/'data/catalog/lip_color_reference_v3.json').read_text());usage=json.loads((root/'data/catalog/sample_usage_v3.json').read_text())
assert ref['pipeline']=='auto-lips-v3'
assert usage['total_source_images']==169 and len(usage['images'])==169
assert sum(len(p['officials']) for p in ref['products'].values())==6
assert usage['accepted']+usage['excluded']==169
assert len({r['id'] for r in usage['images']})==169
expected={'ysl-610':41,'ysl-1936':18,'lancome-274':84,'lancome-275':26}
for key,p in ref['products'].items():
 c=p['coverage'];assert c['complete_corpus'] and c['source_images_all_examined'] and c['available_inputs']==expected[key]
 assert c['accepted']==len(p['samples']) and c['excluded']==len(p['excluded'])
 for sample in p['samples']:
  assert sample['use_for_color_reference'] and sample['assessment']['use']
  assert sample['assessment']['deltaE']<=20 and sample['metrics']['colorPipeline']=='auto-lips-v3'
  assert (root/sample['thumbnail'].removeprefix('./')).is_file()
  if key=='lancome-274' and sample['variant']!='unknown':assert sample['assessment']['officialVariant']==sample['variant']
 for sample in p['excluded']:
  assert sample['use_for_color_reference'] is False and sample['assessment']['use'] is False
  assert sample['assessment']['reason'] and sample['assessment']['code']
# Recompute all eligibility decisions using the shared JS implementation.
script="""import fs from 'node:fs';import {assessReferenceSample} from './color-similarity.js';const ref=JSON.parse(fs.readFileSync('data/catalog/lip_color_reference_v3.json'));for(const p of Object.values(ref.products))for(const r of [...p.samples,...p.excluded]){if(['duplicate_image','unreadable_image'].includes(r.assessment.code))continue;const a=assessReferenceSample(r.metrics,p.officials,r.variant);if(a.use!==r.use_for_color_reference||a.code!==r.assessment.code||a.deltaE!==r.assessment.deltaE)throw Error(r.id)}console.log('PASS exact shared filtering decisions');"""
subprocess.run(['node','--input-type=module','-e',script],cwd=root,check=True)
with (root/'data/catalog/sample_usage_v3.csv').open(encoding='utf-8-sig',newline='') as f:assert len(list(csv.DictReader(f)))==169
serialized=json.dumps(ref)+json.dumps(usage)
assert all(x not in serialized for x in ['AccessKey','Signature=','Expires=','/workspace/','file:///'])
print('PASS 169-file coverage, 6 standards, all exclusion reasons, accepted thumbnails, known-SKU isolation and CSV ledger')
