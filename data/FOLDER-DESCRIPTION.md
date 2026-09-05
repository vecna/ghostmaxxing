# data

This folder contains runtime data assets.

`face_canonical_uv.json` stores canonical face UV coordinate data used by the 3D/MediaPipe rendering path to align texture or mesh-related Ghostyle effects to facial landmarks.

`camera-facts.json` supplies the fact copy loaded by the homepage camera-field interaction in `pages-js/index.js`.

The JSON data is excluded from code2prompt because it is large structured geometry data. Source files that consume it remain included where appropriate.
