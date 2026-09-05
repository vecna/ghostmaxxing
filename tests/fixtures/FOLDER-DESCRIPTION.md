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
