import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthPortal } from "@/components/auth/AuthPortal";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>;
}) {
  const session = await auth();

  // Se o usuário já estiver logado, manda ele direto para o dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  // 1. Prioridade Máxima: Erro de Credenciais
  if (params.error === "CredentialsSignin") {
    return (
      <AuthPortal
        initialMode="login"
        loginError="E-mail e/ou senha incorretos."
      />
    );
  }

  // 2. Segunda Prioridade: Verificação de E-mail (Sucesso)
  if (params.verified === "1") {
    return (
      <AuthPortal
        initialMode="login"
        loginNotice="E-mail confirmado. Agora você pode entrar no portal."
      />
    );
  }

  // 3. Estado Padrão (Entrou na tela pela primeira vez)
  return <AuthPortal initialMode="login" />;
}