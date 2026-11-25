import { MAX_EDGE, MAX_SOURCE_PIXELS } from './constants'
import { analyzePage } from './regions'
import type { PageModel } from './types'

export type DecodedRaster = {
  width: number
  height: number
  source: Uint8ClampedArray
  scaled: boolean
  sourceWidth: number
  sourceHeight: number
}

export function createPage(
  label: string,
  width: number,
  height: number,
  source: Uint8ClampedArray,
): PageModel {
  return {
    label,
    width,
    height,
    source,
    analysis: analyzePage(source, width, height),
    paint: new Uint8ClampedArray(width * height * 4),
    undo: [],
    redo: [],
  }
}

export async function decodeImage(file: Blob): Promise<DecodedRaster> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot decode images.')
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Could not read this image. Use a PNG or JPEG.')
  }
  try {
    const sourceWidth = bitmap.width
    const sourceHeight = bitmap.height
    if (sourceWidth < 2 || sourceHeight < 2) {
      throw new Error('This image is too small to color.')
    }
    if (sourceWidth * sourceHeight > MAX_SOURCE_PIXELS) {
      throw new Error('This image is too large to open on this device.')
    }
    const long = Math.max(sourceWidth, sourceHeight)
    const scale = long > MAX_EDGE ? MAX_EDGE / long : 1
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Could not prepare this image.')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    const source = new Uint8ClampedArray(ctx.getImageData(0, 0, width, height).data)
    return {
      width,
      height,
      source,
      scaled: scale < 0.999,
      sourceWidth,
      sourceHeight,
    }
  } finally {
    bitmap.close()
  }
}
