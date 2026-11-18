// A casa do desafio: etapas da obra ligadas à % concluída do desafio (a mesma do "concluído" e da barra).
// Função pura, usada pelo app e pela demonstração da landing. Entre 0% e 100% há 8 etapas de 12,5%, então as
// trocas coincidem com os marcos 25/50/75 que já comemoram na tela.

export interface HouseStage {
  name: string
  /** Texto alternativo da ilustração nesta etapa. */
  alt: string
  from: number // % concluída para chegar à etapa
}

export const HOUSE_STAGES: HouseStage[] = [
  { name: 'Terreno', alt: 'Terreno vazio, só com a planta da casa marcada no chão.', from: 0 },
  { name: 'Fundação', alt: 'Fundação sendo concretada, com as ferragens de pé.', from: 0 },
  { name: 'Estrutura', alt: 'Pilares de concreto e a laje entre os dois andares.', from: 12.5 },
  { name: 'Paredes', alt: 'Paredes dos dois andares subindo entre os pilares.', from: 25 },
  { name: 'Telhado e janelas', alt: 'Casa com laje de cobertura, grandes janelas de vidro e porta.', from: 37.5 },
  { name: 'Fachada', alt: 'Fachada com ripado de madeira, guarda-corpo de vidro e luminárias.', from: 50 },
  { name: 'Garagem', alt: 'Casa com garagem e entrada de carro.', from: 62.5 },
  { name: 'Paisagismo', alt: 'Casa com gramado, árvores, arbustos e caminho de pedra.', from: 75 },
  { name: 'Piscina', alt: 'Casa com piscina e deck de madeira no jardim.', from: 87.5 },
  { name: 'Casa concluída', alt: 'Casa luxuosa pronta: luzes acesas, jardim, garagem e piscina.', from: 100 },
]

/** Última etapa (casa concluída). */
export const HOUSE_DONE = HOUSE_STAGES.length - 1

export interface House {
  /** 0 = terreno (sem progresso), 1–8 = em obra, 9 = concluída. */
  stage: number
  state: 'empty' | 'partial' | 'complete'
  name: string
  alt: string
  /** 0..1 do caminho dentro da etapa atual (as peças da etapa vão aparecendo). */
  within: number
  next: HouseStage | null
}

export function houseFor(pct: number): House {
  const p = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0
  const stage = p <= 0 ? 0 : p >= 100 ? HOUSE_DONE : 1 + Math.floor(p / 12.5)
  const { name, alt, from } = HOUSE_STAGES[stage]
  const within = stage === 0 ? 0 : stage === HOUSE_DONE ? 1 : (p - from) / 12.5
  return {
    stage,
    state: stage === 0 ? 'empty' : stage === HOUSE_DONE ? 'complete' : 'partial',
    name,
    alt,
    within,
    next: HOUSE_STAGES[stage + 1] ?? null,
  }
}
