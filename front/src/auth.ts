import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import axios from "axios";
import { loginSchema } from "@/lib/auth/validation";
import { toSessionUser } from "@/lib/auth/user-repo";

export const { handlers: { GET, POST }, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // 1. Valida se os campos não estão vazios
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        try {
          // 2. O Front-End envia a tentativa de login para o Microsserviço (Porta 4000)
          const response = await axios.post("http://localhost:4000/usuarios/login", {
            email: parsed.data.email,
            password: parsed.data.password,
          });

          // 3. Se a porta 4000 responder com sucesso, o usuário é logado no site!
          if (response.data && response.data.user) {
            return toSessionUser(response.data.user);
          }
          return null;
        } catch (error) {
          // Se a senha estiver errada, o Microsserviço devolve o erro 401 e a tela avisa o usuário
          console.error("Tentativa de login falhou ou microsserviço offline.");
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});