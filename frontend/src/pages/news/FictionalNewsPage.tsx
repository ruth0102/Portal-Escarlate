import { Link } from 'react-router-dom'
import styles from '../news-summary/news-summary.module.css'

export function FictionalNewsPage() {
  return (
    <main className={styles.page}>
      <article className={styles.summaryArticle}>
        <header className={styles.header}>
          <Link className={styles.backLink} to="/dashboard">
            ← Voltar
          </Link>
          <span className={styles.brandPill}>Portal Escarlate</span>
        </header>

        <section className={styles.hero}>
          <img
            className={styles.featuredImage}
            src="/escritorio-PE.png"
            alt="Ambiente editorial do Portal Escarlate"
          />

          <div className={styles.heroCopy}>
            <span className={styles.heroEyebrow}>Notícia inicial</span>
            <h1 className={styles.title}>Portal Escarlate lança nova plataforma de notícias</h1>
            <p className={styles.heroText}>
              Uma experiência de pesquisa inteligente para acompanhar temas relevantes,
              comparar fontes diversas e transformar resultados em sínteses claras.
            </p>
            <div className={styles.metaRow}>
              <span className={styles.author}>Equipe Portal Escarlate</span>
            </div>
          </div>
        </section>

        <div className={styles.content}>
          <div className={styles.summaryHeader}>
            <span className={styles.summaryLabel}>Apresentação</span>
            <div className={styles.metaNote}>
              <span>Conteúdo demonstrativo</span>
              <span>Fonte: Portal Escarlate</span>
            </div>
          </div>

          <div className={styles.summaryText}>
            O Portal Escarlate apresenta uma plataforma voltada para leitores que buscam
            contexto, agilidade e organização na leitura de notícias. A proposta combina
            pesquisa por temas, curadoria de fontes e apoio de inteligência artificial para
            destacar os pontos centrais de cada página de resultados.
            {'\n\n'}
            A interface foi desenhada para reduzir ruído visual e priorizar a leitura. Cada
            busca pode reunir notícias de origens diferentes, permitindo que o usuário
            acompanhe um mesmo assunto por perspectivas variadas antes de decidir onde
            aprofundar a leitura.
            {'\n\n'}
            Esta notícia é uma página fictícia usada como conteúdo inicial do dashboard. Ela
            serve para demonstrar o comportamento dos cards antes da primeira pesquisa real,
            mantendo a navegação consistente com o restante da aplicação.
          </div>

          <div className={styles.footer}>
            <Link className={styles.readMore} to="/dashboard">
              Voltar para pesquisa →
            </Link>
          </div>
        </div>
      </article>
    </main>
  )
}
