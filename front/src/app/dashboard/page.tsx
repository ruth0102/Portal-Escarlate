import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LogoutButton } from "@/components/LogoutButton"; // Usando o novo componente para limpar o cache
import styles from "./dashboard.module.css";

export default async function DashboardPage() {
  const session = await auth();

  // Proteção de rota: se não houver sessão válida, redireciona para a home
  if (!session?.user) {
    redirect("/");
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        
        {/* CABEÇALHO */}
        <div className={styles.header}>
          <div>
            <span className={styles.kicker}>Ala reservada</span>
            <h1 className={styles.title}>Portal Escarlate</h1>
          </div>

          {/* Substituímos o formulário antigo pelo LogoutButton inteligente */}
          <LogoutButton className={styles.action}>
            Sair
          </LogoutButton>
        </div>

        {/* GRADE DE CARDS */}
        <div className={styles.grid}>
          
          {/* CARD: CONTA ATIVA */}
          <article className={styles.card}>
            <span className={styles.label}>Conta ativa</span>
            <strong className={styles.value}>{session.user.email}</strong>
            <p className={styles.copy}>
              Sessão autenticada via JWT com Auth.js. Comunicação validada pelo 
              <strong> Microsserviço de Autenticação (Node.js)</strong> e dados persistidos no 
              <strong> Supabase (PostgreSQL em nuvem)</strong>.
            </p>
          </article>

          {/* CARD: ARQUITETURA */}
          <article className={styles.card}>
            <span className={styles.label}>Arquitetura</span>
            <strong className={styles.value}>Microsserviços</strong>
            <p className={styles.copy}>
              O Front-End (Next.js) atua de forma independente. O acesso direto ao banco de dados é totalmente restrito aos microsserviços do back-end, garantindo a segurança e a integridade da plataforma Portal Escarlate.
            </p>
          </article>

          {/* CARD: PRÓXIMA ETAPA */}
          <article className={styles.cardWide}>
            <span className={styles.label}>Próxima etapa</span>
            <strong className={styles.value}>Integração de Notificações</strong>
            <p className={styles.copy}>
              O barramento de eventos (Porta 10000) já notifica a criação, login e exclusão de contas. O próximo passo é evoluir a arquitetura de microsserviços integrando os demais domínios do sistema para reagirem a esses eventos de forma assíncrona.
            </p>
          </article>

        </div>
      </section>
    </main>
  );
}