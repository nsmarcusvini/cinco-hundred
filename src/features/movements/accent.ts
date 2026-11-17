// Cor de destaque de cada movimento. Tons terrosos que conversam com o verde #0b3d2e e o fundo #f4f1e8,
// todos com contraste AA (>= 4.5:1) para texto sobre o creme e para texto creme sobre a cor.
export const ACCENTS = {
  tijolo: '#a4471f', // terracota, o tijolo da marca
  petroleo: '#1d6670',
  ocre: '#85600f',
  ameixa: '#6d3b5e',
  musgo: '#4a6622',
} as const

const BY_SLUG: Record<string, string> = {
  'desafio-500': ACCENTS.tijolo,
  '100-mil-com-um-amigo': ACCENTS.petroleo,
  '100-dias': ACCENTS.musgo,
}

const FALLBACK = [ACCENTS.ocre, ACCENTS.ameixa, ACCENTS.petroleo, ACCENTS.musgo, ACCENTS.tijolo]

/** Cor fixa para os movimentos conhecidos; os novos ganham uma da paleta, sempre a mesma para o mesmo slug. */
export function movementAccent(slug: string): string {
  if (BY_SLUG[slug]) return BY_SLUG[slug]
  let h = 0
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACK[h % FALLBACK.length]
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
