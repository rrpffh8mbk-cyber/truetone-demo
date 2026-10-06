"""Inventory extracted data_original assets without storing raw media in Git."""
import argparse, hashlib, json, pathlib, re
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--output',required=True);a=p.parse_args()
root=pathlib.Path(a.root)
labels={'cream_gift':'兰蔻 #274 声色限定原声裸茶','cream':'兰蔻 #274 黑管哑光','intimatte':'兰蔻 #274 粉金管 Intimatte','unknown':''}
def product(path):
 name=str(path).lower().replace('_','-')
 for key in ['ysl-1936','ysl-610','lancome-274','lancome-275']:
  if key in name:return key
 raise ValueError('Unmapped product: '+str(path))
def variant(path):
 text=str(path).lower()
 if 'cream_gift' in text:return 'cream_gift'
 if 'intimatte' in text:return 'intimatte'
 if 'cream' in text:return 'cream'
 return 'unknown'
items=[]
for folder,role,platform in [('color_official','official','官方'),('Data-XHS','sample','小红书'),('Data_clean_taobao','sample','淘宝')]:
 for file in sorted((root/folder).rglob('*')):
  if not file.is_file() or file.suffix.lower() not in ['.jpg','.jpeg','.png','.webp']:continue
  rel=file.relative_to(root).as_posix();key=product(rel);v=variant(rel)
  items.append({'product_key':key,'id':role+'-'+hashlib.sha256(rel.encode()).hexdigest()[:16],'role':role,'platform':platform,'file':str(file.resolve()),'original':True,'source_object_key':rel,'source_filename':file.name,'variant':v,'label':labels[v] or key.upper()+' 官方标准图'})
pathlib.Path(a.output).write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
print('Inventoried:',sum(x['role']=='sample' for x in items),'sample images and',sum(x['role']=='official' for x in items),'official images')
