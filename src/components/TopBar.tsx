import { SAMPLES } from '../editor/constants'

type TopBarProps = {
  fileName: string | null
  canUndo: boolean
  canRedo: boolean
  canExport: boolean
  loading: boolean
  onOpen: () => void
  onSample: (href: string, fileName: string) => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onExport: () => void
}

export function TopBar({
  fileName,
  canUndo,
  canRedo,
  canExport,
  loading,
  onOpen,
  onSample,
  onUndo,
  onRedo,
  onClear,
  onExport,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="kicker">PDF</span>
        <strong>Coloring Studio</strong>
      </div>
      <p className="filename" title={fileName ?? undefined}>
        {fileName ?? 'No page open'}
      </p>
      <div className="top-actions">
        <button type="button" onClick={onOpen} disabled={loading}>
          Open
        </button>
        <details className="samples">
          <summary>Samples</summary>
          <div className="sample-menu">
            {SAMPLES.map((sample) => (
              <button
                key={sample.href}
                type="button"
                disabled={loading}
                onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open')
                  onSample(sample.href, sample.file)
                }}
              >
                {sample.label}
              </button>
            ))}
          </div>
        </details>
        <button type="button" onClick={onUndo} disabled={!canUndo || loading} aria-keyshortcuts="Control+Z">
          Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo || loading} aria-keyshortcuts="Control+Shift+Z">
          Redo
        </button>
        <button type="button" onClick={onClear} disabled={!canExport || loading}>
          Clear
        </button>
        <button type="button" className="primary" onClick={onExport} disabled={!canExport || loading}>
          Export PNG
        </button>
      </div>
    </header>
  )
}
