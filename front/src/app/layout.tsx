import { LogoutButton } from "@/components/LogoutButton";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/Providers";

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
        <Providers>
          <nav style={{
            display: 'flex',
            gap: '20px',
            padding: '20px',
            backgroundColor: '#1a1a1a',
            color: 'white',
            borderBottom: '2px solid #e63946',
            alignItems: 'center' 
          }}>
            <Link href="/dashboard" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold' }}>
              Portal Escarlate
            </Link>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '20px', alignItems: 'center' }}>
              <Link href="/dashboard" style={{ color: 'white', textDecoration: 'none' }}>Home</Link>
              
              <Link href="/profile" style={{ color: '#e63946', textDecoration: 'none', fontWeight: 'bold' }}>
                Perfil
              </Link>
              
              {/* 2. SUBSTITUÍMOS TODO AQUELE FORMULÁRIO POR ESTA ÚNICA LINHA: */}
              <LogoutButton variant="link" />
              
            </div>
          </nav>

          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}