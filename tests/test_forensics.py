"""Browser parity, responsive localisation, real optional neural inference."""
import hashlib,json,os,pathlib,urllib.request,threading,http.server,functools
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];BASE=os.environ.get('TRUETONE_TEST_URL','http://127.0.0.1:8000').rstrip('/');REAL=os.environ.get('TRUETONE_REAL_FORENSICS')=='1';network_cache={}
def remote(route):
 url=route.request.url
 if url not in network_cache:
  with urllib.request.urlopen(url,timeout=120) as r:network_cache[url]=(r.status,r.read(),r.headers.get('Content-Type','application/octet-stream'))
 status,body,ct=network_cache[url];route.fulfill(status=status,body=body,content_type=ct,headers={'Access-Control-Allow-Origin':'*'})
if REAL:
 class LocalModel(http.server.SimpleHTTPRequestHandler):
  def end_headers(self):self.send_header('Access-Control-Allow-Origin','*');super().end_headers()
  def log_message(self,*args):pass
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(LocalModel,directory='/workspace/.cache/truetone-models'))
 threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for width,height in ([(1280,900)] if REAL else [(1280,900),(390,844)]):
  ctx=browser.new_context(viewport={'width':width,'height':height})
  if BASE.startswith('https://'):ctx.route(BASE+'/**',remote)
  if REAL:
   ctx.route('https://cdn.jsdelivr.net/**',remote)
   artifact=pathlib.Path('/workspace/.cache/truetone-models/deepfake-vit-quantized.onnx').read_bytes();assert hashlib.sha256(artifact).hexdigest()=='3519c22b9695f99ddc00821228eeac91239065a90bfbdb4917858b3ec1dcfc42'
   ctx.route('https://huggingface.co/**',lambda r:r.fulfill(status=302,headers={'Access-Control-Allow-Origin':'*','Location':f'http://127.0.0.1:{server.server_port}/deepfake-vit-quantized.onnx'}))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  if REAL:
   page.on('console',lambda m:print('Browser:',m.type,m.text[:500],flush=True))
   page.on('request',lambda r:print('Load:',r.url.split('?')[0][:160],flush=True) if ('cdn.jsdelivr.net' in r.url or 'huggingface.co' in r.url) else None)
  page.goto(BASE+'/forensics.html',wait_until='networkidle');page.wait_for_selector('[data-fixture="control"]')
  assert '40/60' in page.locator('#benchmark-summary').inner_text();assert '0/6' in page.locator('#benchmark-summary').inner_text()
  for kind,status in [('control','no-local-change'),('local_color_strong','local-change'),('splice','local-change'),('ai_generated','source-unavailable')]:
   page.locator('[data-fixture="'+kind+'"]').click();page.wait_for_selector('[data-forensic-status="'+status+'"]',timeout=60000)
   if status=='local-change':assert page.locator('.forensic-map').count()==1
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.locator('#forensic-result').screenshot(path=f'/tmp/truetone-forensic-{kind}-{width}.png')
  if REAL:
   page.locator('[data-generation-check]').click();page.wait_for_function('document.querySelector(".generation-result").textContent.includes("模型响应") || document.querySelector(".generation-result").textContent.includes("检查未完成")',timeout=180000)
   assert page.locator('.generation-result b').count(),page.locator('.generation-result').inner_text()
   text=page.locator('.generation-result').inner_text();assert '不是真' in text or '不是“假图概率”' in text
   assert '未出现较强响应' in text,'Known held-out miss remains a miss in the browser'
   page.locator('#forensic-result').screenshot(path='/tmp/truetone-forensic-real-model.png');print('Real browser ViT inference:',text,flush=True)
  assert not errors,errors
  ctx.close();print('Forensic browser parity:',width,'passed',flush=True)
 browser.close()
