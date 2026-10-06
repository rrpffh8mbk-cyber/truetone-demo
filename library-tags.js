// Shared labels for the current reference library. Unknown/weak evidence adds
// no preference, and official/product graphics cannot describe a wearer.
export function attachLibraryLabels(media, records) {
  const key=media.source_object_key||media.object_key;
  const row=records.get(key);
  return row?{...media,semanticTags:row.tags,labelFields:row.labels.fields,
    wearerProfileEvidence:row.wearer_profile_evidence,tagRecordId:row.id}:media;
}

export function profileTagMatch(media, profile) {
  if(!profile||!media.wearerProfileEvidence)return 0;
  let matches=0;
  for(const field of ['lip','skin','makeup']){
    const label=media.labelFields?.[field];
    if(profile[field]&&label?.value===profile[field]&&
       ['medium','high'].includes(label.confidence))matches++;
  }
  return matches;
}

export function rankReferenceMedia(media, profile) {
  return media.slice().sort((a,b)=>profileTagMatch(b,profile)-profileTagMatch(a,profile)||
    (a.colorDistance??Infinity)-(b.colorDistance??Infinity));
}
