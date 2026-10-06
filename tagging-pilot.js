const fields = { lip: '原生唇色', skin: '肤色表现', makeup: '整体妆容', application: '涂法' };
const confidence = { high: '高', medium: '中', low: '低', unknown: '证据不足' };
const basisNames = { explicit_review_self_report_only: '评论自述', explicit_review_self_report: '评论自述', image_observation: '图片观察', user_requested_visual_heuristic: '图片规则' };
const storageKey = 'truetone-tagging-review-2026-10-06-pilot-v2';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
let data, reviews = {};
try {
  reviews = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
  if (typeof reviews !== 'object' || Array.isArray(reviews)) reviews = {};
} catch { reviews = {}; }

function labelRows(values, keys) {
  return keys.map(key => {
    const item = values[key];
    return `<div class="label-row"><div class="label-head"><span class="field-name">${fields[key]}</span><span class="tag">${escapeHtml(item.value)}</span><span class="confidence ${escapeHtml(item.confidence)}">${confidence[item.confidence]}</span>${basisNames[item.basis] ? `<span class="confidence">${basisNames[item.basis]}</span>` : ''}</div><p class="reason">${escapeHtml(item.reason)}</p>${item.evidence_quote ? `<p class="reason">依据：“${escapeHtml(item.evidence_quote)}”</p>` : ''}</div>`;
  }).join('');
}

function renderCard(sample) {
  const r = sample.review_text;
  const options = key => ['<option value="">暂未评价</option>', ...data.label_options[key].map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)].join('');
  return `<article class="card" data-number="${sample.number}">
    <div class="card-header"><span class="number">0${sample.number}</span><h2>${escapeHtml(sample.product_label)}</h2><span class="filename">${escapeHtml(sample.source_object_key.split('/').pop())}</span></div>
    <div class="card-body"><div>
      <button class="photo-button" data-view="${sample.number}" aria-label="放大查看第 ${sample.number} 张图片"><img src="${escapeHtml(sample.image_path)}" alt="第 ${sample.number} 张淘宝试色样本：${escapeHtml(sample.product_label)}" width="${sample.preview_size[0]}" height="${sample.preview_size[1]}"></button>
      <p class="photo-caption">点击放大 · 保留完整画面与比例，未裁出唇部。原图 ${sample.original_size.join(' × ')}。</p>
      <details class="source"><summary>查看来源文件</summary><p>${escapeHtml(sample.source_object_key)}</p><p>TXT：${escapeHtml(r.source_object_key)}</p></details>
    </div><div>
      <h3>试标结果 · 新规则</h3>
      <div class="final-labels">${labelRows(sample.labels.fields, ['lip', 'skin', 'makeup'])}</div>
      <details class="source image-evidence"><summary>展开图片观察记录</summary>${labelRows(sample.visual.fields, ['skin', 'makeup'])}<p>当前可见唇色（仅作外观描述，不用于原生唇色标签）：${escapeHtml(sample.visual.visible_lip_observation)}</p></details>
      <details class="text-evidence"><summary>展开同目录 TXT 与独立文字标签</summary>
        <p class="reason">文字置信度表示原文是否明确，不能作为视觉识别准确率。</p>
        <blockquote class="quote">${escapeHtml(r.raw)}</blockquote>
        ${labelRows(r.fields, ['lip', 'skin', 'makeup', 'application'])}
        <div class="topics">${r.topics.map(t => `<span class="topic">${escapeHtml(t.tag)}${t.scope === 'image_4_only' ? ' · 仅图四' : ''}</span>`).join('')}</div>
        ${r.topics.map(t => `<p class="topic-evidence">${escapeHtml(t.tag)}：“${escapeHtml(t.evidence_quote)}”${t.note ? `<br>${escapeHtml(t.note)}` : ''}</p>`).join('')}
        <p class="mapping">对应范围：${escapeHtml(r.mapping_note)}</p>
      </details>
      <div class="review"><h3>你的标签复核</h3><p class="reason">唇色核对评论，肤色与妆容核对图片及标注规则；可只填写有把握的项。</p><div class="review-fields">${['lip','skin','makeup'].map(key => `<label for="review-${sample.number}-${key}">${fields[key]}<select id="review-${sample.number}-${key}" data-sample="${sample.sample_id}" data-field="${key}">${options(key)}</select></label>`).join('')}</div></div>
    </div></div></article>`;
}

function validReview(sample, key) {
  const value = reviews[sample.sample_id]?.[key];
  return data.label_options[key].includes(value) ? value : null;
}

function updateCount() {
  let count = 0;
  for (const sample of data.samples) for (const key of ['lip','skin','makeup']) if (validReview(sample, key)) count++;
  document.querySelector('#review-count').textContent = count ? `已填写 ${count} / 15 项复核标签。` : '尚未填写复核标签。';
  document.querySelector('#export-review').disabled = !count;
}

function saveReviews() {
  updateCount();
  try { localStorage.setItem(storageKey, JSON.stringify(reviews)); }
  catch { document.querySelector('#review-count').textContent = '浏览器无法持久保存，请在离开前导出复核。'; return; }
}

async function start() {
  const response = await fetch(new URL('./data/catalog/tagging_pilot_v2.json', import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  data = await response.json();
  document.querySelector('#samples').innerHTML = data.samples.map(renderCard).join('');
  for (const select of document.querySelectorAll('[data-field]')) {
    const sample = data.samples.find(s => s.sample_id === select.dataset.sample);
    select.value = validReview(sample, select.dataset.field) || '';
    select.addEventListener('change', () => {
      const id = select.dataset.sample;
      reviews[id] ??= {};
      if (select.value) reviews[id][select.dataset.field] = select.value;
      else delete reviews[id][select.dataset.field];
      saveReviews();
    });
  }
  updateCount();
  const viewer = document.querySelector('#image-viewer');
  document.querySelector('#close-viewer').addEventListener('click', () => viewer.close());
  for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => {
    const sample = data.samples.find(s => s.number === Number(button.dataset.view));
    viewer.querySelector('img').src = sample.image_path;
    viewer.querySelector('img').alt = `第 ${sample.number} 张：${sample.product_label}`;
    viewer.querySelector('p').textContent = `第 ${sample.number} 张 · ${sample.product_label}`;
    viewer.showModal();
  });
  document.querySelector('#export-review').addEventListener('click', () => {
    const result = { pilot_version: data.version, schema_version: data.schema_version, reviewed_at: new Date().toISOString(), samples: data.samples.map(sample => ({ number: sample.number, sample_id: sample.sample_id, source_image_sha256: sample.source_image_sha256, prediction: sample.labels.fields, visual_prediction: sample.visual.fields, text_prediction: sample.review_text.fields, user_labels: Object.fromEntries(['lip','skin','makeup'].map(key => [key, validReview(sample,key)])) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + '\n'], {type:'application/json'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'truetone-five-image-review.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.querySelector('#reset-review').addEventListener('click', () => {
    reviews = {}; for (const select of document.querySelectorAll('[data-field]')) select.value = ''; saveReviews();
  });
}

start().catch(error => {
  document.querySelector('#samples').textContent = `试标记录加载失败：${error.message}。请刷新重试。`;
});
