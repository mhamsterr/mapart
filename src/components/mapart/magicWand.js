// Magic wand: selects pixels of an RGBA image that are similar in colour to the clicked pixel.
// Pure function (no DOM), so it can be unit tested.
//
//   rgba            Uint8ClampedArray / Uint8Array, 4 bytes per pixel
//   tolerance       0..100; maximum per-channel difference to the seed colour is tolerance * 2.55 levels
//   contiguous      true: flood fill (4-connected) from the seed; false: every similar pixel in the image
//   respectEdges    true: the selection does not grow *out of* pixels sitting on a strong edge, so thin
//                   outlines stop it from leaking into neighbouring objects
//
// Returns a Uint8Array (width * height) with 1 for selected pixels.

const EDGE_THRESHOLD = 40; // gradient magnitude (0..255 scale) above which a pixel counts as an edge

function luminanceGradient(rgba, width, height) {
  const lum = new Float32Array(width * height);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    lum[p] = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * (rgba[i + 3] / 255);
  }
  const edge = new Uint8Array(width * height);
  const at = (x, y) => lum[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      if (Math.sqrt(gx * gx + gy * gy) / 4 > EDGE_THRESHOLD) edge[y * width + x] = 1;
    }
  }
  return edge;
}

export function magicWand(rgba, width, height, seedX, seedY, tolerance, contiguous, respectEdges) {
  const selected = new Uint8Array(width * height);
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return selected;

  // seed colour: mean of the 3x3 neighbourhood, so a single noisy pixel doesn't decide the selection
  const seed = [0, 0, 0, 0];
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = seedX + dx;
      const y = seedY + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) seed[c] += rgba[i + c];
      n++;
    }
  }
  for (let c = 0; c < 4; c++) seed[c] /= n;

  const limit = tolerance * 2.55;
  const similar = (p) => {
    const i = p * 4;
    return (
      Math.abs(rgba[i] - seed[0]) <= limit &&
      Math.abs(rgba[i + 1] - seed[1]) <= limit &&
      Math.abs(rgba[i + 2] - seed[2]) <= limit &&
      Math.abs(rgba[i + 3] - seed[3]) <= limit
    );
  };
  const edge = respectEdges ? luminanceGradient(rgba, width, height) : null;

  if (!contiguous) {
    for (let p = 0; p < selected.length; p++) if (similar(p)) selected[p] = 1;
    return selected;
  }

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const seedPixel = seedY * width + seedX;
  selected[seedPixel] = 1; // the clicked pixel is always part of the selection
  queue[tail++] = seedPixel;
  while (head < tail) {
    const p = queue[head++];
    if (edge !== null && edge[p] === 1 && p !== seedPixel) continue; // edge pixels are selected but not grown from
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0 && !selected[p - 1] && similar(p - 1)) { selected[p - 1] = 1; queue[tail++] = p - 1; }
    if (x < width - 1 && !selected[p + 1] && similar(p + 1)) { selected[p + 1] = 1; queue[tail++] = p + 1; }
    if (y > 0 && !selected[p - width] && similar(p - width)) { selected[p - width] = 1; queue[tail++] = p - width; }
    if (y < height - 1 && !selected[p + width] && similar(p + width)) { selected[p + width] = 1; queue[tail++] = p + width; }
  }
  return selected;
}
