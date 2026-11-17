// Contato de suporte e fornecedor do Tijoloblock (Decreto 7.962/2013), que também é o controlador dos dados (LGPD).
// Só dados confirmados pelo fundador, que autorizou publicá-los.

export const SUPPORT_EMAIL = 'tijoloblock@outlook.com'

type Company = { name: string; documentLabel: 'CPF' | 'CNPJ'; document: string; address?: string }

/** Fornecedor. Endereço só entra quando o fundador informar. */
export const COMPANY: Company | null = {
  name: 'Marcus Vinicius Nascimento Souza',
  documentLabel: 'CPF',
  document: '526.985.108-38',
}

const parts = (c: Company) => [c.name, `${c.documentLabel} ${c.document}`, c.address].filter(Boolean)

/** "Nome · CPF 000.000.000-00 · Endereço": a identificação que aparece no rodapé. */
export const companyLine = (c: Company) => parts(c).join(' · ')

/** "Nome, CPF 000.000.000-00, Endereço": a mesma identificação dentro de uma frase. */
export const companyText = (c: Company) => parts(c).join(', ')
