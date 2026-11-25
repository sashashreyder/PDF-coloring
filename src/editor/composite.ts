import type { Bounds, PageModel } from './types'

export function composite(
  ctx: CanvasRenderingContext2D,
  page: Pick<PageModel, 'width' | 'height' | 'source' | 'paint' | 'analysis'>,
  bounds?: Bounds,
): void {
  const x0 = bounds ? Math.max(0, bounds.x0) : 0
  const y0 = bounds ? Math.max(0, bounds.y0) : 0
  const x1 = bounds ? Math.min(page.width - 1, bounds.x1) : page.width - 1
  const y1 = bounds ? Math.min(page.height - 1, bounds.y1) : page.height - 1
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  if (bw <= 0 || bh <= 0) return

  const image = ctx.createImageData(bw, bh)
  const dest = image.data
  const { source, paint, analysis } = page
  const line = analysis.lineAlpha
  const stride = page.width
  let p = 0
  for (let y = y0; y <= y1; y++) {
    let i = y * stride + x0
    for (let x = 0; x < bw; x += 1, i += 1, p += 4) {
      const o = i * 4
      if (paint[o + 3] > 0) {
        const inv = 255 - line[i]
        dest[p] = (paint[o] * inv) / 255
        dest[p + 1] = (paint[o + 1] * inv) / 255
        dest[p + 2] = (paint[o + 2] * inv) / 255
      } else {
        dest[p] = source[o]
        dest[p + 1] = source[o + 1]
        dest[p + 2] = source[o + 2]
      }
      dest[p + 3] = 255
    }
  }
  ctx.putImageData(image, x0, y0)
}
