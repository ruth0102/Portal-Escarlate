import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { type: "text" }, // 1. Campo para receber o valor do checkbox
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          // O Front-End faz a requisição HTTP para o Microsserviço de Auth (Porta 4000)
          const response = await fetch("http://localhost:4000/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!response.ok) return null;

          const user = await response.json();
          
          // 2. Retornamos o "remember" junto com os dados do usuário para o JWT
          return {
            id: user.id.toString(),
            email: user.email,
            role: user.role,
            remember: credentials.remember, // "true" ou "false" vindo do front
          };
        } catch (error) {
          console.error("Erro ao conectar com o microsserviço:", error);
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/", // Define a página raiz como tela de login
  },
  callbacks: {
    async jwt({ token, user }) {
      // Quando o usuário faz login pela primeira vez
      if (user) {
        token.role = (user as any).role;
        
        // 3. Lógica de Expiração Dinâmica
        // Se "manter acesso ativo" estiver desativado, o token expira em 1 hora (3600s)
        if ((user as any).remember === "false") {
          // Math.floor(Date.now() / 1000) gera o timestamp atual em segundos
          token.exp = Math.floor(Date.now() / 1000) + 3600;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Repassa os dados do Token para a Sessão acessível no Front-end
      if (token?.sub && session.user) {
        session.user.id = token.sub;
        (session.user as any).role = token.role; 
      }
      return session;
    },
  },
});