# Five-image tagging pilot, revision 2

Preview: [tagging-pilot.html](../../tagging-pilot.html). Current records:
[tagging_pilot_v2.json](../catalog/tagging_pilot_v2.json). The original
[tagging_pilot_v1.json](../catalog/tagging_pilot_v1.json) remains an archive.

The five Taobao photos cover YSL 610, YSL 1936, Lancome 274 Cream,
Lancome 274 Intimatte and Lancome 275. This is a user-review pilot, not a random
accuracy benchmark. No accuracy has been calculated. These records await user
review and are not used for production personalized matching.

User-requested revision:

- Skin categories are `白皙`, `黄皮`, `黑皮`, with `不确定` for missing evidence.
  Explicit author self-report takes priority; the photograph supplements it.
  `我黄皮` maps directly to `黄皮` under this everyday classification.
- Native lip depth comes exclusively from explicit review-author self-report.
  Missing self-report stays `不确定`; visible lipstick color does not fill it.
- Makeup follows the requested visual heuristic. Uneven visible facial skin
  color yields `素颜`. Relatively even skin yields a made-up candidate; prominent
  eye makeup yields `浓妆`, light eye makeup yields `淡妆`, and absent eyes in
  this made-up branch yield `淡妆`. Uneven skin takes precedence over absent eyes.
  Illumination, filters, blur and natural skin appearance can affect the heuristic;
  labels retain reasons and qualitative confidence and are not verified makeup facts.

`labels.fields` stores the new field-specific result; `visual.fields` contains
only image-derived skin/makeup labels, and `review_text.fields` retains text
labels with exact quotes and scope. Original text, filename, source directory,
image hash and previews are unchanged. Vocabulary and policies are documented
in `data/catalog/tag_schema.json` (version `2026-10-06-v2`).

All 117 supplied Taobao JPGs have same-folder `content.txt` across 87 review
folders. Numbered-photo references retain their scope: the YSL 1936 pilot's
layering comment refers only to image four, while the folder only contains image
one. The Intimatte comment's deep-lip description applies to the author; bare
face/light application describe the review session without individual photo
identification. `浅涂` maps to `薄涂`; future planned thick application is not
assigned to the present photo. Buyer complaints remain attributed claims.

The five previews retain the complete frame and existing ICC profiles, with
EXIF stripped. Originals stay outside Git. Revision-2 corrections are stored
separately in the browser, preventing revision-1 judgments from silently being
reused with the new rules. Exported JSON includes the combined predictions,
separate image/text evidence and user corrections; no corrections are uploaded
or used to modify published labels automatically.
