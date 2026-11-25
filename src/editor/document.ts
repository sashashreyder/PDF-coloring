import { MAX_EDGE, MAX_IMAGE_BYTES, MAX_PDF_BYTES } from './constants'
import { createPage, decodeImage } from './raster'
import type { StudioDocument } from './types'

export function detectKind(file: File): 'pdf' | 'image' | null {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    type === 'image/png' ||
    type === 'image/jpeg' ||
    type === 'image/jpg' ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  ) {
    return 'image'
  }
  return null
}

export async function openDocument(file: File): Promise<StudioDocument> {
  const kind = detectKind(file)
  if (!kind) throw new Error('Use a PNG, JPEG, or PDF coloring page.')

  if (kind === 'image') {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('This image is over 30 MB. Export a smaller PNG and try again.')
    }
    const raster = await decodeImage(file)
    const page = createPage('Image', raster.width, raster.height, raster.source)
    const note = raster.scaled
      ? `Scaled from ${raster.sourceWidth}×${raster.sourceHeight} to ${raster.width}×${raster.height} so painting stays responsive. Export uses this working size.`
      : `Opened at ${raster.width}×${raster.height} px.`
    return {
      name: file.name,
      pageCount: 1,
      pages: [page],
      pageIndex: 0,
      note,
      ensurePage: async () => page,
      dispose: () => undefined,
    }
  }

  if (file.size > MAX_PDF_BYTES) {
    throw new Error('This PDF is over 40 MB. Export a smaller file and try again.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { openPdf } = await import('./pdf')
  const pdf = await openPdf(bytes)
  const pages: StudioDocument['pages'] = new Array(pdf.pageCount)
  return {
    name: file.name,
    pageCount: pdf.pageCount,
    pages,
    pageIndex: 0,
    note:
      pdf.pageCount > 1
        ? `${pdf.pageCount} pages. Each page is rendered when you select it, up to ${MAX_EDGE} px on the long edge.`
        : 'PDF page ready.',
    ensurePage: async (index) => {
      const cached = pages[index]
      if (cached) return cached
      if (index < 0 || index >= pdf.pageCount) {
        throw new Error('That page is not in this PDF.')
      }
      const rendered = await pdf.renderPage(index + 1)
      const page = createPage(`Page ${index + 1}`, rendered.width, rendered.height, rendered.source)
      pages[index] = page
      return page
    },
    dispose: () => {
      void pdf.destroy()
    },
  }
}
