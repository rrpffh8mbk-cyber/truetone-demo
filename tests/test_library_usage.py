"""Excluded/cached remote photos must not reappear in reference cards."""
import json,pathlib
from playwright.sync_api import sync_playwright
catalog=json.loads(pathlib.Path('data/catalog/lip_color_reference_v3.json').read_text())
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True);ctx=browser.new_context()
 ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.abort())
 outlier=catalog['products']['lancome-274']['excluded'][0]
 def old_api(route):
  route.fulfill(status=200,content_type='application/json',body=json.dumps({'media':[{'id':'old-excluded','object_key':outlier['source_object_key'],'url':'https://example.invalid/excluded.jpg','platform':'淘宝'}]}),headers={'Access-Control-Allow-Origin':'*'})
 ctx.route('https://*.fcapp.run/**',old_api)
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 for key,product in catalog['products'].items():
  page.goto('http://127.0.0.1:8000/#/shade/'+key,wait_until='networkidle')
  page.locator('#start-product-analysis').click()
  page.wait_for_selector('.sample-usage')
  usage=page.locator('.sample-usage');text=usage.inner_text();c=product['coverage']
  assert f'已检查 {c["available_inputs"]} 张：使用 {c["accepted"]} 张，不使用 {c["excluded"]} 张' in text,text
  usage.locator('summary').click()
  assert usage.locator('tbody tr').count()==c['excluded']
  for row in usage.locator('tbody tr').all():assert '不用于颜色参考' in row.inner_text()
  assert page.locator('#top-media img').count()>0
  for image in page.locator('#top-media img').all():assert 'excluded.jpg' not in image.get_attribute('src')
  assert not errors,errors
  print('PASS full coverage, exclusion marks and remote media filtering:',key,flush=True)
 response=page.request.get('http://127.0.0.1:8000/data/catalog/sample_usage_v3.csv');assert response.ok
 browser.close()
