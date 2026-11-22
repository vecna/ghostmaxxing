# AI fixture labeling

Since we might use AI/diffsion generated images to test camouflage, it is handy to have a script to tag in a visible way the synthetic faces and the machine-generated makeup.

```sh
node scripts-dev/mark-ai-images.cjs --size 15% --dry-run
node scripts-dev/mark-ai-images.cjs --size 15%
```

`--size 160` means a 160px-wide badge. Default: 15% of image width, bottom-right.
The marker defaults to all JPEG/PNG files under `tests/fixtures/synthetic-faces/`.
Existing visible badges are skipped, including badges of another size. See
`scripts-dev/README.md` for exact overwrite behaviour and detection limits.

## Why a visible label

C2PA has an official Content Credentials icon, but it represents available
provenance information; Ghostmaxxing doesn't need EXIF/metadata informations, but rather visible
human information when media is consumed.
It adds no hidden marker or EXIF provenance claim. C2PA might be a known industry standard, but isn't suitable in this case.

The scripts apply an explicit **AI Gen** label in the project's existing Atkinson Bold font and
orange/ink colour tokens. 

(unused, but) C2PA references:

- [C2PA official icon](https://c2pa.org/introducing-official-content-credentials-icon/)
- [C2PA explainer](https://spec.c2pa.org/specifications/specifications/2.4/explainer/Explainer.html)

## Test made 

- All **33** synthetic JPEG fixture copies were marked at 15%, then run again
  with `--size 120`: all skipped, and before/after SHA-256 lists were identical.
- The four regression cases cover JPEG and PNG idempotence at changed sizes,
  unchanged dimensions, dry-run/invalid-size byte preservation, and corrupt input.
- Visually inspected a marked portrait; the badge is legible in the bottom-right.
