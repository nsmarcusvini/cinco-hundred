// Progresso do onboarding. Adaptado do "Onboarding Stepper Progress" (21st.dev, shadcnspace):
// a barra virou uma fileira de blocos, um por passo (o objeto do produto), e o "voltar" fica ao lado.

interface StepBlocksProps {
  current: number // 1-based
  total: number
  onBack?: () => void
}

export function StepBlocks({ current, total, onBack }: StepBlocksProps) {
  return (
    <div className="flex h-12 items-center gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="-ml-2 rounded-field px-2 py-2 font-medium text-muted">
          ‹ Voltar
        </button>
      ) : (
        <span className="w-[4.5rem]" />
      )}
      <div
        className="ml-auto flex gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={`Passo ${current} de ${total}`}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`size-3.5 rounded-[3px] transition-colors duration-200 ${
              i < current ? 'bg-leaf' : 'border border-line'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
