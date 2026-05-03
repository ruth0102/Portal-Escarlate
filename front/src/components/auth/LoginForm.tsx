"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AuthForm, type AuthMessage } from "@/components/auth/AuthForm";
import { loginSchema } from "@/lib/auth/validation";
import styles from "./AuthPortal.module.css";

type LoginFormProps = {
  active: boolean;
  initialNotice?: string;
  errorMessage?: string; // NOVO: Recebendo a prop de erro
};

const defaultMessage: AuthMessage = {
  tone: "neutral",
  text: "Login: pronto para conectar sua autenticação e liberar a área de monitoramento e pesquisa pública.",
};

export function LoginForm({ active, initialNotice, errorMessage }: LoginFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  
  // Modificado: Agora ele dá prioridade máxima para a mensagem de erro
  const [message, setMessage] = useState<AuthMessage>(() => {
    if (errorMessage) {
      return { tone: "error", text: errorMessage };
    }
    if (initialNotice) {
      return { tone: "success", text: initialNotice };
    }
    return defaultMessage;
  });

  return (
    <AuthForm
      active={active}
      busy={busy}
      formId="panel-login"
      actionLabel="Entrar no portal"
      message={message}
      meta={
        <>
          <label className={styles.checkline}>
            <input type="checkbox" name="remember" />
            <span>Manter acesso ativo</span>
          </label>
          <span className={styles.textLink} aria-disabled="true">
            Recuperação em breve
          </span>
        </>
      }
      onSubmit={(event) => {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);
        
        // 1. CAPTURAMOS O VALOR DO CHECKBOX (retorna true se estiver marcado)
        const isRememberChecked = formData.get("remember") === "on";

        const parsed = loginSchema.safeParse({
          email: formData.get("email"),
          password: formData.get("password"),
        });

        if (!parsed.success) {
          setMessage({
            tone: "error",
            text: parsed.error.issues[0]?.message ?? "Revise os dados informados.",
          });
          return;
        }

        setBusy(true);
        setMessage(defaultMessage);

        startTransition(async () => {
          try {
            const response = await signIn("credentials", {
              email: parsed.data.email,
              password: parsed.data.password,
              // 2. ENVIAMOS O VALOR PARA O NEXTAUTH
              remember: isRememberChecked ? "true" : "false", 
              redirect: false,
            });

            if (response?.error) {
              setMessage({
                tone: "error",
                text: "E-mail e/ou senha incorretos.",
              });
              return;
            }

            setMessage({
              tone: "success",
              text: "Acesso confirmado. Redirecionando para a ala reservada...",
            });

            router.push("/dashboard");
            router.refresh();
          } finally {
            setBusy(false);
          }
        });
      }}
    >
      <label className={styles.field}>
        <span className={styles.fieldLabel}>E-mail</span>
        <span className={styles.inputWrap}>
          <input
            className={styles.fieldInput}
            type="email"
            name="email"
            placeholder="voce@dominio.com"
            required
          />
          <span className={styles.fieldIcon}>✦</span>
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Senha</span>
        <span className={styles.inputWrap}>
          <input
            className={styles.fieldInput}
            type="password"
            name="password"
            placeholder="Digite sua senha"
            required
          />
          <span className={styles.fieldIcon}>✧</span>
        </span>
      </label>
    </AuthForm>
  );
}