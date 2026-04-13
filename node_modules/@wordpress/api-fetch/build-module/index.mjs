// packages/api-fetch/src/index.ts
import { __ } from "@wordpress/i18n";
import createNonceMiddleware from "./middlewares/nonce.mjs";
import createRootURLMiddleware from "./middlewares/root-url.mjs";
import createPreloadingMiddleware from "./middlewares/preloading.mjs";
import fetchAllMiddleware from "./middlewares/fetch-all-middleware.mjs";
import namespaceEndpointMiddleware from "./middlewares/namespace-endpoint.mjs";
import httpV1Middleware from "./middlewares/http-v1.mjs";
import userLocaleMiddleware from "./middlewares/user-locale.mjs";
import mediaUploadMiddleware from "./middlewares/media-upload.mjs";
import createThemePreviewMiddleware from "./middlewares/theme-preview.mjs";
import {
  parseResponseAndNormalizeError,
  parseAndThrowError
} from "./utils/response.mjs";
var DEFAULT_HEADERS = {
  // The backend uses the Accept header as a condition for considering an
  // incoming request as a REST request.
  //
  // See: https://core.trac.wordpress.org/ticket/44534
  Accept: "application/json, */*;q=0.1"
};
var DEFAULT_OPTIONS = {
  credentials: "include"
};
var middlewares = [
  userLocaleMiddleware,
  namespaceEndpointMiddleware,
  httpV1Middleware,
  fetchAllMiddleware
];
function registerMiddleware(middleware) {
  middlewares.unshift(middleware);
}
var defaultFetchHandler = (nextOptions) => {
  const { url, path, data, parse = true, ...remainingOptions } = nextOptions;
  let { body, headers } = nextOptions;
  headers = { ...DEFAULT_HEADERS, ...headers };
  if (data) {
    body = JSON.stringify(data);
    headers["Content-Type"] = "application/json";
  }
  const responsePromise = globalThis.fetch(
    // Fall back to explicitly passing `window.location` which is the behavior if `undefined` is passed.
    url || path || window.location.href,
    {
      ...DEFAULT_OPTIONS,
      ...remainingOptions,
      body,
      headers
    }
  );
  return responsePromise.then(
    (response) => {
      if (!response.ok) {
        return parseAndThrowError(response, parse);
      }
      return parseResponseAndNormalizeError(response, parse);
    },
    (err) => {
      if (err && err.name === "AbortError") {
        throw err;
      }
      if (!globalThis.navigator.onLine) {
        throw {
          code: "offline_error",
          message: __(
            "Unable to connect. Please check your Internet connection."
          )
        };
      }
      throw {
        code: "fetch_error",
        message: __(
          "Could not get a valid response from the server."
        )
      };
    }
  );
};
var fetchHandler = defaultFetchHandler;
function setFetchHandler(newFetchHandler) {
  fetchHandler = newFetchHandler;
}
var apiFetch = (options) => {
  const enhancedHandler = middlewares.reduceRight(
    (next, middleware) => {
      return (workingOptions) => middleware(workingOptions, next);
    },
    fetchHandler
  );
  return enhancedHandler(options).catch((error) => {
    if (error.code !== "rest_cookie_invalid_nonce") {
      return Promise.reject(error);
    }
    return globalThis.fetch(apiFetch.nonceEndpoint).then((response) => {
      if (!response.ok) {
        return Promise.reject(error);
      }
      return response.text();
    }).then((text) => {
      apiFetch.nonceMiddleware.nonce = text;
      return apiFetch(options);
    });
  });
};
apiFetch.use = registerMiddleware;
apiFetch.setFetchHandler = setFetchHandler;
apiFetch.createNonceMiddleware = createNonceMiddleware;
apiFetch.createPreloadingMiddleware = createPreloadingMiddleware;
apiFetch.createRootURLMiddleware = createRootURLMiddleware;
apiFetch.fetchAllMiddleware = fetchAllMiddleware;
apiFetch.mediaUploadMiddleware = mediaUploadMiddleware;
apiFetch.createThemePreviewMiddleware = createThemePreviewMiddleware;
var index_default = apiFetch;
export {
  index_default as default
};
//# sourceMappingURL=index.mjs.map
