"""Run with a checkout server on port 8000. Default: offline pipeline/UI regression.
For real model validation, also set TRUETONE_REAL_SAMPLE and TRUETONE_MODEL_FILE.
The real sample should be a blue-lip portrait crop; raw media is not kept in Git.
"""
import base64, hashlib, os, pathlib, urllib.request
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TRUETONE_TEST_URL','http://127.0.0.1:8000')
REAL=os.environ.get('TRUETONE_REAL_SAMPLE')
MODEL=os.environ.get('TRUETONE_MODEL_FILE')
NO_FACE="window.FaceMesh=class{setOptions(){} onResults(cb){this.cb=cb} async send(){this.cb({multiFaceLandmarks:[]})}};"
STUB="""export async function automaticLipMask(image){
 const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
 const x=c.getContext('2d');x.drawImage(image,0,0);const d=x.getImageData(0,0,1,1).data;
 if(d[0]===0&&d[1]===0&&d[2]===0)return {mask:null,reason:'No lips'};
 x.clearRect(0,0,c.width,c.height);x.fillStyle='white';x.fillRect(c.width*.2,c.height*.267,c.width*.6,c.height*.2);
 x.clearRect(c.width*.3,c.height*.35,c.width*.4,c.height*.034);
 return {mask:c,source:'semantic-lips',confidence:.9};
} """
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
    context=browser.new_context()
    if REAL:
        model=pathlib.Path(MODEL).read_bytes() if MODEL else None
        if model:assert hashlib.sha256(model).hexdigest()=='0d9bd318e46987c3bdbfacae9e2c0f461cae1c6ac6ea6d43bbe541a91727e33f'
        def remote(route):
            if model and 'resnet18.onnx' in route.request.url:
                route.fulfill(status=200,body=model,headers={'Content-Type':'application/octet-stream','Access-Control-Allow-Origin':'*'})
            else:
                with urllib.request.urlopen(route.request.url,timeout=60) as r:route.fulfill(status=r.status,body=r.read(),headers={'Content-Type':r.headers.get('Content-Type','application/octet-stream'),'Access-Control-Allow-Origin':'*'})
        context.route('https://cdn.jsdelivr.net/**',remote);context.route('https://huggingface.co/**',remote)
    else:
        context.add_init_script(NO_FACE)
        context.route('**/semantic-lips.js*',lambda r:r.fulfill(status=200,body=STUB,content_type='application/javascript'))
        context.route('https://cdn.jsdelivr.net/**',lambda r:r.abort())
    context.route('https://*.fcapp.run/**',lambda r:r.abort())
    for viewport in [{'width':1280,'height':900},{'width':390,'height':844}]:
        page=context.new_page();page.set_viewport_size(viewport);errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/',wait_until='networkidle')
        encoded=page.evaluate("""()=>{
          sessionStorage.setItem('truetone-user-profile',JSON.stringify({lip:'浅唇',skin:'黄皮',makeup:'淡妆'}));
          const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');
          x.fillStyle='#d0aa99';x.fillRect(0,0,400,300);x.fillStyle='#1423c8';x.fillRect(80,80,240,60);
          x.fillStyle='white';x.fillRect(120,105,160,10);x.fillStyle='#1423c8';x.fillRect(300,200,20,80);
          return c.toDataURL('image/png').split(',')[1];
        }""")
        data=pathlib.Path(REAL).read_bytes() if REAL else base64.b64decode(encoded)
        upload={'name':'blue-lip-closeup.png','mimeType':'image/png','buffer':data}
        page.goto(BASE+'/#/seeded',wait_until='networkidle')
        page.locator('#seed-brand').fill('ysl');page.locator('#seed-shade').fill('610')
        page.locator('#seed-text').fill('薄涂自然，很适合日常。')
        page.locator('#seed-images').set_input_files(upload)
        page.locator('#seed-run').click()
        page.wait_for_selector('.seed-report',timeout=180000)
        page.locator('.upload-diagnostics > summary').click()
        page.wait_for_selector('.image-evidence-detail')
        assert page.locator('.lip-selector').count()==0,'Automatic flow must not require manual selection'
        assert page.locator('.big-score').inner_text()=='0/100'
        text=page.locator('.image-evidence-detail').inner_text()
        assert '自动分割上唇和下唇' in text,text
        assert '颜色相似度 0/100' in text,text
        assert '旧红色筛选统计不参与评分' in page.locator('#seed-result').inner_text()
        before=page.locator('.image-evidence-detail img').get_attribute('src')
        page.locator('[data-show-roi]').click()
        assert page.locator('.image-evidence-detail img').get_attribute('src')!=before
        page.locator('#seed-run').click();page.wait_for_selector('.seed-report',timeout=20000)
        page.locator('.upload-diagnostics > summary').click();page.wait_for_selector('.image-evidence-detail')
        assert page.locator('.big-score').inner_text()=='0/100','Text and sample priors must not inflate similarity'
        page.goto(BASE+'/#/verify',wait_until='networkidle')
        blank=page.evaluate("""()=>{const c=document.createElement('canvas');c.width=100;c.height=100;c.getContext('2d').fillRect(0,0,100,100);return c.toDataURL().split(',')[1]}""")
        page.locator('#verify-input').set_input_files({'name':'blank.png','mimeType':'image/png','buffer':base64.b64decode(blank)})
        page.locator('#match-product').select_option('ysl-610');page.locator('#run-verify').click()
        page.wait_for_selector('#diag',timeout=180000)
        assert page.locator('.score-ring b').inner_text()=='—'
        assert page.locator('.lip-selector').count()==0
        assert not errors,errors
        print('PASS automatic close-up, 0 similarity, text isolation, ROI inspection, rerun and missing-region handling:',viewport,flush=True)
        page.close()
    browser.close()
