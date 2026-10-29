#!/usr/bin/env bash
# End-to-end smoke test of the local-fuzzer image: what a user does, minus the browser.
#
#   bash docker/smoke-test.sh <image> [video]
#
# Starts the container with a root-owned bind-mounted data folder (the
# entrypoint must hand it to the 'node' user), uploads the fixture video,
# runs a two-cell job (palette with paired seeds; forced colour with zones and
# no overlap), checks the results, the Ghostyle download and the WebGL backend,
# then stops the container the way `docker stop` does. Used by
# .github/workflows/docker.yml on amd64 and arm64 before anything is published.
set -euo pipefail

IMAGE=${1:?usage: smoke-test.sh <image> [video]}
VIDEO=${2:-tests/fixtures/my-moving-face.mp4}
PORT=${PORT:-11111}
NAME=localfuzzer-smoke-$$
B="http://localhost:$PORT"
DATA=$(mktemp -d)
H=(-H 'X-Localfuzzer: 1')
fail() { echo "SMOKE TEST FAILED: $*" >&2; docker logs --tail 80 "$NAME" >&2 || true; for f in "$DATA"/jobs/*/job.log; do [ -f "$f" ] && tail -n 60 "$f" >&2; done; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; sudo rm -rf "$DATA" 2>/dev/null || rm -rf "$DATA" 2>/dev/null || true; }
trap cleanup EXIT
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# A data folder the container user cannot write yet: root-owned, like a folder docker itself created.
sudo chown root:root "$DATA" 2>/dev/null || true
sudo chmod 755 "$DATA" 2>/dev/null || true

docker run -d --name "$NAME" -p "127.0.0.1:$PORT:11111" --shm-size=1g -v "$DATA:/data" "$IMAGE" >/dev/null
for i in $(seq 1 60); do curl -fsS "$B/api/info" >/dev/null 2>&1 && break; sleep 1; [ "$i" = 60 ] && fail "the service did not answer"; done
echo "service up: $(curl -fsS "$B/api/info" | json "d['tool'] + ' / ' + d['arch'] + ' / warnings: ' + str(d['warnings'])")"
[ "$(docker top "$NAME" -eo user,args | grep 'localfuzzer/server.cjs' | awk '{print $1}' | head -1)" != root ] || fail "the server runs as root"

echo "guards"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.example' "$B/api/info")" = 421 ] || fail "Host guard"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$B/api/jobs/x")" = 403 ] || fail "custom-header guard"

echo "upload"
UP=$(curl -fsS -X PUT "${H[@]}" --data-binary @"$VIDEO" "$B/api/upload?name=$(basename "$VIDEO")" | json "d['uploadId']")

echo "job"
PLAN='{"label":"smoke","uploadId":"'"$UP"'","plan":{"atlas":{"bin":15},"cells":[
 {"name":"palette","recipe":"three-bands.json","trials":2,"top":1},
 {"name":"white-nose","recipe":"three-bands.json","trials":1,"top":1,"paired":false,"color":"white","noOverlap":true,"zones":["nose-cheeks"]}]}}'
JOB=$(curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' -d "$PLAN" "$B/api/jobs" | json "d['id']")
for i in $(seq 1 240); do
   STATUS=$(curl -fsS "$B/api/jobs/$JOB" | json "d['status']")
   case "$STATUS" in done) break;; failed|cancelled) fail "job $STATUS";; esac
   sleep 5; [ "$i" = 240 ] && fail "job still $STATUS after 20 minutes"
done
echo "job done in $(curl -fsS "$B/api/jobs/$JOB" | json "d['finishedAt'] + ' (started ' + d['startedAt'] + ')'")"

echo "results"
curl -fsS "$B/api/jobs/$JOB" | python3 -c "
import json, sys
d = json.load(sys.stdin); s = d['summary']
assert s and len(s['recipes']) == 2, 'two recipes in the summary'
assert len(s['materialised']) >= 2, 'materialised Ghostyles'
assert s['atlas']['imprints'] >= 3, 'atlas imprints'
print('  imprints', s['atlas']['imprints'], '| recipes', [r['recipeId'] for r in s['recipes']], '| best escape', s['materialised'][0]['scores']['escapeRate'])
" || fail "summary"
LOG=$(ls "$DATA"/jobs/*/job.log 2>/dev/null | head -1 || true)
[ -n "$LOG" ] || LOG=$(sudo ls "$DATA"/jobs/*/job.log | head -1)
sudo grep -q "face-api backend webgl" "$LOG" || grep -q "face-api backend webgl" "$LOG" || fail "face-api did not get the WebGL backend (swiftshader)"
DRIFT=$( (sudo grep -h "descriptor drift" "$LOG" 2>/dev/null || grep -h "descriptor drift" "$LOG") | head -1)
echo "  $DRIFT"

echo "downloads"
curl -fsS -o "$DATA.zip" "$B/api/jobs/$JOB/download?what=ghostyles"
unzip -l "$DATA.zip" | grep -q 'ghostyle-fuzz-[0-9]*\.js' || fail "no Ghostyle in the zip"
unzip -l "$DATA.zip" | grep -q 'report.html' || fail "no report in the zip"
rm -f "$DATA.zip"

echo "graceful stop"
docker stop -t 120 "$NAME" >/dev/null
[ "$(docker inspect -f '{{.State.ExitCode}}' "$NAME")" = 0 ] || fail "exit code $(docker inspect -f '{{.State.ExitCode}}' "$NAME") on stop"

echo "SMOKE TEST PASSED"
