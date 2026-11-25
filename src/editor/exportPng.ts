import { composite } from './composite'
import type { PageModel } from './types'

export function downloadPng(page: PageModel, fileName: string): void {
  const canvas = document.createElement('canvas')
  canvas.width = page.width
  canvas.height = page.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not export this page.')
  composite(ctx, page)
  const url = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  const base = fileName.replace(/\.[^.]+$/, '') || 'coloring-page'
  link.href = url
  link.download = `${base}-colored.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
}
