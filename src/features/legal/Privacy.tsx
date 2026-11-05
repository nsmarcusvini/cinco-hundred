import { LegalLayout } from './LegalLayout'

export default function Privacy() {
  return (
    <LegalLayout title="Política de privacidade" updated="4 de novembro de 2026">
      <section>
        <h2>Quais dados coletamos</h2>
        <ul>
          <li>Conta: e-mail, nome de exibição e, se você informar, data de nascimento e cidade.</li>
          <li>Uso: desafios, blocos marcados, preferências de lembrete, telas abertas e ações no app (como criar um
            desafio), sempre sem valores financeiros.</li>
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
          <li>Ninguém do seu grupo, dos movimentos ou dos rankings tem acesso.</li>
          <li>A administração do Tijoblock também não vê esses dados: o painel interno mostra cadastro, status de
            pagamento e progresso em blocos, nunca renda, gastos ou valores guardados. O acesso técnico ao banco é
            restrito a manutenção e segurança.</li>
          <li>Eles nunca são enviados para ferramentas de análise. Medimos só faixas, como “prazo entre 5 e 10 anos”.</li>
          <li>Você pode apagar seus dados financeiros a qualquer momento, mantendo os seus desafios.</li>
          <li>Se preferir, use o modo rápido: o cálculo roda só no seu aparelho e guardamos apenas o valor mensal escolhido.</li>
        </ul>
      </section>
      <section>
        <h2>Como medimos o uso</h2>
        <p>Medimos o uso para entender o que funciona, corrigir problemas e dar suporte.</p>
        <ul>
          <li>Com login: registramos quais telas você abre e quais ações faz, ligadas à sua conta. Nunca valores, e
            nunca o texto das suas notas.</li>
          <li>Sem login: contamos visitas por página, sem cookie nem identificador.</li>
          <li>Guardamos esses registros por até 12 meses, e as medições de velocidade por até 90 dias. Ao excluir a
            conta, os registros que ficarem deixam de estar ligados a você.</li>
        </ul>
      </section>
      <section>
        <h2>Quem administra o Tijoblock</h2>
        <p>
          O painel interno é protegido por verificação em duas etapas e mostra seu e-mail, nome, cidade, idade, origem
          do cadastro, status de pagamento, título e progresso em blocos dos desafios, último acesso e histórico de
          ações. Ele é usado para dar suporte e entender o uso do app. Cada consulta a uma conta fica registrada.
        </p>
      </section>
      <section>
        <h2>Rankings</h2>
        <ul>
          <li>Ranking geral: só aparece quem escolheu aparecer, no cadastro ou em Configurações. Mostra o nome de
            exibição e o total marcado nos blocos.</li>
          <li>Rankings dos movimentos: mostram o nome de exibição de quem criou o desafio, o nome abreviado dos
            demais participantes (ex.: "Marcus S.") e a porcentagem concluída, nunca valores.</li>
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
