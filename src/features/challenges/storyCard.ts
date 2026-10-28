// Card de progresso para stories (seção 6.6): canvas 1080×1920, compartilhado como arquivo.
// Carregado só quando a pessoa abre "Compartilhar progresso".
import { formatBRL } from '../../lib/format'

const W = 1080
const H = 1920
const PAD = 96
const FOREST = '#0b3d2e'
const CREAM = '#f4f1e8'
const GOLD = '#e8b44c'
const DISPLAY = "'Bricolage Grotesque', system-ui, sans-serif"
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"

export interface StoryData {
  title: string
  blocks: number
  marked: Set<number>
  saved: number
  goal: number
  streak: number
}

/** A mesma fonte de display da landing; sem ela o card sai na fonte do sistema. */
async function loadDisplayFont() {
  try {
    const face = new FontFace('Bricolage Grotesque', 'url(/fonts/bricolage-grotesque.woff2)', { weight: '200 800' })
    document.fonts.add(await face.load())
  } catch {
    /* sem rede: segue com a fonte do sistema */
  }
}

/** Maior tamanho de fonte (até `max`) em que o texto cabe na largura. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, width: number, family = DISPLAY) {
  let size = max
  do ctx.font = `${weight} ${size}px ${family}`
  while (ctx.measureText(text).width > width && (size -= 4) > 24)
  return size
}

export async function renderStoryCard(d: StoryData): Promise<Blob> {
  await loadDisplayFont()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const inner = W - PAD * 2
  const pct = Math.min(100, (d.saved / d.goal) * 100)

  ctx.fillStyle = FOREST
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = CREAM
  ctx.font = `800 56px ${DISPLAY}`
  ctx.fillText('Tijoblock', PAD, 168)

  ctx.globalAlpha = 0.8
  fit(ctx, d.title, 600, 52, inner, SANS)
  ctx.fillText(d.title, PAD, 330)
  ctx.globalAlpha = 1

  ctx.fillStyle = GOLD
  const value = formatBRL(d.saved)
  fit(ctx, value, 800, 172, inner)
  ctx.fillText(value, PAD - 6, 500)

  ctx.fillStyle = CREAM
  ctx.globalAlpha = 0.8
  ctx.font = `500 44px ${SANS}`
  ctx.fillText(`${Math.floor(pct)}% de ${formatBRL(d.goal)}`, PAD, 584)
  ctx.globalAlpha = 0.2
  ctx.beginPath()
  ctx.roundRect(PAD, 630, inner, 20, 4)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.roundRect(PAD, 630, Math.max(20, (inner * pct) / 100), 20, 4)
  ctx.fill()

  // Mini-grade: escolhe o número de colunas que deixa os blocos maiores na área disponível.
  const top = 730
  const areaH = 860
  let cols = 1
  let cell = 0
  for (let c = 1; c <= d.blocks; c++) {
    const size = Math.min(inner / c, areaH / Math.ceil(d.blocks / c))
    if (size > cell) [cols, cell] = [c, size]
  }
  const gap = Math.max(2, cell * 0.14)
  const sq = cell - gap
  for (let n = 1; n <= d.blocks; n++) {
    const i = n - 1
    ctx.fillStyle = d.marked.has(n) ? GOLD : 'rgba(244, 241, 232, 0.13)'
    ctx.beginPath()
    ctx.roundRect(PAD + (i % cols) * cell, top + Math.floor(i / cols) * cell, sq, sq, Math.min(8, sq * 0.18))
    ctx.fill()
  }

  ctx.fillStyle = CREAM
  ctx.font = `700 52px ${SANS}`
  ctx.fillText(
    d.streak > 0
      ? `🔥 ${d.streak} ${d.streak === 1 ? 'dia seguido' : 'dias seguidos'}`
      : `${d.marked.size} de ${d.blocks} blocos marcados`,
    PAD, 1700,
  )
  ctx.globalAlpha = 0.6
  ctx.font = `500 40px ${SANS}`
  ctx.fillText(location.host, PAD, 1820)
  ctx.globalAlpha = 1

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas vazio'))), 'image/png'))
}

/** Menu de compartilhar do celular com a imagem; sem suporte a arquivos, baixa a imagem. */
export async function shareStoryCard(blob: Blob, title: string): Promise<'shared' | 'downloaded' | 'canceled'> {
  const file = new File([blob], 'tijoblock.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch {
      return 'canceled'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return 'downloaded'
}
