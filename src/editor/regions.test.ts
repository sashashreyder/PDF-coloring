import { describe, expect, it } from 'vitest'
import { analyzePage, chooseRegion, HARD_INK_LUMINANCE } from './regions'

function blank(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  return data
}

function paintPixels(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: [number, number, number],
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = (y * width + x) * 4
      data[o] = rgb[0]
      data[o + 1] = rgb[1]
      data[o + 2] = rgb[2]
      data[o + 3] = 255
    }
  }
}

function frame(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const edge =
        x < x0 + thickness || x > x1 - thickness || y < y0 + thickness || y > y1 - thickness
      if (!edge) continue
      const o = (y * width + x) * 4
      data[o] = 0
      data[o + 1] = 0
      data[o + 2] = 0
      data[o + 3] = 255
    }
  }
}

describe('chooseRegion', () => {
  it('keeps a fill inside a closed frame', () => {
    const width = 120
    const height = 120
    const data = blank(width, height)
    frame(data, width, 20, 20, 99, 99, 4)
    const region = chooseRegion(analyzePage(data, width, height), 50, 50)
    expect(region).not.toBeNull()
    expect(region?.needsConfirm).toBe(false)
    expect(region?.mask[50 * width + 50]).toBe(1)
    expect(region?.mask[5 * width + 5]).toBe(0)
    expect(region?.mask[50 * width + 20]).toBe(0)
    expect(region?.touchesBorder).toBe(false)
  })

  it('seals a 3px gap in the outline', () => {
    const width = 120
    const height = 120
    const data = blank(width, height)
    frame(data, width, 20, 20, 99, 99, 4)
    paintPixels(data, width, 96, 48, 99, 50, [255, 255, 255])
    const region = chooseRegion(analyzePage(data, width, height), 50, 50)
    expect(region).not.toBeNull()
    expect(region?.mask[5 * width + 5]).toBe(0)
    expect(region?.needsConfirm).toBe(false)
    expect(region?.mask[50 * width + 50]).toBe(1)
  })

  it('treats a 12px gap as an open area that touches the border', () => {
    const width = 120
    const height = 120
    const data = blank(width, height)
    frame(data, width, 20, 20, 99, 99, 4)
    paintPixels(data, width, 96, 40, 99, 51, [255, 255, 255])
    const region = chooseRegion(analyzePage(data, width, height), 50, 50)
    expect(region).not.toBeNull()
    expect(region?.mask[5 * width + 5]).toBe(1)
    expect(region?.touchesBorder).toBe(true)
    expect(region?.needsConfirm).toBe(true)
  })

  it('prefers the interior when the tap lands on the outline', () => {
    const width = 120
    const height = 120
    const data = blank(width, height)
    frame(data, width, 20, 20, 99, 99, 4)
    const region = chooseRegion(analyzePage(data, width, height), 22, 50)
    expect(region).not.toBeNull()
    expect(region?.mask[50 * width + 50]).toBe(1)
    expect(region?.mask[5 * width + 5]).toBe(0)
    expect(region?.needsConfirm).toBe(false)
  })

  it('does not include hard ink in the paintable mask', () => {
    const width = 80
    const height = 80
    const data = blank(width, height)
    frame(data, width, 10, 10, 69, 69, 3)
    const analysis = analyzePage(data, width, height)
    expect(analysis.lum[40 * width + 10]).toBeLessThanOrEqual(HARD_INK_LUMINANCE)
    const region = chooseRegion(analysis, 40, 40)
    expect(region?.mask[40 * width + 10]).toBe(0)
  })

  it('colors the soft rim next to ink without crossing into the margin', () => {
    const width = 90
    const height = 90
    const data = blank(width, height)
    frame(data, width, 15, 15, 74, 74, 2)
    const analysis = analyzePage(data, width, height)
    const region = chooseRegion(analysis, 45, 45)
    const insideNearLine = 45 * width + 17
    expect(analysis.barrier[insideNearLine]).toBe(1)
    expect(analysis.lum[insideNearLine]).toBeGreaterThan(HARD_INK_LUMINANCE)
    expect(region?.mask[insideNearLine]).toBe(1)
    expect(region?.mask[4 * width + 4]).toBe(0)
  })
})
