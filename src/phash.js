// Perceptual hashing of section screenshots for visual similarity.
// Uses sharp to downscale to grayscale, then computes a dHash (row+col gradients)
// plus a coarse average-brightness grid used as a secondary signal.
import sharp from 'sharp';

const W = 9; // dHash works on a (W-1) wide difference
const H = 8;

/**
 * Compute a visual signature for an image file.
 * @returns {Promise<{dhash: bigint, grid: number[], aspect: number}>}
 */
export async function computeSignature(imgPath) {
  // dHash: resize to 9x8 grayscale, compare adjacent pixels row-wise.
  const gray = await sharp(imgPath)
    .greyscale()
    .resize(W, H, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data } = gray;
  let dhash = 0n;
  let bit = 0n;
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W - 1; col++) {
      const left = data[row * W + col];
      const right = data[row * W + col + 1];
      if (left > right) dhash |= 1n << bit;
      bit++;
    }
  }

  // Coarse 8x8 average grid (normalized 0..1) as a robustness signal.
  const grid = await sharp(imgPath)
    .greyscale()
    .resize(8, 8, { fit: 'fill' })
    .raw()
    .toBuffer();
  const gridArr = [...grid].map((v) => v / 255);

  // Aspect ratio of the original (helps avoid matching very different shapes).
  const meta = await sharp(imgPath).metadata();
  const aspect = meta.width && meta.height ? meta.width / meta.height : 1;

  return { dhash: dhash.toString(), grid: gridArr, aspect };
}

// Hamming distance between two dHash strings (bigint-encoded).
export function hammingDistance(aStr, bStr) {
  let x = BigInt(aStr) ^ BigInt(bStr);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}
