"""Audit all source text rows and build a sanitized, traceable review catalog.
Uses review-text.js for conservative author tags, polarity and claim counting.
Questions never assign their attributes to the respondent or associated photo.
"""
import argparse,csv,hashlib,json,pathlib,re,subprocess,collections
import openpyxl
REPO=pathlib.Path(__file__).resolve().parents[1]

def clean(text):
 return re.sub(r'https?://\S+','[链接已省略]',str(text or '').replace('\\n','\n').replace('\\t','\t')).strip()
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def product(path):
 key=str(path).lower().replace('_','-')
 return next(p for p in ('ysl-610','ysl-1936','lancome-274','lancome-275') if p in key)
def variant(path):
 key=str(path).lower()
 return next((v for v in ('cream_gift','intimatte','cream') if v in key),'unknown')
def canonical(text):return re.sub(r'\s+','',text)

def build(root):
 rows=[];source_counts=collections.Counter()
 def add(path,text,kind,platform,number,question='',sku='',repeat=False,post_id=None,sheet=None):
  text=clean(text)
  if not text:return
  source_counts[kind]+=1
  key=path.relative_to(root).as_posix()
  rows.append({'product_key':product(path),'variant':variant(path),'platform':platform,'type':kind,
   'text':text,'question':clean(question),'sku':clean(sku),'repeatBuyer':repeat,
   'source':{'object_key':key,'sha256':sha(path),'row':number,'sheet':sheet,'post_id':post_id}})
 for path in sorted((root/'Data_clean_taobao').rglob('*.csv')):
  if 'picture' in path.name:continue
  with path.open(encoding='utf-8-sig',newline='') as f:
   for number,row in enumerate(csv.DictReader(f),2):
    if '评价内容' in row:
     text=clean(row.get('评价内容'))
     if clean(row.get('追评内容')):text+='\n追评：'+clean(row['追评内容'])
     count=re.search(r'买过(\d+)次',row.get('购买次数',''))
     add(path,text,'评价','淘宝',number,sku=row.get('色号',''),repeat=row.get('新老客')=='回头客' or bool(count and int(count[1])>1))
    elif '回答内容' in row:
     add(path,row['回答内容'],'问大家回答','淘宝',number,question=row.get('问题内容',''))
 for path in sorted((root/'Data-XHS').rglob('*.xlsx')):
  book=openpyxl.load_workbook(path,read_only=True,data_only=True)
  for sheet in book:
   for number,row in enumerate(sheet.values,1):
    if number==1 or len(row)<2:continue
    ids=set(re.findall(r'(?:/item/|/explore/)([0-9a-f]{24})',str(row[0])))
    post_id=next(iter(ids)) if len(ids)==1 else None
    add(path,row[1],'正文','小红书',number,post_id=post_id,sheet=sheet.title)
    if len(row)>2:add(path,row[2],'评论','小红书',number,post_id=post_id,sheet=sheet.title)
  book.close()
 for path in sorted((root/'Data_clean_taobao').rglob('content.txt')):
  add(path,path.read_text(encoding='utf-8-sig'),'配图评价','淘宝',None)
 # The two black-tube exports repeat the same question/answer dataset. Keep
 # one family-level opinion with both sources, not two SKU-specific votes.
 shared={}
 for row in rows:
  if row['type']=='问大家回答' and row['product_key']=='lancome-274' and row['variant'] in ('cream','cream_gift'):
   shared.setdefault((canonical(row['text']),canonical(row['question'])),set()).add(row['variant'])
 for row in rows:
  if row['type']=='问大家回答' and row['product_key']=='lancome-274' and len(shared.get((canonical(row['text']),canonical(row['question'])),set()))>1:
   row['source']['export_variant']=row['variant'];row['variant']='unknown'
 labels=json.loads((REPO/'data/catalog/sample_tags_v1.json').read_text())
 curated={}
 for image in labels['images']:
  if image['review_text'].get('raw') and image['review_text']['status'] in ('author_body','review_body'):
   key=(image['product_key'],image['variant'],canonical(image['review_text']['raw']))
   curated[key]={k:v for k,v in image['review_fields'].items() if k in ('lip','skin','makeup') and v['value']!='不确定'}
 dedup={}
 for row in rows:
  key=(row['product_key'],row['variant'],canonical(row['text']),canonical(row['question']))
  if key in dedup:
   old=dedup[key];old['sources'].append(row['source']);old['repeatBuyer']|=row['repeatBuyer']
   continue
  text_sha=hashlib.sha256((row['product_key']+'|'+row['variant']+'|'+row['text']+'|'+row['question']).encode()).hexdigest()
  row.update({'id':'review-'+text_sha[:16],'sources':[row.pop('source')],'text_sha256':text_sha})
  selected=curated.get((row['product_key'],row['variant'],canonical(row['text'])))
  if selected is not None:row['curatedFields']=selected
  row['variant_scope']='known_product_line' if row['variant']!='unknown' else 'family_only'
  if row['product_key']=='lancome-274' and row['variant']=='intimatte' and re.search(r'(?:我(?:买过|用过|买的)|买的|之前买过).*274.*(?:唇釉|镜面)',row['text']):
   row['variant_scope']='cross_variant';row['scope_note']='作者引用另一款 274 唇釉，不作为粉金管的精确版本结论。'
  dedup[key]=row
 rows=list(dedup.values())
 code="""import fs from 'node:fs';import {reviewTextAssessment} from './review-text.js';const rows=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(rows.map(r=>({...r,...reviewTextAssessment(r.text,{question:r.question,curatedFields:r.curatedFields})}))));"""
 rows=json.loads(subprocess.run(['node','--input-type=module','-e',code],cwd=REPO,input=json.dumps(rows,ensure_ascii=False),text=True,capture_output=True,check=True).stdout)
 overrides_path=REPO/'data/catalog/review_audit_overrides_v1.json'
 overrides=json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
 for row in rows:
  row.pop('curatedFields',None)
  target=row['product_key'].split('-')[-1]
  mentioned=set(re.findall(r'(?<!\d)(\d{3,4})(?!\d)',row['text']))
  other_shades=mentioned-{target}
  question_shades=set(re.findall(r'(?<!\d)(\d{3,4})(?!\d)',row['question']))
  row['product_scope']='target_context'
  if other_shades and target not in mentioned:
   row['product_scope']='other_or_unspecified_product'
  elif row['type']=='问大家回答' and target not in mentioned and question_shades and question_shades!={target}:
   row['product_scope']='uncertain_comparison'
  if other_shades or row['product_scope']!='target_context':
   row['claims']={};row['claim_scope_note']='包含其他色号或问题归属不明确，未自动把适配意见计入目标色号。'
  if row['id'] in overrides:
   item=overrides[row['id']];assert item['text_sha256']==row['text_sha256']
   row.update(item['corrections']);row['audit_note']=item['note']
  row['audit_method']='shared_conservative_text_rules_and_reviewed_photo_author_evidence'
 products={}
 for key in ('ysl-610','ysl-1936','lancome-274','lancome-275'):
  subset=[r for r in rows if r['product_key']==key]
  products[key]={'review_count':len(subset),'reviews':subset,'keywordCounts':dict(collections.Counter(word for r in subset if r['product_scope']=='target_context' for word in ['深唇','浅唇','素颜','薄涂','厚涂','氧化','拔干','沾杯','色差','自然光'] if word in r['text'])),
   'reviewQuality':{k:sum(bool(r[k]) for r in subset) for k in ('repeatBuyer','negativeEvidence','genericTemplate')},
   'consumerDifferenceMentions':sum(any(t['key']=='color_difference' and t['polarity']=='reported' for t in r['topics']) for r in subset if r['product_scope']=='target_context')}
 result={'version':'2026-10-06-reviewed-text-v2','method':'All nonempty CSV/XLSX/TXT text rows audited with conservative shared rules. Exact within-product/variant text+question duplicates merged, sources retained. Photo-author tags reused only by exact text equality. Questions/recommendations never infer author traits. Negative experiences remain eligible evidence; no positivity-to-authenticity inference.',
  'summary':{'source_text_rows':sum(source_counts.values()),'source_kinds':dict(source_counts),'deduplicated_records':len(rows),'generic_records':sum(r['genericTemplate'] for r in rows),'manual_corrections':len(overrides)},'products':products}
 output=REPO/'data/catalog/review_catalog_v2.json';output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(result['summary'],ensure_ascii=False))
 # Claims are opinions, separate from author profile tags; keep exact opposing quotes.
 old=json.loads((REPO/'data/catalog/evidence_claims_v1.json').read_text())
 entries={}
 for key,entry in products.items():
  claims={}
  for field,label in [('yellow_skin','黄皮是否适合'),('deep_lip','深唇是否适合'),('bare_face','素颜是否适合')]:
   eligible=[r for r in entry['reviews'] if field in r['claims']]
   support=[r for r in eligible if r['claims'][field]['stance']=='support'];oppose=[r for r in eligible if r['claims'][field]['stance']=='oppose']
   def examples(records):return [{'platform':r['platform'],'variant':r['variant'],'variant_scope':r['variant_scope'],'type':r['type'],'text':(r['question']+' — ' if r['question'] else '')+r['text'],'review_id':r['id']} for r in records[:3]]
   claims[field]={'label':label,'support_count':len(support),'oppose_count':len(oppose),'support_examples':examples(support),'oppose_examples':examples(oppose)}
  entries[key]={'dedup_text_records':entry['review_count'],'claims':claims}
  if key=='lancome-274':
   vm=old['products'][key]['variant_model']
   posts=[r for r in entry['reviews'] if r['type']=='正文']
   glaze=[r for r in posts if re.search(r'唇釉|镜面',r['text'])]
   small=[r for r in posts if '小蛮腰' in r['text']]
   vm['xiaohongshu'].update({'main_posts':len(posts),'explicit_lipglaze_or_mirror_posts':len(glaze),'explicit_xiaomanyao_posts':len(small),'no_clear_variant_posts':sum(not re.search(r'唇釉|镜面|小蛮腰|粉金管|黑管',r['text']) for r in posts)})
   entries[key]['variant_model']=vm
 claims={'version':'2026-10-06-text-evidence-v2','method':{'counting':'Deduplicate by product, variant, exact author text and question. Count only explicit suitability stances; ambiguous statements excluded. Recommendations count as opinions, never author identity.','display_note':'支持/相悖计数为文本证据摘要，不是消费者总体比例；版本不明或跨版本记录只作家族意见。'},'products':entries}
 (REPO/'data/catalog/evidence_claims_v2.json').write_text(json.dumps(claims,ensure_ascii=False,indent=2)+'\n')
 return rows

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=pathlib.Path,required=True);args=parser.parse_args();build(args.root)
