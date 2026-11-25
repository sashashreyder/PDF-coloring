import {
  AnnotationMode,
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
} from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { MAX_EDGE } from './constants'

let workerReady = false

export function configurePdfWorker(): void {
  if (workerReady) return
  GlobalWorkerOptions.workerSrc = workerSrc
  workerReady = true
}

export type PdfHandle = {
  pageCount: number
  renderPage: (pageNumber: number) => Promise<{ width: number; height: number; source: Uint8ClampedArray }>
  destroy: () => Promise<void>
}

function chooseScale(width: number, height: number): number {
  const long = Math.max(width, height)
  if (long <= 0) return 1
  return Math.min(MAX_EDGE / long, 4)
}

export async function openPdf(data: Uint8Array): Promise<PdfHandle> {
  if (data.length < 5 || data[0] !== 0x25) {
    throw new Error('This file is not a readable PDF.')
  }
  configurePdfWorker()
  const task = getDocument({ data, useSystemFonts: true })
  try {
    const pdf = await task.promise
    if (pdf.numPages < 1) {
      await task.destroy()
      throw new Error('This PDF has no pages.')
    }
    return {
      pageCount: pdf.numPages,
      renderPage: (pageNumber) => renderPage(pdf, pageNumber),
      destroy: () => task.destroy(),
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('This PDF')) throw error
    await task.destroy().catch(() => undefined)
    throw new Error(pdfMessage(error), { cause: error })
  }
}

async function renderPage(
  pdf: Awaited<ReturnType<typeof getDocument>['promise']>,
  pageNumber: number,
): Promise<{ width: number; height: number; source: Uint8ClampedArray }> {
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: chooseScale(base.width, base.height) })
  const width = Math.max(1, Math.floor(viewport.width))
  const height = Math.max(1, Math.floor(viewport.height))
  if (width < 2 || height < 2) {
    page.cleanup()
    throw new Error('This PDF page has no drawable area.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  try {
    await page.render({
      canvas,
      viewport,
      annotationMode: AnnotationMode.DISABLE,
    }).promise
  } catch {
    page.cleanup()
    throw new Error('This PDF page could not be rendered.')
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    page.cleanup()
    throw new Error('Could not read the rendered PDF page.')
  }
  let source: Uint8ClampedArray
  try {
    source = new Uint8ClampedArray(ctx.getImageData(0, 0, width, height).data)
  } catch {
    page.cleanup()
    throw new Error('The browser blocked pixel access to this PDF page.')
  }
  page.cleanup()
  return { width, height, source }
}

function pdfMessage(error: unknown): string {
  if (error instanceof PasswordException) {
    return 'This PDF is password-protected. Unlock it, then import it again.'
  }
  if (error instanceof InvalidPDFException) {
    return 'This PDF is damaged or is not a format the editor can read.'
  }
  if (error instanceof Error && /password/i.test(error.message)) {
    return 'This PDF is password-protected. Unlock it, then import it again.'
  }
  return 'Could not open this PDF. It may be damaged or use a feature this prototype does not render.'
}
