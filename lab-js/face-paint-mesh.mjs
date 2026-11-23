// Ordered MediaPipe contours at the boundary between paintable tissue and
// the exposed eyes and mouth. The mouth loop follows the inner lip edges.
export const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
export const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const INNER_LIPS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];

const OPENINGS = [LEFT_EYE, RIGHT_EYE, INNER_LIPS];
const OPENING_VERTICES = OPENINGS.map((loop) => new Set(loop));
export const FACE_LANDMARK_COUNT = 468;

/** The canonical atlas triangulates each opening using only its boundary vertices. */
export function paintableTriangles(triangles) {
   return triangles.filter((triangle) => triangle.every((i) => i < FACE_LANDMARK_COUNT)
      && !OPENING_VERTICES.some((vertices) => triangle.every((i) => vertices.has(i))));
}

/** Project the opening contours using the current frame's landmarks. */
export function faceOpenings(landmarks) {
   const loops = OPENINGS.map((loop) => loop.map((i) => landmarks[i]));
   return loops.every((loop) => loop.every((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)))
      ? loops : null;
}
