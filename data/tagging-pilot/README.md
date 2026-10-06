# Five-image tagging pilot

Preview: [tagging-pilot.html](../../tagging-pilot.html). Records:
[tagging_pilot_v1.json](../catalog/tagging_pilot_v1.json).

These five Taobao review photos cover YSL 610, YSL 1936, Lancome 274 Cream,
Lancome 274 Intimatte and Lancome 275. This is a user-review pilot, not a random
accuracy benchmark. No accuracy has been calculated and the records are not used
for production personalized matching.

Visual assessments were recorded separately before extracting the five selected
comments. They remain independent of comment-derived labels. The original review
text, filename, directory, image hash, confidence level and reasons are preserved
in the records. Shared label options come from `data/catalog/tag_schema.json`.
Confidence levels are qualitative assessments, not calibrated probabilities.

`lip` means native lip depth before lipstick. The current visible lip color is a
separate observation; lipstick-covered pixels cannot establish native depth.
`skin` describes appearance in the photograph, without lighting calibration.
`makeup` is unknown when the visible crop does not provide sufficient evidence.

All 117 JPG files in the supplied Taobao archive have a same-folder `content.txt`,
across 87 review folders. One comment can describe multiple photos. Explicit
numbered-photo references must keep their scope: the YSL 1936 pilot comment
describes layering only in image four, while its folder contains only image one.
The Intimatte pilot comment explicitly self-reports deep native lips, a bare-face
session and light application; its three attached photos are not individually
identified in the text. `浅涂` is normalized to `薄涂`. The LC275 comment's `黄皮`
is preserved as a quoted topic, since it does not uniquely identify one of the
six skin options. Buyer complaints remain attributed claims, not verified facts.

The five JPEG previews preserve the full frame, resize only when needed, strip
EXIF metadata and retain an existing ICC profile. Original files stay outside
the checkout. User corrections stay in the browser and can be exported as JSON;
the page does not submit them to a server or change the published predictions.
