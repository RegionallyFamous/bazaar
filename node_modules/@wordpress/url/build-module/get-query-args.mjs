// packages/url/src/get-query-args.ts
import { safeDecodeURIComponent } from "./safe-decode-uri-component.mjs";
import { getQueryString } from "./get-query-string.mjs";
function setPath(object, path, value) {
  const length = path.length;
  const lastIndex = length - 1;
  for (let i = 0; i < length; i++) {
    let key = path[i];
    if (!key && Array.isArray(object)) {
      key = object.length.toString();
    }
    key = ["__proto__", "constructor", "prototype"].includes(key) ? key.toUpperCase() : key;
    const isNextKeyArrayIndex = !isNaN(Number(path[i + 1]));
    object[key] = i === lastIndex ? (
      // If at end of path, assign the intended value.
      value
    ) : (
      // Otherwise, advance to the next object in the path, creating
      // it if it does not yet exist.
      object[key] || (isNextKeyArrayIndex ? [] : {})
    );
    if (Array.isArray(object[key]) && !isNextKeyArrayIndex) {
      object[key] = { ...object[key] };
    }
    object = object[key];
  }
}
function getQueryArgs(url) {
  return (getQueryString(url) || "").replace(/\+/g, "%20").split("&").reduce((accumulator, keyValue) => {
    const [key, value = ""] = keyValue.split("=").filter(Boolean).map(safeDecodeURIComponent);
    if (key) {
      const segments = key.replace(/\]/g, "").split("[");
      setPath(accumulator, segments, value);
    }
    return accumulator;
  }, /* @__PURE__ */ Object.create(null));
}
export {
  getQueryArgs
};
//# sourceMappingURL=get-query-args.mjs.map
