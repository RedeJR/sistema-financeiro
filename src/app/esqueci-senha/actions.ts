"use server";

import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { limparCpf } from "@/lib/cpf";
import { enviarEmailRecuperacaoSenha } from "@/lib/email";
import { valoresDoFormulario, type ActionState } from "@/lib/form-state";

const schema = z.object({
  cpf: z.string().trim().min(1, "Informe o CPF."),
});

const DURACAO_MS = 60 * 60 * 1000; // 1 hora

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Sempre termina em redirect pro mesmo "enviado" — exista ou não o CPF,
// tenha ou não email cadastrado. De fora, ninguém consegue diferenciar "CPF
// não existe" de "email foi enviado", pra não dar pista de quem tem conta
// aqui (mesmo princípio do login: mensagem de erro genérica).
export async function solicitarRecuperacaoSenha(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = schema.safeParse({ cpf: formData.get("cpf") });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  const cpf = limparCpf(parsed.data.cpf);
  const usuario = await prisma.usuario.findUnique({ where: { cpf } });

  if (usuario && usuario.ativo && usuario.email) {
    const token = gerarToken();
    await prisma.recuperacaoSenha.create({
      data: {
        id: hashToken(token),
        usuarioId: usuario.id,
        expiresAt: new Date(Date.now() + DURACAO_MS),
      },
    });
    const link = `${baseUrl()}/redefinir-senha/${token}`;
    await enviarEmailRecuperacaoSenha({ destinatario: usuario.email, nomeUsuario: usuario.nome, link });
  }

  redirect("/esqueci-senha?enviado=1");
}
