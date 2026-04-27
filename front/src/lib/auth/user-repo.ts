import "server-only";
import { apiAuth } from "@/services/api"; 
import { AxiosError } from "axios";

// Tipagens alinhadas com o banco PostgreSQL
export type LegacyUserRow = { id: string; email: string; password?: string; created_at: string };
type PublicUserRow = Pick<LegacyUserRow, "id" | "email" | "created_at">;
type AuthUserRow = Pick<LegacyUserRow, "id" | "email" | "password" | "created_at">;

export type SessionUser = {
  id: string;
  email: string;
  role: string;
};

// Tratamento de erro customizado
export class DuplicateEmailError extends Error {
  constructor() {
    super("Já existe uma conta com esse e-mail.");
    this.name = "DuplicateEmailError";
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// ==========================================
// COMUNICAÇÃO COM O MICROSSERVIÇO (PORTA 4000)
// ==========================================

// 1. Busca o usuário com a senha criptografada (Usado no Login)
export async function findUserByEmailForAuth(email: string): Promise<AuthUserRow | null> {
  try {
    const normalizedEmail = normalizeEmail(email);
    // Faz o GET na nova rota do Back-End
    const response = await apiAuth.get<AuthUserRow>(`/usuarios/auth`, {
      params: { email: normalizedEmail },
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return null; // Usuário não existe (Fluxo normal ao tentar logar com email errado)
    }
    console.error("Erro no findUserByEmailForAuth:", error);
    throw new Error("Falha de comunicação com o Microsserviço de Autenticação.");
  }
}

// 2. Busca o usuário apenas com dados públicos (Usado em validações)
export async function findUserByEmail(email: string): Promise<PublicUserRow | null> {
  try {
    const normalizedEmail = normalizeEmail(email);
    // Faz o GET na rota pública do Back-End
    const response = await apiAuth.get<PublicUserRow>(`/usuarios/publico`, {
      params: { email: normalizedEmail },
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return null;
    }
    console.error("Erro no findUserByEmail:", error);
    throw new Error("Falha ao buscar dados públicos do usuário via API.");
  }
}

// 3. Cadastra o novo usuário (Usado no Register)
export async function createUser(input: {
  email: string;
  passwordHash: string; // O Front envia a senha, o Back-End faz o Bcrypt
}): Promise<PublicUserRow> {
  try {
    // Envia o POST para o Microsserviço
    const response = await apiAuth.post<PublicUserRow>("/usuarios", {
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash, 
    });

    return response.data;
  } catch (error) {
    // Se o Back-End retornar 409, dispara o erro de E-mail Duplicado
    if (error instanceof AxiosError && error.response?.status === 409) {
      throw new DuplicateEmailError();
    }
    console.error("Erro no createUser:", error);
    throw new Error("Falha ao solicitar criação de usuário no Microsserviço.");
  }
}

// 4. Formata o usuário para a sessão do Front-End
export function toSessionUser(user: { id: string; email: string }): SessionUser {
  return {
    id: user.id,
    email: normalizeEmail(user.email),
    role: "user",
  };
}