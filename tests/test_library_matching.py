"""The deployed application loads the catalog and applies the saved profile."""
import json,os,pathlib,urllib.request,subprocess
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TRUETONE_TEST_URL','http://127.0.0.1:8000').rstrip('/')
catalog=json.loads(pathlib.Path('data/catalog/sample_tags_v1.json').read_text())
reference=json.loads(pathlib.Path('data/catalog/lip_color_reference_v3.json').read_text())['products']['lancome-274']
records={r['source_object_key']:r for r in catalog['images']}
profile={'lip':'深唇','skin':'黑皮','makeup':'素颜'}
code="""import fs from 'node:fs';import {attachLibraryLabels,rankReferenceMedia} from './library-tags.js';import {compareLipColor} from './color-similarity.js';const labels=JSON.parse(fs.readFileSync('data/catalog/sample_tags_v1.json'));const r=JSON.parse(fs.readFileSync('data/catalog/lip_color_reference_v3.json')).products['lancome-274'];const records=new Map(labels.images.map(x=>[x.source_object_key,x]));const all=r.samples.filter(s=>s.variant==='intimatte').map(s=>attachLibraryLabels({...s,referenceScore:compareLipColor(s.metrics,{...r,selectedVariant:s.variant}).score,colorDistance:s.assessment.deltaE},records));process.stdout.write(JSON.stringify(rankReferenceMedia(all,{lip:'深唇',skin:'黑皮',makeup:'素颜'}).slice(0,3)));"""
expected=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],text=True))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for width,height in [(1280,900),(390,844)]:
  ctx=browser.new_context(viewport={'width':width,'height':height})
  ctx.add_init_script('sessionStorage.setItem("truetone-user-profile",'+json.dumps(json.dumps(profile))+');')
  ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.abort())
  ctx.route('https://*.fcapp.run/**',lambda r:r.fulfill(status=200,content_type='application/json',body='{"media":[]}',headers={'Access-Control-Allow-Origin':'*'}))
  if BASE.startswith('https://'):
   def verified(route):
    with urllib.request.urlopen(route.request.url,timeout=30) as response:
     route.fulfill(status=response.status,body=response.read(),content_type=response.headers.get('Content-Type','application/octet-stream'))
   ctx.route(BASE+'/**',verified)
  page=ctx.new_page();errors=[];catalog_loaded=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:catalog_loaded.append(r.status) if 'sample_tags_v1.json' in r.url else None)
  page.goto(BASE+'/#/shade/lancome-274',wait_until='networkidle')
  page.locator('#start-product-analysis').click()
  page.wait_for_selector('#top-media img')
  actual=page.locator('#top-media img').evaluate_all('(imgs)=>imgs.map(i=>i.getAttribute("src"))')
  assert actual==[s['thumbnail'] for s in expected],actual
  assert catalog_loaded==[200],catalog_loaded
  assert page.locator('#top-media').inner_text().count('综合推荐')==3
  assert page.locator('#reviews .review').count()>0
  page.locator('[data-prof=深唇]').click()
  for text in page.locator('#reviews .review p').all_text_contents():assert '适合深唇姐妹' not in text, 'Recommendation must not masquerade as author depth'
  assert '未稳定加载' not in page.locator('#reviews').inner_text()
  # A changed profile must rerank cached product data within the same session.
  other={'lip':'浅唇','skin':'白皙','makeup':'淡妆'}
  second_code=code.replace("{lip:'深唇',skin:'黑皮',makeup:'素颜'}", "{lip:'浅唇',skin:'白皙',makeup:'淡妆'}")
  second=json.loads(subprocess.check_output(['node','--input-type=module','-e',second_code],text=True))
  assert [r['id'] for r in second]!=[r['id'] for r in expected]
  page.evaluate('(profile)=>sessionStorage.setItem("truetone-user-profile",JSON.stringify(profile))',other)
  page.goto(BASE+'/#/search',wait_until='networkidle')
  page.goto(BASE+'/#/shade/lancome-274',wait_until='networkidle')
  page.locator('#start-product-analysis').click();page.wait_for_selector('#top-media img')
  assert page.locator('#top-media img').evaluate_all('(imgs)=>imgs.map(i=>i.getAttribute("src"))')==[r['thumbnail'] for r in second]
  assert catalog_loaded==[200], 'Labels should be cached, not fetched for every profile'
  assert not errors,errors
  page.goto(BASE+'/',wait_until='networkidle')
  options=page.locator('#profile-skin option').all_text_contents()
  assert options==['请选择','白皙','黄皮','黑皮'],options
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Mobile overflow'
  print('PASS app uses full-library profile labels, text-corrected matching and three skin options:',width,flush=True)
  ctx.close()
 browser.close()
