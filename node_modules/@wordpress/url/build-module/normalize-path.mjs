// packages/url/src/normalize-path.ts
function normalizePath(path) {
  const split = path.split("?");
  const query = split[1];
  const base = split[0];
  if (!query) {
    return base;
  }
  return base + "?" + query.split("&").map((entry) => entry.split("=")).map((pair) => pair.map(decodeURIComponent)).sort((a, b) => a[0].localeCompare(b[0])).map((pair) => pair.map(encodeURIComponent)).map((pair) => pair.join("=")).join("&");
}
export {
  normalizePath
};
//# sourceMappingURL=normalize-path.mjs.map
