// packages/url/src/filter-url-for-display.ts
function filterURLForDisplay(url, maxLength = null) {
  if (!url) {
    return "";
  }
  let filteredURL = url.replace(/^[a-z\-.\+]+[0-9]*:(\/\/)?/i, "").replace(/^www\./i, "");
  if (filteredURL.match(/^[^\/]+\/$/)) {
    filteredURL = filteredURL.replace("/", "");
  }
  const fileRegexp = /\/([^\/?]+)\.(?:[\w]+)(?=\?|$)/;
  if (!maxLength || filteredURL.length <= maxLength || !filteredURL.match(fileRegexp)) {
    return filteredURL;
  }
  filteredURL = filteredURL.split("?")[0];
  const urlPieces = filteredURL.split("/");
  const file = urlPieces[urlPieces.length - 1];
  if (file.length <= maxLength) {
    return "\u2026" + filteredURL.slice(-maxLength);
  }
  const index = file.lastIndexOf(".");
  const [fileName, extension] = [
    file.slice(0, index),
    file.slice(index + 1)
  ];
  const truncatedFile = fileName.slice(-3) + "." + extension;
  return file.slice(0, maxLength - truncatedFile.length - 1) + "\u2026" + truncatedFile;
}
export {
  filterURLForDisplay
};
//# sourceMappingURL=filter-url-for-display.mjs.map
