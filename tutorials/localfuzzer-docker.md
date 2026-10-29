# The local fuzzer in Docker

A web page around `scripts-dev/ghostyle-fuzz.cjs`, packed in one image:
someone pulls it, opens `http://localhost:11111`, uploads a video of a face
turning, and a few hours later downloads an assessment and the Ghostyles.
Everything runs and stays on that machine.

- Image: `ghcr.io/vecna/ghostmaxxing` (linux/amd64 and linux/arm64, so Apple
  Silicon runs it natively).
- Inside: `npm run localfuzzer` (`scripts-dev/localfuzzer/server.cjs`), Node 22,
  ffmpeg, Playwright's headless Chromium, the fuzzer and its vendored models.
- Data: one folder (`/data` in the container) holds every job: video, atlas,
  logs, report, Ghostyles.

Contents: 1 Run it · 2 The page · 3 The data folder · 4 Without Docker ·
5 Publishing the image · 6 Security and privacy · 7 Troubleshooting ·
8 What was tested.

---

## 1. Run it

Docker Desktop (macOS, Windows) or Docker Engine (Linux), then:

```sh
docker run -d --name ghostmaxxing \
  -p 127.0.0.1:11111:11111 \
  --shm-size=1g --stop-timeout 120 \
  -v ghostmaxxing-data:/data \
  ghcr.io/vecna/ghostmaxxing:latest
```

Open <http://localhost:11111>.

| Option | Why |
|---|---|
| `-p 127.0.0.1:11111:11111` | Only this machine can open the page. There is no login, so never publish it on `0.0.0.0`. |
| `--shm-size=1g` | Chromium uses shared memory; Docker's default 64 MB makes it crash on long runs. The page warns when it is too small. |
| `--stop-timeout 120` | `docker stop` then lets the running trial finish and its Ghostyles be written; the job resumes at the next start. With Docker's default 10 s the trial in progress is lost (the job still resumes). |
| `-v ghostmaxxing-data:/data` | A named volume. To see the files directly, use a folder instead: `-v "$PWD/ghostmaxxing-data:/data"`. |

With Docker Compose, `compose.yaml` at the root of the repository does the
same and writes into `./ghostmaxxing-data`:

```sh
docker compose up -d       # start (and resume any unfinished job)
docker compose down        # stop; a running job resumes on the next up
```

Everyday commands:

```sh
docker logs -f ghostmaxxing          # the service's log (each job also has its own, on the page)
docker stop ghostmaxxing             # stop; the job in progress resumes on start
docker start ghostmaxxing
docker pull ghcr.io/vecna/ghostmaxxing:latest && docker rm -f ghostmaxxing   # update, then run again
docker volume rm ghostmaxxing-data   # delete every job for good
```

Speed: a trial costs about 1.2 s per imprint (pose) on one core with the
software WebGL renderer. On Docker Desktop, give the VM several CPUs
(Settings → Resources). A Quick job takes 15-45 minutes, Standard 1.5-4 hours,
Deep a night; the page shows an estimate before you start and refines it once
the atlas is built.

---

## 2. The page

1. **Upload** an MP4 (any format ffmpeg reads). One person, face visible,
   turning the head slowly left, right, up and down; 15-60 s is plenty. The
   file is checked with ffprobe before anything runs.
2. **Preset**:
   - *Quick*: 15° pose bins (fewer imprints) and three recipes × 30 trials.
   - *Standard*: the 11-cell comparison matrix of
     `ghostyle-fuzz-reading-the-numbers.md` (palette vs forced white/black,
     opacity, palette contrast, overlap, eye/nose/no-eye zones, shapes) × 25.
   - *Deep*: the same × 100, every imprint swept (no pruning).
   - *My default*: what you saved from the settings.
   Every preset uses seed 1000 and paired seeds, so seed N is the same design
   in every three-bands cell, on every video and in every job.
3. **Settings** (optional) expose every option of the three commands:
   - `atlas`: sample fps, pose bin, max imprints, candidates, anchor window, max gap;
   - `trial`, per *cell* (one fuzzer run): recipe (bundled or a custom JSON
     recipe), trials, seed, top, prune / subset / margin, colour, no overlap,
     zones, paired;
   - `report` runs after every cell and at the end (nothing to set);
   - `--gpu` (only with a GPU passed through to the container).
   Incompatible choices (a colour with paired seeds, a recipe that already
   forces another colour, a bad CSS colour, ...) are refused before the job
   is queued, with the reason. "Commands this plan will run" shows the exact
   command lines. "Save as my default" turns the settings into a preset.
4. **Start**. Jobs run one at a time, in order; the list shows the queue
   position and when each should start.
5. **Open** a job: steps, progress, time left, log; once a cell is done, the
   results so far:
   - *The video, as face-api sees it*: imprints, pose range, face scale,
     sharpness, clean detection score, noise floor;
   - *Results per cell*: escape = lost (the detector found no face) +
     identity (a face was found, ≥ 0.6 from every clean pose), the same given
     detection, face covered, best seed;
   - *Ghostyles*: the best materialised trials with their anchor image, every
     pose, the `.js` and the CSV.
   Buttons: the full HTML report, **Download the Ghostyles (.zip)** (Ghostyles,
   images, report, a README), **Download the logs (.zip)** (atlas JSON,
   `trials.ndjson`, job log: what to send to whoever analyses the runs),
   **Run again on this video** (keeps the atlas when its settings do not change).
6. **Cancel** stops after the current trial and keeps its results; **Resume**
   continues from the next seed; **Delete** removes the job folder, video
   included.
7. **Compare selected** (two jobs or more, e.g. three videos of one face):
   image-quality variables, outcome per recipe and video, and the same designs
   face by face (`ghostyle-fuzz.cjs compare`).

To try a Ghostyle in the lab: copy the `.js` into `ghostyles/` of a checkout,
add it to `ghostyles.json` and run `npm run validate-plugin -- ghostyles/<file>.js`
(`ghostyle-fuzz.md` §7.1).

---

## 3. The data folder

```
/data/
  settings.json                     "My default" (if saved)
  uploads/                          videos uploaded but not started (dropped after a day)
  compare/compare-<time>.txt        every compare run
  jobs/<job-id>/
    job.json                        plan, steps, progress (the queue's state)
    job.log                         everything the fuzzer printed, with each command
    video/<name>.mp4                the uploaded video
    recipes/                        custom recipes of this job
    summary.json                    per-cell results and the materialised trials
    <label>_<id>/                   the fuzzer's own folder (ghostyle-fuzz.md §7)
      pose-atlas.json, anchor.png, frames/, trials.ndjson, report.html,
      runs/<recipe-id>-<seed>/ghostyle-fuzz-<seed>.js ...
```

Each job folder is self-contained: the fuzzer commands in `job.log` can be
re-run on it with a checkout of the repository.

---

## 4. Without Docker

```sh
npm ci
npx playwright install chromium     # once
npm run localfuzzer                 # http://127.0.0.1:11111, data in scratch/localfuzzer/
```

Needs Node ≥ 18, ffmpeg/ffprobe on the PATH, and `zip` for .zip downloads
(.tar.gz otherwise). Environment variables: `LOCALFUZZER_PORT`,
`LOCALFUZZER_HOST`, `LOCALFUZZER_DATA`, `LOCALFUZZER_MAX_UPLOAD_MB` (4096),
`LOCALFUZZER_ALLOWED_HOSTS`. Ctrl-C stops after the current trial; the job
resumes at the next start.

---

## 5. Publishing the image

### Why GitHub Container Registry

The image is published to `ghcr.io/vecna/ghostmaxxing` by a GitHub Actions
workflow (`.github/workflows/docker.yml`), not to Docker Hub, because:

- **No secret to manage.** The workflow logs in with the token GitHub gives
  every run (`GITHUB_TOKEN`), valid for that run only. Docker Hub needs an
  account and a long-lived access token stored as a repository secret.
- **Tied to the repository.** The package page links to the code, and each
  image carries a signed build-provenance attestation: anyone can verify it
  was built by this workflow from this repository.
- **Free for public images**, without Docker Hub's anonymous pull limits.

The only cost is the longer name: `ghcr.io/vecna/ghostmaxxing` instead of
`vecna/ghostmaxxing`. A Docker Hub mirror can be added later (below).

### What the workflow does

| Event | Builds and tests | Publishes |
|---|---|---|
| Pull request touching the image | amd64 and arm64 | nothing |
| Push to `main` or `fuzzer` | amd64 and arm64 | `:main` or `:fuzzer` (rolling, the latest commit) |
| Tag `v1.2.3` | amd64 and arm64 | `:1.2.3`, `:1.2`, `:latest` |
| Actions → Docker image → Run workflow | amd64 and arm64 | as a push of the chosen branch |

The test job builds natively on an amd64 and an arm64 runner (GitHub's
`ubuntu-24.04-arm`, free for public repositories) and runs
`docker/smoke-test.sh`: start the container with a root-owned data folder,
upload `tests/fixtures/my-moving-face.mp4`, run a two-cell job, check the
summary, the WebGL backend and the Ghostyle download, stop it the way
`docker stop` does. Only when both pass does the publish job push the
multi-arch image.

### First time

1. **Commit and push** `Dockerfile`, `.dockerignore`, `compose.yaml`,
   `docker/`, `scripts-dev/localfuzzer/`, `.github/workflows/docker.yml` to
   the `fuzzer` branch.
2. **Watch the run**: repository → *Actions* → *Docker image*. The first build
   takes 15-30 minutes (later ones reuse the cache). If the arm64 job waits
   forever for a runner, the repository is private (arm64 runners are free
   only for public ones): remove the arm64 line from the matrix, and from
   `platforms`, or make the repository public.
3. **Make the package public.** The first push creates the package as
   *private*. Go to your GitHub profile → *Packages* → `ghostmaxxing` →
   *Package settings* → *Danger Zone* → *Change visibility* → *Public*. Check
   on the same page that the repository `vecna/ghostmaxxing` is listed under
   *Manage Actions access* with the *Write* role (the image label
   `org.opencontainers.image.source` links them; if it is missing, add it
   there).
4. **Check from any machine**, logged out of everything:
   ```sh
   docker pull ghcr.io/vecna/ghostmaxxing:fuzzer
   ```

### A release

```sh
git tag v1.1.0          # semantic version: major.minor.patch
git push origin v1.1.0
```

The workflow publishes `:1.1.0`, `:1.1` and `:latest`. People who want a
fixed version use `:1.1.0`; `:latest` follows the newest tag; `:fuzzer`
follows the branch. A tag is not moved or reused: fix forward with `v1.1.1`.

### Verifying an image

```sh
gh attestation verify oci://ghcr.io/vecna/ghostmaxxing:1.1.0 --owner vecna
docker buildx imagetools inspect ghcr.io/vecna/ghostmaxxing:1.1.0   # both platforms listed
```

### Optional: a Docker Hub mirror (`vecna/ghostmaxxing`)

Only if the short name matters. Once:

1. Create a Docker Hub account (or use the `vecna` one) and a repository
   `ghostmaxxing`, public.
2. Docker Hub → *Account settings* → *Personal access tokens* → *Generate*,
   scope *Read & Write*, no expiry or a reminder to rotate it.
3. GitHub repository → *Settings* → *Secrets and variables* → *Actions* →
   *New repository secret*: `DOCKERHUB_USERNAME` (the Docker Hub user) and
   `DOCKERHUB_TOKEN` (the token).

Then, in `.github/workflows/docker.yml`, job `publish`, add a login step after
the ghcr.io one and the second image name:

```yaml
      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
```

```yaml
          images: |
            ${{ env.IMAGE }}
            docker.io/vecna/ghostmaxxing
```

The attestation stays on ghcr.io; the Docker Hub copy is the same image
(same digest).

### Building it yourself

```sh
docker build -t ghostmaxxing-local .
docker run -d --name ghostmaxxing -p 127.0.0.1:11111:11111 --shm-size=1g --stop-timeout 120 -v ghostmaxxing-data:/data ghostmaxxing-local
bash docker/smoke-test.sh ghostmaxxing-local      # the CI test, on your machine
docker buildx build --platform linux/amd64,linux/arm64 -t <name> .   # both platforms (needs QEMU for the other one)
```

---

## 6. Security and privacy

- **Local only.** The examples publish the port on 127.0.0.1. The service
  also refuses requests whose `Host` is not `localhost`/`127.0.0.1`/`[::1]`
  (a web page elsewhere cannot reach it through DNS rebinding), and every
  call that changes something must carry an `X-Localfuzzer` header, which a
  page from another site cannot add without a CORS permission the service
  never grants. There is no login: do not expose it on a network.
  `LOCALFUZZER_ALLOWED_HOSTS` exists for people who knowingly put it behind
  their own authenticated proxy.
- **Nothing leaves the machine.** The service makes no outbound request.
  Playwright's headless Chromium, the browser in the image, made no outbound
  connection in a measured trial (the full Chrome build does call Google
  services; it is not in the image). The models are in the image.
- **Biometric data.** Videos and imprint frames are faces. They stay in the
  data folder until the job is deleted from the page (which removes its
  folder) or the volume is removed. Results derived from them (atlas
  descriptors, frames, overlays) are in the same folder and go with it.
- **Least privilege.** The service runs as the unprivileged `node` user (uid
  1000); the entrypoint starts as root only to make the data folder writable
  for it, then drops privileges. Start with `--user <uid>:<gid>` to skip even
  that.
- **What the image contains.** Only what `.dockerignore` allows (an
  allowlist): `scripts-dev/`, `lab-js/`, `data/`, `tutorials/`,
  `translations/`, `docker/`, `package*.json`, `README.md`. No `scratch/`,
  no tests, no `.git`.

---

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The page says `/dev/shm is only 64 MB` | Start with `--shm-size=1g` (Compose: `shm_size: 1gb`). |
| Very slow on a Mac | Docker Desktop pulled the amd64 image (emulated): `docker pull --platform linux/arm64 ghcr.io/vecna/ghostmaxxing:latest`. Also give Docker more CPUs. |
| `entrypoint: /data is not writable` | Started with `--user` on a folder that user does not own: `chown` the folder, or drop `--user`. |
| Job failed at "Pose atlas" | face-api recognised no frontal face: light, framing, face too small or too far. The log shows the last lines of the fuzzer. |
| `host … not allowed` | Open `http://localhost:11111` rather than an IP or another name. |
| Port 11111 in use | `-p 127.0.0.1:12345:11111` and open port 12345. |
| A job shows "interrupted" | The container stopped during the job; it resumed from the first trial not in the log. Give `docker stop` more time (`--stop-timeout 120`) to keep the trial in progress. |

---

## 8. What was tested

Before this was first published, the parts were tested as follows:

- The fuzzer, the service and the page, natively (Node 22, Linux): uploads,
  validation, every preset's plan, jobs with forced colour, zones, no overlap,
  custom recipes, atlas reuse, cancel (the trial in progress finishes and its
  Ghostyles are written), resume from the next seed, restart while a job runs,
  downloads, compare, the Host and header guards, path traversal; the page
  driven with Playwright at desktop and phone width, light and dark.
- The container's process chain with the image's exact entrypoint and
  command (`tini -- docker/entrypoint.sh npm run localfuzzer`, started as root
  on a root-owned data folder): privilege drop, data folder hand-over,
  healthcheck, and a `docker stop`-equivalent SIGTERM in the middle of a
  trial (trial finished, Ghostyles written, job resumed on restart, no
  process left, exit code 0).
- Playwright's headless shell on the harness: identical measurement to the
  full Chromium (same seed, same escape and worst case to four decimals),
  WebGL backend, no outbound connection.
- The image build itself was **not** run before publishing (the machine that
  wrote this could not reach a container registry): its first build is the
  workflow's, which smoke-tests the image on amd64 and arm64 before pushing
  anything.
