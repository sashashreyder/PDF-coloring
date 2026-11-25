import {
  DEFAULT_BRUSH,
  MAX_BRUSH,
  MIN_BRUSH,
  PALETTE,
} from '../editor/constants'
import type { Tool } from '../editor/types'

type DockProps = {
  tool: Tool
  color: string
  brushSize: number
  zoom: number
  disabled: boolean
  onTool: (tool: Tool) => void
  onColor: (color: string) => void
  onBrush: (size: number) => void
  onZoom: (factor: number) => void
  onFit: () => void
}

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'fill', label: 'Fill', hint: 'Tap a closed area' },
  { id: 'brush', label: 'Brush', hint: 'Draw across lines' },
  { id: 'constrained', label: 'Inside', hint: 'Draw inside one area' },
  { id: 'pan', label: 'Pan', hint: 'Move the page' },
]

export function Dock({
  tool,
  color,
  brushSize,
  zoom,
  disabled,
  onTool,
  onColor,
  onBrush,
  onZoom,
  onFit,
}: DockProps) {
  return (
    <footer className="dock">
      <div className="tools" role="toolbar" aria-label="Tools">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="tool"
            data-testid={`tool-${item.id}`}
            aria-pressed={tool === item.id}
            disabled={disabled}
            title={item.hint}
            onClick={() => onTool(item.id)}
          >
            <ToolIcon tool={item.id} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="swatches" role="listbox" aria-label="Colors">
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className="swatch"
            role="option"
            aria-selected={color.toLowerCase() === swatch}
            aria-label={`Color ${swatch}`}
            disabled={disabled}
            style={{ background: swatch }}
            onClick={() => onColor(swatch)}
          />
        ))}
        <label className="swatch custom" title="Custom color">
          <span className="sr">Custom color</span>
          <input
            type="color"
            value={toColorInput(color)}
            disabled={disabled}
            aria-label="Custom color"
            onChange={(event) => onColor(event.target.value)}
          />
        </label>
      </div>
      <div className="fine">
        <label className="slider">
          <span>Brush {brushSize}</span>
          <input
            type="range"
            min={MIN_BRUSH}
            max={MAX_BRUSH}
            value={brushSize}
            disabled={disabled}
            aria-label="Brush size"
            onChange={(event) => onBrush(Number(event.target.value))}
          />
        </label>
        <div className="zoom" role="group" aria-label="Zoom">
          <button type="button" disabled={disabled} onClick={() => onZoom(1 / 1.2)} aria-label="Zoom out">
            −
          </button>
          <button type="button" disabled={disabled} onClick={onFit}>
            Fit
          </button>
          <button type="button" disabled={disabled} onClick={() => onZoom(1.2)} aria-label="Zoom in">
            +
          </button>
          <span className="zoom-read">{disabled ? '—' : `${Math.round(zoom * 100)}%`}</span>
        </div>
      </div>
      <p className="hint">
        Clean black line art works best. Gaps of about 4 px are sealed. A large area that touches the page edge
        needs a second tap. Default brush is {DEFAULT_BRUSH} px.
      </p>
    </footer>
  )
}

function toColorInput(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#e85d4c'
}

function ToolIcon({ tool }: { tool: Tool }) {
  if (tool === 'fill') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 14.5 14.5 7l3 3L10 17.5H7v-3Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13.2 8.3 16 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (tool === 'brush') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 5.5 18.5 10 10 18.5H5.5V14L14 5.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  }
  if (tool === 'constrained') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="4.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 14.5c1.2-2 2.4-3 4-3s2.6 1.4 4 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m12 4 2.2 2.2M12 4 9.8 6.2M12 20l2.2-2.2M12 20l-2.2-2.2M4 12l2.2-2.2M4 12l2.2 2.2M20 12l-2.2-2.2M20 12l-2.2 2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
