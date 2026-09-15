# Capturing lab screenshots without a camera

The workshop pages need pictures of the lab in use, and the claims pages need
numbers. Both come from the same harness: `lab.html` running in a headless
browser with a synthetic face in place of the webcam. The commands live in
`scripts-dev/README.md`, under "Capture lab screenshots and measure
recognition distance". This page covers why the harness exists and how to read
what it produces.

## Two harnesses

`measure` and `shots` drive the **built fixtures**: `figureN-clean.y4m` and `figureN-painted.y4m`, two separately generated pictures of the same synthetic person. That is the right shape for measuring a set.

`render` drives **one arbitrary photograph**, and it is what the homepage story cards are made with:

```sh
node scripts-dev/lab-capture.cjs render --image shots/candidate.jpg \
  --ghostyle cv-dazzle-1 --layers box,ghostyle
```

The difference that matters is not the input format. A Ghostyle is an overlay drawn on the video by the lab, so `render`'s clean pass and Ghostyle pass are the same frame: same crop, same light, same pose, guaranteed by the renderer rather than by the subject holding still. Two pictures that differ only in the thing being tested are comparable; two photographs of a person who moved between them are not, and the difference gets attributed to the framing.

It writes cropped images into `scratch/story/` and prints the distance, the threshold and the crop it used. It writes no data file: the numbers that reach a page are typed in by hand.

## The method

Chromium can be handed a video file as its webcam. The lab then runs its full
pipeline against it: face-api detects, the landmark and recognition models run,
the baseline is saved to local storage, the auto-find loop measures distance.
Nothing is faked and nothing is drawn on afterwards. Every number in the two
pictures is what the lab computed.

```bash
# 1. a still becomes a fake webcam feed (Y4M, I420, what Chromium expects)
ffmpeg -loop 1 -i face.jpeg -t 8 -r 15 \
  -vf "scale=-1:300,pad=640:480:(ow-iw)/2:(oh-ih)/2:color=0x9a938c,format=yuv420p" \
  -pix_fmt yuv420p face.y4m

# 2. serve the repo
python3 -m http.server 8127

# 3. drive the lab
node tutorials/final.js
```

The browser flags that matter:

```
--use-fake-ui-for-media-stream          auto-grant the camera prompt
--use-fake-device-for-media-stream      use a synthetic device
--use-file-for-fake-video-capture=FILE  ...fed from this Y4M
--enable-unsafe-swiftshader             WebGL without a GPU, for MediaPipe
--autoplay-policy=no-user-gesture-required
```


```bash
printf "file 'clean.y4m'\nfile 'painted.y4m'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy clean-then-painted.y4m
```

Save the baseline while the clean segment is on screen, then read the distance
once the painted segment starts. Chromium loops the file.

## The script doing most of it

```
"capture:fixtures": "node scripts-dev/build-face-fixtures.cjs",
"capture:measure": "node scripts-dev/lab-capture.cjs measure",
"capture:shots": "node scripts-dev/lab-capture.cjs shots",
"capture:probe": "node scripts-dev/lab-capture.cjs probe",
```

## A result worth keeping

While making these I ran all eight fixture pairs through the lab: save the
baseline from the clean face, then measure the painted face in the same
session, default settings, `tiny_face_detector`, threshold 0.58.

| Pair | Painted face, peak distance | Outcome |
|---|---|---|
| figure1 | 0.23 | matched |
| figure2 | 0.26 | matched |
| figure3 | 0.39 | matched |
| figure4 | 0.46 | matched |
| figure5 | 0.57 | matched, one frame short of the line |
| figure6 | 0.51 | matched |
| figure7 | 0.33 | matched |
| figure8 | 0.44 | matched |

**None of the eight eludes the matcher.** Every painted face was still
recognised as its own baseline. figure5 reaches 0.57 against a 0.58 threshold,
so it fails by one hundredth.

Conditions, because the number means nothing without them: a still image fed as
a 640x480 webcam feed, even synthetic lighting, frontal pose, no motion, the
vendored face-api models, default threshold. A still is the easiest possible
case for a matcher, and a real face in a real room moves, so this is a floor
rather than a verdict.

What it is good for: it is a documented baseline for the fixture set, and it
says plainly that these eight painted looks are not yet evidence of evasion. If
you want a screenshot of the "eluded" state for the workshop page, it will have
to come from a look that actually crosses the line. The honest options are a
real workshop recording, or painting more heavily on one of these fixtures
until the distance clears 0.58 and saying so in the caption.

## Why a synthetic face

Every screenshot of the lab shows a face. Using a real one means either a
participant who has to consent to their face appearing in documentation that
outlives the workshop, or a stock photo whose licence has to be checked each
time the page is rebuilt. The pairs in `tests/fixtures/synthetic-faces/` are
synthetic: the same generated face twice, once bare and once with adversarial
makeup applied. Nobody is depicted, so a picture can be regenerated at any
time without asking anyone.

The second reason is repeatability. A person cannot hold still across eight
runs. A file can, so a measurement taken today is comparable with one taken
after a detector upgrade.

## Important bias to know

Face recognition system works also when a person twist their face, and so a condition in real world might be harder to prove if we just use a 2D model.

## Adding a figure

Drop `figureN-clean.jpeg` and `figureN-painted.jpeg` into
`tests/fixtures/synthetic-faces/`, both showing the same face, ideally the same
framing. Build the fixtures, measure, then add the row to the table above. The
`.y4m` files are git-ignored: they are large and regenerable, so only the
JPEGs and the measurements are worth committing.
