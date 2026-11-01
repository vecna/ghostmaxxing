# Local Fuzzer Docker image

Maintainer notes for the image built from the repository root
[`Dockerfile`](../Dockerfile). User instructions live in the public functional
documentation:

- `/docs/guides/localfuzzer.html` — install Docker and run a job;
- `/docs/guides/localfuzzer-report.html` — interpret the report.

This file is deliberately about the container artifact only: what it contains,
how to pull it, how to rebuild it, how it is published, and how to smoke-test
the result.

## Image and platforms

Published image: `ghcr.io/vecna/ghostmaxxing`.

The release workflow publishes one multi-architecture manifest for:

- `linux/amd64`;
- `linux/arm64`, including native execution through Docker Desktop on Apple
  Silicon.

Release tags follow the Git tag: `v1.2.3` publishes `:1.2.3`, `:1.2`, and
`:latest`. Branch builds publish their branch tag, such as `:main` or
`:fuzzer`. Do not move a release tag; publish a new patch version.

## What the image contains

The base is `node:24-bookworm-slim`. The image adds:

- Node 24 and the production dependency in `package-lock.json`;
- Playwright's Chromium headless shell and its system libraries;
- ffmpeg and ffprobe for probing and extracting exact video frames;
- `zip` for downloadable archives;
- `tini` as PID 1;
- `setpriv` from `util-linux`, used by the entrypoint to hand `/data` to the
  unprivileged `node` user;
- the repository source required by `scripts-dev/localfuzzer/server.cjs`,
  `scripts-dev/ghostyle-fuzz.cjs`, the browser harness, recipes, models, UV
  data, and report generator.

The build sets `NPM_CONFIG_OMIT=dev` and runs `npm ci --omit=dev`. Vitest,
JSDoc, jsdom, canvas, and other website/test tooling are not installed in the
runtime image. This separation is intentional; the report generator and local
service use the production Playwright dependency only.

The container listens on port `11111`, stores mutable state beneath `/data`,
and starts:

```text
tini -- docker/entrypoint.sh npm run localfuzzer
```

The entrypoint creates or adopts the data directory, drops privileges, and
then replaces itself with the command. `tini` forwards `docker stop`'s
SIGTERM; the service lets the current trial finish before exiting so the job
can resume at the next start.

## Pull and inspect

```sh
docker pull ghcr.io/vecna/ghostmaxxing:latest
docker image inspect ghcr.io/vecna/ghostmaxxing:latest
docker buildx imagetools inspect ghcr.io/vecna/ghostmaxxing:latest
```

The last command should show both supported platforms. A normal local launch
for a release check is:

```sh
docker run -d --name ghostmaxxing \
  -p 127.0.0.1:11111:11111 \
  --shm-size=1g --stop-timeout 120 \
  -v ghostmaxxing-data:/data \
  ghcr.io/vecna/ghostmaxxing:latest
```

Keep the loopback bind. The service has no authentication and is not designed
to be published directly on a network.

## Rebuild locally

From the repository root:

```sh
docker build --pull -t ghostmaxxing-local .
bash docker/smoke-test.sh ghostmaxxing-local tests/fixtures/my-moving-face.mp4
```

The build verifies the fuzzer version, `tini`, `setpriv`, ffprobe, zip, and the
installed Chromium shell. The smoke test starts the exact image, uploads the
fixture, runs a small multi-cell job, checks the summary, WebGL backend,
download, signal handling, and restart path, then cleans up its test container
and temporary data.

To exercise the service manually after a successful build:

```sh
docker run -d --name ghostmaxxing-local \
  -p 127.0.0.1:11111:11111 \
  --shm-size=1g --stop-timeout 120 \
  -v ghostmaxxing-local-data:/data \
  ghostmaxxing-local
docker logs -f ghostmaxxing-local
```

For a multi-architecture build without publishing:

```sh
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghostmaxxing-local:multi \
  .
```

Building the non-native platform requires a configured buildx builder and
emulation or native workers. A multi-platform result cannot be loaded into the
classic local image store as one image; use a registry output or test each
native build separately.

## Compose build and run

[`compose.yaml`](../compose.yaml) uses the published image and a bind-mounted
`./ghostmaxxing-data` directory. To use a local rebuild instead, change the
service temporarily to `build: .` and an appropriate local tag, then run:

```sh
docker compose build --pull
docker compose up -d
docker compose logs -f
docker compose down
```

Do not commit a local-only image name to the release configuration.

## CI and publishing

`.github/workflows/docker.yml` is the publication source of truth.

| Event | Builds and smoke-tests | Publishes |
|---|---|---|
| Pull request touching image inputs | amd64 and arm64 | Nothing |
| Push to `main` or `fuzzer` | amd64 and arm64 | Rolling branch tag |
| Tag `vX.Y.Z` | amd64 and arm64 | `:X.Y.Z`, `:X.Y`, `:latest` |
| Manual workflow dispatch | amd64 and arm64 | Tag derived from the selected ref |

Each architecture is built and tested natively before the publish job creates
the multi-architecture manifest. GitHub Actions authenticates to GHCR with the
run-scoped `GITHUB_TOKEN`; no long-lived registry secret is required. The
image labels connect the package to this repository, and the publish job emits
build-provenance attestations.

First publication setup:

1. Confirm the repository package has Actions write access.
2. Run the Docker workflow from the intended release branch.
3. In the GitHub package settings, make the package public.
4. Pull the resulting tag from a logged-out machine.
5. Verify provenance:

```sh
gh attestation verify \
  oci://ghcr.io/vecna/ghostmaxxing:latest \
  --owner vecna
```

## Build inputs and cache invalidation

The package manifests are copied before the repository so dependency and
browser layers remain cached when application files change. Changes to
`package.json`, `package-lock.json`, the Node base version, Playwright version,
or apt packages invalidate the expensive dependency layer. Changes to fuzzer,
service, recipe, model, or report files invalidate the final source layer.

`.dockerignore` excludes generated and local state. When adding a runtime file,
confirm that it is not ignored and that the Docker workflow path filters include
the change where appropriate.

## Runtime data and permissions

`/data` contains settings, uploads, job state, videos, clean atlas frames,
descriptors, generated Ghostyles, reports, logs, and comparisons. Treat the
volume as sensitive biometric-adjacent data.

The entrypoint supports a root-owned new volume because Docker commonly creates
mount points as root. It changes ownership only for the configured data path,
then runs the service as `node`. Test both a named volume and a bind mount when
changing entrypoint permissions.

The healthcheck calls `http://127.0.0.1:11111/api/info` inside the container.
It proves the HTTP service responds; it does not prove Chromium, ffmpeg, or a
full fuzz job works. That is the smoke test's role.

## Release checklist

1. Run unit tests for fuzzer and local-service plan logic.
2. Build the image locally with `--pull`.
3. Run `docker/smoke-test.sh` against the local image.
4. Stop a manual job during a trial and confirm it exits after that trial and
   resumes from the next seed.
5. Inspect the image for both target platforms in CI.
6. Pull the published digest and rerun the smoke test.
7. Confirm the package is public and the provenance attestation verifies.
8. Open the public Local Fuzzer and report guides and check that the release
   command and report behaviour still match the image.
