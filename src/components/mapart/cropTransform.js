// How the uploaded image is placed on the map canvas. One source rectangle of the image is stretched over
// the whole canvas; which rectangle depends on the map size and the crop settings. Both the preview drawing
// and the zones (which are stored in image coordinates, so they stay on the same part of the picture when the
// map size or crop changes) use these functions, so they can never disagree.

/**
 * Source rectangle (in image pixels) that is drawn over the whole canvas.
 *   cropOff   true when cropping is off: the whole image is stretched over the canvas
 *   zoom      10..50, percentX/percentY 0..100, as in the crop settings
 */
export function getSourceRect({ cropOff, imgW, imgH, mapSizeX, mapSizeY, zoom, percentX, percentY }) {
  if (cropOff) {
    return { sx: 0, sy: 0, sw: imgW, sh: imgH };
  }
  let sw;
  let sh;
  if (imgW * mapSizeY > imgH * mapSizeX) {
    // image w/h greater than canvas w/h
    sw = Math.floor((10 * imgH * mapSizeX) / (mapSizeY * zoom)); // the 10 is because zoom is from 10 to 50 in steps of 1
    sh = Math.floor((10 * imgH) / zoom);
  } else {
    // image w/h leq canvas w/h
    sw = Math.floor((10 * imgW) / zoom);
    sh = Math.floor((10 * imgW * mapSizeY) / (mapSizeX * zoom));
  }
  return {
    sx: Math.floor((percentX * (imgW - sw)) / 100),
    sy: Math.floor((percentY * (imgH - sh)) / 100),
    sw,
    sh,
  };
}

/**
 * Transform from image fractions (u, v in 0..1 of the whole image) to canvas pixels:
 *   x = ax * u + bx,   y = ay * v + by
 * Without an image there is nothing to anchor to, so image fractions are simply canvas fractions.
 */
export function getZoneTransform({ image, cropOff, mapSizeX, mapSizeY, zoom, percentX, percentY }) {
  const W = 128 * mapSizeX;
  const H = 128 * mapSizeY;
  if (!image || !image.width || !image.height) {
    return { ax: W, bx: 0, ay: H, by: 0 };
  }
  const imgW = image.width;
  const imgH = image.height;
  const { sx, sy, sw, sh } = getSourceRect({ cropOff, imgW, imgH, mapSizeX, mapSizeY, zoom, percentX, percentY });
  return {
    ax: (imgW * W) / sw,
    bx: (-sx * W) / sw,
    ay: (imgH * H) / sh,
    by: (-sy * H) / sh,
  };
}
