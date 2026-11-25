import type { Bounds, Rgb } from './types'

export function unionBounds(a: Bounds | null, b: Bounds): Bounds {
  if (!a || b.x1 < b.x0 || b.y1 < b.y0) return a && a.x1 >= a.x0 ? a : b
  if (a.x1 < a.x0 || a.y1 < a.y0) return b
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }
}

export function applyFill(
  paint: Uint8ClampedArray,
  mask: Uint8Array,
  color: Rgb,
): void {
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const o = i * 4
    paint[o] = color.r
    paint[o + 1] = color.g
    paint[o + 2] = color.b
    paint[o + 3] = 255
  }
}

export function stampCircle(
  paint: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  color: Rgb,
  clip: Uint8Array | null,
): { bounds: Bounds; painted: boolean } {
  const r = Math.max(0.5, radius)
  const r2 = r * r
  const x0 = Math.max(0, Math.floor(cx - r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const x1 = Math.min(width - 1, Math.ceil(cx + r))
  const y1 = Math.min(height - 1, Math.ceil(cy + r))
  let painted = false
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy > r2) continue
      const i = y * width + x
      if (clip && !clip[i]) continue
      const o = i * 4
      paint[o] = color.r
      paint[o + 1] = color.g
      paint[o + 2] = color.b
      paint[o + 3] = 255
      painted = true
    }
  }
  return {
    bounds: painted ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: -1, y1: -1 },
    painted,
  }
}

export function paintStroke(
  paint: Uint8ClampedArray,
  width: number,
  height: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
  color: Rgb,
  clip: Uint8Array | null,
): { bounds: Bounds; painted: boolean } {
  const dist = Math.hypot(toX - fromX, toY - fromY)
  const step = Math.max(1, radius * 0.35)
  const steps = Math.max(1, Math.ceil(dist / step))
  let painted = false
  let bounds: Bounds | null = null
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const hit = stampCircle(
      paint,
      width,
      height,
      fromX + (toX - fromX) * t,
      fromY + (toY - fromY) * t,
      radius,
      color,
      clip,
    )
    painted = painted || hit.painted
    bounds = unionBounds(bounds, hit.bounds)
  }
  return {
    bounds: bounds ?? { x0: 0, y0: 0, x1: -1, y1: -1 },
    painted,
  }
}
