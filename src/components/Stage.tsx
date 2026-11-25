import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { clientToPixel } from '../editor/coordinates'
import { composite } from '../editor/composite'
import { cancelUndo, pushUndo } from '../editor/history'
import { applyFill, paintStroke } from '../editor/paint'
import { areaPercent, chooseRegion } from '../editor/regions'
import { hexToRgb, type PageModel, type Tool, type ViewState } from '../editor/types'

type Pending = {
  pageIndex: number
  kind: 'fill' | 'constrained'
  mask: Uint8Array
  seed: number
}

type Gesture =
  | { mode: 'draw'; lastX: number; lastY: number; dirty: boolean; clip: Uint8Array | null }
  | { mode: 'pan'; lastX: number; lastY: number }
  | { mode: 'pinch'; dist: number; scale: number; ix: number; iy: number }

type StageProps = {
  pageIndex: number
  width: number
  height: number
  revision: number
  tool: Tool
  color: string
  brushSize: number
  view: ViewState
  loading: boolean
  spacePan: boolean
  getPage: () => PageModel | null
  onStatus: (message: string) => void
  onHistory: () => void
  onResize: (width: number, height: number) => void
  onPanBy: (dx: number, dy: number) => void
  onZoomAt: (localX: number, localY: number, factor: number) => void
  onSetView: (view: ViewState) => void
}

export function Stage({
  pageIndex,
  width,
  height,
  revision,
  tool,
  color,
  brushSize,
  view,
  loading,
  spacePan,
  getPage,
  onStatus,
  onHistory,
  onResize,
  onPanBy,
  onZoomAt,
  onSetView,
}: StageProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const multiTouch = useRef(false)
  const gesture = useRef<Gesture | null>(null)
  const pending = useRef<Pending | null>(null)
  const dirtyRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const page = getPage()
    if (!canvas || !page) return
    if (canvas.width !== page.width || canvas.height !== page.height) {
      canvas.width = page.width
      canvas.height = page.height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    composite(ctx, page)
  }, [getPage, height, pageIndex, revision, width])

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      onResize(node.clientWidth, node.clientHeight)
    })
    observer.observe(node)
    onResize(node.clientWidth, node.clientHeight)
    return () => observer.disconnect()
  }, [onResize])

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      if (!getPage()) return
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08
      onZoomAt(event.clientX - rect.left, event.clientY - rect.top, factor)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [getPage, onZoomAt])

  function redraw(bounds?: { x0: number; y0: number; x1: number; y1: number }) {
    const canvas = canvasRef.current
    const page = getPage()
    if (!canvas || !page) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    composite(ctx, page, bounds)
  }

  function queueRedraw(bounds: { x0: number; y0: number; x1: number; y1: number }) {
    const current = dirtyRef.current
    dirtyRef.current = current
      ? {
          x0: Math.min(current.x0, bounds.x0),
          y0: Math.min(current.y0, bounds.y0),
          x1: Math.max(current.x1, bounds.x1),
          y1: Math.max(current.y1, bounds.y1),
        }
      : bounds
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const next = dirtyRef.current
      dirtyRef.current = null
      if (next && next.x1 >= next.x0) redraw(next)
    })
  }

  function localPoint(clientX: number, clientY: number) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: clientX, y: clientY }
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function radiusFor(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === 'pen' && event.pressure > 0) {
      return Math.max(1, brushSize * (0.35 + 0.65 * event.pressure))
    }
    return brushSize
  }

  function beginStroke(x: number, y: number, clip: Uint8Array | null, radius: number) {
    const page = getPage()
    if (!page) return
    pushUndo(page)
    gesture.current = { mode: 'draw', lastX: x, lastY: y, dirty: false, clip }
    const hit = paintStroke(page.paint, page.width, page.height, x, y, x, y, radius, hexToRgb(color), clip)
    if (hit.painted) {
      gesture.current.dirty = true
      queueRedraw(hit.bounds)
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (loading || event.button === 2) return
    const canvas = canvasRef.current
    const page = getPage()
    if (!canvas || !page) return
    canvas.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size >= 2) {
      multiTouch.current = true
      cancelDraw()
      startPinch()
      return
    }
    if (multiTouch.current) return

    const pixel = clientToPixel(event.clientX, event.clientY, canvas)
    if (!pixel) return
    const navigating = tool === 'pan' || spacePan || event.button === 1
    if (navigating) {
      gesture.current = { mode: 'pan', lastX: event.clientX, lastY: event.clientY }
      return
    }
    if (tool === 'fill') {
      fillAt(pixel.x, pixel.y)
      return
    }
    if (tool === 'constrained') {
      const region = chooseRegion(page.analysis, pixel.x, pixel.y)
      if (!region) {
        onStatus('Tap inside the white of a shape. The outline itself is not a region.')
        return
      }
      const confirmed =
        pending.current &&
        pending.current.kind === 'constrained' &&
        pending.current.pageIndex === pageIndex &&
        pending.current.mask[region.seed] === 1
      if (region.needsConfirm && !confirmed) {
        pending.current = { pageIndex, kind: 'constrained', mask: region.mask, seed: region.seed }
        const pct = areaPercent(region.count, page.width, page.height)
        onStatus(`Open area, about ${pct}% of the page. Tap again to draw inside it.`)
        return
      }
      pending.current = null
      onStatus('Drawing stays inside this region. Lines stay visible.')
      beginStroke(pixel.x, pixel.y, region.mask, radiusFor(event))
      return
    }
    pending.current = null
    beginStroke(pixel.x, pixel.y, null, radiusFor(event))
  }

  function fillAt(x: number, y: number) {
    const page = getPage()
    if (!page) return
    const region = chooseRegion(page.analysis, x, y)
    if (!region) {
      onStatus('Tap inside the white of a shape. The outline itself is not a region.')
      return
    }
    const confirmed =
      pending.current &&
      pending.current.kind === 'fill' &&
      pending.current.pageIndex === pageIndex &&
      pending.current.mask[region.seed] === 1
    if (region.needsConfirm && !confirmed) {
      pending.current = { pageIndex, kind: 'fill', mask: region.mask, seed: region.seed }
      const pct = areaPercent(region.count, page.width, page.height)
      onStatus(`Open area, about ${pct}% of the page. Tap again to fill it.`)
      return
    }
    pending.current = null
    pushUndo(page)
    applyFill(page.paint, region.mask, hexToRgb(color))
    redraw()
    onHistory()
    onStatus(
      region.needsConfirm
        ? 'Filled the open area.'
        : `Filled a closed area (${region.count.toLocaleString()} px).`,
    )
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const current = gesture.current
    if (current?.mode === 'pinch') {
      updatePinch()
      return
    }
    if (current?.mode === 'pan') {
      onPanBy(event.clientX - current.lastX, event.clientY - current.lastY)
      current.lastX = event.clientX
      current.lastY = event.clientY
      return
    }
    if (current?.mode !== 'draw') return
    const canvas = canvasRef.current
    const page = getPage()
    if (!canvas || !page) return
    const pixel = clientToPixel(event.clientX, event.clientY, canvas)
    if (!pixel) return
    const hit = paintStroke(
      page.paint,
      page.width,
      page.height,
      current.lastX,
      current.lastY,
      pixel.x,
      pixel.y,
      radiusFor(event),
      hexToRgb(color),
      current.clip,
    )
    current.lastX = pixel.x
    current.lastY = pixel.y
    if (hit.painted) {
      current.dirty = true
      queueRedraw(hit.bounds)
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size === 0) {
      finishGesture()
      multiTouch.current = false
      return
    }
    if (gesture.current?.mode === 'pinch') {
      gesture.current = null
    }
  }

  function finishGesture() {
    const current = gesture.current
    gesture.current = null
    if (current?.mode !== 'draw') return
    const page = getPage()
    if (!page) return
    if (!current.dirty) cancelUndo(page)
    else onHistory()
  }

  function cancelDraw() {
    const current = gesture.current
    if (current?.mode !== 'draw') return
    const page = getPage()
    gesture.current = null
    if (!page) return
    cancelUndo(page)
    redraw()
  }

  function startPinch() {
    const pts = [...pointers.current.values()]
    if (pts.length < 2) return
    const a = localPoint(pts[0].x, pts[0].y)
    const b = localPoint(pts[1].x, pts[1].y)
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
    const current = view
    gesture.current = {
      mode: 'pinch',
      dist,
      scale: current.scale,
      ix: (midX - current.tx) / current.scale,
      iy: (midY - current.ty) / current.scale,
    }
  }

  function updatePinch() {
    const current = gesture.current
    const pts = [...pointers.current.values()]
    if (current?.mode !== 'pinch' || pts.length < 2) return
    const a = localPoint(pts[0].x, pts[0].y)
    const b = localPoint(pts[1].x, pts[1].y)
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
    const next = Math.min(8, Math.max(0.2, current.scale * (dist / current.dist)))
    onSetView({
      scale: next,
      tx: midX - current.ix * next,
      ty: midY - current.iy * next,
    })
  }

  const cursor =
    tool === 'pan' || spacePan ? 'grab' : tool === 'fill' || tool === 'constrained' ? 'crosshair' : 'crosshair'

  return (
    <div
      ref={viewportRef}
      className="viewport"
      data-testid="viewport"
      style={{ pointerEvents: loading ? 'none' : 'auto' }}
    >
      <div
        className="camera"
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
        }}
      >
        <canvas
          ref={canvasRef}
          className="sheet"
          data-testid="stage-canvas"
          style={{ width, height, cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
    </div>
  )
}
