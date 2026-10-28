import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { formatBRL } from '../lib/format'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-forest text-cream disabled:bg-forest/40',
    secondary: 'border-2 border-forest text-forest disabled:opacity-40',
    ghost: 'text-forest underline-offset-4 hover:underline disabled:opacity-40',
  }[variant]
  return (
    <button
      className={`min-h-12 rounded-field px-5 text-base font-semibold transition-transform duration-150 active:scale-[0.98] ${styles} ${className}`}
      {...props}
    />
  )
}

/** Campo de moeda em reais inteiros: teclado numérico e máscara que não trava a digitação. */
export function CurrencyInput({
  value, onChange, large, ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null
  onChange: (value: number | null) => void
  large?: boolean
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={`num w-full border-b-2 border-line bg-transparent py-1 font-extrabold outline-none focus:border-forest ${
        large ? 'text-3xl' : 'text-lg'
      }`}
      placeholder="R$ 0"
      value={value === null ? '' : formatBRL(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
        onChange(digits ? Number(digits) : null)
      }}
      {...props}
    />
  )
}

interface ChoiceProps<T> {
  options: { value: T; label: ReactNode }[]
  value: T | null
  onChange: (value: T) => void
  label: string
}

/** Escolha única em chips (role=radiogroup). */
export function Choice<T extends string | number | boolean>({ options, value, onChange, label }: ChoiceProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 rounded-field border-2 px-4 font-medium transition-colors duration-150 ${
            value === o.value ? 'border-forest bg-forest text-cream' : 'border-line'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Prévia da grade: N blocos quadrados (sem interação). */
export function GridPreview({ blocks, filled = 0 }: { blocks: number; filled?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10px,1fr))] gap-[3px]" aria-hidden>
      {Array.from({ length: blocks }, (_, i) => (
        <span key={i} className={`aspect-square rounded-[2px] ${i < filled ? 'bg-leaf' : 'bg-line'}`} />
      ))}
    </div>
  )
}
