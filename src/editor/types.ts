import type { PageAnalysis } from './regions'

export type Tool = 'fill' | 'brush' | 'constrained' | 'pan'

export type Rgb = { r: number; g: number; b: number }

export type ViewState = { scale: number; tx: number; ty: number }

export type Bounds = { x0: number; y0: number; x1: number; y1: number }

export type PageModel = {
  label: string
  width: number
  height: number
  source: Uint8ClampedArray
  analysis: PageAnalysis
  paint: Uint8ClampedArray
  undo: Uint8ClampedArray[]
  redo: Uint8ClampedArray[]
}

export type StudioDocument = {
  name: string
  pageCount: number
  pages: Array<PageModel | undefined>
  pageIndex: number
  note: string
  ensurePage: (index: number) => Promise<PageModel>
  dispose: () => void
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n) || full.length !== 6) return { r: 232, g: 93, b: 76 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
