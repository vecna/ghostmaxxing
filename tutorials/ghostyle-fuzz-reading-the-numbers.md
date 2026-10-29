# ghostyle-fuzz: reading the numbers

Companion to `tutorials/ghostyle-fuzz.md`. It explains, with the figures of
the October 2026 runs on three videos of one person (`my-moving-face`, `-2`,
`-3`), four things the logs say that are easy to misread: what "image quality"
is, when a seed is comparable across faces, why the identity rarely moves on
some videos, and why some imprints are dead weight. Every number below can be
recomputed from `trials.ndjson` + `pose-atlas.json` with `compare`.

---

## 1. Image quality: the variables

Nothing in the atlas is called "quality". It is the combination of five
measured things, all printed by `compare` (table 1):

| Variable | Where | What it is | Oct 2026 values (face 1 / 2 / 3) |
|---|---|---|---|
| **px/cm** | `imprints[].pxPerCm`, anchor | Face scale: iris pixels ÷ 1.17 cm. Decides how many pixels a 5 × 2 cm stroke occupies and how much detail face-api gets. | 26.4 / 21.0 / 16.2 |
| **sharpness** | `imprints[].sharpness` | Variance of the Laplacian on a 160-px grey crop of the face oval. Motion blur and soft focus pull it down fast; it is the single strongest per-imprint predictor of escape on face 3 (ρ = −0.54). | median 468 / 74 / 38 |
| **clean score** | `imprints[].score` | face-api's detection confidence on the *clean* frame. The detector threshold is 0.5; an imprint at 0.50–0.55 is one perturbation away from "lost". | mean 0.83 / 0.74 / 0.77 |
| **noise floor** | `noiseFloor`, `imprints[].noise` | Descriptor distance between each clean pose and its nearest clean neighbour: how much the face drifts on its own. 0.6 is the identity threshold, so a p90 of 0.56 (face 3) means some clean poses are almost strangers to each other already. | median 0.25 / 0.41 / 0.37, p90 0.32 / 0.48 / 0.56 |
| **unrecognised bins** | `unrecognisedBins` | Poses MediaPipe saw but face-api never recognised *clean*. They cannot be measured, and many of them means the video sits at the detector's limit. | 1 / 24 / 20 |

Plus the context: frame size (all 480 × 864), duration, presence share and
gaps, pose range (yaw −20..16° on face 1 against ±48° on face 2), and skin
L\* (65 / 54 / 55). Face 1 is a sharp, large, narrow-pose video; faces 2 and 3
are blurrier, smaller, wider-pose videos of the same person. That is the whole
"video effect": restricted to the ten pose bins the three atlases share,
three-bands escapes 26 % on face 1, 6 % on face 2 and 10 % on face 3, so the
gap is image quality, not pose range.

What to do with it: keep the variables similar when you want comparable
escape rates (same camera distance, light, and `--bin`), and read the
`compare` table before reading any escape rate.

---

## 2. The same seed on different faces

### Why it was not the same design

`drawTrial` consumes one random stream: palette first, then per stroke
centre, angle, colour. The palette draw rejects a set of colours when two are
closer than `minPairDeltaE` and draws again; **how many rejections happen
depends on the skin swatch** (it decides which colours are candidates). Every
rejection eats random numbers, so on another face the stroke draws start from
a different position in the stream. On the October runs the same seed gave the
same strokes on 13 % (face 1 vs 2), 20 % (1 vs 3) and 35 % (2 vs 3) of the
seeds, and never the same colours.

Since 1.1.0 two things make a seed name one design everywhere:

- `--paired` (recipe `pairedSeeds: true`): the palette comes from a second
  stream seeded `seed ^ 0x9E3779B9`; the stroke stream starts fresh.
- `--color <css>`: no palette draw at all, so the stroke stream also starts
  fresh. `--paired` and `--color` trials of the same geometry therefore share
  strokes seed by seed, which is what `run-samples.sh` relies on.

The strokes are still drawn on each face's own anchor frame (centre = a mesh
point, size in cm via that anchor's px/cm), so they are the same design up to
the anchor's slight head pose; for one person on three videos that is close
enough to call "the same Ghostyle".

### Is it informative?

Yes, in two ways, and `compare` (table 3) prints both.

1. **Rank correlation of matched designs.** For the 31 seeds that happened to
   draw the same strokes on all three faces, escape rates correlate at
   Spearman 0.61–0.81 between faces (unmatched same-seed pairs: ≈ 0). So about
   half of what makes a design good transfers to another video of the same
   person; the other half is the video. With `--paired` every seed is matched,
   so 25 trials per cell already give a usable estimate.
2. **Robust designs.** Ranking matched seeds by their *worst* face finds the
   designs that do not depend on one video: seed 176 of three-bands escaped
   93 % / 56 % / 48 %, while the per-face top-20 lists overlap only at chance
   level (2–3 of 20). A design that wins on one face and loses on the other
   two is not a finding; a design in the top of the min column is.

The honest limit: all three videos are the same person. Transfer across
*people* needs another face's atlas, and the same `compare` run.

---

## 3. Why the identity rarely moves on faces 2 and 3

An imprint escapes in one of two ways, and 1.1.0 reports them apart:

- **lost**: face-api's tiny detector finds no face, not even at score 0.1.
- **descriptor escape**: a face is found, its 128-number descriptor is
  computed, and it lies ≥ 0.6 from *every* clean imprint of the atlas.

October numbers, three-bands, as a share of all imprint evaluations:

| | face 1 | face 2 | face 3 |
|---|---|---|---|
| escaped | 28.6 % | 13.6 % | 13.5 % |
| of which lost | 19.3 % | 11.7 % | 12.8 % |
| of which descriptor | 9.3 % | 1.9 % | 0.7 % |
| descriptor escape *given a face was found* | 11.5 % | 2.1 % | 0.9 % |
| 90th percentile of `dAtlas` when found | 0.63 | 0.55 | 0.51 |

So on faces 2 and 3 the strokes almost never change *who* face-api sees; they
only sometimes stop it from seeing a face. Three reasons, in order of weight:

1. **Blur and scale cap how far a descriptor can move.** The recognition net
   reads texture. A crisp 26 px/cm face gives it sharp edges to be disturbed
   by, and a painted band removes or adds a lot of signal; on a 16 px/cm face
   at sharpness 38 the clean descriptor is already built from little texture,
   and the band changes less of what the net uses. The 90th percentile of
   `dAtlas` tells it directly: on face 3 even the best 10 % of evaluations stay
   at 0.51, below the 0.6 line; on face 1 they cross it.
2. **`dAtlas` is a minimum over all clean imprints.** With 27 or 40 clean
   poses in the atlas, a perturbed descriptor that left its own pose often
   lands within 0.6 of some *other* pose and counts as recognised
   ("caught by another imprint", §4). With 14 poses there are fewer nets.
3. **The split is not a software artefact.** The detector loss itself is also
   lower on faces 2/3 than on face 1 (12–13 % vs 19 %), and the control step at
   the start of every run re-described the clean frames within 4 × 10⁻⁶ of the
   atlas, so the measurement is stable; it is the face that reacts less.

Practical reading: a recipe's *descriptor* column is the one that says it
changes identity; its *lost* column mostly says the detector was fragile,
which depends on the video and is trivially obtained with a stroke across the
eyes (85–95 % of the per-face top-20 have one). Judge recipes on both columns,
and on the video with the most texture (face 1 here) when you care about
identity.

---

## 4. Dead imprints and "caught by another imprint"

### Where the numbers come from

Every trial line in `trials.ndjson` has one row per imprint with `detection`,
`dPair` (distance to the clean descriptor of the *same* frame), `dAtlas`
(smallest distance to *any* clean imprint) and `nearestId`. Over all trials
of a video you can therefore ask, per imprint, how often it escaped, and per
row, which of the two distances crossed 0.6.

### Dead imprints

An imprint is dead weight when its outcome never changes across trials. Over
the 1,200 three-bands sweeps of face 2 and the 591 of face 3:

- face 2: imprints 16, 18, 22, 24, 26 escaped in under 1 % of the sweeps
  (variance of the escaped flag < 0.01); face 3: eight imprints did (2, 3, 11,
  13, 14, 23, 25, 26). None on face 1.
- Two of them, face 3's imprints 13 and 14 (yaw −27°/−33°, pitch +34°/+31°:
  head turned and chin up), barely react to any overlay: `dAtlas` stays at
  0.145 ± 0.04 and 0.21 ± 0.03 whatever is painted. Look at
  `frames/imprint-0013.png` and `-0014.png`; the painted area is probably tiny
  or off the visible skin at that pose.

Two consequences:

1. **`worstCase` is degenerate on face 3.** `worstCase` is the smallest
   `dAtlas` of a sweep, and imprint 13 supplies it in 81 % of the sweeps,
   imprint 14 in 16 %. Every trial therefore has `worstCase` ≈ 0.145, the
   Pareto front on `(escapeRate, worstCase)` is noise, and pruning (which
   requires `worst < kth worst` as well as a low escape) almost never fires
   (4 % of trials pruned, against 54–76 % on the other videos). Replaying the
   log with `--prune-subset 16`, the one subset size that happens to contain
   imprint 13, would have pruned 44–66 % of the trials at no loss in the true
   top-20.
2. **CPU.** A trial costs about 1.2 s per imprint on swiftshader: 16 s on
   face 1 (14 imprints), 24 s on face 2 (27), 47 s on face 3 (40). Ranking the
   face-3 trials by the 20 most informative imprints reproduces the
   full-atlas ranking at Spearman 0.975; so half of face 3's 7.7 hours bought
   almost no ranking information. The remedy is a thinner atlas (`--bin 15`,
   or a `--max-imprints` cap, remembering that the cap keeps the *frontal*
   bins, which are the least informative) rather than fewer trials.

### Caught by another imprint

`dAtlas ≤ dPair` always, because the clean descriptor of the same frame is
one of the candidates in the minimum. The two differ when the overlay pushed
the descriptor away from its own frame (`dPair` ≥ 0.6) but within 0.6 of some
*other* clean pose (`dAtlas` < 0.6, `nearestId` ≠ `id`). Counting rows with
exactly that pattern:

| | face 1 | face 2 | face 3 |
|---|---|---|---|
| rows with `dPair` ≥ 0.6 but `dAtlas` < 0.6 | 5 % | 15 % | 13.5 % |

This is correct behaviour (a recogniser with a gallery of the person's photos
would also match the nearest one), but it means **escape rate depends on how
dense the gallery is**: an atlas with more clean poses, closer together in
descriptor space, catches more perturbed descriptors. Face 2's imprint 22 is
the extreme case: its own descriptor is moved past 0.6 in 79 % of the sweeps
(`dPair`), yet it escapes in 0 % because a neighbouring frontal pose is always
within reach. So an escape rate of 17 % on a 27-imprint atlas and 41 % on a
14-imprint atlas are not on the same scale even for the same face. Compare
atlases on the `compare` tables, on matched seeds, and on the per-imprint
view; not on the headline rate.

```
ghostyle-fuzz 1.1.0 compare: my-moving-face, my-moving-face2, my-moving-face3

1. Image quality: what each atlas offers face-api, and the variables that decide how hard it is
atlas              frame  seconds  imprints    yaw °  pitch °  px/cm  sharpness  clean score  noise med / p90  skin L*  unrecognised bins  presence  gaps
---------------  -------  -------  --------  -------  -------  -----  ---------  -----------  ---------------  -------  -----------------  --------  ----
my-moving-face   480×864     31.8        14  -20..16   -25..9   26.4        468         0.83  0.2514 / 0.3222     65.2                  1       89%     1
my-moving-face2  480×864     14.4        27  -48..49  -21..29   21.0         74         0.74  0.4082 / 0.4782     54.2                 24       96%     2
my-moving-face3  480×864     18.3        40  -37..48  -27..38   16.2         38         0.77   0.366 / 0.5556     55.0                 20       90%    10
px/cm: face scale on the anchor (iris = 1.17 cm); sharpness: variance of the Laplacian on the face crop, higher = crisper (motion blur and soft focus lower it);
clean score: face-api detection confidence on the clean imprints (0.5 is the detection threshold; the weak pass goes down to 0.1);
noise: descriptor distance between neighbouring clean poses (median / 90th percentile; the identity threshold is 0.6);
unrecognised bins: poses MediaPipe saw but face-api never recognised clean, so they cannot be measured.

2. Outcome per recipe and atlas
recipe                          atlas  trials  complete  escape  = lost  + descriptor  descr|detected  face covered  s/trial
--------------------  ---------------  ------  --------  ------  ------  ------------  --------------  ------------  -------
four-lines-0c0d29da    my-moving-face     900       216   66.8%   44.7%         22.1%           39.9%         12.5%     16.5
four-lines-0c0d29da   my-moving-face2     600       241   23.8%   20.9%          2.9%            3.6%         10.8%     23.8
four-lines-0c0d29da   my-moving-face3       2         2   11.3%   11.3%          0.0%            0.0%         11.1%     89.9
three-bands-1d7a652d   my-moving-face     420       175   41.1%   28.2%         12.9%           17.9%         15.5%     15.6
three-bands-1d7a652d  my-moving-face2    1200       557   16.9%   14.8%          2.2%            2.6%         13.4%     23.7
three-bands-1d7a652d  my-moving-face3     591       565   13.6%   12.9%          0.8%            0.9%         14.1%     46.7
means over complete sweeps; escapeRate is not comparable across atlases of different size and pose range, the split tells which mechanism moved.

3. Same seed, same design, different face
A seed names the same strokes on every face only when the palette did not consume randomness (--color) or had its own stream (--paired);
with a 1.0.0 recipe the palette rejections depend on the skin, so most seeds draw different strokes on different faces and are not comparable.

four-lines-0c0d29da: 2 seed(s) run on all of my-moving-face, my-moving-face2, my-moving-face3; 0 draw the same strokes everywhere

three-bands-1d7a652d: 400 seed(s) run on all of my-moving-face, my-moving-face2, my-moving-face3; 31 draw the same strokes everywhere
   my-moving-face vs my-moving-face2: 11 complete pairs, mean escape 42.2% vs 21.2%, Spearman rank correlation 0.81
   my-moving-face vs my-moving-face3: 12 complete pairs, mean escape 42.9% vs 20.0%, Spearman rank correlation 0.61
   my-moving-face2 vs my-moving-face3: 20 complete pairs, mean escape 17.0% vs 17.4%, Spearman rank correlation 0.61
seed  my-moving-face escape (lost+descr)  my-moving-face2 escape (lost+descr)  my-moving-face3 escape (lost+descr)  min  mean
----  ----------------------------------  -----------------------------------  -----------------------------------  ---  ----
176                        93% (57%+36%)                         56% (52%+4%)                         48% (48%+0%)  48%   65%
146                        33% (25%+8%)*                         33% (30%+4%)                         30% (30%+0%)  30%   32%
22                          57% (50%+7%)                         37% (30%+7%)                         25% (25%+0%)  25%   40%
291                        25% (17%+8%)*                         33% (26%+7%)                         30% (30%+0%)  25%   29%
195                        57% (29%+29%)                         19% (19%+0%)                         18% (18%+0%)  18%   31%
81                         86% (43%+43%)                         15% (11%+4%)                         33% (33%+0%)  15%   44%
361                        79% (43%+36%)                        52% (37%+15%)                         13% (13%+0%)  13%   48%
328                        17% (0%+17%)*                        17% (0%+17%)*                         13% (13%+0%)  13%   15%
143                        36% (21%+14%)                          11% (7%+4%)                         23% (20%+3%)  11%   23%
57                          29% (29%+0%)                         11% (11%+0%)                         23% (23%+0%)  11%   21%
294                        17% (17%+0%)*                          8% (8%+0%)*                         18% (18%+0%)   8%   14%
216                        33% (8%+25%)*                          11% (7%+4%)                           8% (8%+0%)   8%   17%
343                        25% (8%+17%)*                        17% (17%+0%)*                           8% (8%+0%)   8%   16%
234                          8% (0%+8%)*                          8% (8%+0%)*                           8% (8%+0%)   8%    8%
148                        33% (8%+25%)*                           7% (4%+4%)                           8% (5%+3%)   7%   16%
   designs ranked by their worst face (min), the robust ones first; * = pruned sweep, measured on the subset only

```
