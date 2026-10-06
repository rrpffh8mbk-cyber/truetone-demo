"""Analyze originals and official photos through the browser's shared pipeline.
Raw files/ROI views remain in a local cache. Only accepted thumbnails, color
measurements and the complete usage ledger are written to the public checkout.
"""
import argparse, base64, collections, concurrent.futures, csv, hashlib, json, pathlib, statistics, urllib.request
from PIL import Image, ImageOps
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--output',default='data/catalog/lip_color_reference_v3.json');p.add_argument('--base-url',default='http://127.0.0.1:8000');p.add_argument('--model-file');p.add_argument('--workers',type=int,default=4);p.add_argument('--cache-dir',default='/workspace/.cache/truetone-rebuild-v3');a=p.parse_args()
items=json.loads(pathlib.Path(a.manifest).read_text());cache=pathlib.Path(a.cache_dir);cache.mkdir(parents=True,exist_ok=True)
measurement_code=pathlib.Path('agents.js').read_text().split('export function runFourAgents')[0].encode()
code_hash=hashlib.sha256(measurement_code+b''.join(pathlib.Path(n).read_bytes() for n in ['semantic-lips.js','lips.js'])).hexdigest()[:16]
expected='0d9bd318e46987c3bdbfacae9e2c0f461cae1c6ac6ea6d43bbe541a91727e33f'
model=pathlib.Path(a.model_file).read_bytes() if a.model_file else None
if model:assert hashlib.sha256(model).hexdigest()==expected,'Invalid model checksum'

def analyze(chunk):
 out=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True);page=browser.new_page()
  def remote(route):
   with urllib.request.urlopen(route.request.url,timeout=90) as r:route.fulfill(status=r.status,body=r.read(),headers={'Content-Type':r.headers.get('Content-Type','application/octet-stream'),'Access-Control-Allow-Origin':'*'})
  page.route('https://cdn.jsdelivr.net/**',remote)
  if model:page.route('**/models/resnet18.onnx',lambda r:r.fulfill(status=200,body=model,content_type='application/octet-stream'))
  page.goto(a.base_url+'/',wait_until='networkidle')
  for item in chunk:
   raw=pathlib.Path(item['file']).read_bytes();sha=hashlib.sha256(raw).hexdigest();cached=cache/(sha+'-'+code_hash+'.json');roi=cache/(sha+'-'+code_hash+'-roi.jpg')
   record={k:v for k,v in item.items() if k in ['product_key','id','role','platform','original','source_object_key','source_filename','variant','label']};record['image_sha256']=sha
   if cached.exists():result=json.loads(cached.read_text())
   else:
    try:
     # Detect unreadable source files separately from automatic ROI failures.
     with Image.open(item['file']) as image:image.verify()
     result=page.evaluate('''async data=>{const {analyzeImageFile}=await import('./agents.js');return await analyzeImageFile(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],'reference.jpg',{type:'image/jpeg'}))}''',base64.b64encode(raw).decode())
     roi.write_bytes(base64.b64decode(result['views']['roi'].split(',')[1]));result={'metrics':result['metrics']}
    except Exception as e:result={'error':'原图无法解码或分析失败（'+type(e).__name__+'）'}
    cached.write_text(json.dumps(result,ensure_ascii=False))
   # Older local diagnostic caches may contain paths in exception text. Keep
   # that diagnostic local; only a stable public reason enters the catalog.
   if result.get('error'):result={'error':'原图格式损坏、无法解码或分析失败'}
   out.append({**record,**result});print(item['role'],item['product_key'],item['source_filename'],'ROI' if result.get('metrics',{}).get('roiDetected') else 'excluded',flush=True)
  browser.close()
 return out
chunks=[items[i::a.workers] for i in range(a.workers)]
with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
 analyzed=[r for part in pool.map(analyze,chunks) for r in part]
analyzed.sort(key=lambda r:r['source_object_key'])
officials=collections.defaultdict(list)
for r in analyzed:
 if r['role']=='official':
  if not r.get('metrics',{}).get('roiDetected') or (r['metrics'].get('segmentationConfidence') or 0)<.65:raise RuntimeError('Official photo needs reliable automatic lips: '+r['source_filename'])
  officials[r['product_key']].append(r)
# Use the exact CIEDE2000 function and filtering rules used by the app.
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True);page=browser.new_page();page.goto(a.base_url+'/',wait_until='domcontentloaded')
 assessments=page.evaluate('''async ({records,officials})=>{const {assessReferenceSample}=await import('./color-similarity.js');return records.map(r=>r.error?{use:false,code:'unreadable_image',reason:r.error}:assessReferenceSample(r.metrics,officials[r.product_key],r.variant))}''',{'records':[r for r in analyzed if r['role']=='sample'],'officials':dict(officials)})
 browser.close()
samples=collections.defaultdict(list);excluded=collections.defaultdict(list);ledger=[];seen={}
thumbroot=pathlib.Path('data/reference-thumbnails');thumbroot.mkdir(parents=True,exist_ok=True)
for r,assessment in zip([r for r in analyzed if r['role']=='sample'],assessments):
 key=r['product_key'];duplicate=(key,r['variant'],r['image_sha256'])
 if duplicate in seen:assessment={'use':False,'code':'duplicate_image','reason':'同产品线重复图片','duplicateOf':seen[duplicate]}
 else:seen[duplicate]=r['id']
 r={**r,'use_for_color_reference':assessment['use'],'assessment':assessment}
 ledger.append({**{k:v for k,v in r.items() if k not in ['metrics','error','label']},'lab':r.get('metrics',{}).get('lab'),'roiSource':r.get('metrics',{}).get('roiSource'),'segmentationConfidence':r.get('metrics',{}).get('segmentationConfidence')})
 if assessment['use']:
  original=next(x['file'] for x in items if x['id']==r['id'])
  with Image.open(original) as image:
   thumb=ImageOps.contain(ImageOps.exif_transpose(image).convert('RGB'),(240,240));thumb.save(thumbroot/(r['id']+'.jpg'),quality=80,optimize=True)
  r['thumbnail']='./data/reference-thumbnails/'+r['id']+'.jpg';samples[key].append(r)
 else:excluded[key].append(r)
def pct(xs,p):
 xs=sorted(xs);i=(len(xs)-1)*p;lo=int(i);hi=min(lo+1,len(xs)-1);return round(xs[lo]+(xs[hi]-xs[lo])*(i-lo),2)
def summary(records):
 import math
 m=[r['metrics'] for r in records]
 if not m:return None
 hue=(math.degrees(math.atan2(sum(math.sin(math.radians(x['hue'])) for x in m),sum(math.cos(math.radians(x['hue'])) for x in m)))+360)%360
 return {'n':len(m),'hue':{'circular_center':round(hue,2),'observed_median':round(statistics.median(x['hue'] for x in m),2)},**{k:{name:pct([x[k] for x in m],q) for name,q in [('p10',.1),('p25',.25),('median',.5),('p75',.75),('p90',.9)]} for k in ['saturation','brightness','sceneBrightness']}}
products={}
for key in sorted(officials):
 accepted=samples[key];distribution=summary(accepted);base=accepted or officials[key]
 center={'lab':[round(statistics.median(r['metrics']['lab'][i] for r in base),4) for i in range(3)],'rgb':[round(statistics.median(r['metrics']['rgb'][i] for r in base)) for i in range(3)],'hue':(distribution or summary(base))['hue']['circular_center'],'saturation':(distribution or summary(base))['saturation']['median'],'brightness':(distribution or summary(base))['brightness']['median']}
 products[key]={'pipeline':'auto-lips-v3','officials':officials[key],'center':center,'samples':accepted,'excluded':excluded[key],'all':distribution,'platforms':{platform:summary([r for r in accepted if r['platform']==platform]) for platform in sorted({r['platform'] for r in accepted})},'variants':{v:summary([r for r in accepted if r['variant']==v]) for v in sorted({r['variant'] for r in accepted})},'coverage':{'available_inputs':len(accepted)+len(excluded[key]),'accepted':len(accepted),'excluded':len(excluded[key]),'originals':len(accepted),'thumbnails':0,'complete_corpus':True,'source_images_all_examined':True}}
out={'version':'2026-10-06-official-v3','pipeline':'auto-lips-v3','method':'Adaptive multi-scale BiSeNet upper/lower lip segmentation; connected-mouth cleanup; hue-neutral retry and MediaPipe fallback. All original images examined. Exclude failed selections, duplicates and official CIEDE2000 color distance >20. Known 274 variants use their own official; unknown variants use closest official without inferring identity. Official photos determine similarity; accepted sample statistics do not shift the standard.','model':{'source':'https://huggingface.co/jbrownkramer/face-parsing','sha256':expected},'source_release':{'repository':'rrpffh8mbk-cyber/truetone-demo','tag':'data_v1','title':'data_original'},'policy':{'max_official_delta_e':20,'min_segmentation_confidence':.65,'zero_similarity_delta_e':30,'meaning':'Not for color reference is an automatic color/ROI filter, not a judgment of authenticity or proof of bare lips.'},'coverage_note':'All 169 source sample files and 6 official photos examined. Exclusions remain auditable; videos and unreadable photos are not used as color samples.','products':products}
pathlib.Path(a.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
usage={'version':out['version'],'source_release':out['source_release'],'policy':out['policy'],'total_source_images':len(ledger),'accepted':sum(x['use_for_color_reference'] for x in ledger),'excluded':sum(not x['use_for_color_reference'] for x in ledger),'images':ledger}
pathlib.Path('data/catalog/sample_usage_v3.json').write_text(json.dumps(usage,ensure_ascii=False,indent=2)+'\n')
with pathlib.Path('data/catalog/sample_usage_v3.csv').open('w',encoding='utf-8-sig',newline='') as f:
 writer=csv.writer(f);writer.writerow(['product','variant','platform','source_file','use_for_color_reference','reason_code','reason','official_delta_e','official_reference','duplicate_of'])
 for r in ledger:
  x=r['assessment'];writer.writerow([r['product_key'],r['variant'],r['platform'],r['source_object_key'],r['use_for_color_reference'],x['code'],x['reason'],x.get('deltaE',''),x.get('officialId',''),x.get('duplicateOf','')])
print('RESULT',json.dumps({k:{'inputs':v['coverage']['available_inputs'],'accepted':len(v['samples']),'excluded':len(v['excluded']),'reasons':dict(collections.Counter(r['assessment']['code'] for r in v['excluded']))} for k,v in products.items()}),flush=True)
