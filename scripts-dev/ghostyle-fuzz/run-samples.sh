#!/usr/bin/env bash
# run-samples.sh — a sample matrix of ghostyle-fuzz 1.1.0 options over several
# videos of one face, built so that the faces can be compared design by design.
#
#   bash scripts-dev/ghostyle-fuzz/run-samples.sh [video ...]
#
# Without arguments the three fixtures my-moving-face{,2,3}.mp4 are used. The
# atlases go under a fresh root (scratch/fuzz-v2 by default), so nothing mixes
# with the 1.0.0 runs in scratch/fuzz. Every cell runs the SAME seed range with
# --paired or --color, so seed N is the same strokes on every video and in every
# palette cell; compare lines them up at the end.
#
# Environment knobs:
#   ROOT=scratch/fuzz-v2   where the atlases go
#   TRIALS=25              trials per cell per video (3 for a ten-minute smoke test)
#   SEED=1000              first seed of every cell (keep it the same on every machine)
#   BIN=10                 pose bin size in degrees for every atlas (15 thins a big atlas)
#   MAX_IMPRINTS=60        cap on imprints per atlas (fewer = cheaper trials, less pose coverage)
#   GPU=--gpu              use the machine's GPU instead of swiftshader (check controlDrift in the run header)
#   CELLS=...              space-separated subset of the cell names below, to trim the matrix
#
# Cost: one imprint evaluation is ~1.2 s on swiftshader; a trial costs
# imprints × 1.2 s. With the 2026-10 atlases (14 / 27 / 40 imprints) the full
# matrix at TRIALS=25 is about 1.3 h + 2 h + 3.7 h. Ctrl-C inside a cell stops
# that cell after the current trial and the script goes on with the next one.
set -uo pipefail

ROOT=${ROOT:-scratch/fuzz-v2}
TRIALS=${TRIALS:-25}
SEED=${SEED:-1000}
BIN=${BIN:-10}
MAX_IMPRINTS=${MAX_IMPRINTS:-60}
GPU=${GPU:-}
FUZZ="node scripts-dev/ghostyle-fuzz.cjs"
REC=scripts-dev/ghostyle-fuzz/recipes

VIDEOS=("$@")
if [ ${#VIDEOS[@]} -eq 0 ]; then
   VIDEOS=(tests/fixtures/my-moving-face.mp4 tests/fixtures/my-moving-face2.mp4 tests/fixtures/my-moving-face3.mp4)
fi

# name|recipe|extra trial options. Paired seeds everywhere: the strokes of seed N
# are identical across cells that share a recipe geometry (all the three-bands
# cells) and across videos.
ALL_CELLS=(
   "bands-palette|three-bands.json|--paired"
   "bands-white|three-bands.json|--color white"
   "bands-black|three-bands.json|--color black"
   "bands-opaque|three-bands-opaque.json|--paired"
   "bands-any-colour|three-bands-any-colour.json|--paired"
   "bands-no-overlap|three-bands.json|--paired --no-overlap"
   "bands-eyes|three-bands.json|--paired --no-overlap --zones eyes"
   "bands-nose|three-bands.json|--paired --no-overlap --zones nose-cheeks"
   "bands-no-eyes|three-bands.json|--paired --no-overlap --zones forehead,nose-cheeks,mouth-chin"
   "one-long-band|one-long-band.json|--paired"
   "six-thin-lines|six-thin-lines.json|--paired"
)
if [ -n "${CELLS:-}" ]; then
   SELECTED=()
   for cell in "${ALL_CELLS[@]}"; do
      name=${cell%%|*}
      case " $CELLS " in *" $name "*) SELECTED+=("$cell");; esac
   done
   ALL_CELLS=("${SELECTED[@]}")
fi

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

ATLASES=()
for video in "${VIDEOS[@]}"; do
   if [ ! -f "$video" ]; then echo "no such video: $video" >&2; continue; fi
   stem=$(basename "$video"); stem=${stem%.*}; stem=$(printf '%s' "$stem" | sed 's/[^a-zA-Z0-9._-]\+/-/g')
   atlas="$ROOT/$stem/pose-atlas.json"
   if [ -f "$atlas" ]; then
      log "atlas exists, reusing: $atlas"
   else
      log "atlas: $video -> $ROOT/$stem (bin $BIN°, max $MAX_IMPRINTS imprints)"
      $FUZZ atlas --video "$video" --out-root "$ROOT" --bin "$BIN" --max-imprints "$MAX_IMPRINTS" $GPU || { echo "atlas failed for $video" >&2; continue; }
   fi
   ATLASES+=("$atlas")
done
[ ${#ATLASES[@]} -eq 0 ] && { echo "no atlas built" >&2; exit 1; }

for atlas in "${ATLASES[@]}"; do
   for cell in "${ALL_CELLS[@]}"; do
      IFS='|' read -r name recipe extra <<< "$cell"
      log "trial $name on $atlas: $recipe $extra, seeds $SEED..$((SEED + TRIALS - 1))"
      # shellcheck disable=SC2086
      $FUZZ trial --atlas "$atlas" --recipe "$REC/$recipe" --seed "$SEED" --trials "$TRIALS" --top 5 $extra $GPU
   done
   log "report: $atlas"
   $FUZZ report --atlas "$atlas"
done

ATLAS_ARGS=()
for atlas in "${ATLASES[@]}"; do ATLAS_ARGS+=(--atlas "$atlas"); done
if [ ${#ATLASES[@]} -ge 2 ]; then
   log "compare"
   $FUZZ compare "${ATLAS_ARGS[@]}" --output "$ROOT/compare.txt"
fi

# The files that reproduce every number (no images): small enough to share.
PACK="$(basename "$ROOT")-logs.tgz"
tar czf "$PACK" "$ROOT"/*/pose-atlas.json "$ROOT"/*/trials.ndjson $( [ -f "$ROOT/compare.txt" ] && echo "$ROOT/compare.txt" ) "$REC"
log "done: $PACK ($(du -h "$PACK" | cut -f1))"
