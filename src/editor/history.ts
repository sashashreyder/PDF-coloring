import { MAX_UNDO } from './constants'
import type { PageModel } from './types'

export function pushUndo(page: PageModel): void {
  page.undo.push(page.paint.slice())
  if (page.undo.length > MAX_UNDO) page.undo.shift()
  page.redo.length = 0
}

export function cancelUndo(page: PageModel): void {
  const prev = page.undo.pop()
  if (prev) page.paint.set(prev)
}

export function undo(page: PageModel): boolean {
  const prev = page.undo.pop()
  if (!prev) return false
  page.redo.push(page.paint.slice())
  if (page.redo.length > MAX_UNDO) page.redo.shift()
  page.paint.set(prev)
  return true
}

export function redo(page: PageModel): boolean {
  const next = page.redo.pop()
  if (!next) return false
  page.undo.push(page.paint.slice())
  if (page.undo.length > MAX_UNDO) page.undo.shift()
  page.paint.set(next)
  return true
}
