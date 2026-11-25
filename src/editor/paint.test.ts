import { describe, expect, it } from 'vitest'
import { applyFill, paintStroke } from './paint'
import type { Rgb } from './types'

const red: Rgb = { r: 200, g: 20, b: 20 }
const blue: Rgb = { r: 20, g: 40, b: 180 }

describe('paint', () => {
  it('recolors a filled region', () => {
    const paint = new Uint8ClampedArray(16)
    const mask = Uint8Array.from([1, 0, 1, 0])
    applyFill(paint, mask, red)
    applyFill(paint, mask, blue)
    expect(Array.from(paint.slice(0, 4))).toEqual([20, 40, 180, 255])
    expect(Array.from(paint.slice(4, 8))).toEqual([0, 0, 0, 0])
    expect(Array.from(paint.slice(8, 12))).toEqual([20, 40, 180, 255])
  })

  it('clips a stroke to the region mask', () => {
    const width = 12
    const height = 12
    const paint = new Uint8ClampedArray(width * height * 4)
    const clip = new Uint8Array(width * height)
    clip[5 * width + 5] = 1
    const result = paintStroke(paint, width, height, 5.5, 5.5, 9.5, 5.5, 1.2, red, clip)
    expect(result.painted).toBe(true)
    expect(paint[(5 * width + 5) * 4 + 3]).toBe(255)
    expect(paint[(5 * width + 8) * 4 + 3]).toBe(0)
  })
})
