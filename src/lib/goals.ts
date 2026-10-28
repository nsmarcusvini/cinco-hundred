export type SavingsGoal = 'reserva' | 'investimento' | 'intercambio' | 'dinheiro_trabalhando' | 'outros'

export const GOALS: { value: SavingsGoal; label: string; icon: string }[] = [
  { value: 'reserva', label: 'Reserva de emergência', icon: '🛟' },
  { value: 'investimento', label: 'Investimento', icon: '📈' },
  { value: 'intercambio', label: 'Intercâmbio', icon: '✈️' },
  { value: 'dinheiro_trabalhando', label: 'Deixar o dinheiro trabalhar', icon: '🌱' },
  { value: 'outros', label: 'Outros', icon: '🎯' },
]

/** "Intercâmbio", ou o texto que a pessoa escreveu em "Outros". */
export function goalLabel(goal: SavingsGoal | null, other: string | null): string | null {
  if (!goal) return null
  if (goal === 'outros') return other?.trim() || 'Outro objetivo'
  return GOALS.find((g) => g.value === goal)!.label
}

export const goalIcon = (goal: SavingsGoal | null) => GOALS.find((g) => g.value === goal)?.icon ?? '🎯'
