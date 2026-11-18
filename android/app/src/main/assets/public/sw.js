/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  importScripts("/sw-notifications.js");
  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "sw-notifications.js",
    "revision": "cc7e116baa56bab425cca3aeaedf08bd"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "bb891985fade4e3eb2932eb938afc88e"
  }, {
    "url": "pwa-512x512.png",
    "revision": "13e42577daef8f4f35a64d6a3a82271f"
  }, {
    "url": "pwa-192x192.png",
    "revision": "9759bede1947f1e50179d5a76cedb6b2"
  }, {
    "url": "index.html",
    "revision": "023fb3f2640272b8ad58da37a3041653"
  }, {
    "url": "icon.svg",
    "revision": "1221a8f76e4b2cbb2d423f251f578012"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "fdb0f65d756a5bfd695f9e7f72b5b087"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/index-RkiUdFas.css",
    "revision": null
  }, {
    "url": "assets/index-Ck6cbxxm.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "fdb0f65d756a5bfd695f9e7f72b5b087"
  }, {
    "url": "icon.svg",
    "revision": "1221a8f76e4b2cbb2d423f251f578012"
  }, {
    "url": "pwa-192x192.png",
    "revision": "9759bede1947f1e50179d5a76cedb6b2"
  }, {
    "url": "pwa-512x512.png",
    "revision": "13e42577daef8f4f35a64d6a3a82271f"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "bb891985fade4e3eb2932eb938afc88e"
  }, {
    "url": "sw-notifications.js",
    "revision": "cc7e116baa56bab425cca3aeaedf08bd"
  }, {
    "url": "manifest.webmanifest",
    "revision": "b0f46a1fd50dea09fa9653bedf848041"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/__\/auth/, /^\/api\//]
  }));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
