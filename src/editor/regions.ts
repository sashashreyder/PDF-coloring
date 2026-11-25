/**
 * Region detection for clean black-and-white line art.
 *
 * The original pixels are never modified. A barrier mask is built by
 * thresholding dark pixels, then dilating them so gaps up to MAX_SEALED_GAP
 * pixels and anti-aliased fringes do not leak. Flood fill runs on that
 * barrier, not on the paint layer. A thin soft rim of the barrier (paper
 * that dilation consumed) is painted so color meets the ink without a white
 * halo. True ink stays unpainted and is drawn from the source image.
 *
 * Regions that touch the image border and cover a large share of the page
 * are treated as open (a leak or the outer margin) and need a second tap.
 */

export const INK_LUMINANCE = 186
export const HARD_INK_LUMINANCE = 78
export const GAP_RADIUS = 2
/** Orthogonal gaps of this many white pixels (or fewer) are sealed. */
export const MAX_SEALED_GAP = GAP_RADIUS * 2
export const BORDER_CONFIRM_RATIO = 0.2
export const LINE_FADE_LUMINANCE = 210
const LINE_SEARCH = 10

export type PageAnalysis = {
  width: number
  height: number
  barrier: Uint8Array
  lum: Uint8Array
  lineAlpha: Uint8Array
}

export type Region = {
  mask: Uint8Array
  count: number
  seed: number
  touchesBorder: boolean
  needsConfirm: boolean
}

export function luminance(r: number, g: number, b: number): number {
  return (r * 77 + g * 150 + b * 29) >> 8
}

function compositeLum(r: number, g: number, b: number, a: number): number {
  if (a >= 255) return luminance(r, g, b)
  if (a <= 0) return 255
  const r2 = (r * a + 255 * (255 - a) + 127) / 255
  const g2 = (g * a + 255 * (255 - a) + 127) / 255
  const b2 = (b * a + 255 * (255 - a) + 127) / 255
  return luminance(r2, g2, b2)
}

export function analyzePage(src: Uint8ClampedArray, width: number, height: number): PageAnalysis {
  const n = width * height
  const ink = new Uint8Array(n)
  const lum = new Uint8Array(n)
  const lineAlpha = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const value = compositeLum(src[o], src[o + 1], src[o + 2], src[o + 3])
    lum[i] = value
    if (value <= INK_LUMINANCE) ink[i] = 1
    if (value < LINE_FADE_LUMINANCE) {
      lineAlpha[i] = Math.round(((LINE_FADE_LUMINANCE - value) / LINE_FADE_LUMINANCE) * 255)
    }
  }
  return {
    width,
    height,
    barrier: dilate(ink, width, height, GAP_RADIUS),
    lum,
    lineAlpha,
  }
}

function dilate(src: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return src
  const tmp = new Uint8Array(width * height)
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    for (let k = 0; k <= radius && k < width; k++) sum += src[row + k]
    for (let x = 0; x < width; x++) {
      const add = x + radius
      const remove = x - radius - 1
      if (x > 0 && add < width) sum += src[row + add]
      if (remove >= 0) sum -= src[row + remove]
      tmp[row + x] = sum > 0 ? 1 : 0
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let k = 0; k <= radius && k < height; k++) sum += tmp[k * width + x]
    for (let y = 0; y < height; y++) {
      const add = y + radius
      const remove = y - radius - 1
      if (y > 0 && add < height) sum += tmp[add * width + x]
      if (remove >= 0) sum -= tmp[remove * width + x]
      out[y * width + x] = sum > 0 ? 1 : 0
    }
  }
  return out
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

export function chooseRegion(analysis: PageAnalysis, x: number, y: number): Region | null {
  const { width, height, barrier } = analysis
  if (x < 0 || y < 0 || x >= width || y >= height) return null
  const xi = Math.min(width - 1, Math.max(0, Math.floor(x)))
  const yi = Math.min(height - 1, Math.max(0, Math.floor(y)))
  const start = yi * width + xi
  const seeds: number[] = []
  if (!barrier[start]) {
    seeds.push(start)
  } else {
    for (const [dx, dy] of DIRS) {
      for (let rad = 1; rad <= LINE_SEARCH; rad++) {
        const sx = xi + dx * rad
        const sy = yi + dy * rad
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) break
        const id = sy * width + sx
        if (!barrier[id]) {
          seeds.push(id)
          break
        }
      }
    }
  }
  if (seeds.length === 0) return null

  let best: Region | null = null
  for (const seed of seeds) {
    if (best?.mask[seed]) continue
    const region = floodRegion(analysis, seed)
    if (!region) continue
    best = best ? preferRegion(best, region) : region
  }
  return best
}

function preferRegion(a: Region, b: Region): Region {
  if (a.needsConfirm !== b.needsConfirm) return a.needsConfirm ? b : a
  return a.count <= b.count ? a : b
}

export function areaPercent(count: number, width: number, height: number): number {
  if (count <= 0 || width <= 0 || height <= 0) return 0
  return Math.max(1, Math.round((count / (width * height)) * 100))
}

function floodRegion(analysis: PageAnalysis, seed: number): Region | null {
  const { width, height, barrier, lum } = analysis
  const n = width * height
  const mask = new Uint8Array(n)
  const stack: number[] = [seed]
  let count = 0

  while (stack.length > 0) {
    let i = stack.pop() as number
    let x = i % width
    const y = (i / width) | 0
    while (x > 0 && !barrier[i - 1] && !mask[i - 1]) {
      x -= 1
      i -= 1
    }
    let spanUp = false
    let spanDown = false
    for (; x < width && !barrier[i] && !mask[i]; x += 1, i += 1) {
      mask[i] = 1
      count += 1
      if (y > 0) {
        const above = i - width
        if (!barrier[above] && !mask[above]) {
          if (!spanUp) {
            stack.push(above)
            spanUp = true
          }
        } else {
          spanUp = false
        }
      }
      if (y < height - 1) {
        const below = i + width
        if (!barrier[below] && !mask[below]) {
          if (!spanDown) {
            stack.push(below)
            spanDown = true
          }
        } else {
          spanDown = false
        }
      }
    }
  }

  if (count === 0) return null
  count += includeSoftRim(mask, barrier, lum, width)
  const border = regionTouchesBorder(mask, width, height)
  const needsConfirm = border && count / n >= BORDER_CONFIRM_RATIO
  return { mask, count, seed, touchesBorder: border, needsConfirm }
}

function includeSoftRim(
  mask: Uint8Array,
  barrier: Uint8Array,
  lum: Uint8Array,
  width: number,
): number {
  let frontier: number[] = []
  const n = mask.length
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue
    const x = i % width
    if (
      (x > 0 && !mask[i - 1]) ||
      (x + 1 < width && !mask[i + 1]) ||
      (i >= width && !mask[i - width]) ||
      (i + width < n && !mask[i + width])
    ) {
      frontier.push(i)
    }
  }

  let added = 0
  for (let step = 0; step < GAP_RADIUS; step++) {
    const next: number[] = []
    for (const i of frontier) {
      const x = i % width
      const neighbors = neighborIndexes(i, x, width, n)
      for (const j of neighbors) {
        if (mask[j] || lum[j] <= HARD_INK_LUMINANCE || !barrier[j]) continue
        if (touchesOutside(j, mask, barrier, width, n)) continue
        mask[j] = 1
        added += 1
        next.push(j)
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return added
}

function neighborIndexes(i: number, x: number, width: number, n: number): number[] {
  const out: number[] = []
  if (x > 0) out.push(i - 1)
  if (x + 1 < width) out.push(i + 1)
  if (i >= width) out.push(i - width)
  if (i + width < n) out.push(i + width)
  return out
}

function touchesOutside(
  index: number,
  mask: Uint8Array,
  barrier: Uint8Array,
  width: number,
  n: number,
): boolean {
  const x = index % width
  const neighbors = neighborIndexes(index, x, width, n)
  for (const k of neighbors) {
    if (!barrier[k] && !mask[k]) return true
  }
  return false
}

function regionTouchesBorder(mask: Uint8Array, width: number, height: number): boolean {
  for (let x = 0; x < width; x++) {
    if (mask[x] || mask[(height - 1) * width + x]) return true
  }
  for (let y = 0; y < height; y++) {
    if (mask[y * width] || mask[y * width + width - 1]) return true
  }
  return false
}
