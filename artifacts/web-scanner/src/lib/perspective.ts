/**
 * perspective.ts
 * On-device perspective warp using a 20×20 triangle mesh.
 * No server, no library — pure Canvas API.
 */

export interface Point { x: number; y: number }
export interface WarpPerspectiveOptions {
  maxCpuPixels?: number;
}

export interface CurvedPageWarp {
  corners: [Point, Point, Point, Point];
  foldCurve: Point[];
  side: 'left' | 'right';
}

export function fitWarpSizeToPixelLimit(
  width: number,
  height: number,
  maxPixels: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeMaxPixels = Number.isFinite(maxPixels)
    ? Math.max(1, maxPixels)
    : safeWidth * safeHeight;
  const scale = Math.min(1, Math.sqrt(safeMaxPixels / (safeWidth * safeHeight)));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

/** corners = [TL, TR, BR, BL] in source image coordinates */
export function warpPerspective(
  src: HTMLCanvasElement | HTMLImageElement,
  corners: [Point, Point, Point, Point],
  outW: number,
  outH: number,
  options: WarpPerspectiveOptions = {},
): HTMLCanvasElement {
  const gpuResult = warpPerspectiveWebGL(src, corners, outW, outH);
  if (gpuResult) return gpuResult;

  const cpuResult = warpPerspectiveCPU(
    src,
    corners,
    outW,
    outH,
    options.maxCpuPixels,
  );
  if (cpuResult) return cpuResult;

  // This legacy fallback is used only if image pixels cannot be read for the
  // CPU path (for example, a browser-specific canvas restriction).
  const dst = document.createElement('canvas');
  dst.width = outW;
  dst.height = outH;
  const ctx = dst.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const MESH = 24; // grid resolution — higher = sharper but slower

  for (let row = 0; row < MESH; row++) {
    for (let col = 0; col < MESH; col++) {
      const u0 = col / MESH,       v0 = row / MESH;
      const u1 = (col + 1) / MESH, v1 = (row + 1) / MESH;

      // Destination cell corners (rectangular grid in output)
      const d00 = { x: u0 * outW, y: v0 * outH };
      const d10 = { x: u1 * outW, y: v0 * outH };
      const d11 = { x: u1 * outW, y: v1 * outH };
      const d01 = { x: u0 * outW, y: v1 * outH };

      // Source cell corners (bilinear interpolation in input quad)
      const s00 = bilerp(corners, u0, v0);
      const s10 = bilerp(corners, u1, v0);
      const s11 = bilerp(corners, u1, v1);
      const s01 = bilerp(corners, u0, v1);

      // Upper-left triangle
      drawTexturedTri(ctx, src, d00, d10, d01, s00, s10, s01);
      // Lower-right triangle
      drawTexturedTri(ctx, src, d10, d11, d01, s10, s11, s01);
    }
  }

  return dst;
}

/**
 * Warp one book page while keeping the binding edge curved.
 *
 * A homography can flatten a planar page, but it cannot flatten the small
 * cylinder made by a bound book. This mesh maps each horizontal output row
 * between the outside edge and the measured binding curve. WebGL handles the
 * normal path; the pixel sampler below keeps the same geometry available when
 * WebGL is disabled.
 */
export function warpBookPage(
  src: HTMLCanvasElement | HTMLImageElement,
  page: CurvedPageWarp,
  outW: number,
  outH: number,
  options: WarpPerspectiveOptions = {},
): HTMLCanvasElement {
  const gpuResult = warpBookPageWebGL(src, page, outW, outH);
  if (gpuResult) return gpuResult;

  // Preserve the requested output dimensions when the caller did not set a
  // platform ceiling. WebGL availability must not silently change effective
  // DPI. Source reads are bounded independently inside the CPU implementation.
  const target = Number.isFinite(options.maxCpuPixels)
    ? fitWarpSizeToPixelLimit(outW, outH, options.maxCpuPixels!)
    : { width: outW, height: outH };
  const sourceReadLimit = Number.isFinite(options.maxCpuPixels)
    ? options.maxCpuPixels!
    : Math.max(2_400_000, target.width * target.height);
  const cpuResult = warpBookPageCPU(
    src,
    page,
    target.width,
    target.height,
    sourceReadLimit,
  );
  if (cpuResult) return cpuResult;

  // This last-resort path is intentionally simple and keeps the same
  // conservative page geometry if a browser refuses pixel reads.
  return warpPerspective(src, page.corners, target.width, target.height, options);
}

function curvedPageSourcePoint(
  page: CurvedPageWarp,
  u: number,
  v: number,
): Point {
  const [TL, TR, BR, BL] = page.corners;
  const outside = page.side === 'left'
    ? lerp2(TL, BL, v)
    : lerp2(TR, BR, v);
  const fold = sampleCurve(page.foldCurve, v);
  return page.side === 'left'
    ? lerp2(outside, fold, u)
    : lerp2(fold, outside, u);
}

function sampleCurve(curve: Point[], t: number): Point {
  if (!curve.length) return { x: 0, y: 0 };
  if (curve.length === 1) return curve[0];
  const position = Math.max(0, Math.min(1, t)) * (curve.length - 1);
  const index = Math.min(curve.length - 2, Math.floor(position));
  return lerp2(curve[index], curve[index + 1], position - index);
}

function warpBookPageWebGL(
  src: HTMLCanvasElement | HTMLImageElement,
  page: CurvedPageWarp,
  outW: number,
  outH: number,
): HTMLCanvasElement | null {
  const sourceW = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const sourceH = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  if (!sourceW || !sourceH || !outW || !outH) return null;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  if (
    sourceW > maxTexture || sourceH > maxTexture ||
    outW > maxRenderbuffer || outH > maxRenderbuffer ||
    outW > maxViewport[0] || outH > maxViewport[1]
  ) return null;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
      vTexCoord = aTexCoord;
    }
  `);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    uniform sampler2D uTexture;
    varying vec2 vTexCoord;
    void main() {
      gl_FragColor = texture2D(uTexture, vTexCoord);
    }
  `);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const columns = 24;
  const rows = 32;
  const positions: number[] = [];
  const texCoords: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    for (let col = 0; col <= columns; col++) {
      const u = col / columns;
      const source = curvedPageSourcePoint(page, u, v);
      positions.push(u * 2 - 1, 1 - v * 2);
      texCoords.push(source.x / sourceW, source.y / sourceH);
    }
  }

  const indices: number[] = [];
  const stride = columns + 1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const topLeft = row * stride + col;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft);
    }
  }

  const positionBuffer = gl.createBuffer();
  const texCoordBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!positionBuffer || !texCoordBuffer || !indexBuffer) return null;

  const bindAttribute = (
    buffer: WebGLBuffer,
    name: string,
    values: number[],
    size: number,
  ) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, name);
    if (location < 0) return;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  };

  bindAttribute(positionBuffer, 'aPosition', positions, 2);
  bindAttribute(texCoordBuffer, 'aTexCoord', texCoords, 2);

  const texture = gl.createTexture();
  if (!texture) return null;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  } catch {
    return null;
  }
  if (gl.getError() !== gl.NO_ERROR) return null;

  const sampler = gl.getUniformLocation(program, 'uTexture');
  if (sampler) gl.uniform1i(sampler, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  gl.viewport(0, 0, outW, outH);
  gl.clearColor(1, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  if (gl.getError() !== gl.NO_ERROR) return null;
  return canvas;
}

function warpBookPageCPU(
  src: HTMLCanvasElement | HTMLImageElement,
  page: CurvedPageWarp,
  outW: number,
  outH: number,
  requestedMaxPixels = 2_400_000,
): HTMLCanvasElement | null {
  const sourceW = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const sourceH = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  if (!sourceW || !sourceH) return null;

  // Read only the page being processed, not the complete two-page spread.
  // Downsampling a 12 MP spread to a 6 MP CPU budget would leave only ~3 MP
  // of detail for one page and then upscale it to a 6 MP output. Cropping
  // first preserves the page's real source detail within the same memory cap.
  const pagePoints = [...page.corners, ...page.foldCurve];
  const minX = Math.max(0, Math.floor(Math.min(...pagePoints.map(point => point.x))) - 2);
  const minY = Math.max(0, Math.floor(Math.min(...pagePoints.map(point => point.y))) - 2);
  const maxX = Math.min(sourceW, Math.ceil(Math.max(...pagePoints.map(point => point.x))) + 2);
  const maxY = Math.min(sourceH, Math.ceil(Math.max(...pagePoints.map(point => point.y))) + 2);
  const cropWidth = Math.max(1, maxX - minX);
  const cropHeight = Math.max(1, maxY - minY);
  const sourceTarget = fitWarpSizeToPixelLimit(cropWidth, cropHeight, requestedMaxPixels);
  const sourceScaleX = sourceTarget.width / cropWidth;
  const sourceScaleY = sourceTarget.height / cropHeight;
  const scaledPage: CurvedPageWarp = {
    side: page.side,
    corners: page.corners.map(point => ({
      x: (point.x - minX) * sourceScaleX,
      y: (point.y - minY) * sourceScaleY,
    })) as [Point, Point, Point, Point],
    foldCurve: page.foldCurve.map(point => ({
      x: (point.x - minX) * sourceScaleX,
      y: (point.y - minY) * sourceScaleY,
    })),
  };
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = sourceTarget.width;
  sourceCanvas.height = sourceTarget.height;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const output = document.createElement('canvas');
  output.width = outW;
  output.height = outH;
  const outputCtx = output.getContext('2d');
  if (!sourceCtx || !outputCtx) return null;

  try {
    sourceCtx.drawImage(
      src,
      minX,
      minY,
      cropWidth,
      cropHeight,
      0,
      0,
      sourceTarget.width,
      sourceTarget.height,
    );
    const input = sourceCtx.getImageData(0, 0, sourceTarget.width, sourceTarget.height);
    const result = outputCtx.createImageData(outW, outH);
    const sourceData = input.data;
    const resultData = result.data;

    for (let y = 0; y < outH; y++) {
      const v = outH === 1 ? 0 : y / (outH - 1);
      for (let x = 0; x < outW; x++) {
        const u = outW === 1 ? 0 : x / (outW - 1);
        const sourcePoint = curvedPageSourcePoint(scaledPage, u, v);
        if (
          sourcePoint.x < 0 || sourcePoint.y < 0 ||
          sourcePoint.x >= sourceTarget.width - 1 || sourcePoint.y >= sourceTarget.height - 1
        ) continue;
        const left = Math.floor(sourcePoint.x);
        const top = Math.floor(sourcePoint.y);
        const fx = sourcePoint.x - left;
        const fy = sourcePoint.y - top;
        const right = left + 1;
        const bottom = top + 1;
        const outputIndex = (y * outW + x) * 4;
        const topLeft = (top * sourceTarget.width + left) * 4;
        const topRight = topLeft + 4;
        const bottomLeft = bottom * sourceTarget.width * 4 + left * 4;
        const bottomRight = bottomLeft + 4;
        for (let channel = 0; channel < 4; channel++) {
          const topValue = sourceData[topLeft + channel] * (1 - fx) + sourceData[topRight + channel] * fx;
          const bottomValue = sourceData[bottomLeft + channel] * (1 - fx) + sourceData[bottomRight + channel] * fx;
          resultData[outputIndex + channel] = topValue * (1 - fy) + bottomValue * fy;
        }
      }
    }
    outputCtx.putImageData(result, 0, 0);
    return output;
  } catch {
    return null;
  }
}

/**
 * Seam-free CPU fallback for browsers where WebGL is unavailable.
 * It evaluates the inverse projective transform for each output pixel rather
 * than joining hundreds of independently anti-aliased triangles.
 */
function warpPerspectiveCPU(
  src: HTMLCanvasElement | HTMLImageElement,
  corners: [Point, Point, Point, Point],
  outW: number,
  outH: number,
  requestedMaxPixels = 2_400_000,
): HTMLCanvasElement | null {
  const sourceW = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const sourceH = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  if (!sourceW || !sourceH) return null;

  // Keep the conservative 2.4 MP default for non-iOS callers. iOS callers can
  // explicitly opt into the same post-correction ceiling used by their normal
  // WebGL path, so a GPU fallback does not silently reduce the chosen DPI.
  const target = fitWarpSizeToPixelLimit(outW, outH, requestedMaxPixels);
  const targetW = target.width;
  const targetH = target.height;

  const homography = solveHomography(
    [[0, 0], [targetW, 0], [targetW, targetH], [0, targetH]],
    corners.map(p => [p.x, p.y]) as [number, number][],
  );
  if (!homography) return null;

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = sourceW;
  sourceCanvas.height = sourceH;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const output = document.createElement('canvas');
  output.width = targetW;
  output.height = targetH;
  const outputCtx = output.getContext('2d');
  if (!sourceCtx || !outputCtx) return null;

  try {
    sourceCtx.drawImage(src, 0, 0, sourceW, sourceH);
    const input = sourceCtx.getImageData(0, 0, sourceW, sourceH);
    const result = outputCtx.createImageData(targetW, targetH);
    const sourceData = input.data;
    const resultData = result.data;

    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        const q = homography[6] * x + homography[7] * y + 1;
        if (Math.abs(q) < 1e-8) continue;
        const sourceX = (homography[0] * x + homography[1] * y + homography[2]) / q;
        const sourceY = (homography[3] * x + homography[4] * y + homography[5]) / q;
        if (sourceX < 0 || sourceY < 0 || sourceX >= sourceW - 1 || sourceY >= sourceH - 1) continue;

        const left = Math.floor(sourceX);
        const top = Math.floor(sourceY);
        const right = left + 1;
        const bottom = top + 1;
        const fx = sourceX - left;
        const fy = sourceY - top;
        const outputIndex = (y * targetW + x) * 4;
        const topLeft = (top * sourceW + left) * 4;
        const topRight = topLeft + 4;
        const bottomLeft = ((bottom * sourceW + left) * 4);
        const bottomRight = bottomLeft + 4;
        for (let channel = 0; channel < 4; channel++) {
          const topValue = sourceData[topLeft + channel] * (1 - fx) + sourceData[topRight + channel] * fx;
          const bottomValue = sourceData[bottomLeft + channel] * (1 - fx) + sourceData[bottomRight + channel] * fx;
          resultData[outputIndex + channel] = topValue * (1 - fy) + bottomValue * fy;
        }
      }
    }

    outputCtx.putImageData(result, 0, 0);
    return output;
  } catch {
    return null;
  }
}

/**
 * Seam-free projective warp using the browser's GPU.
 *
 * The previous implementation split the page into many clipped triangles.
 * Anti-aliasing at each triangle boundary can expose the mesh as a diagonal
 * grid. A single perspective-correct WebGL quad samples the same transform
 * continuously, so text and flat paper areas remain clean.
 */
function warpPerspectiveWebGL(
  src: HTMLCanvasElement | HTMLImageElement,
  corners: [Point, Point, Point, Point],
  outW: number,
  outH: number,
): HTMLCanvasElement | null {
  const sourceW = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const sourceH = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  if (!sourceW || !sourceH) return null;

  const homography = solveHomography(
    [
      [0, 0], [outW, 0], [outW, outH], [0, outH],
    ],
    corners.map(p => [p.x, p.y]) as [number, number][],
  );
  if (!homography) return null;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  if (
    sourceW > maxTexture || sourceH > maxTexture ||
    outW > maxRenderbuffer || outH > maxRenderbuffer ||
    outW > maxViewport[0] || outH > maxViewport[1]
  ) return null;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    attribute float aWeight;
    varying vec2 vTexCoordTimesWeight;
    varying float vWeight;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
      vTexCoordTimesWeight = aTexCoord * aWeight;
      vWeight = aWeight;
    }
  `);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    uniform sampler2D uTexture;
    varying vec2 vTexCoordTimesWeight;
    varying float vWeight;
    void main() {
      gl_FragColor = texture2D(uTexture, vTexCoordTimesWeight / vWeight);
    }
  `);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const positions: number[] = [];
  const texCoords: number[] = [];
  const weights: number[] = [];
  const destination = [
    [0, 0], [outW, 0], [outW, outH], [0, outH],
  ];

  for (let i = 0; i < 4; i++) {
    const [x, y] = destination[i];
    const { x: sx, y: sy } = corners[i];
    const weight = homography[6] * x + homography[7] * y + 1;
    if (!Number.isFinite(weight) || Math.abs(weight) < 1e-6) return null;

    positions.push(
      (x / outW) * 2 - 1,
      1 - (y / outH) * 2,
    );
    // WebGL's default image upload keeps this top-origin source convention.
    texCoords.push(sx / sourceW, sy / sourceH);
    weights.push(weight);
  }

  const positionBuffer = gl.createBuffer();
  const texCoordBuffer = gl.createBuffer();
  const weightBuffer = gl.createBuffer();
  if (!positionBuffer || !texCoordBuffer || !weightBuffer) return null;

  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const indexBuffer = gl.createBuffer();
  if (!indexBuffer) return null;

  const bindAttribute = (buffer: WebGLBuffer, name: string, values: number[], size: number) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, name);
    if (location < 0) return;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  };

  bindAttribute(positionBuffer, 'aPosition', positions, 2);
  bindAttribute(texCoordBuffer, 'aTexCoord', texCoords, 2);
  bindAttribute(weightBuffer, 'aWeight', weights, 1);

  const texture = gl.createTexture();
  if (!texture) return null;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  } catch {
    return null;
  }
  if (gl.getError() !== gl.NO_ERROR) return null;

  const sampler = gl.getUniformLocation(program, 'uTexture');
  if (sampler) gl.uniform1i(sampler, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.viewport(0, 0, outW, outH);
  gl.clearColor(1, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  if (gl.getError() !== gl.NO_ERROR) return null;

  return canvas;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/** Solve the 8 unknowns of a 2D projective transform with Gaussian elimination. */
function solveHomography(
  from: [number, number][],
  to: [number, number][],
): number[] | null {
  const matrix: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-9) return null;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const divisor = matrix[col][col];
    for (let j = col; j <= 8; j++) matrix[col][j] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let j = col; j <= 8; j++) matrix[row][j] -= factor * matrix[col][j];
    }
  }

  return matrix.map(row => row[8]);
}

/** Bilinear interpolation inside the source quad: u,v ∈ [0,1] */
function bilerp(
  [TL, TR, BR, BL]: [Point, Point, Point, Point],
  u: number,
  v: number,
): Point {
  const top = lerp2(TL, TR, u);
  const bot = lerp2(BL, BR, u);
  return lerp2(top, bot, v);
}

function lerp2(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Draw a textured triangle by computing the affine transform that maps
 * source triangle (s0, s1, s2) → destination triangle (d0, d1, d2),
 * clipping the canvas to the destination, then drawing the source image
 * through that transform.
 */
function drawTexturedTri(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement | HTMLImageElement,
  d0: Point, d1: Point, d2: Point,
  s0: Point, s1: Point, s2: Point,
) {
  const denom = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(denom) < 1e-6) return;

  const Δd1x = d1.x - d0.x, Δd2x = d2.x - d0.x;
  const Δd1y = d1.y - d0.y, Δd2y = d2.y - d0.y;
  const Δs1x = s1.x - s0.x, Δs2x = s2.x - s0.x;
  const Δs1y = s1.y - s0.y, Δs2y = s2.y - s0.y;

  // Affine: (sx, sy) → (dx, dy)
  // canvas setTransform(a, b, c, d, e, f):  x'=a·x+c·y+e,  y'=b·x+d·y+f
  const a  = (Δd1x * Δs2y - Δd2x * Δs1y) / denom;
  const b  = (Δd1y * Δs2y - Δd2y * Δs1y) / denom;
  const c  = (Δd2x * Δs1x - Δd1x * Δs2x) / denom;
  const d  = (Δd2y * Δs1x - Δd1y * Δs2x) / denom;
  const e  = d0.x - a * s0.x - c * s0.y;
  const f  = d0.y - b * s0.x - d * s0.y;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}

/** Estimate A4 portrait output dimensions preserving aspect ratio from 4 corners */
export function estimateOutputSize(corners: [Point, Point, Point, Point]): { w: number; h: number } {
  const [TL, TR, BR, BL] = corners;
  const top  = Math.hypot(TR.x - TL.x, TR.y - TL.y);
  const bot  = Math.hypot(BR.x - BL.x, BR.y - BL.y);
  const left = Math.hypot(BL.x - TL.x, BL.y - TL.y);
  const right= Math.hypot(BR.x - TR.x, BR.y - TR.y);
  const w    = Math.round((top + bot) / 2);
  const h    = Math.round((left + right) / 2);
  return { w: Math.max(w, 100), h: Math.max(h, 100) };
}
