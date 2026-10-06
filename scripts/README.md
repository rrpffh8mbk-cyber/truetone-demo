# Rebuild official color references and sample usage

The `data_original` GitHub Release (`data_v1`) provides the user-supplied
`Data-XHS.zip`, `Data_clean_taobao.zip` and `color_official.zip`. Extract them
outside the public checkout, preserving their original directory names.

```sh
python3 scripts/prepare_original_manifest.py --root /private/extracted --output /private/manifest.json
python3 -m http.server 8000
# In a second terminal, from this checkout:
python3 scripts/rebuild_color_reference.py --manifest /private/manifest.json --model-file /private/resnet18.onnx --workers 4
```

Requires Python Playwright, Pillow and `/usr/bin/chromium`. TLS verification and
model SHA-256 verification remain enabled. The optional model-file flag reuses
verified model bytes. Four independent browser workers reuse their sessions;
local caches retain measurements and ROI previews for inspection.

The manifest inventories 169 sample files and 6 official photos. All files are
examined, including unreadable files and duplicate images. Official photos must
have a reliable lip region; a failed official selection stops the rebuild rather
than substituting a sample-derived standard. The pipeline uses the same browser
analyzer and CIEDE2000 implementation as uploads.

Usage policy:

- Reference-library semantic segmentation confidence must be at least 0.65.
  Uploads can show a measured color from a crop at confidence 0.60–0.65, with
  the lower confidence disclosed; geometry is preferred when available. Adaptive crop scales,
  primary-mouth component cleanup and hue-neutral retries improve close-ups.
- A sample is excluded when its official CIEDE2000 distance exceeds 20.
- Known 274 variants use their own official photo. Unknown variants use the
  closest of the three for family-level filtering; this does not identify a SKU.
- Unreadable photos, failed/weak ROIs and byte-identical images within the same
  product/variant are marked not for color reference, with reasons retained.
- Rejected images never enter sample color statistics or reference-media ranking.
- A color match alone cannot establish that lipstick was applied. A color outlier
  alone cannot establish that an image is fake or bare lips.

Outputs are `data/catalog/lip_color_reference_v3.json`, the 169-row
`sample_usage_v3.json` and `sample_usage_v3.csv`, plus small accepted-image
thumbnails. Original high-resolution images, local paths, credentials and signed
URLs are not copied into these outputs. v1/v2 catalogs remain historical archives.

Uploaded-image similarity compares against official-photo lip colors, independent
of the accepted sample median. Mapping: `round(100 * max(0, 1 - deltaE00 / 30))`.
Equal colors are 100, distance 30 or greater is 0, missing ROI/official is no score.
Multiple uploads use the lowest successfully measured similarity. The display
scale and exclusion threshold are explicit rules, not a calibrated authenticity
probability or a physical color measurement. See tests/README.md for validation.

## Rebuild semantic labels

Install `olefile==0.47`, `openpyxl` and Pillow, then run:

```sh
python3 scripts/label_sample_library.py --root /private/extracted
```

This rebuild applies the checked-in AI-reviewed image/text annotations; it does
not perform a new AI inspection. Image and text SHA-256 checks reject changed
sources. Word DOC piece tables supply XHS post IDs/titles; Excel author bodies
are joined only by an exact post ID, never from the other-commenter column.
Taobao TXT files are joined by their original image folder. Author evidence
quotes must match their source. An original link with no usable caption stays
unlabeled by text. The JSON/CSV preserve final values, confidence, source quotes,
image candidates and conflict resolutions for all 175 files, including unreadable
files. Raw images and source link tokens are not republished.

## Rebuild text evidence

```sh
python3 scripts/rebuild_review_catalog.py --root /private/extracted
```

Requires Node.js and openpyxl. The script reads review/answer CSVs, author-body
and commenter columns of XLSX separately, and photo-linked TXT files. It calls
the shared `review-text.js` classifier, applies hash-validated reviewed corrections,
and rebuilds the current review catalog and support/oppose counts. Questions,
recommendations, negations, other shade numbers and uncertain product scope are
handled separately. The 18 reviewed corrections retain exact quotes; additional
ambiguous records conservatively abstain. This is a rule audit, not a claimed
manual accuracy benchmark. User identifiers, nicknames, IPs and source access
tokens are omitted.
