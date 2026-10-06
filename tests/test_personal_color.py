"""P1/P2 share real-photo color/finish, including profile and variant changes.
Landmark detection is doubled; selection, data loading and pixel rendering are real.
HTTPS routes use the system-verifying Python client for this cloud's proxy CA.
"""
import base64,json,os,pathlib,subprocess,urllib.request
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TRUETONE_TEST_URL','http://127.0.0.1:8000').rstrip('/')
STUB='''export const OUTER=[61,0,291,17],INNER=[13,14];
export async function detectLipLandmarks(){const landmarks=Array.from({length:468},()=>({x:.5,y:.5}));
Object.assign(landmarks,{61:{x:.3,y:.64},291:{x:.7,y:.64},0:{x:.5,y:.56},17:{x:.5,y:.72},13:{x:.5,y:.63},14:{x:.5,y:.65},50:{x:.2,y:.4},280:{x:.8,y:.4}});return {landmarks,faces:1};}
export function createLipMask(lm,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='white';x.beginPath();x.ellipse(w*.5,h*.64,w*.2,h*.08,0,0,Math.PI*2);x.fill();x.globalCompositeOperation='destination-out';x.beginPath();x.ellipse(w*.5,h*.64,w*.12,h*.018,0,0,Math.PI*2);x.fill();return c;}
export function polygon(){}'''
NODE="""import fs from 'node:fs';import {attachLibraryLabels} from './library-tags.js';import {buildPersonalColor} from './personal-color.js';import {compareLipColor} from './color-similarity.js';
const labels=new Map(JSON.parse(fs.readFileSync('data/catalog/sample_tags_v1.json')).images.map(r=>[r.source_object_key,r]));const r=JSON.parse(fs.readFileSync('data/catalog/lip_color_reference_v3.json')).products['ysl-610'];const media=r.samples.map(s=>attachLibraryLabels({...s,thumb:s.thumbnail,referenceScore:compareLipColor(s.metrics,r).score},labels));console.log(JSON.stringify(buildPersonalColor({key:'ysl-610',media},{lip:'深唇',skin:'黄皮'})));"""
expected=json.loads(subprocess.check_output(['node','--input-type=module','-e',NODE],text=True))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for width,height in [(1280,900),(390,844)]:
  ctx=browser.new_context(viewport={'width':width,'height':height})
  ctx.add_init_script('sessionStorage.setItem("truetone-user-profile",JSON.stringify({lip:"深唇",skin:"黄皮",makeup:"淡妆",goal:"日常"}));')
  if BASE.startswith('https://'):
   def verified(route):
    with urllib.request.urlopen(route.request.url,timeout=30) as response:
     route.fulfill(status=response.status,body=response.read(),content_type=response.headers.get('Content-Type','application/octet-stream'))
   ctx.route(BASE+'/**',verified)
  ctx.route('**/lips.js*',lambda r:r.fulfill(status=200,content_type='application/javascript',body=STUB))
  ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.abort())
  ctx.route('https://*.fcapp.run/**',lambda r:r.fulfill(status=200,content_type='application/json',body='{"media":[]}',headers={'Access-Control-Allow-Origin':'*'}))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+'/#/selfie?p=ysl-610',wait_until='networkidle')
  assert page.locator('#consumer-shade').input_value()=='610'
  encoded=page.evaluate('''()=>{const c=document.createElement('canvas');c.width=400;c.height=500;const x=c.getContext('2d');x.fillStyle='#c9a68f';x.fillRect(0,0,400,500);x.fillStyle='#935b54';x.beginPath();x.ellipse(200,320,80,40,0,0,Math.PI*2);x.fill();x.fillStyle='#f4e6d5';x.fillRect(160,317,80,6);return c.toDataURL('image/png').split(',')[1]}''')
  page.locator('#consumer-selfie-input').set_input_files({'name':'fixture.png','mimeType':'image/png','buffer':base64.b64decode(encoded)})
  page.locator('#consumer-run').click();page.wait_for_selector('#consumer-result-photo',timeout=45000)
  assert page.locator('.preview-swatch').get_attribute('data-color')==expected['color']['hex']
  assert page.locator('.preview-swatch').get_attribute('data-finish')=='gloss'
  assert f"{expected['usedCount']} 张真实试色" in page.locator('.tryon-caption').inner_text()
  assert page.locator('.tryon-caption [data-color-sample]').evaluate_all('(a)=>a.map(x=>x.dataset.colorSample)')==[s['id'] for s in expected['samples']]
  preview=page.locator('#consumer-result-photo').get_attribute('src')
  page.locator('[data-view=original]').click();assert page.locator('#consumer-result-photo').get_attribute('src')!=preview
  page.locator('[data-view=tryon]').click();assert page.locator('#consumer-result-photo').get_attribute('src')==preview
  page.goto(BASE+'/#/shade/ysl-610',wait_until='networkidle');page.locator('#start-product-analysis').click();page.wait_for_selector('.personal-color-section')
  section=page.locator('.personal-color-section');assert section.get_attribute('data-personal-color')==expected['color']['hex']
  assert section.get_attribute('data-color-scope')=='personal'
  assert section.locator('[data-color-sample]').count()==5
  assert section.locator('[data-general-sample]').count()<=5
  assert '不参与本次取色' in section.locator('.general-color-evidence summary').inner_text()
  assert section.locator('[data-color-sample]').evaluate_all('(a)=>a.map(x=>x.dataset.colorSample)')==[s['id'] for s in expected['samples']]
  section.locator('.color-evidence:not(.general-color-evidence) > summary').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  if not BASE.startswith('https://'):
   section.screenshot(path=f'/tmp/truetone-color-{width}.png')
  # Reproduce the reported unconfirmed images: no accepted, reliable black-skin match.
  page.evaluate('sessionStorage.setItem("truetone-user-profile",JSON.stringify({lip:"中唇",skin:"黑皮",makeup:"淡妆"}))')
  page.goto(BASE+'/#/search',wait_until='networkidle');page.goto(BASE+'/#/shade/ysl-610',wait_until='networkidle')
  page.locator('#start-product-analysis').click();page.wait_for_selector('.personal-color-section')
  general=page.locator('.personal-color-section')
  assert '暂无已确认匹配' in general.locator('.personal-color-headline').inner_text()
  assert '通用颜色参考' in general.locator('h3').inner_text()
  assert general.get_attribute('data-color-scope')=='general'
  assert general.locator('figcaption').count()==5
  for text in general.locator('figcaption').all_text_contents():
   assert '原生唇色未说明' in text and '肤色判断把握较低' in text,text
   assert '条件尚未确认' not in text
  # Color matching only needs the two relevant fields, even without makeup.
  page.evaluate('sessionStorage.setItem("truetone-user-profile",JSON.stringify({lip:"深唇",skin:"黄皮"}))')
  page.goto(BASE+'/#/search',wait_until='networkidle');page.goto(BASE+'/#/shade/ysl-610',wait_until='networkidle')
  page.locator('#start-product-analysis').click();page.wait_for_selector('.personal-color-section')
  assert page.locator('.personal-color-section').get_attribute('data-personal-color')==expected['color']['hex']
  page.evaluate('sessionStorage.setItem("truetone-user-profile",JSON.stringify({lip:"浅唇",skin:"白皙",makeup:"淡妆"}))')
  page.goto(BASE+'/#/search',wait_until='networkidle');page.goto(BASE+'/#/shade/ysl-610',wait_until='networkidle')
  page.locator('#start-product-analysis').click();page.wait_for_selector('.personal-color-section')
  assert page.locator('.personal-color-section').get_attribute('data-personal-color')!=expected['color']['hex'],'Profile must refresh the color even when product data is cached'
  assert page.locator('.personal-color-section [data-color-sample]').count()==3
  assert '未凑满 5 张' in page.locator('.personal-color-copy').inner_text()
  page.goto(BASE+'/#/shade/lancome-274',wait_until='networkidle');page.locator('#start-product-analysis').click();page.wait_for_selector('#shade-preview-variant')
  assert page.locator('#shade-preview-variant').input_value()=='intimatte'
  assert page.locator('.personal-color-section .finish-label').inner_text()=='柔雾哑光'
  page.locator('#shade-preview-variant').select_option('cream');page.wait_for_function('document.querySelector(".personal-color-section .finish-label")?.textContent==="哑光"')
  assert int(page.locator('.personal-color-section').get_attribute('data-sample-count'))<=4
  assert '未凑满 5 张' in page.locator('.personal-color-copy').inner_text()
  # P2's upload entry keeps the exact selected version in P1.
  page.locator('a[href*="/selfie?p=lancome-274"]').click();page.wait_for_selector('#consumer-variant')
  assert page.locator('#consumer-variant').input_value()=='cream'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  print('PASS P1/P2 real-photo color consistency, profile refresh, mirror/matte and variant scarcity:',width,flush=True)
  ctx.close()
 browser.close()
