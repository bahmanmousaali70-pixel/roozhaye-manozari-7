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
    "revision": "0d8e484a0ad07b413ff44e1f8dd659a6"
  }, {
    "url": "pwa-512x512.png",
    "revision": "670ab2973e8f2af3f43732c6b5d3d241"
  }, {
    "url": "pwa-192x192.png",
    "revision": "cebb107e85e574e9264e470d4127eaba"
  }, {
    "url": "index.html",
    "revision": "38d5881ed16cd192c0ed44a8b86e5dc3"
  }, {
    "url": "icon.svg",
    "revision": "3b8dd97173b1591aa5f8de15f5daad7a"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "725fe72bd52faaecff31bb71a0e6adf0"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/index-DqCxL5RI.js",
    "revision": null
  }, {
    "url": "assets/index-B-XsLlhD.css",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "725fe72bd52faaecff31bb71a0e6adf0"
  }, {
    "url": "icon.svg",
    "revision": "3b8dd97173b1591aa5f8de15f5daad7a"
  }, {
    "url": "pwa-192x192.png",
    "revision": "cebb107e85e574e9264e470d4127eaba"
  }, {
    "url": "pwa-512x512.png",
    "revision": "670ab2973e8f2af3f43732c6b5d3d241"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "0d8e484a0ad07b413ff44e1f8dd659a6"
  }, {
    "url": "sw-notifications.js",
    "revision": "cc7e116baa56bab425cca3aeaedf08bd"
  }, {
    "url": "manifest.webmanifest",
    "revision": "b0f46a1fd50dea09fa9653bedf848041"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html")));
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
