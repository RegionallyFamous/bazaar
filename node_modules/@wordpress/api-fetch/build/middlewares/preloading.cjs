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

// packages/api-fetch/src/middlewares/preloading.ts
var preloading_exports = {};
__export(preloading_exports, {
  default: () => preloading_default
});
module.exports = __toCommonJS(preloading_exports);
var import_url = require("@wordpress/url");
function createPreloadingMiddleware(preloadedData) {
  const cache = Object.fromEntries(
    Object.entries(preloadedData).map(([path, data]) => [
      (0, import_url.normalizePath)(path),
      data
    ])
  );
  return (options, next) => {
    const { parse = true } = options;
    let rawPath = options.path;
    if (!rawPath && options.url) {
      const { rest_route: pathFromQuery, ...queryArgs } = (0, import_url.getQueryArgs)(
        options.url
      );
      if (typeof pathFromQuery === "string") {
        rawPath = (0, import_url.addQueryArgs)(pathFromQuery, queryArgs);
      }
    }
    if (typeof rawPath !== "string") {
      return next(options);
    }
    const method = options.method || "GET";
    const path = (0, import_url.normalizePath)(rawPath);
    if ("GET" === method && cache[path]) {
      const cacheData = cache[path];
      delete cache[path];
      return prepareResponse(cacheData, !!parse);
    } else if ("OPTIONS" === method && cache[method] && cache[method][path]) {
      const cacheData = cache[method][path];
      delete cache[method][path];
      return prepareResponse(cacheData, !!parse);
    }
    return next(options);
  };
}
function prepareResponse(responseData, parse) {
  if (parse) {
    return Promise.resolve(responseData.body);
  }
  try {
    return Promise.resolve(
      new window.Response(JSON.stringify(responseData.body), {
        status: 200,
        statusText: "OK",
        headers: responseData.headers
      })
    );
  } catch {
    Object.entries(
      responseData.headers
    ).forEach(([key, value]) => {
      if (key.toLowerCase() === "link") {
        responseData.headers[key] = value.replace(
          /<([^>]+)>/,
          (_, url) => `<${encodeURI(url)}>`
        );
      }
    });
    return Promise.resolve(
      parse ? responseData.body : new window.Response(JSON.stringify(responseData.body), {
        status: 200,
        statusText: "OK",
        headers: responseData.headers
      })
    );
  }
}
var preloading_default = createPreloadingMiddleware;
//# sourceMappingURL=preloading.cjs.map
