import { Link } from 'react-router-dom'
import styles from './terms.module.css'

export function TermsPage() {
  return (
    <main className={styles.page}>
      <article className={styles.panel}>
        <span className={styles.kicker}>Termos de uso e privacidade</span>
        <h1 className={styles.title}>Política de coleta e uso de dados</h1>

        <p className={styles.lead}>
          Ao criar uma conta, acessar ou utilizar o Portal Escarlate, você declara estar ciente
          e de acordo com estes termos, incluindo o tratamento dos dados pessoais necessários
          para operação, segurança, identificação de usuários e melhoria da experiência na
          plataforma.
        </p>

        <section className={styles.section}>
          <h2>Dados tratados</h2>
          <p>
            A plataforma poderá armazenar dados de identificação e contato, especialmente o
            endereço de e-mail informado no cadastro, além de registros de uso associados à
            conta, como histórico de pesquisas realizadas, datas de interação e informações
            necessárias para autenticação e funcionamento dos recursos internos.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Finalidades do tratamento</h2>
          <p>
            O histórico de pesquisas será armazenado nos servidores para melhorar a experiência
            de uso, recuperar sugestões de pesquisas anteriores, apoiar métricas internas,
            aprimorar a organização de temas consultados e desenvolver recursos de análise
            disponíveis na plataforma.
          </p>
          <p>
            O e-mail será armazenado para distinguir usuários, manter a autenticação, associar
            ações ao titular da conta, viabilizar comunicações operacionais e permitir eventuais
            envios informativos, promocionais ou publicitários relacionados à plataforma,
            observadas as preferências disponíveis e a legislação aplicável.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Consentimento e aceite</h2>
          <p>
            Ao registrar-se ou realizar login, você manifesta concordância com estes termos e
            com as políticas de coleta, armazenamento e uso de dados aqui descritas. Esse aceite
            é utilizado como registro de ciência sobre as finalidades informadas, sem afastar
            outros fundamentos legais que possam justificar tratamentos necessários para
            execução do serviço, segurança, prevenção a abuso ou cumprimento de obrigação legal.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Transparência, segurança e retenção</h2>
          <p>
            Os dados serão tratados de forma compatível com as finalidades apresentadas,
            buscando limitar o acesso a informações necessárias para operação do sistema. A
            plataforma poderá manter registros enquanto a conta estiver ativa ou pelo período
            necessário para cumprir obrigações legais, preservar segurança, auditar uso indevido
            ou executar funcionalidades solicitadas pelo usuário.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Direitos do titular</h2>
          <p>
            O usuário poderá solicitar informações sobre os dados associados à sua conta,
            correção de informações, revisão de preferências de comunicação e, quando aplicável,
            exclusão ou limitação de tratamento, observadas as hipóteses em que a retenção seja
            necessária para segurança, registro operacional ou cumprimento de dever legal.
          </p>
        </section>

        <div className={styles.actions}>
          <Link className={styles.button} to="/">
            Voltar ao acesso
          </Link>
        </div>
      </article>
    </main>
  )
}
