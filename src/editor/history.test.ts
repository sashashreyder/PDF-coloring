import { describe, expect, it } from 'vitest'
import { cancelUndo, pushUndo, redo, undo } from './history'
import type { PageModel } from './types'

function page(): PageModel {
  return {
    label: 't',
    width: 1,
    height: 1,
    source: new Uint8ClampedArray(4),
    analysis: { width: 1, height: 1, barrier: new Uint8Array(1), lum: new Uint8Array(1), lineAlpha: new Uint8Array(1) },
    paint: Uint8ClampedArray.from([1, 2, 3, 4]),
    undo: [],
    redo: [],
  }
}

describe('history', () => {
  it('undoes and redoes a paint change', () => {
    const model = page()
    pushUndo(model)
    model.paint[0] = 9
    expect(undo(model)).toBe(true)
    expect(model.paint[0]).toBe(1)
    expect(redo(model)).toBe(true)
    expect(model.paint[0]).toBe(9)
  })

  it('drops an empty gesture snapshot', () => {
    const model = page()
    pushUndo(model)
    cancelUndo(model)
    expect(model.undo).toHaveLength(0)
    expect(model.paint[0]).toBe(1)
  })
})
