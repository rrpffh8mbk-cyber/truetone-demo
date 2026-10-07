"""A/B/C acceptance on real browser algorithms and real BiSeNet, not cached answers."""
import functools,hashlib,http.server,io,json,os,pathlib,threading,urllib.request
from PIL import Image
import numpy as np
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];BASE=os.environ.get('TRUETONE_TEST_URL','http://127.0.0.1:8000').rstrip('/');bench=json.loads((ROOT/'data/forensics/benchmark.json').read_text());inputs=json.loads(pathlib.Path(os.environ.get('TRUETONE_ORIGINAL_MANIFEST','/workspace/.cache/truetone-originals/manifest.json')).read_text())
class ModelServer(http.server.SimpleHTTPRequestHandler):
 def end_headers(self):self.send_header('Access-Control-Allow-Origin','*');super().end_headers()
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(ModelServer,directory='/workspace/.cache/truetone-models'));threading.Thread(target=server.serve_forever,daemon=True).start()
model=pathlib.Path('/workspace/.cache/truetone-models/face-parsing-resnet18.onnx');assert hashlib.sha256(model.read_bytes()).hexdigest()=='0d9bd318e46987c3bdbfacae9e2c0f461cae1c6ac6ea6d43bbe541a91727e33f'
network_cache={}
def remote(route):
 url=route.request.url
 if url not in network_cache:
  with urllib.request.urlopen(url,timeout=90) as r:network_cache[url]=(r.status,r.read(),r.headers.get('Content-Type','application/octet-stream'))
 status,body,ct=network_cache[url];route.fulfill(status=status,body=body,content_type=ct,headers={'Access-Control-Allow-Origin':'*'})
result=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for width,height in [(1280,900),(390,844)]:
  ctx=browser.new_context(viewport={'width':width,'height':height})
  if BASE.startswith('https://'):ctx.route(BASE+'/**',remote)
  ctx.route('https://cdn.jsdelivr.net/**',remote)
  ctx.route('**/models/resnet18.onnx',lambda r:r.fulfill(status=302,headers={'Access-Control-Allow-Origin':'*','Location':f'http://127.0.0.1:{server.server_port}/{model.name}'}))
  ctx.route('https://*.fcapp.run/**',lambda r:r.fulfill(status=200,body='{"media":[]}',content_type='application/json',headers={'Access-Control-Allow-Origin':'*'}))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def run(brand,shade,image,text):
   page.goto(BASE+'/#/seeded',wait_until='networkidle');page.wait_for_selector('#seed-run')
   page.locator('#seed-brand').fill(brand);page.locator('#seed-shade').fill(shade);page.locator('#seed-images').set_input_files(str(image));page.locator('#seed-text').fill(text);page.locator('#seed-run').click();page.wait_for_selector('.seed-report',timeout=240000)
   return {'color':page.locator('.seed-report').get_attribute('data-image-score'),'decision':page.locator('.seed-report').get_attribute('data-decision'),'headline':page.locator('.evidence-result-hero').inner_text(),'actions':page.locator('.seed-report > .forensic-actions').inner_text()}
  # A: inspect the actual overlay pixels, not merely whether an <img> was rendered.
  a=next(r for r in bench['records'] if r['phase']=='test' and r['kind']=='local_color_strong')
  value=run('兰蔻','274',ROOT/'data/forensics'/a['image'],'我是黄皮、深唇，薄涂颜色好看，对我来说适合淡妆。')
  assert page.locator('[data-forensic-status="local-change"]').count()==1
  uri=page.locator('.forensic-map').get_attribute('src');import base64
  overlay=np.asarray(Image.open(io.BytesIO(base64.b64decode(uri.split(',')[1]))).convert('RGB'));original=np.asarray(Image.open(ROOT/'data/forensics'/a['image']).convert('RGB'))
  changed=np.any(overlay!=original,axis=2);assert changed.sum()>20
  assert overlay[changed,0].mean()>original[changed,0].mean();assert overlay[changed,1].mean()>overlay[changed,2].mean(),'Orange highlighted pixels'
  assert value['decision']=='caution';assert '编辑过程' in value['actions'];page.locator('.forensic-panel').screenshot(path=f'/tmp/acceptance-A-{width}.png');result.append({'case':'A','width':width,**value,'orangePixels':int(changed.sum())});print('A:',width,value,flush=True)
  # B: detailed text must never turn unavailable source verification into an image pass.
  b=next(r for r in bench['records'] if r['kind']=='ai_generated')
  value=run('YSL','610',ROOT/'data/forensics'/b['image'],'我是黄皮、深唇，平时淡妆。薄涂奶茶棕，半小时后颜色变深，喝水会沾杯。颜色好看，对我来说需要打底。')
  assert page.locator('[data-forensic-status="source-unavailable"]').count()==1;assert page.locator('.forensic-map').count()==0
  visible=page.locator('.forensic-row').inner_text();assert '无法判定' in visible,'B requires an explicit abstention rather than just missing source'
  assert value['decision']!='reference','No unqualified reference headline on unavailable image verification';assert '无法核验' in value['headline'] or '无法判定' in value['headline'];page.locator('.forensic-panel').screenshot(path=f'/tmp/acceptance-B-{width}.png');result.append({'case':'B','width':width,**value});print('B:',width,value,flush=True)
  # C1: real official image => high independently computed colour similarity; absolute claims still trigger review.
  official=next(r for r in inputs if r['role']=='official' and r['product_key']=='ysl-610')
  value=run('YSL','610',pathlib.Path(official['file']),'任何肤色任何妆容都适合，谁涂谁显白，完全不沾杯，不会氧化，实物和图片一模一样。')
  assert int(value['color'])>=90,value;assert value['decision']=='caution';assert '文案承诺' in value['actions'];result.append({'case':'C-claims','width':width,**value});page.locator('.evidence-result-hero').screenshot(path=f'/tmp/acceptance-C-claims-{width}.png');print('C claims:',width,value,flush=True)
  # C2: same high-colour evidence, 274 version missing => clarify even if the photo matches an official.
  official=next(r for r in inputs if r['role']=='official' and r['product_key']=='lancome-274' and r['variant']=='intimatte')
  value=run('兰蔻','274',pathlib.Path(official['file']),'我是黄皮、深唇，平时淡妆。薄涂奶茶色，半小时后变深，喝水会沾杯。颜色好看，对我来说需要打底。')
  assert int(value['color'])>=90,value;assert value['decision']=='clarify';assert '确认产品线和版本' in value['actions'];assert '版本' in value['headline'];result.append({'case':'C-version','width':width,**value});print('C version:',width,value,flush=True)
  assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');ctx.close()
 browser.close()
server.shutdown();pathlib.Path('/tmp/truetone-acceptance-abc.json').write_text(json.dumps({'site':BASE,'realSegmentation':True,'evaluationType':'Known-case A/B/C acceptance regression, not independent accuracy','codeSha256':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['app.js','forensic-ui.js','trust-agent.js','visual-forensics.js']},'rows':result},ensure_ascii=False,indent=2));print('PASS all A/B/C requirements',flush=True)
