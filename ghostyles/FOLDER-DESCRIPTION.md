# ghostyles

This folder contains Ghostmaxxing's example and experimental Ghostyle plugins. Each JavaScript module is loaded by the lab's plugin manager and demonstrates a visual effect through the public `window.gstmxx` plugin API.

`00-template.js` is the canonical authoring example. Other files are individual 2D, UV, or combined effects; their `==Ghostyle==` metadata and exported callbacks are the plugin contract. Validate all plugins with `npm run validate:ghostyles` or one file with `npm run validate-plugin -- ghostyles/<file>.js`.

Plugins run in the browser against face-api geometry and, where they export `paintUV`, the experimental MediaPipe UV renderer. They are optional effects rather than independent application entry points. Do not treat an `Escaped` result as proof of protection, anonymity, or transfer to an external recognition system.
