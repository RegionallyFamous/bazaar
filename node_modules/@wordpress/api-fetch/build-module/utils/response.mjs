// packages/api-fetch/src/utils/response.ts
import { __ } from "@wordpress/i18n";
async function parseJsonAndNormalizeError(response) {
  try {
    return await response.json();
  } catch {
    throw {
      code: "invalid_json",
      message: __("The response is not a valid JSON response.")
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
export {
  parseAndThrowError,
  parseResponseAndNormalizeError
};
//# sourceMappingURL=response.mjs.map
