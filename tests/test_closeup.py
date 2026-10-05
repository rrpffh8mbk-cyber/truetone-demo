"""Browser checks: serve repository root on port 8000, then run this file.
Requires Python Playwright and Chromium; does not download models.
"""
import base64
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TRUETONE_TEST_URL', 'http://127.0.0.1:8000')
NO_FACE = """window.FaceMesh=class{setOptions(){} onResults(cb){this.cb=cb} async send(){this.cb({multiFaceLandmarks:[]})}};"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    for viewport in [{'width':1280,'height':900},{'width':390,'height':844}]:
        page = browser.new_page(viewport=viewport)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.add_init_script(NO_FACE)
        page.route('https://cdn.jsdelivr.net/**', lambda r:r.abort())
        page.route('https://*.fcapp.run/**', lambda r:r.abort())
        page.goto(BASE+'/', wait_until='networkidle')
        encoded = page.evaluate("""()=>{
          sessionStorage.setItem('truetone-user-profile',JSON.stringify({lip:'浅唇',skin:'自然中性',makeup:'淡妆'}));
          const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');
          x.fillStyle='#d0aa99';x.fillRect(0,0,400,300);x.fillStyle='#1423c8';x.fillRect(80,80,240,60);
          x.fillStyle='white';x.fillRect(120,105,160,10);x.fillStyle='#1423c8';x.fillRect(300,200,20,80);
          return c.toDataURL('image/png').split(',')[1];
        }""")
        upload={'name':'blue-lip-closeup.png','mimeType':'image/png','buffer':base64.b64decode(encoded)}
        page.goto(BASE+'/#/seeded',wait_until='networkidle')
        page.locator('#seed-brand').fill('ysl');page.locator('#seed-shade').fill('610')
        page.locator('#seed-images').set_input_files(upload)
        assert page.locator('.mark-lips').count()==1
        page.locator('#seed-run').click()
        dialog=page.locator('.lip-selector');dialog.wait_for(state='visible')
        assert dialog.locator('[data-action="confirm"]').is_disabled()
        box=dialog.locator('canvas').bounding_box()
        # Paint upper lip, clear it, then paint both lips excluding the white mouth.
        def stroke(y):
            page.mouse.move(box['x']+.3*box['width'],box['y']+y*box['height']);page.mouse.down()
            page.mouse.move(box['x']+.7*box['width'],box['y']+y*box['height'],steps=8);page.mouse.up()
        stroke(.3);dialog.locator('[data-action="clear"]').click()
        assert dialog.locator('[data-action="confirm"]').is_disabled()
        stroke(.3);stroke(.43)
        dialog.locator('[data-action="confirm"]').click()
        page.wait_for_selector('.image-evidence-detail',timeout=20000)
        text=page.locator('.image-evidence-detail').inner_text()
        assert '按你标记的唇部像素分析' in text,text
        assert '偏差较大' in text,text
        assert '很接近' not in text,text
        assert '与该色号样本库常见方向偏差较大' in text
        page.locator('#seed-run').click()
        page.wait_for_selector('.image-evidence-detail',timeout=20000)
        assert page.locator('.lip-selector').count()==0,'Saved selection must be reusable'
        page.goto(BASE+'/#/verify',wait_until='networkidle')
        page.locator('#verify-input').set_input_files(upload)
        page.locator('#match-product').select_option('ysl-610')
        page.locator('#run-verify').click()
        page.locator('.lip-selector [data-action="skip"]').click()
        page.wait_for_selector('#diag',timeout=20000)
        assert page.locator('.score-ring b').inner_text()=='—'
        assert '未能识别唇部' in page.locator('#verify-results').inner_text()
        assert not errors,errors
        print('PASS close-up brush, empty selection, warm-reference mismatch, rerun and skip:',viewport)
        page.close()
    browser.close()
