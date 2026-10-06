"""Real model regression: complete official close-ups must not become corner-only ROIs.
Usage: python3 tests/test_real_official.py --manifest /private/manifest.json
"""
import argparse,base64,hashlib,json,pathlib,urllib.request
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--base-url',default='http://127.0.0.1:8000');a=p.parse_args()
items=[r for r in json.loads(pathlib.Path(a.manifest).read_text()) if r['role']=='official'];assert len(items)==6
model=pathlib.Path('models/resnet18.onnx').read_bytes();assert hashlib.sha256(model).hexdigest()=='0d9bd318e46987c3bdbfacae9e2c0f461cae1c6ac6ea6d43bbe541a91727e33f'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True);page=b.new_page()
 def remote(route):
  with urllib.request.urlopen(route.request.url,timeout=90) as r:route.fulfill(status=r.status,body=r.read(),content_type=r.headers.get('Content-Type','application/octet-stream'))
 page.route('https://cdn.jsdelivr.net/**',remote);page.route('**/models/resnet18.onnx',lambda r:r.fulfill(status=200,body=model,content_type='application/octet-stream'))
 page.goto(a.base_url+'/',wait_until='networkidle')
 for r in items:
  result=page.evaluate('''async ({data,key,variant})=>{const {analyzeImageFile}=await import('./agents.js');const {compareLipColor}=await import('./color-similarity.js');const catalog=await fetch('./data/catalog/lip_color_reference_v3.json').then(r=>r.json());const measured=await analyzeImageFile(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],'official.jpg',{type:'image/jpeg'}));return {metrics:measured.metrics,match:compareLipColor(measured.metrics,{...catalog.products[key],selectedVariant:variant})}}''',{'data':base64.b64encode(pathlib.Path(r['file']).read_bytes()).decode(),'key':r['product_key'],'variant':r['variant']})
  assert result['metrics']['roiDetected'] and result['metrics']['candidateRatio']>10,result
  assert result['match']['score']==100 and result['match']['officialVariant']==r['variant'],result
  print('PASS official close-up, substantial lips, correct SKU and 100 similarity:',r['source_filename'],flush=True)
 b.close()
