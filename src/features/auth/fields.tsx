import { useState, type ReactNode } from 'react'

export const inputCls = 'w-full min-h-12 rounded-field border-2 border-line bg-transparent px-3 outline-none focus:border-forest'

export const MIN_PASSWORD = 8

/** Regra da senha: 8+ caracteres com letra e número. Devolve o que falta, ou null se está ok. */
export function passwordProblem(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `Use pelo menos ${MIN_PASSWORD} caracteres.`
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return 'Misture letras e números.'
  return null
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
    </div>
  )
}

/** Senha com botão de mostrar/esconder (no celular é melhor que pedir para digitar duas vezes). */
export function PasswordInput({ id, value, onChange, autoComplete, autoFocus, describedBy }: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  autoFocus?: boolean
  describedBy?: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input id={id} type={shown ? 'text' : 'password'} required autoComplete={autoComplete} autoFocus={autoFocus}
        minLength={autoComplete === 'new-password' ? MIN_PASSWORD : undefined} aria-describedby={describedBy}
        value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} pr-20`} />
      <button type="button" onClick={() => setShown(!shown)} aria-pressed={shown}
        className="absolute inset-y-0 right-0 min-w-16 px-3 text-sm font-semibold text-forest">
        {shown ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  )
}

/** Mensagem em português para os erros do Supabase Auth. */
export function authMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case 'invalid_credentials': return 'E-mail ou senha incorretos.'
    case 'email_not_confirmed': return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
    case 'user_already_exists':
    case 'email_exists': return 'Já existe uma conta com este e-mail. Entre com sua senha.'
    case 'weak_password': return 'Senha fraca. Use pelo menos 8 caracteres, com letras e números.'
    case 'same_password': return 'A nova senha precisa ser diferente da atual.'
    case 'email_address_invalid': return 'Confira o e-mail digitado.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit': return 'Muitas tentativas. Espere alguns minutos e tente de novo.'
    default: return 'Não foi possível concluir. Confira sua conexão e tente de novo.'
  }
}
