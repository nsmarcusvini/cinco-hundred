import { LegalLayout } from './LegalLayout'

export default function Privacy() {
  return (
    <LegalLayout title="Política de privacidade" updated="28 de outubro de 2026">
      <section>
        <h2>Quais dados coletamos</h2>
        <ul>
          <li>Conta: e-mail, nome de exibição e, se você informar, data de nascimento e cidade.</li>
          <li>Uso: desafios, blocos marcados, preferências de lembrete e eventos de uso sem valores financeiros.</li>
          <li>Pagamento: processado pela Stripe. Não vemos nem guardamos os dados do seu cartão.</li>
        </ul>
      </section>
      <section>
        <h2>Seus dados financeiros</h2>
        <p>
          Renda, gastos e situação financeira são guardados só com o seu consentimento explícito, registrado no
          cadastro, e com uma finalidade única: calcular o seu plano.
        </p>
        <ul>
          <li>Só você vê esses dados. Ninguém do seu grupo, dos movimentos ou dos rankings tem acesso.</li>
          <li>Eles nunca são enviados para ferramentas de análise. Medimos só faixas, como “prazo entre 5 e 10 anos”.</li>
          <li>Você pode apagar seus dados financeiros a qualquer momento, mantendo os seus desafios.</li>
          <li>Se preferir, use o modo rápido: o cálculo roda só no seu aparelho e guardamos apenas o valor mensal escolhido.</li>
        </ul>
      </section>
      <section>
        <h2>Rankings</h2>
        <ul>
          <li>Ranking geral: só aparece quem escolheu aparecer, no cadastro ou em Configurações. Mostra o nome de
            exibição e o total marcado nos blocos.</li>
          <li>Rankings dos movimentos: mostram o nome de exibição e a porcentagem concluída, nunca valores.</li>
          <li>Ranking do grupo: só os participantes do desafio veem quanto cada um guardou nele.</li>
        </ul>
      </section>
      <section>
        <h2>Notificações</h2>
        <p>Lembretes só são enviados se você ativar, e podem ser desligados em Configurações.</p>
      </section>
      <section>
        <h2>Seus direitos (LGPD)</h2>
        <p>
          Você pode acessar, corrigir, exportar e excluir seus dados. Ao excluir a conta, apagamos todos os dados
          pessoais; as compras ficam anonimizadas para fins fiscais.
        </p>
      </section>
    </LegalLayout>
  )
}
