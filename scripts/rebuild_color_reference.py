"""Reprocess available originals/thumbnails through the browser's exact pipeline.
Input manifest: [{product_key,id,platform,file,original,source_object_key?,source_filename?}].
Raw files stay outside Git. Only measured colors and provenance are exported.
Run from a server serving this checkout; see scripts/README.md.
"""
import argparse, base64, collections, hashlib, json, pathlib, statistics, urllib.request
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--manifest',required=True)
parser.add_argument('--output',default='data/catalog/lip_color_reference_v2.json')
parser.add_argument('--base-url',default='http://127.0.0.1:8000')
parser.add_argument('--model-file')
args=parser.parse_args()
items=json.loads(pathlib.Path(args.manifest).read_text())
# Prefer originals when the same named photo also occurs as an embedded thumbnail.
seen=set();unique=[];duplicates=[]
for item in sorted(items,key=lambda x:not x.get('original',False)):
    name=pathlib.PurePosixPath(item.get('source_object_key') or item.get('source_filename') or item['id']).name
    key=(item['product_key'],name)
    if key in seen:duplicates.append(item['id']);continue
    seen.add(key);unique.append(item)
expected='0d9bd318e46987c3bdbfacae9e2c0f461cae1c6ac6ea6d43bbe541a91727e33f'
model_bytes=pathlib.Path(args.model_file).read_bytes() if args.model_file else None
if model_bytes:assert hashlib.sha256(model_bytes).hexdigest()==expected,'Invalid model checksum'
results=collections.defaultdict(list);excluded=collections.defaultdict(list)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
    page=browser.new_page()
    def remote(route):
        if model_bytes and 'resnet18.onnx' in route.request.url:
            route.fulfill(status=200,body=model_bytes,headers={'Content-Type':'application/octet-stream','Access-Control-Allow-Origin':'*'})
        else:
            with urllib.request.urlopen(route.request.url,timeout=60) as r:
                route.fulfill(status=r.status,body=r.read(),headers={'Content-Type':r.headers.get('Content-Type','application/octet-stream'),'Access-Control-Allow-Origin':'*'})
    page.route('https://cdn.jsdelivr.net/**',remote);page.route('https://huggingface.co/**',remote)
    page.goto(args.base_url+'/',wait_until='networkidle')
    for item in unique:
        raw=pathlib.Path(item['file']).read_bytes()
        data=base64.b64encode(raw).decode()
        result=page.evaluate('''async(data)=>{
          const {analyzeImageFile}=await import('./agents.js?v=20261006-auto-v2');
          const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
          return (await analyzeImageFile(new File([bytes],'reference.jpg',{type:'image/jpeg'}))).metrics;
        }''',data)
        provenance={k:v for k,v in item.items() if k in ['product_key','id','platform','original','source_object_key','source_filename','variant']}
        provenance['image_sha256']=hashlib.sha256(raw).hexdigest()
        if not result['roiDetected'] or (result.get('segmentationConfidence') is not None and result['segmentationConfidence']<.65):
            excluded[item['product_key']].append({**provenance,'reason':result.get('roiReason') or 'Automatic segmentation confidence below 0.65'})
        else:results[item['product_key']].append({**provenance,'metrics':result})
        print(item['product_key'],item['id'],'accepted' if result['roiDetected'] and (result.get('segmentationConfidence') or 1)>=.65 else 'excluded',flush=True)
    browser.close()
def median(xs):return statistics.median(xs)
def percentile(xs,p):
    xs=sorted(xs);index=(len(xs)-1)*p;lower=int(index);upper=min(lower+1,len(xs)-1)
    return round(xs[lower]+(xs[upper]-xs[lower])*(index-lower),2)
def summary(samples):
    m=[s['metrics'] for s in samples]
    if not m:return None
    import math
    hue=(math.degrees(math.atan2(sum(math.sin(math.radians(x['hue'])) for x in m),sum(math.cos(math.radians(x['hue'])) for x in m)))+360)%360
    return {'n':len(m),**{k:{name:percentile([x[k] for x in m],p) for name,p in [('p10',.1),('p25',.25),('median',.5),('p75',.75),('p90',.9)]} for k in ['saturation','brightness','sceneBrightness']},'hue':{'circular_center':round(hue,2),'observed_median':round(median([x['hue'] for x in m]),2)}}
products={}
for key in sorted({x['product_key'] for x in items}):
    samples=results[key];all_summary=summary(samples)
    center={'lab':[round(median([s['metrics']['lab'][i] for s in samples]),4) for i in range(3)],'rgb':[round(median([s['metrics']['rgb'][i] for s in samples])) for i in range(3)],'hue':all_summary['hue']['circular_center'],'saturation':all_summary['saturation']['median'],'brightness':all_summary['brightness']['median']} if samples else None
    products[key]={'pipeline':'auto-lips-v2','center':center,'samples':samples,'excluded':excluded[key],'all':all_summary,'platforms':{p:summary([s for s in samples if s['platform']==p]) for p in sorted({s['platform'] for s in samples})},'coverage':{'available_inputs':sum(x['product_key']==key for x in unique),'accepted':len(samples),'originals':sum(s.get('original',False) for s in samples),'thumbnails':sum(not s.get('original',False) for s in samples),'complete_corpus':False}}
out={'version':'2026-10-06-auto-lips-v2','pipeline':'auto-lips-v2','method':'BiSeNet semantic lip segmentation (upper/lower lips only), with MediaPipe geometric fallback. Median RGB converted to CIELAB; product center is coordinate-wise median Lab. Exclude failed or low-confidence selections.','model':{'source':'https://huggingface.co/jbrownkramer/face-parsing','revision':'4be031c61a22e801ab389ab9ccf954781772fd42','sha256':expected},'coverage_note':'Only retrievable API originals and embedded thumbnails were reprocessed. This is not the full historical corpus; no missing image inherits its old red-heuristic metrics.','duplicate_ids_excluded':duplicates,'products':products}
pathlib.Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('Accepted reference samples:',sum(len(p['samples']) for p in products.values()),'of',len(unique),'unique inputs',flush=True)
