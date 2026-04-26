import "server-only";
import { apiAuth } from "@/services/api"; // Importando o Axios que vamos criar!
import { AxiosError } from "axios";

// Mantemos as tipagens para o TypeScript não reclamar
export type LegacyUserRow = { id: string; email: string; password?: string; created_at: string };
type PublicUserRow = Pick<LegacyUserRow, "id" | "email" | "created_at">;
type AuthUserRow = Pick<LegacyUserRow, "id" | "email" | "password" | "created_at">;

export type SessionUser = {
  id: string;
  email: string;
  role: string;
};

export class DuplicateEmailError extends Error {
  constructor() {
    super("Já existe uma conta com esse e-mail.");
    this.name = "DuplicateEmailError";
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// ------------------------------------------------------------------
// O Front-End agora pede para o Microsserviço, em vez de ir no banco
// ------------------------------------------------------------------

export async function findUserByEmailForAuth(email: string) {
  try {
    const normalizedEmail = normalizeEmail(email);
    // Faz um GET na porta do microsserviço de Auth (ex: localhost:4000/usuarios/auth?email=...)
    const response = await apiAuth.get<AuthUserRow>(`/usuarios/auth`, {
      params: { email: normalizedEmail },
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return null; // Usuário não encontrado, normal no processo de login
    }
    throw new Error("Falha de comunicação com o Microsserviço de Autenticação.");
  }
}

export async function findUserByEmail(email: string) {
  try {
    const normalizedEmail = normalizeEmail(email);
    const response = await apiAuth.get<PublicUserRow>(`/usuarios/publico`, {
      params: { email: normalizedEmail },
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return null;
    }
    throw new Error("Falha ao buscar dados públicos do usuário via API.");
  }
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
}) {
  try {
    // Faz um POST enviando os dados para o microsserviço cadastrar
    const response = await apiAuth.post<PublicUserRow>("/usuarios", {
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
    });

    return response.data;
  } catch (error) {
    // Se o microsserviço avisar que deu conflito (Erro 409), o e-mail já existe
    if (error instanceof AxiosError && error.response?.status === 409) {
      throw new DuplicateEmailError();
    }
    throw new Error("Falha ao solicitar criação de usuário no Microsserviço.");
  }
}

export function toSessionUser(user: { id: string; email: string }): SessionUser {
  return {
    id: user.id,
    email: normalizeEmail(user.email),
    role: "user",
  };
}
