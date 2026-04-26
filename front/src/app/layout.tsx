import type { Metadata } from "next";
import Link from "next/link"; // Importante para a navegação interna
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal Escarlate",
  description:
    "Curadoria reservada de notícias de alto impacto e apoio à pesquisa em arquivos públicos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        {/* Adicionando a Navbar Global */}
        <nav style={{
          display: 'flex',
          gap: '20px',
          padding: '20px',
          backgroundColor: '#1a1a1a',
          color: 'white',
          borderBottom: '2px solid #e63946'
        }}>
          <Link href="/dashboard" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold' }}>
            Portal Escarlate
          </Link>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '20px' }}>
            <Link href="/dashboard" style={{ color: 'white', textDecoration: 'none' }}>Home</Link>
            
            {/* O link para a entrega de hoje (26/04) */}
            <Link href="/profile" style={{ color: '#e63946', textDecoration: 'none', fontWeight: 'bold' }}>
              Perfil
            </Link>
            
            <Link href="/login" style={{ color: 'white', textDecoration: 'none' }}>Sair</Link>
          </div>
        </nav>

        <main>{children}</main>
      </body>
    </html>
  );
}