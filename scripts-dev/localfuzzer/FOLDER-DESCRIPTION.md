# scripts-dev/localfuzzer

The local fuzzer web service: `npm run localfuzzer` serves a page on
http://127.0.0.1:11111 that wraps `scripts-dev/ghostyle-fuzz.cjs` (upload a
video, pick a preset or edit every option of atlas/trial/report, queue, watch,
download the Ghostyles). It is what the Docker image runs (`Dockerfile`,
`docker/`). Documentation: `tutorials/localfuzzer-docker.md`.

- `server.cjs` — zero-dependency HTTP server: uploads (checked with ffprobe),
  the job queue (one job at a time, resumed after a restart), the fuzzer as a
  child process, progress from its log lines, cancel/resume/delete, downloads,
  compare, the Host and header guards.
- `jobs-core.cjs` — pure helpers: presets, plan validation (the CLI's own
  incompatibilities), plan → command lines, progress parsing, time estimate.
  Unit tests: `tests/unit/localfuzzer-core.test.js`.
- `public/` — the page: `index.html`, `style.css`, `app.js` (plain DOM, no
  framework, no network beyond the service).

Data goes to `$LOCALFUZZER_DATA` (default `scratch/localfuzzer/`, `/data` in
the image); one folder per job.
