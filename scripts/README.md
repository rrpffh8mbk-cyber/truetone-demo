# Rebuild the lip-color reference

Serve the repository with `python3 -m http.server 8000`. Then run:

```sh
python3 scripts/rebuild_color_reference.py --manifest /path/to/local-sample-manifest.json
```

Requires Python Playwright and `/usr/bin/chromium`. Model assets are fetched with
TLS verification. `--model-file /path/to/resnet18.onnx` can reuse a local model;
its published checksum must match. The script uses the exact browser analyzer,
not a separate Python color approximation. Keep raw media outside the checkout.

The input manifest is an array of local image records:

```json
[{"product_key":"ysl-610","id":"sample-1","platform":"小红书","file":"/private/path/image.jpg","original":true,"source_object_key":"Data-XHS/example/image.jpg"}]
```

If a thumbnail repeats an original's source filename, the original wins.
Selections that fail or whose semantic confidence is below 0.65 are excluded.
Only color measurements, image hashes, source IDs and coverage are exported to
`data/catalog/lip_color_reference_v2.json`. Do not put credentials or signed URLs
in the manifest. No raw media or live authentication is saved in the catalog.

The current reference contains 25 unique retrievable images: 12 API originals and
13 embedded thumbnails. It is not the full historical 169-image corpus. Re-run
with a full local manifest when the originals are available; review coverage and
failed selections before replacing the catalog. `complete_corpus` remains false
until completeness has been separately established.

Similarity uses CIEDE2000 distance to the coordinate-wise median Lab reference
center. Display mapping: `round(100 * max(0, 1 - deltaE00 / 30))`. Equal colors are
100; a large perceptual distance of 30 or more is 0. This transparent display
scale has not been calibrated against human authenticity labels. Multi-image
reports use the lowest successfully measured similarity; text and historical
product scores cannot raise it. Missing regions/references yield no score.
