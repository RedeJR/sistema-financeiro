"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { criarSessao, encerrarSessaoAtual, senhaConfere } from "@/lib/auth";
import { limparCpf } from "@/lib/cpf";
import type { ActionState } from "@/lib/form-state";

const schema = z.object({
  cpf: z.string().trim().min(1, "Informe o CPF."),
  senha: z.string().min(1, "Informe a senha."),
});

export async function entrar(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    cpf: formData.get("cpf"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: { cpf: String(formData.get("cpf") ?? "") },
    };
  }

  const cpf = limparCpf(parsed.data.cpf);
  const usuario = await prisma.usuario.findUnique({ where: { cpf } });

  // Mensagem genérica de propósito: não dá pra descobrir, de fora, se o CPF
  // existe ou se foi a senha que errou. Não ecoa a senha de volta.
  const erroGenerico = { error: "CPF ou senha inválidos.", values: { cpf: parsed.data.cpf } };

  if (!usuario || !usuario.ativo) return erroGenerico;

  const ok = await senhaConfere(parsed.data.senha, usuario.senhaHash);
  if (!ok) return erroGenerico;

  await criarSessao(usuario.id);
  redirect("/");
}

export async function sair() {
  await encerrarSessaoAtual();
  redirect("/login");
}
