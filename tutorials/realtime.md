# Latent Space Visualizer

**Project:** Ghostmaxxing

**Audience:** people iterating on physical makeup and researchers inspecting
face-descriptor drift

**Status:** experimental

The Latent Space Visualizer (`realtime.html`) is a local, real-time instrument
for comparing a face-api/dlib descriptor with a baseline. It is designed around
a makeup session: capture the untreated state, tell the tool when application
starts, then ask it to measure each finished step over a short window.

It reports what this one browser model did under the tested conditions. It does
not establish protection from another recognition system.

## 1. Choose a source

The default source is the camera. Open **Source → Open local video** to use a
recording instead. The file remains on the device and can be paused, sought and
replayed with the browser's video controls.

Changing source invalidates the current baseline. Camera baselines can be
restored after reload; local-video baselines last only for the current page
session because the temporary file URL does not survive a reload.

## 2. Capture a baseline

1. Return to a neutral, frontal pose and keep the room light steady.
2. Press **Set baseline**.
3. Hold the pose while the ring collects eight accepted samples across at least
   three seconds.

The tool rejects baseline frames when detection confidence is low, the face is
too small or clipped, the head roll/yaw is too large, or the face crop is badly
under- or overexposed. The message in the pill names the current rejection; it
is not a generic lighting warning.

The resulting medoid becomes the baseline. Its average spread is shown as the
session noise floor.

## 3. Measure a makeup step

1. Press **Start makeup step** before applying one change. The timeline marks
   the event and shades the application interval.
2. Apply the change. You may leave the frame; a sustained absence becomes one
   collapsed gap rather than a long run of false zeroes.
3. Return to the baseline pose and light, then press **Measure this step**.
4. Hold still while eight comparable samples are collected across at least
   three seconds.

The result is the medoid of that window, not a single clicked frame. The tool
shows its distance from the original baseline and its temporal spread, updates
the measured radial shape, and saves the sharpest accepted frame as a step
thumbnail. Repeat with **Start next step** for cumulative changes.

With a local video, phase markers include the media time. Starting or measuring
a step resumes a paused video, so the collection window can advance instead of
silently sampling one frozen frame.

## 4. What gets excluded

After baseline capture, the software permits appearance changes that may lower
detector confidence or darken the face crop. It still excludes frames whose 2D
pose, face-box size/position, or ambient luminance differs too much from the
baseline. Ambient light is estimated outside the face box so dark makeup is
less likely to be mistaken for a room-light change.

This is a nuisance gate, not full pose or lighting normalisation. It does not
measure pitch, cannot know that makeup caused the remaining change, and cannot
separate every shadow from every intervention.

## 5. Read the three panels

- **Distance.** The live Euclidean distance and a scrolling timeline. The noise
  floor is measured from this baseline; `0.60` is dlib's documented LFW
  operating point. The space between them is deliberately uncalibrated.
- **Source and experiment.** Camera or local video, baseline progress, phase
  controls, status, capture controls and local gallery actions. **Display** only
  changes CSS brightness; it does not change pixels seen by the model.
- **Descriptor Delta.** The equalizer and radial fingerprint show the absolute
  change in all 128 descriptor coordinates. The live radial outline can be
  compared with the filled shape from the latest measured step.

Descriptor dimensions are not facial regions. A radial spoke cannot identify
which cheek, eyebrow or makeup line caused a change. These views can show
whether two 128-value patterns differ; they cannot explain the face semantically.

## 6. Captures and privacy

Manual, sustained-spike and declared-step captures are saved as watermarked
JPEGs in browser IndexedDB. Camera baselines and view settings use localStorage.
The selected video itself is neither uploaded nor persisted by the page.

**Delete baseline** removes the persisted camera descriptor but deliberately
does not erase the gallery. Use **Delete all** or delete individual captures in
the viewer when those records are no longer needed.

A 128-value face descriptor is biometric data. Treat exported images and local
browser storage accordingly, even though this page does not transmit them.

## 7. Interpreting a result

Report the measured step distance together with the baseline noise floor and
the step's temporal spread. Compare steps within one session, re-baseline after
changing the source or setup, and repeat promising measurements. A high value is
evidence of movement in this specific 2017 dlib embedding under these conditions;
it is not evidence of evasion against a deployed system.

For thresholds, algorithms, research provenance and limitations, read
[Realtime Visualizer: Methodology, Sources and Limits](/docs/jsdoc/tutorials/realtime-fr-method).
