import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_ZOOM, MIN_ZOOM, SAMPLES } from '../editor/constants'
import { openDocument } from '../editor/document'
import { downloadPng } from '../editor/exportPng'
import { pushUndo, redo, undo } from '../editor/history'
import type { PageModel, StudioDocument, Tool, ViewState } from '../editor/types'
import { Dock } from './Dock'
import { Stage } from './Stage'
import { TopBar } from './TopBar'

const START_VIEW: ViewState = { scale: 1, tx: 24, ty: 24 }

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong while opening that file.'
}

function fitView(page: PageModel, width: number, height: number): ViewState {
  const pad = Math.min(36, Math.max(12, Math.min(width, height) * 0.05))
  const scale = Math.min((width - pad * 2) / page.width, (height - pad * 2) / page.height)
  const next = Math.min(MAX_ZOOM, Math.max(0.05, scale))
  return {
    scale: next,
    tx: (width - page.width * next) / 2,
    ty: (height - page.height * next) / 2,
  }
}

export function Studio() {
  const docRef = useRef<StudioDocument | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const stageSize = useRef({ w: 0, h: 0 })
  const userAdjusted = useRef(false)
  const tokenRef = useRef(0)

  const [fileName, setFileName] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
  const [revision, setRevision] = useState(0)
  const [hist, setHist] = useState({ undo: 0, redo: 0 })
  const [tool, setTool] = useState<Tool>('fill')
  const [color, setColor] = useState('#e85d4c')
  const [brushSize, setBrushSize] = useState(16)
  const [view, setView] = useState<ViewState>(START_VIEW)
  const [status, setStatus] = useState('Open a PNG, JPEG, or PDF, or try a sample page.')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [spacePan, setSpacePan] = useState(false)

  const getPage = useCallback(() => {
    const doc = docRef.current
    if (!doc) return null
    return doc.pages[doc.pageIndex] ?? null
  }, [])

  const syncHist = useCallback(() => {
    const page = getPage()
    setHist({ undo: page?.undo.length ?? 0, redo: page?.redo.length ?? 0 })
    setRevision((value) => value + 1)
  }, [getPage])

  const fitCurrent = useCallback(() => {
    const page = getPage()
    const { w, h } = stageSize.current
    if (!page || w < 40 || h < 40) return
    userAdjusted.current = false
    setView(fitView(page, w, h))
  }, [getPage])

  const onResize = useCallback(
    (width: number, height: number) => {
      stageSize.current = { w: width, h: height }
      if (!userAdjusted.current) {
        const page = getPage()
        if (page && width > 40 && height > 40) setView(fitView(page, width, height))
      }
    },
    [getPage],
  )

  const onZoomAt = useCallback((localX: number, localY: number, factor: number) => {
    userAdjusted.current = true
    setView((current) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.scale * factor))
      const ix = (localX - current.tx) / current.scale
      const iy = (localY - current.ty) / current.scale
      return { scale, tx: localX - ix * scale, ty: localY - iy * scale }
    })
  }, [])

  const onPanBy = useCallback((dx: number, dy: number) => {
    userAdjusted.current = true
    setView((current) => ({ ...current, tx: current.tx + dx, ty: current.ty + dy }))
  }, [])

  const onSetView = useCallback((next: ViewState) => {
    userAdjusted.current = true
    setView(next)
  }, [])

  const zoomFromCenter = useCallback(
    (factor: number) => {
      const { w, h } = stageSize.current
      onZoomAt(w / 2, h / 2, factor)
    },
    [onZoomAt],
  )

  async function loadFile(file: File) {
    const token = ++tokenRef.current
    setLoading(true)
    setError(null)
    setStatus(`Opening ${file.name}…`)
    try {
      const doc = await openDocument(file)
      if (token !== tokenRef.current) {
        doc.dispose()
        return
      }
      await doc.ensurePage(0)
      if (token !== tokenRef.current) {
        doc.dispose()
        return
      }
      docRef.current?.dispose()
      doc.pageIndex = 0
      docRef.current = doc
      const page = doc.pages[0]
      userAdjusted.current = false
      setFileName(doc.name)
      setPageCount(doc.pageCount)
      setPageIndex(0)
      setPageSize({ width: page?.width ?? 0, height: page?.height ?? 0 })
      setHist({ undo: 0, redo: 0 })
      setRevision((value) => value + 1)
      setStatus(doc.note || 'Ready.')
      fitCurrent()
    } catch (caught) {
      if (token !== tokenRef.current) return
      setError(messageFrom(caught))
    } finally {
      if (token === tokenRef.current) setLoading(false)
    }
  }

  async function loadSample(href: string, name: string) {
    setLoading(true)
    setError(null)
    setStatus(`Loading ${name}…`)
    try {
      const response = await fetch(href)
      if (!response.ok) throw new Error('Could not load that sample.')
      const blob = await response.blob()
      const type = name.endsWith('.pdf') ? 'application/pdf' : blob.type || 'image/png'
      await loadFile(new File([blob], name, { type }))
    } catch (caught) {
      setError(messageFrom(caught))
      setLoading(false)
    }
  }

  async function selectPage(index: number) {
    const doc = docRef.current
    if (!doc || loading || index === doc.pageIndex) return
    setLoading(true)
    setError(null)
    setStatus(`Rendering page ${index + 1}…`)
    try {
      const page = await doc.ensurePage(index)
      doc.pageIndex = index
      userAdjusted.current = false
      setPageIndex(index)
      setPageSize({ width: page.width, height: page.height })
      setHist({ undo: page.undo.length, redo: page.redo.length })
      setRevision((value) => value + 1)
      setStatus(`Page ${index + 1} of ${doc.pageCount}.`)
      const { w, h } = stageSize.current
      if (w > 40 && h > 40) setView(fitView(page, w, h))
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setLoading(false)
    }
  }

  const onUndo = useCallback(() => {
    const page = getPage()
    if (!page || !undo(page)) return
    syncHist()
    setStatus('Undid the last change.')
    setError(null)
  }, [getPage, syncHist])

  const onRedo = useCallback(() => {
    const page = getPage()
    if (!page || !redo(page)) return
    syncHist()
    setStatus('Redid the last change.')
    setError(null)
  }, [getPage, syncHist])

  function onClear() {
    const page = getPage()
    if (!page) return
    pushUndo(page)
    page.paint.fill(0)
    syncHist()
    setStatus('Cleared paint on this page. The original line art is unchanged.')
    setError(null)
  }

  function onExport() {
    const page = getPage()
    if (!page || !fileName) return
    try {
      downloadPng(page, fileName)
      setError(null)
      setStatus(`Exported a ${page.width}×${page.height} PNG.`)
    } catch (caught) {
      setError(messageFrom(caught))
    }
  }

  const commands = useRef({
    undo: () => undefined,
    redo: () => undefined,
    fit: () => undefined,
    zoom: (_factor: number) => undefined,
  })

  useEffect(() => {
    commands.current = { undo: onUndo, redo: onRedo, fit: fitCurrent, zoom: zoomFromCenter }
  }, [fitCurrent, onRedo, onUndo, zoomFromCenter])

  useEffect(() => {
    function isField(target: EventTarget | null) {
      return (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      )
    }
    function onKeyDown(event: KeyboardEvent) {
      if (isField(event.target)) return
      if (event.code === 'Space') {
        if (event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') return
        event.preventDefault()
        setSpacePan(true)
        return
      }
      const key = event.key.toLowerCase()
      const meta = event.metaKey || event.ctrlKey
      if (meta && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) commands.current.redo()
        else commands.current.undo()
        return
      }
      if (meta && key === 'y') {
        event.preventDefault()
        commands.current.redo()
        return
      }
      if (meta) return
      if (key === 'f') setTool('fill')
      else if (key === 'b') setTool('brush')
      else if (key === 'i') setTool('constrained')
      else if (key === 'h') setTool('pan')
      else if (key === '[') setBrushSize((size) => Math.max(2, size - 2))
      else if (key === ']') setBrushSize((size) => Math.min(48, size + 2))
      else if (key === '0') commands.current.fit()
      else if (key === '+' || key === '=') commands.current.zoom(1.2)
      else if (key === '-' || key === '_') commands.current.zoom(1 / 1.2)
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') setSpacePan(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const hasPage = pageCount > 0 && pageSize.width > 0

  return (
    <div
      className="app"
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        const file = event.dataTransfer.files[0]
        if (file) void loadFile(file)
      }}
      >
      <input
        ref={inputRef}
        className="sr"
        type="file"
        accept="image/png,image/jpeg,application/pdf,.pdf"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void loadFile(file)
        }}
      />
      <TopBar
        fileName={fileName}
        canUndo={hist.undo > 0}
        canRedo={hist.redo > 0}
        canExport={hasPage}
        loading={loading}
        onOpen={() => inputRef.current?.click()}
        onSample={(href, name) => {
          void loadSample(href, name)
        }}
        onUndo={onUndo}
        onRedo={onRedo}
        onClear={onClear}
        onExport={onExport}
      />
      {hasPage ? (
        <Stage
          pageIndex={pageIndex}
          width={pageSize.width}
          height={pageSize.height}
          revision={revision}
          tool={tool}
          color={color}
          brushSize={brushSize}
          view={view}
          loading={loading}
          spacePan={spacePan}
          getPage={getPage}
          onStatus={(next) => {
            setError(null)
            setStatus(next)
          }}
          onHistory={syncHist}
          onResize={onResize}
          onPanBy={onPanBy}
          onZoomAt={onZoomAt}
          onSetView={onSetView}
        />
      ) : (
        <section className="empty">
          <div className="empty-card">
            <h1>Color the page you already have.</h1>
            <p>
              Import a black-and-white PDF, PNG, or JPEG. Fill closed shapes, draw freely, or keep a brush inside
              one region. Everything stays in this browser.
            </p>
            <div className="empty-actions">
              <button type="button" className="primary" onClick={() => inputRef.current?.click()} disabled={loading}>
                Open a file
              </button>
            </div>
            <div className="sample-grid">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.href}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    void loadSample(sample.href, sample.file)
                  }}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
      {pageCount > 1 && (
        <div className="pages" role="tablist" aria-label="PDF pages">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={index === pageIndex}
              disabled={loading}
              onClick={() => {
                void selectPage(index)
              }}
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}
      <p className={error ? 'status error' : 'status'} role="status" data-testid="status">
        {loading ? status : error ?? status}
      </p>
      <Dock
        tool={tool}
        color={color}
        brushSize={brushSize}
        zoom={view.scale}
        disabled={!hasPage || loading}
        onTool={setTool}
        onColor={setColor}
        onBrush={setBrushSize}
        onZoom={zoomFromCenter}
        onFit={fitCurrent}
      />
    </div>
  )
}
