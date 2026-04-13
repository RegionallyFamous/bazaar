// packages/url/src/safe-decode-uri-component.ts
function safeDecodeURIComponent(uriComponent) {
  try {
    return decodeURIComponent(uriComponent);
  } catch (uriComponentError) {
    return uriComponent;
  }
}
export {
  safeDecodeURIComponent
};
//# sourceMappingURL=safe-decode-uri-component.mjs.map
