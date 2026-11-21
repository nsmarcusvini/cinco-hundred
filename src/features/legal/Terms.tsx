import { COMPANY, companyText, SUPPORT_EMAIL } from '../../lib/company'
import { PLANS, TRIAL_DAYS } from '../../lib/plans'
import { LegalLayout } from './LegalLayout'

export default function Terms() {
  return (
    <LegalLayout title="Termos de uso" updated="21 de novembro de 2026">
      <section>
        <h2>O que é o Tijoloblock</h2>
        <p>
          O Tijoloblock é um painel para acompanhar desafios de poupança. Você guarda o dinheiro na sua própria
          conta ou investimento e marca no app os blocos correspondentes.
        </p>
      </section>
      <section>
        <h2>{COMPANY ? 'Quem fornece o Tijoloblock' : 'Suporte'}</h2>
        {COMPANY && <p>{companyText(COMPANY)}.</p>}
        <p>Suporte, dúvidas e reclamações: <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.</p>
      </section>
      <section>
        <h2>O app não é instituição financeira</h2>
        <ul>
          <li>Não guardamos, não movimentamos e não investimos o seu dinheiro.</li>
          <li>Não fazemos recomendação de investimento. O plano personalizado é uma simulação educativa baseada
            nas informações que você informa.</li>
          <li>Rendimentos mostrados no plano são estimativas com uma taxa de referência, não garantia.</li>
        </ul>
      </section>
      <section>
        <h2>Assinatura</h2>
        <p>
          O cadastro e o plano personalizado são grátis. Para criar desafios, participar de grupos e de movimentos,
          você assina um dos planos abaixo. O pagamento é processado pela Stripe.
        </p>
        <ul>
          <li>Mensal: {PLANS.monthly.price} por mês, com {TRIAL_DAYS} dias grátis na primeira assinatura.</li>
          <li>Anual: {PLANS.annual.price} por ano, cobrados de uma vez, sem teste grátis.</li>
        </ul>
      </section>
      <section>
        <h2>Teste grátis</h2>
        <p>
          O teste grátis exige um cartão. Se você não cancelar antes do fim dos {TRIAL_DAYS} dias, a primeira
          mensalidade é cobrada automaticamente nesse cartão. Se cancelar antes, nada é cobrado. O teste vale uma vez
          por conta.
        </p>
      </section>
      <section>
        <h2>Renovação automática</h2>
        <p>
          A assinatura renova sozinha ao fim de cada período, no mesmo plano e pelo valor vigente, até você cancelar.
          Se a cobrança for recusada, tentamos de novo por alguns dias. Enquanto ela não for paga, o acesso fica
          suspenso e os desafios ficam só para consulta. Se o valor do plano mudar, avisamos antes da renovação.
        </p>
      </section>
      <section>
        <h2>Cancelamento</h2>
        <p>
          Você cancela quando quiser em Configurações, sem multa. A renovação para na hora, o acesso segue até o fim do
          período já pago e não há reembolso proporcional do período restante, salvo o direito de arrependimento abaixo.
          Ao terminar a assinatura, você não cria novos desafios nem entra em grupos e movimentos, e os desafios que
          você já tem ficam só para consulta: os blocos continuam guardados na sua conta, mas não dá para marcar nem
          desmarcar até assinar de novo. Em grupos, os demais participantes seguem marcando normalmente.
        </p>
      </section>
      <section>
        <h2>Reembolso (direito de arrependimento)</h2>
        <p>
          Você pode desistir em até 7 dias depois da primeira cobrança, conforme o Código de Defesa do Consumidor, e
          receber o valor de volta. Peça pelo e-mail <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>. Com o reembolso, a assinatura é encerrada na hora.
        </p>
      </section>
      <section>
        <h2>Quem comprou o acesso vitalício</h2>
        <p>Quem comprou o acesso com pagamento único até a criação dos planos continua com ele, sem mensalidade.</p>
      </section>
      <section>
        <h2>Desafios em grupo e movimentos</h2>
        <p>
          Em grupos, os participantes veem as marcações uns dos outros e o ranking do grupo, com quanto cada um
          guardou. Nos rankings dos movimentos aparecem só o nome de exibição de quem criou o desafio, o nome
          abreviado dos demais participantes (ex.: "Marcus S.") e a porcentagem concluída, nunca valores. No ranking geral aparecem o nome de exibição e o total marcado nos blocos (incluindo o saldo inicial do movimento "Já comecei", em blocos inteiros), e só de quem escolheu
          aparecer. Você pode entrar ou sair dos rankings em Configurações.
        </p>
      </section>
      <section>
        <h2>Sua conta</h2>
        <p>
          Você pode excluir sua conta a qualquer momento. A assinatura é cancelada junto, sem reembolso do período já
          pago, salvo o direito de arrependimento. Compras e assinaturas ficam guardadas de forma anonimizada para fins
          fiscais.
        </p>
      </section>
    </LegalLayout>
  )
}
