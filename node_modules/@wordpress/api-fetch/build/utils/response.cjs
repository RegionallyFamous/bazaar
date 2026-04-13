"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/api-fetch/src/utils/response.ts
var response_exports = {};
__export(response_exports, {
  parseAndThrowError: () => parseAndThrowError,
  parseResponseAndNormalizeError: () => parseResponseAndNormalizeError
});
module.exports = __toCommonJS(response_exports);
var import_i18n = require("@wordpress/i18n");
async function parseJsonAndNormalizeError(response) {
  try {
    return await response.json();
  } catch {
    throw {
      code: "invalid_json",
      message: (0, import_i18n.__)("The response is not a valid JSON response.")
    };
  }
}
async function parseResponseAndNormalizeError(response, shouldParseResponse = true) {
  if (!shouldParseResponse) {
    return response;
  }
  if (response.status === 204) {
    return null;
  }
  return await parseJsonAndNormalizeError(response);
}
async function parseAndThrowError(response, shouldParseResponse = true) {
  if (!shouldParseResponse) {
    throw response;
  }
  throw await parseJsonAndNormalizeError(response);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  parseAndThrowError,
  parseResponseAndNormalizeError
});
//# sourceMappingURL=response.cjs.map
