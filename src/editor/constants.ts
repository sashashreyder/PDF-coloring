/** Longest edge kept for editing. Larger imports are scaled down. */
export const MAX_EDGE = 1600

/** Image files larger than this are rejected before decode. */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024

/** PDF files larger than this are rejected. */
export const MAX_PDF_BYTES = 40 * 1024 * 1024

/** Natural pixel count above which an image is refused. */
export const MAX_SOURCE_PIXELS = 40_000_000

export const MAX_UNDO = 8

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 8

export const DEFAULT_BRUSH = 16
export const MIN_BRUSH = 2
export const MAX_BRUSH = 48

export const DEFAULT_COLOR = '#e85d4c'

export const PALETTE = [
  '#e85d4c',
  '#ee8b3a',
  '#f2c14e',
  '#7dba6a',
  '#2f9e8f',
  '#3d7ea6',
  '#3f5e9a',
  '#7b5ea7',
  '#d36a9a',
  '#8d6e63',
  '#2f3437',
  '#f4f1ea',
] as const

export const SAMPLES = [
  { href: '/fixtures/closed-simple.png', file: 'closed-simple.png', label: 'Closed shapes' },
  { href: '/fixtures/detailed-bw.png', file: 'detailed-bw.png', label: 'Detailed line art' },
  { href: '/fixtures/small-gap.png', file: 'small-gap.png', label: 'Small gap' },
  { href: '/fixtures/multi-page.pdf', file: 'multi-page.pdf', label: 'Multi-page PDF' },
] as const
