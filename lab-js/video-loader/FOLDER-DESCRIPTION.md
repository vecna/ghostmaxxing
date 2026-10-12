# lab-js/video-loader

This folder contains the seekable-video analysis core used by `loader.html`.
It is intentionally independent from the live-camera state owned by
`realtime.html` and the main lab.

`controller.js` owns local video loading, deterministic seeking, MediaPipe
FaceLandmarker and ImageEmbedder sampling, sparse face-api verification,
baseline acquisition, and native-resolution evidence capture. It retains no
pixel queue: only selected evidence frames survive, while neighbouring frames
can be recovered later by seeking the original source. A person can also ask
for an immediate comparison at the current source position after the baseline
exists; that manual check is stored separately from automatically confirmed
events.

`analysis.js` contains pure numeric helpers and the trigger state machine. Its
default face-api identity distance is `0.6`; ImageEmbedder drift is maintained
as a separate generic visual signal and never presented as identity distance.

`session.js` owns the versioned analysis session, append-only observations,
review classifications, report projection, separately downloadable NDJSON
technical log, and reversible editorial actions.

The detailed product boundary, signal semantics, calibration decisions, CLI
contract, and test policy live in `../../tutorials/video-loader.md`.
