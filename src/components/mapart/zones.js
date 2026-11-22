// Helpers for "tool zones": regions of the map canvas that can override some global settings
// (image corrections, dithering).
//
// A zone's shape is an ordered list of operations (`zone.ops`), each of which adds to or subtracts
// from the shape:  { mode: "add" | "subtract", shape: <shape> }  with shape being one of
//   { type: "rect",   x, y, w, h }                  fractions of the uploaded IMAGE (0..1)
//   { type: "poly",   points: [[u, v], ...] }       image fractions; lasso
//   { type: "brush",  points: [[u, v], ...], radius }  image fractions; radius is a fraction of the image width
//   { type: "bitmap", w, h, data: Uint8Array, t }   magic wand result; one byte per canvas pixel at w x h
//                                                   resolution, t = the image->canvas transform it was made with
// Shapes are stored relative to the IMAGE, not the canvas, so a zone stays on the same part of the picture when
// the map size or crop changes. A transform T = { ax, bx, ay, by } (see cropTransform.js) converts image
// fractions to canvas pixels:  x = ax * u + bx,  y = ay * v + by.
// The ops are rasterised to a per-pixel mask at the current canvas size and transform (see getZoneMask).
// Later zones in the array win where zones overlap.

export const MAX_ZONES = 12;

export function createZone(id, name, defaults, ops = []) {
  return {
    id,
    name,
    ops, // always pass a fresh array: masks are cached per ops array identity
    shapeVersion: 0, // bumped whenever ops change; used for change detection
    overrideCorrections: false,
    brightness: defaults.brightness,
    contrast: defaults.contrast,
    saturation: defaults.saturation,
    overrideDithering: false,
    dithering: defaults.dithering,
    ditheringPropagationRed: defaults.ditheringPropagationRed,
    ditheringPropagationGreen: defaults.ditheringPropagationGreen,
    ditheringPropagationBlue: defaults.ditheringPropagationBlue,
  };
}

// ---------------------------------------------------------------- rasterisation

function drawShape(ctx, shape, width, height, T) {
  switch (shape.type) {
    case "rect": {
      const x0 = Math.round(T.ax * shape.x + T.bx);
      const y0 = Math.round(T.ay * shape.y + T.by);
      const x1 = Math.round(T.ax * (shape.x + shape.w) + T.bx);
      const y1 = Math.round(T.ay * (shape.y + shape.h) + T.by);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      break;
    }
    case "poly": {
      if (shape.points.length < 3) break;
      ctx.beginPath();
      shape.points.forEach(([u, v], index) => (index === 0 ? ctx.moveTo(T.ax * u + T.bx, T.ay * v + T.by) : ctx.lineTo(T.ax * u + T.bx, T.ay * v + T.by)));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "brush": {
      const radius = Math.max(0.5, shape.radius * T.ax);
      if (shape.points.length === 1) {
        ctx.beginPath();
        ctx.arc(T.ax * shape.points[0][0] + T.bx, T.ay * shape.points[0][1] + T.by, radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineWidth = radius * 2;
        ctx.beginPath();
        shape.points.forEach(([u, v], index) => (index === 0 ? ctx.moveTo(T.ax * u + T.bx, T.ay * v + T.by) : ctx.lineTo(T.ax * u + T.bx, T.ay * v + T.by)));
        ctx.stroke();
      }
      break;
    }
    case "bitmap": {
      // the wand's pixels belong to the picture, not to the canvas: look every canvas pixel up through the image
      // fractions, using the transform the bitmap was made with (identity when it equals the current one)
      const t = shape.t;
      const layer = document.createElement("canvas");
      layer.width = width;
      layer.height = height;
      const layerCtx = layer.getContext("2d");
      const image = layerCtx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        const v = (y + 0.5 - T.by) / T.ay;
        const sourceY = Math.floor(t.ay * v + t.by);
        if (sourceY < 0 || sourceY >= shape.h) continue;
        for (let x = 0; x < width; x++) {
          const u = (x + 0.5 - T.bx) / T.ax;
          const sourceX = Math.floor(t.ax * u + t.bx);
          if (sourceX >= 0 && sourceX < shape.w && shape.data[sourceY * shape.w + sourceX]) {
            const i = (y * width + x) * 4;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = image.data[i + 3] = 255;
          }
        }
      }
      layerCtx.putImageData(image, 0, 0);
      ctx.drawImage(layer, 0, 0);
      break;
    }
    default:
      break;
  }
}

function rasterizeOps(ops, width, height, T) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const op of ops) {
    ctx.globalCompositeOperation = op.mode === "subtract" ? "destination-out" : "source-over";
    drawShape(ctx, op.shape, width, height, T);
  }
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  let count = 0;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let p = 0, i = 3; p < mask.length; p++, i += 4) {
    if (data[i] >= 128) {
      mask[p] = 1;
      count++;
      const x = p % width;
      const y = (p - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { mask, count, bbox: count > 0 ? { x0, y0, x1: x1 + 1, y1: y1 + 1 } : null };
}

const maskCache = new WeakMap(); // ops array -> Map("WxH" -> { mask, count, bbox })

/** Identifies a transform (for caches and change detection). */
export function transformKey(T) {
  return `${T.ax.toFixed(6)},${T.bx.toFixed(6)},${T.ay.toFixed(6)},${T.by.toFixed(6)}`;
}

/** Image fractions -> canvas pixels, and back. */
export const imageToCanvas = (T, u, v) => [T.ax * u + T.bx, T.ay * v + T.by];
export const canvasToImage = (T, x, y) => [(x - T.bx) / T.ax, (y - T.by) / T.ay];

/** Per-pixel mask of a zone at the given canvas size: { mask: Uint8Array (1 = in zone), count, bbox }. Cached. */
export function getZoneMask(zone, width, height, T) {
  let bySize = maskCache.get(zone.ops);
  if (!bySize) {
    bySize = new Map();
    maskCache.set(zone.ops, bySize);
  }
  const key = `${width}x${height}|${transformKey(T)}`;
  let result = bySize.get(key);
  if (!result) {
    result = rasterizeOps(zone.ops, width, height, T);
    bySize.set(key, result);
  }
  return result;
}

const maskCanvasCache = new WeakMap(); // mask -> canvas whose alpha is 255 where the mask is set

/** Canvas (same size as the map canvas) that is opaque exactly where the mask is set; used for compositing. */
export function getMaskCanvas(mask, width, height) {
  let canvas = maskCanvasCache.get(mask);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(width, height);
    for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
      if (mask[p]) {
        image.data[i] = image.data[i + 1] = image.data[i + 2] = image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    maskCanvasCache.set(mask, canvas);
  }
  return canvas;
}

const layerCache = new WeakMap(); // mask -> { normal, selected } overlay layers

/** Translucent fill plus a 1px outline of the mask, drawn to a canvas of the map's size. Cached. */
export function getZoneOverlayLayer(mask, width, height, selected) {
  let layers = layerCache.get(mask);
  if (!layers) {
    layers = {};
    layerCache.set(mask, layers);
  }
  const key = selected ? "selected" : "normal";
  if (!layers[key]) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(width, height);
    const outline = selected ? [212, 175, 55, 255] : [224, 222, 188, 235];
    const fill = selected ? [212, 175, 55, 48] : [224, 222, 188, 26];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (!mask[p]) continue;
        const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1 || !mask[p - 1] || !mask[p + 1] || !mask[p - width] || !mask[p + width];
        const colour = isEdge ? outline : fill;
        image.data.set(colour, p * 4);
      }
    }
    ctx.putImageData(image, 0, 0);
    layers[key] = canvas;
  }
  return layers[key];
}

// ---------------------------------------------------------------- helpers used by preview / worker

/** The topmost (last in the list) zone covering a canvas pixel, or null. */
export function zoneAtPixel(zones, width, height, T, x, y) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return null;
  for (let index = zones.length - 1; index >= 0; index--) {
    if (getZoneMask(zones[index], width, height, T).mask[py * width + px]) return zones[index];
  }
  return null;
}

/** If the zone is exactly one added rectangle, returns it (fractions); otherwise null. */
export function getSimpleRect(zone) {
  if (zone.ops.length === 1 && zone.ops[0].mode === "add" && zone.ops[0].shape.type === "rect") {
    return zone.ops[0].shape;
  }
  return null;
}

/**
 * Builds the data the quantiser worker needs for per-zone dithering.
 * Returns { zoneMask: null, zoneDitherSettings: [] } when no zone overrides dithering, so
 * the worker keeps using its original (fastest) code path.
 *
 * zoneMask[pixel] = (index of zone in `zones`) + 1 for pixels in a dithering-override zone, else 0.
 * zoneDitherSettings[zoneMaskValue] = settings for that zone (index 0 and non-override zones are null).
 */
export function buildZoneDitherPayload(zones, width, height, T) {
  const ditherZones = (zones || []).filter((z) => z.overrideDithering);
  if (ditherZones.length === 0) {
    return { zoneMask: null, zoneDitherSettings: [] };
  }
  const zoneMask = new Uint8Array(width * height);
  const zoneDitherSettings = new Array(zones.length + 1).fill(null);
  zones.forEach((zone, index) => {
    if (!zone.overrideDithering) return;
    const id = index + 1;
    zoneDitherSettings[id] = {
      dithering: zone.dithering,
      propagationRed: zone.ditheringPropagationRed,
      propagationGreen: zone.ditheringPropagationGreen,
      propagationBlue: zone.ditheringPropagationBlue,
    };
    const { mask } = getZoneMask(zone, width, height, T);
    for (let p = 0; p < mask.length; p++) {
      if (mask[p]) zoneMask[p] = id;
    }
  });
  return { zoneMask, zoneDitherSettings };
}

/** String that changes only when something affecting the rendered result changes (not the name). */
export function zonesRenderSignature(zones) {
  return JSON.stringify((zones || []).map(({ name, ops, ...rest }) => rest)); // eslint-disable-line no-unused-vars
}
