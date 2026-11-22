/** @module face-descriptor */
export const FACE_DESCRIPTOR_SIZE = 128;

/**
 * Checks the shape shared by Lab and Realtime face-api descriptors.
 * @param {ArrayLike<number>|null} descriptor Candidate vector to validate.
 * @returns {boolean} Whether the vector contains exactly 128 finite numbers.
 */
export function isFaceDescriptor(descriptor) {
   return (Array.isArray(descriptor) || ArrayBuffer.isView(descriptor))
      && descriptor.length === FACE_DESCRIPTOR_SIZE
      && descriptor.every(Number.isFinite);
}

/**
 * Measures Euclidean distance between two vectors of the same length.
 * @param {ArrayLike<number>} first First compatible descriptor.
 * @param {ArrayLike<number>} second Second compatible descriptor.
 * @returns {number} The distance in descriptor space.
 */
export function descriptorDistance(first, second) {
   let squares = 0;
   for (let index = 0; index < first.length; index += 1) {
      squares += (first[index] - second[index]) ** 2;
   }
   return Math.sqrt(squares);
}
