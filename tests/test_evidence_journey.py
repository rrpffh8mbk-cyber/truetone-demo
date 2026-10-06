"""Known evaluation examples. Not a blind validation or an accuracy estimate."""
import hashlib,json,os,pathlib,urllib.request
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TRUETONE_TEST_URL','http://127.0.0.1:8000').rstrip('/')
REAL=os.environ.get('TRUETONE_REAL_CASES')=='1'
STUB='''export async function automaticLipMask(image){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(c.width*.25,c.height*.35,c.width*.5,c.height*.20);return {mask:c,source:'semantic-lips',confidence:.95}}'''
# System-verifying HTTPS fetch used for the cloud proxy CA. No TLS bypass.
network_cache={}
def remote(route):
 url=route.request.url
 if url not in network_cache:
  with urllib.request.urlopen(url,timeout=60) as r:network_cache[url]=(r.status,r.read(),r.headers.get('Content-Type','application/octet-stream'))
 status,body,ct=network_cache[url];route.fulfill(status=status,body=body,content_type=ct,headers={'Access-Control-Allow-Origin':'*'})
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 rows=[]
 for width,height in ([(1280,900)] if REAL else [(1280,900),(390,844)]):
  ctx=browser.new_context(viewport={'width':width,'height':height},accept_downloads=True)
  if BASE.startswith('https://'):ctx.route(BASE+'/**',remote)
  if REAL:
   ctx.route('https://cdn.jsdelivr.net/**',remote)
   model=pathlib.Path(os.environ.get('TRUETONE_MODEL_FILE','/workspace/.cache/truetone-models/face-parsing-resnet18.onnx')).read_bytes()
   assert hashlib.sha256(model).hexdigest()=='0d9bd318e46987c3bdbfacae9e2c0f461cae1c6ac6ea6d43bbe541a91727e33f'
   ctx.route('**/models/resnet18.onnx',lambda r:r.fulfill(status=200,body=model,content_type='application/octet-stream'))
  else:
   ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.abort())
   ctx.route('**/semantic-lips.js*',lambda r:r.fulfill(status=200,body=STUB,content_type='application/javascript'))
  ctx.route('https://*.fcapp.run/**',lambda r:r.fulfill(status=200,body='{"media":[]}',content_type='application/json',headers={'Access-Control-Allow-Origin':'*'}))
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+'/',wait_until='networkidle');assert '哪条试色值得参考' in page.locator('h1').inner_text()
  assert page.locator('.benchmark-card').count()==3
  assert not page.locator('.auxiliary-entry').get_attribute('open')
  page.locator('#gateway-seeded').click();page.wait_for_selector('#seed-run')
  assert page.url.endswith('#/seeded'),'No compulsory profile before checking evidence'
  page.locator('#seed-brand').fill('Dior');page.locator('#seed-shade').fill('999')
  page.locator('#seed-text').fill('好看！');assert page.locator('#seed-run').is_disabled()
  page.locator('#seed-brand').fill('ysl');page.locator('#seed-shade').fill('610');page.locator('#seed-run').click()
  page.wait_for_selector('.seed-report');assert page.locator('.seed-report').get_attribute('data-text-score')=='0'
  assert page.locator('.seed-report').get_attribute('data-image-score')==''
  assert '尚未填写个人条件' in page.locator('#seed-result').inner_text()
  user={'lip':'浅唇','skin':'白皙','makeup':'浓妆'}
  page.evaluate('(p)=>sessionStorage.setItem("truetone-user-profile",JSON.stringify(p))',user)
  scores=[]
  for id in ['marketing','variant','experience']:
   page.goto(BASE+'/#/seeded?case='+id,wait_until='networkidle')
   page.wait_for_selector('.seed-report',timeout=240000)
   score=int(page.locator('.seed-report').get_attribute('data-text-score'));scores.append(score)
   assert page.evaluate('JSON.parse(sessionStorage.getItem("truetone-user-profile"))')==user
   assert '示例条件' in page.locator('.profile-summary-bar').inner_text()
   assert '深唇' in page.locator('.profile-summary-bar').inner_text()
   assert '无法仅凭最终成片验证' in page.locator('.text-assessment').inner_text()
   assert '无法' in page.locator('.cross-modal-notes').inner_text()
   if id=='marketing':
    assert page.locator('.seed-report').get_attribute('data-decision')=='caution'
    assert page.locator('[data-counter-review]').count()>0
   if id=='variant':
    assert '无法仅凭当前文字确定版本' in page.locator('.variant-detection').inner_text()
    assert page.locator('.seed-report').get_attribute('data-decision')=='clarify'
   page.locator('.upload-diagnostics > summary').click();page.wait_for_selector('.image-evidence-detail')
   notes=page.locator('.image-evidence-detail').inner_text();assert '颜色相似度' in notes
   if REAL:
    roi=page.locator('.image-evidence-detail img').get_attribute('src');page.locator('[data-show-roi]').click()
    assert page.locator('.image-evidence-detail img').get_attribute('src')!=roi
    image=page.locator('.seed-report').get_attribute('data-image-score')
    assert image!='','Actual model must find a usable lip region for these known examples'
    print('Measured actual-model case:',id,'text',score,'image',image,flush=True)
    rows.append({'case':id,'textScore':score,'imageColorSimilarity':int(image),'decision':page.locator('.seed-report').get_attribute('data-decision'),'roiNotes':notes,'crossModalNotes':page.locator('.cross-modal-notes').inner_text()})
    page.locator('.image-evidence-detail').screenshot(path='/tmp/truetone-case-roi-'+id+'.png')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   if not REAL:page.locator('#seed-result').screenshot(path=f'/tmp/truetone-evidence-{id}-{width}.png')
  assert scores[0]<scores[1]<scores[2],scores
  # Editing an example changes the actual result, while image score stays separate.
  color=page.locator('.seed-report').get_attribute('data-image-score')
  page.locator('#seed-text').fill('任何肤色任何妆容都适合，谁涂谁显白，完全不沾杯，不会氧化。')
  page.locator('#seed-run').click();page.wait_for_selector('.seed-report',timeout=240000)
  assert int(page.locator('.seed-report').get_attribute('data-text-score'))<scores[2]
  assert page.locator('.seed-report').get_attribute('data-image-score')==color
  assert page.locator('.seed-report').get_attribute('data-decision')=='caution'
  page.goto(BASE+'/#/shade/lancome-274',wait_until='networkidle');page.locator('#start-product-analysis').click();page.wait_for_selector('#top-media')
  assert '颜色相似度中位数' in page.locator('.score-label').inner_text()
  assert '内容参考价值' not in page.locator('.score-label').inner_text()
  page.locator('.brand-action-panel > summary').click()
  with page.expect_download() as info:page.locator('#download-brand-brief').click()
  download=info.value;brief=json.loads(pathlib.Path(download.path()).read_text())
  assert brief['productKey']=='lancome-274';assert brief['actions'][0]['id']=='version'
  assert '未验证转化' in brief['status'];assert brief['actions'][0]['evidence']['sampleIds']
  page.goto(BASE+'/',wait_until='networkidle');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  if not REAL:page.screenshot(path=f'/tmp/truetone-focus-home-{width}.png',full_page=True)
  assert not errors,errors
  print('PASS evidence entry, all three cases, edited rerun, separate scores, preserved profile and brand brief:',width,scores,flush=True)
  ctx.close()
 browser.close()
if REAL:
 out=pathlib.Path('data/evaluation');out.mkdir(exist_ok=True)
 files=['app.js','demo-cases.js','evidence-assessment.js','review-text.js','library-tags.js','personal-color.js','brand-actions.js','cross-modal.js','agents.js','data/catalog/lip_color_reference_v3.json','data/catalog/review_catalog_v2.json',*[str(f) for f in sorted(pathlib.Path('data/demo-cases').glob('*.jpg'))]]
 import subprocess
 result={'evaluationType':'known_demo_stress_cases_not_blind_validation','ruleVersion':'evidence-reference-v1','baseCommitBeforeChanges':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'workingTreeIncludesEvaluationChanges':True,'modelSha256':hashlib.sha256(model).hexdigest(),'inputSha256':{f:hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest() for f in files},'profile':{'skin':'黄皮','lip':'深唇','makeup':'淡妆'},'results':rows,'limitations':'No independent human truth labels, calibrated trust probability, cross-product accuracy or business outcome was measured.'}
 (out/'demo_cases_v1.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print('Saved measured known-case results; website does not read them.',flush=True)
