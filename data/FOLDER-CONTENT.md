# data

This folder contains runtime data assets.

`face_canonical_uv.json` stores canonical face UV coordinate data used by the 3D/MediaPipe rendering path to align texture or mesh-related Ghostyle effects to facial landmarks.

The JSON data is excluded from code2prompt because it is large structured geometry data. Source files that consume it remain included where appropriate.
