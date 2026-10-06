# TrueTone data catalog

This directory stores lightweight indexes and derived metadata only.

- Original storage is Alibaba Cloud OSS. The user also uploaded the source ZIPs
  to the public `data_original` GitHub Release (`data_v1`) for this rebuild.
- GitHub should not become the raw media store; this keeps the public demo repository small and avoids exposing the full scraped corpus.
- `source_registry.json` records the OSS prefixes and dataset counts.
- `tag_schema.json` is the single vocabulary used by both user-profile inputs and evidence-library labels.
- `top_reference_candidates_v1.json` is a technical preselection of candidate reference images. It is not the final semantic/personalized ranking.

Final Top Reference ranking should combine:
1. technical image quality;
2. evidence completeness;
3. agreement with the full multi-source dataset;
4. semantic labels (lip / skin / makeup / lighting / application);
5. platform diversity;
6. match to the current user's profile.

Unknown semantic attributes must stay `不确定` rather than being guessed.

Current color reference: `lip_color_reference_v3.json`. All 169 original
sample files and 6 official photos in the user-uploaded `data_original` Release
have been examined. Official-photo lip colors determine upload similarity;
samples with official CIEDE2000 distance >20, unreliable ROI, unreadable bytes
or within-product/variant duplicates are marked not for color reference.
`sample_usage_v3.json` and `sample_usage_v3.csv` retain every original filename,
usage mark and reason. Only accepted samples enter statistics and media ranking.
The v1 red heuristic and v2 partial-corpus references remain archival only.
See `scripts/README.md` for reproducible processing and threshold limitations.
