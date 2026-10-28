import { LegalLayout } from './LegalLayout'

export default function Terms() {
  return (
    <LegalLayout title="Termos de uso" updated="27 de outubro de 2026">
      <section>
        <h2>O que é o Cinco Hundred</h2>
        <p>
          O Cinco Hundred é um painel para acompanhar desafios de poupança. Você guarda o dinheiro na sua própria
          conta ou investimento e marca no app os blocos correspondentes.
        </p>
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
        <h2>Acesso vitalício</h2>
        <p>
          O cadastro e o plano personalizado são grátis. Para criar desafios, participar de grupos e de movimentos,
          você compra o acesso vitalício com pagamento único, processado pela Stripe. Não há mensalidade.
        </p>
      </section>
      <section>
        <h2>Reembolso (direito de arrependimento)</h2>
        <p>
          Você pode desistir da compra em até 7 dias, conforme o Código de Defesa do Consumidor, e receber o valor
          de volta. Peça pelo suporte. Com o reembolso, o acesso vitalício é encerrado.
        </p>
      </section>
      <section>
        <h2>Desafios em grupo e movimentos</h2>
        <p>
          Em grupos, os participantes veem as marcações uns dos outros. Nos rankings dos movimentos aparecem só o
          nome de exibição e a porcentagem concluída, nunca valores. Você pode sair dos rankings em Configurações.
        </p>
      </section>
      <section>
        <h2>Sua conta</h2>
        <p>Você pode excluir sua conta a qualquer momento. As compras ficam guardadas de forma anonimizada para fins fiscais.</p>
      </section>
    </LegalLayout>
  )
}
