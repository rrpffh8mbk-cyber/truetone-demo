"""Build traceable image labels from reviewed AI annotations and original archives.

No image labels are inferred by a pixel-color threshold in this script. The
checked-in annotations record AI image inspection and author-text selections;
source hashes prevent silently applying them to changed files.
"""
import argparse
import collections
import csv
import hashlib
import json
import pathlib
import re
import struct

import olefile
import openpyxl
from PIL import Image

REPO = pathlib.Path(__file__).resolve().parents[1]
FIELDS = ('lip', 'skin', 'makeup', 'application', 'lighting')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def doc_text(path):
    """Read Word 97 piece tables, retaining Unicode and compressed pieces."""
    with olefile.OleFileIO(path) as ole:
        wd = ole.openstream('WordDocument').read()
        flags = struct.unpack_from('<H', wd, 10)[0]
        pos = 32
        csw = struct.unpack_from('<H', wd, pos)[0]
        pos += 2 + csw * 2
        cslw = struct.unpack_from('<H', wd, pos)[0]
        pos += 2 + cslw * 4 + 2
        fc, length = struct.unpack_from('<II', wd, pos + 33 * 8)
        table = ole.openstream('1Table' if flags & 512 else '0Table').read()
        clx = table[fc:fc + length]
        pos = 0
        while pos < len(clx) and clx[pos] == 1:
            pos += 3 + struct.unpack_from('<H', clx, pos + 1)[0]
        if pos >= len(clx) or clx[pos] != 2:
            raise ValueError('Unsupported DOC piece table: ' + path.name)
        length = struct.unpack_from('<I', clx, pos + 1)[0]
        plc = clx[pos + 5:pos + 5 + length]
        count = (length - 4) // 12
        cps = struct.unpack_from('<' + 'I' * (count + 1), plc)
        pieces = []
        for index in range(count):
            offset = struct.unpack_from('<I', plc, 4 * (count + 1) + index * 8 + 2)[0]
            compressed = bool(offset & 0x40000000)
            offset = (offset & 0x3fffffff) // (2 if compressed else 1)
            size = (cps[index + 1] - cps[index]) * (1 if compressed else 2)
            pieces.append(wd[offset:offset + size].decode('latin1' if compressed else 'utf-16-le', 'replace'))
        return ''.join(pieces)


def title_of(link):
    match = re.search(r'【(.*?)\s+-\s+', str(link))
    title = match.group(1).strip() if match else ''
    # Some documents link to a profile rather than a titled post.
    return '' if '| 小红书' in title else title


def collect_text_sources(root):
    posts, folders = {}, {}
    for path in sorted((root / 'Data-XHS').rglob('*.xlsx')):
        book = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for sheet in book:
            for row_number, row in enumerate(sheet.values, 1):
                if len(row) < 2 or not row[0] or not row[1]:
                    continue
                ids = set(re.findall(r'(?:/item/|/explore/)([0-9a-f]{24})', str(row[0])))
                if len(ids) != 1:
                    continue
                body = str(row[1]).replace('\\n', '\n').replace('\\t', '\t')
                body = re.sub(r'https?://\S+', '[链接已省略]', body)
                posts[ids.pop()] = {
                    'title': title_of(row[0]), 'raw': body,
                    'source_object_key': path.relative_to(root).as_posix(),
                    'source_sha256': sha(path), 'sheet': sheet.title, 'row': row_number,
                    'status': 'author_body', 'role': 'post_author_body',
                    'association': 'exact_post_id_match',
                }
        book.close()
    for path in sorted((root / 'Data-XHS').rglob('*.doc')):
        text = doc_text(path)
        ids = set(re.findall(r'(?:/item/|/explore/)([0-9a-f]{24})', text))
        post_id = next(iter(ids)) if len(ids) == 1 else None
        if post_id in posts:
            folders[path.parent] = {
                **posts[post_id], 'post_id': post_id,
                'link_document': path.relative_to(root).as_posix(),
            }
        else:
            title = title_of(text)
            folders[path.parent] = {
                'title': title, 'raw': title, 'post_id': post_id,
                'source_object_key': path.relative_to(root).as_posix(),
                'source_sha256': sha(path),
                'status': 'title_only' if title else 'link_without_caption',
                'role': 'post_title_only' if title else 'link_document',
                'association': 'same_folder_title_only', 'body_missing': True,
            }
    for path in sorted((root / 'Data_clean_taobao').rglob('content.txt')):
        folders[path.parent] = {
            'title': '', 'raw': path.read_text(encoding='utf-8-sig'),
            'source_object_key': path.relative_to(root).as_posix(),
            'source_sha256': sha(path), 'status': 'review_body',
            'role': 'review_author', 'association': 'same_folder',
        }
    return folders


def unknown(reason, basis='missing_text'):
    return {'value': '不确定', 'confidence': 'unknown', 'reason': reason,
            'basis': basis, 'evidence_quote': None}


def reviewed_field(item, source):
    return {**item, 'basis': 'comment_self_report',
            'source_object_key': source['source_object_key']}


def resolve_labels(visual, text_fields):
    """Explicit author text wins; unknown text never erases available image cues."""
    text_fields = {key: item for key, item in text_fields.items()
                   if item.get('value') not in (None, '', '不确定')}
    lip = text_fields.get('lip', unknown('文字没有原生唇色深浅的明确自述，不从图片补猜。'))
    skin = text_fields.get('skin', visual['fields']['skin'])
    makeup = text_fields.get('makeup')
    state = text_fields.get('makeup_state')
    if makeup is None and state:
        # Explicit made-up state defeats the skin-uniformity heuristic. Eye
        # evidence can retain heavy makeup; otherwise use the user's light default.
        value = '浓妆' if visual['fields']['makeup']['value'] == '浓妆' else '淡妆'
        makeup = {
            **state, 'value': value, 'basis': 'comment_made_up_with_eye_rule',
            'confidence': 'medium' if visual['eye_visible'] else 'low',
            'reason': '文字明确本次带妆，优先于肤色均匀度判断；' +
                      ('可见浓眼妆，归为浓妆。' if value == '浓妆' else
                       '没有明确浓眼妆证据，按约定默认归为淡妆。'),
        }
    if makeup is None:
        makeup = visual['fields']['makeup']
    return {'lip': lip, 'skin': skin, 'makeup': makeup}


def inventory(root):
    for folder, role, platform in [('color_official', 'official', '官方'),
                                   ('Data-XHS', 'sample', '小红书'),
                                   ('Data_clean_taobao', 'sample', '淘宝')]:
        for path in sorted((root / folder).rglob('*')):
            if not path.is_file() or path.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.webp'):
                continue
            key = path.relative_to(root).as_posix()
            product = next((p for p in ('ysl-1936', 'ysl-610', 'lancome-274', 'lancome-275')
                            if p in key.lower().replace('_', '-')), None)
            if product is None:
                raise ValueError('Unmapped product: ' + key)
            lower = key.lower()
            variant = next((v for v in ('cream_gift', 'intimatte', 'cream') if v in lower), 'unknown')
            yield path, {'id': role + '-' + hashlib.sha256(key.encode()).hexdigest()[:16],
                         'source_object_key': key, 'source_filename': path.name,
                         'product_key': product, 'variant': variant, 'role': role,
                         'platform': platform}


def build(root, annotations_path, output):
    annotations = json.loads(annotations_path.read_text())
    schema = json.loads((REPO / 'data/catalog/tag_schema.json').read_text())
    usage = json.loads((REPO / 'data/catalog/sample_usage_v3.json').read_text())
    usage = {row['source_object_key']: row for row in usage['images']}
    sources = collect_text_sources(root)
    images = []
    seen = set()
    for number, (path, row) in enumerate(inventory(root), 1):
        key = row['source_object_key']
        seen.add(key)
        annotation = annotations['images'][key]
        if sha(path) != annotation['source_image_sha256']:
            raise ValueError('Image changed; AI inspection required: ' + key)
        observations = annotation['visual']
        visual = {
            'basis': 'image_only_user_requested_heuristic',
            'skin_uniformity': observations['skin_uniformity'],
            'eye_visible': observations['eye_visible'],
            'observation': observations['observation'],
            'fields': {
                'skin': {'value': observations['skin'], 'basis': 'image_observation',
                         'confidence': observations['confidence'],
                         'reason': observations['observation']},
                'makeup': {'value': observations['makeup'], 'basis': 'user_requested_visual_heuristic',
                           'confidence': observations['confidence'],
                           'reason': observations['observation']},
            },
        }
        source = sources.get(path.parent)
        folder_key = path.parent.relative_to(root).as_posix()
        selection = annotations['text_groups'].get(folder_key)
        if source:
            if not selection or not selection.get('reviewed') or selection['source_sha256'] != source['source_sha256']:
                raise ValueError('Text changed or unreviewed: ' + folder_key)
            for field, item in selection['fields'].items():
                if item['evidence_quote'] not in source['raw']:
                    raise ValueError('Text evidence does not match source: ' + folder_key)
        text_fields = {name: unknown('对应文字没有明确自述此项。') for name in FIELDS}
        explicit = {}
        if source and source['raw']:
            for field, item in selection['fields'].items():
                # Allow explicitly scoped per-photo evidence in future reviews.
                allowed = item.get('photo_filenames')
                if allowed and path.name not in allowed:
                    continue
                explicit[field] = reviewed_field(item, source)
                if field in text_fields:
                    text_fields[field] = explicit[field]
        labels = resolve_labels(visual, explicit)
        for field, label in labels.items():
            if label['value'] not in schema['fields'][field]['allowed']:
                raise ValueError('Invalid label: ' + key)
        conflicts = []
        for field in ('skin', 'makeup'):
            before, after = visual['fields'][field], labels[field]
            if (before['value'] != '不确定' and after['value'] != '不确定'
                    and before['value'] != after['value'] and after['basis'].startswith('comment')):
                conflicts.append({'field': field, 'image_value': before['value'],
                                  'final_value': after['value'], 'resolution': 'comment_wins',
                                  'evidence_quote': after['evidence_quote']})
        image_size = None
        image_status = 'readable'
        try:
            with Image.open(path) as raw:
                raw.load()
                image_size = list(raw.size)
        except (OSError, ValueError):
            image_status = 'unreadable'
        if (image_status == 'readable') != annotation['image_readable']:
            raise ValueError('Image decoding changed; review required: ' + key)
        color_usage = usage.get(key)
        images.append({
            **row, 'number': number, 'source_image_sha256': annotation['source_image_sha256'],
            'image_kind': annotation['image_kind'], 'image_status': image_status,
            'image_size': image_size,
            'tags': {field: label['value'] for field, label in labels.items()},
            'labels': {'fields': labels}, 'visual': visual,
            'review_text': source or {'raw': '', 'title': '', 'status': 'not_applicable_official' if row['role'] == 'official' else 'missing_source'},
            'review_fields': text_fields, 'text_makeup_state': explicit.get('makeup_state'),
            'text_notes': selection['notes'] if selection else [],
            'conflicts': conflicts, 'review_status': 'ai_labeled_user_unverified',
            'use_for_color_reference': color_usage['use_for_color_reference'] if color_usage else None,
            'color_assessment': color_usage['assessment'] if color_usage else {'code': 'official_standard', 'reason': '官方颜色标准，单独存放，不计入用户样本。'},
            'wearer_profile_evidence': row['role'] == 'sample' and annotation['image_kind'] == 'review_photo',
        })
    if seen != set(annotations['images']):
        raise ValueError('Image inventory changed; annotate all files before rebuilding')
    sample = [row for row in images if row['role'] == 'sample']
    summary = {
        'total_images': len(images), 'sample_images': len(sample),
        'official_images': len(images) - len(sample),
        'readable_images': sum(row['image_status'] == 'readable' for row in images),
        'unreadable_sample_images': sum(row['image_status'] == 'unreadable' for row in sample),
        'text_status_samples': dict(collections.Counter(row['review_text']['status'] for row in sample)),
        'sample_tag_counts': {field: dict(collections.Counter(row['tags'][field] for row in sample)) for field in ('lip', 'skin', 'makeup')},
        'conflict_images': sum(bool(row['conflicts']) for row in sample),
        'resolved_conflicts': sum(len(row['conflicts']) for row in sample),
        'color_reference_accepted': sum(row['use_for_color_reference'] for row in sample),
        'color_reference_excluded': sum(not row['use_for_color_reference'] for row in sample),
    }
    result = {'version': '2026-10-06-library-tags-v1', 'schema_version': schema['version'],
              'source_release': {'repository': 'rrpffh8mbk-cyber/truetone-demo', 'tag': 'data_v1', 'title': 'data_original'},
              'label_options': {key: schema['fields'][key]['allowed'] for key in ('lip', 'skin', 'makeup')},
              'tagging_policy': schema['tagging_policy'], 'summary': summary,
              'method': 'AI inspected images and folder-linked author text; source-hash-validated annotations; explicit author text overrides conflicting visual heuristic labels. Other commenters are excluded.',
              'accuracy': None, 'accuracy_note': '规则试标，尚无独立真实标签对照，未计算准确率。', 'images': images}
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    with output.with_suffix('.csv').open('w', encoding='utf-8-sig', newline='') as f:
        columns = ['id', 'role', 'platform', 'product_key', 'variant', 'source_object_key',
                   'image_status', 'lip', 'skin', 'makeup', 'lip_basis', 'skin_basis', 'makeup_basis',
                   'image_skin', 'image_makeup', 'conflicts', 'use_for_color_reference', 'comment']
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for row in images:
            writer.writerow({key: value for key, value in {
                **{k: row[k] for k in columns if k in row}, **row['tags'],
                **{field + '_basis': label['basis'] for field, label in row['labels']['fields'].items()},
                'image_skin': row['visual']['fields']['skin']['value'],
                'image_makeup': row['visual']['fields']['makeup']['value'],
                'conflicts': json.dumps(row['conflicts'], ensure_ascii=False),
                'comment': row['review_text']['raw'],
            }.items() if key in columns})
    print(json.dumps(summary, ensure_ascii=False))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, required=True)
    parser.add_argument('--annotations', type=pathlib.Path, default=REPO / 'data/catalog/labeling_annotations_v1.json')
    parser.add_argument('--output', type=pathlib.Path, default=REPO / 'data/catalog/sample_tags_v1.json')
    args = parser.parse_args()
    build(args.root.resolve(), args.annotations, args.output)
