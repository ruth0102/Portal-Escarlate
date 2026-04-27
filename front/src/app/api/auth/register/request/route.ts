import { NextResponse } from "next/server";
import { registerSchema, flattenFieldErrors } from "@/lib/auth/validation";
import { createUser } from "@/lib/auth/user-repo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Não foi possível ler os dados do cadastro." },
      { status: 400 }
    );
  }

  const parsed = registerSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: parsed.error.issues[0]?.message ?? "Revise os campos informados.",
        fieldErrors: flattenFieldErrors(parsed.error),
      },
      { status: 400 }
    );
  }

  try {
    // Comunicação com o Microsserviço de Auth (Porta 4000)
    const newUser = await createUser({
      email: parsed.data.email,
      passwordHash: parsed.data.password, 
    });

    if (!newUser) {
      throw new Error("Erro ao criar usuário no servidor.");
    }

    return NextResponse.json(
      { message: "Cadastro realizado com sucesso!" },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Erro na rota de registro:", error);
    return NextResponse.json(
      { message: "Não foi possível realizar o cadastro agora." },
      { status: 500 }
    );
  }
}
