# tests/fixtures

This folder contains media fixtures used by automated tests.

The fixture files are local mock face images and video-like assets used to make unit and browser tests repeatable without relying on live camera input.

They are excluded from code2prompt because they are binary/media test data.


The files are used in different tests and angles:
 
        ├── E2E fake webcam
        │      ↓
        │   mock-face.y4m
        │   yuv420p(tv, progressive), 320x240, 15 fps, 15 tbr, 15 tbn
        │
        └── loader.html
               ↓
            my-moving-face.mp4
            video copied, audio removed


`synthetic-faces/` contains AI-generated clean/painted portraits and makeup
variants. `node scripts-dev/mark-ai-images.cjs --size 15%` visibly labels these
JPEG/PNG files in place; `--dry-run` previews the selection. The marker uses the
project font and colour tokens and skips existing visible badges. Marking
changes test inputs and re-encodes JPEGs; restore unmarked files from Git before
changing badge sizes or comparing against an earlier unmarked baseline.

Large makeup tutorials and event recordings may be placed directly in this
folder for local Video Loader calibration. Common video extensions are
git-ignored regardless of source ID or filename; the small committed
`my-moving-face.mp4` is the explicit CI exception. Local research videos are
never copied or modified by the analyser and are not required by CI. See
`tutorials/video-loader.md` for the manual validation order.
