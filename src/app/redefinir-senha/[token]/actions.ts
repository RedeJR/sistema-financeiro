"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashSenha } from "@/lib/auth";
import type { ActionState } from "@/lib/form-state";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const schema = z
  .object({
    novaSenha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
    confirmarSenha: z.string().min(1, "Confirme a senha."),
  })
  .refine((d) => d.novaSenha === d.confirmarSenha, {
    message: "As senhas não coincidem.",
    path: ["confirmarSenha"],
  });

export async function redefinirSenha(
  token: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = schema.safeParse({
    novaSenha: formData.get("novaSenha"),
    confirmarSenha: formData.get("confirmarSenha"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const registro = await prisma.recuperacaoSenha.findUnique({ where: { id: hashToken(token) } });
  if (!registro || registro.usado || registro.expiresAt < new Date()) {
    return {
      error:
        "Esse link não é mais válido — pode ter expirado (1h) ou já ter sido usado. Peça um novo em \"Esqueci minha senha\".",
    };
  }

  const senhaHash = await hashSenha(parsed.data.novaSenha);
  await prisma.$transaction([
    prisma.usuario.update({ where: { id: registro.usuarioId }, data: { senhaHash } }),
    prisma.recuperacaoSenha.update({ where: { id: registro.id }, data: { usado: true } }),
    // Derruba sessões abertas — se alguém mais tinha acesso com a senha
    // antiga (esquecida em algum lugar), perde o acesso na troca.
    prisma.sessao.deleteMany({ where: { usuarioId: registro.usuarioId } }),
  ]);

  redirect("/login?senha-redefinida=1");
}
