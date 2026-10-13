// Adopted metadata-minimization standard (approved during the 2014-13-006
// build). Replaces inherited Author/Creator from the original BI template's
// authoring software with FIS's own values. Rewrites only the Info
// dictionary -- no effect on visible content.
function applyMetadataStandard(doc, formTitle) {
  doc.setAuthor("Foreign Immigration Services");
  doc.setCreator("FIS Forms Library");
  doc.setTitle(formTitle);
}

module.exports = { applyMetadataStandard };
