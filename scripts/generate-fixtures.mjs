import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fixtures')
mkdirSync(root, { recursive: true })

function create(width, height) {
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  return data
}

function dot(data, width, height, x, y, radius) {
  const r2 = radius * radius
  const x0 = Math.max(0, Math.floor(x - radius))
  const y0 = Math.max(0, Math.floor(y - radius))
  const x1 = Math.min(width - 1, Math.ceil(x + radius))
  const y1 = Math.min(height - 1, Math.ceil(y + radius))
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - x
      const dy = yy - y
      if (dx * dx + dy * dy > r2) continue
      const o = (yy * width + xx) * 4
      data[o] = 0
      data[o + 1] = 0
      data[o + 2] = 0
      data[o + 3] = 255
    }
  }
}

function stroke(data, width, height, x0, y0, x1, y1, radius) {
  const dist = Math.hypot(x1 - x0, y1 - y0)
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.5, radius * 0.35)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    dot(data, width, height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius)
  }
}

function rect(data, width, height, x, y, w, h, radius) {
  stroke(data, width, height, x, y, x + w, y, radius)
  stroke(data, width, height, x + w, y, x + w, y + h, radius)
  stroke(data, width, height, x + w, y + h, x, y + h, radius)
  stroke(data, width, height, x, y + h, x, y, radius)
}

function circle(data, width, height, cx, cy, radius, thickness) {
  const steps = Math.max(24, Math.ceil((Math.PI * 2 * radius) / Math.max(1, thickness * 0.4)))
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    dot(data, width, height, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, thickness)
  }
}

function ellipse(data, width, height, cx, cy, rx, ry, thickness) {
  const steps = Math.max(24, Math.ceil((Math.PI * 2 * Math.max(rx, ry)) / 2))
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    dot(data, width, height, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, thickness)
  }
}

function erase(data, width, x, y, w, h) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const o = (yy * width + xx) * 4
      data[o] = 255
      data[o + 1] = 255
      data[o + 2] = 255
      data[o + 3] = 255
    }
  }
}

function crcTable() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

const CRC = crcTable()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const name = Buffer.from(type)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0)
  return Buffer.concat([length, name, data, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const start = y * (width * 4 + 1)
    raw[start] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength).copy(raw, start + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function writePng(name, width, height, draw) {
  const data = create(width, height)
  draw(data, width, height)
  writeFileSync(join(root, name), encodePng(width, height, data))
}

writePng('closed-simple.png', 480, 600, (data, width, height) => {
  rect(data, width, height, 36, 36, 408, 528, 3)
  circle(data, width, height, 170, 180, 78, 3)
  rect(data, width, height, 270, 120, 140, 140, 3)
  stroke(data, width, height, 150, 390, 240, 500, 3)
  stroke(data, width, height, 240, 500, 330, 390, 3)
  stroke(data, width, height, 330, 390, 150, 390, 3)
  circle(data, width, height, 240, 430, 28, 3)
})

writePng('detailed-bw.png', 640, 800, (data, width, height) => {
  rect(data, width, height, 28, 28, width - 56, height - 56, 3)
  const cx = 320
  const cy = 300
  circle(data, width, height, cx, cy, 168, 2.6)
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8 - Math.PI / 2
    circle(
      data,
      width,
      height,
      cx + Math.cos(angle) * 92,
      cy + Math.sin(angle) * 92,
      58,
      2.6,
    )
  }
  circle(data, width, height, cx, cy, 34, 2.8)
  circle(data, width, height, cx, cy, 12, 2.4)
  rect(data, width, height, cx - 10, 470, 20, 210, 2.6)
  ellipse(data, width, height, 230, 560, 70, 28, 2.6)
  ellipse(data, width, height, 410, 600, 78, 26, 2.6)
  circle(data, width, height, 120, 680, 36, 2.6)
  circle(data, width, height, 500, 150, 42, 2.6)
})

writePng('small-gap.png', 560, 320, (data, width, height) => {
  rect(data, width, height, 40, 70, 200, 180, 3)
  rect(data, width, height, 320, 70, 200, 180, 3)
  // Left square: 3px opening on the right wall. Right square: 12px opening.
  erase(data, width, 234, 150, 14, 3)
  erase(data, width, 514, 140, 14, 12)
})

function circlePath(cx, cy, radius) {
  const k = 0.5522847498 * radius
  return [
    `${cx + radius} ${cy} m`,
    `${cx + radius} ${cy + k} ${cx + k} ${cy + radius} ${cx} ${cy + radius} c`,
    `${cx - k} ${cy + radius} ${cx - radius} ${cy + k} ${cx - radius} ${cy} c`,
    `${cx - radius} ${cy - k} ${cx - k} ${cy - radius} ${cx} ${cy - radius} c`,
    `${cx + k} ${cy - radius} ${cx + radius} ${cy - k} ${cx + radius} ${cy} c`,
    'S',
  ].join('\n')
}

function pdfStream(body) {
  return body.endsWith('\n') ? body : `${body}\n`
}

function buildPdf(streams) {
  const bodies = streams.map(pdfStream)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 432 576] /Contents 5 0 R /Resources << >> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 432 576] /Contents 6 0 R /Resources << >> >>',
    `<< /Length ${Buffer.byteLength(bodies[0])} >>\nstream\n${bodies[0]}endstream`,
    `<< /Length ${Buffer.byteLength(bodies[1])} >>\nstream\n${bodies[1]}endstream`,
  ]
  let out = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out))
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefAt = Buffer.byteLength(out)
  let xref = `xref\n0 ${objects.length + 1}\n`
  xref += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Buffer.from(out + xref, 'latin1')
}

const pageOne = `1 1 1 rg
0 0 432 576 re f
0 0 0 RG
3.2 w
1 J
1 j
40 40 352 496 re S
118 230 m
216 392 l
314 230 l
h
S
150 40 132 150 re S
186 40 60 92 re S
92 300 64 64 re S
276 300 64 64 re S
`
const pageTwo = `1 1 1 rg
0 0 432 576 re f
0 0 0 RG
3.2 w
1 J
1 j
48 48 336 480 re S
${circlePath(216, 300, 150)}
${circlePath(216, 300, 96)}
${circlePath(216, 300, 42)}
120 430 m
216 150 l
312 430 l
h
S
`

writeFileSync(join(root, 'multi-page.pdf'), buildPdf([pageOne, pageTwo]))
console.log(`Wrote fixtures to ${root}`)
