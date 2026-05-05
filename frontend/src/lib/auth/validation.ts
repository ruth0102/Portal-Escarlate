import { z } from "zod";

export const passwordRequirements = [
  "Ao menos 8 caracteres.",
  "Pelo menos uma letra.",
  "Pelo menos um número.",
  "Pelo menos um caractere especial.",
] as const;

export const emailSchema = z
  .string()
  .trim()
  .email("Informe um e-mail válido.")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Ao menos 8 caracteres.")
  .regex(/[A-Za-z]/, "Pelo menos uma letra.")
  .regex(/[0-9]/, "Pelo menos um número.")
  .regex(/[^A-Za-z0-9]/, "Pelo menos um caractere especial.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha."),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirme a senha."),
    terms: z.literal(true, {
      message: "É preciso aceitar os termos de acesso.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "A confirmação de senha não confere.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export function flattenFieldErrors(
  error: z.ZodError<Record<string, unknown>>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).flatMap(([key, value]) =>
      value ? [[key, value]] : [],
    ),
  );
}
