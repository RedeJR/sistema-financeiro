"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  bloqueadoAgora,
  criarSessao,
  encerrarSessaoAtual,
  limparTentativasFalhas,
  minutosDeBloqueioRestantes,
  registrarTentativaFalha,
  senhaConfere,
} from "@/lib/auth";

// Hash "morto" — mesmo formato de um hash bcrypt de verdade, mas de senha
// nenhuma. Usado só pra gastar o mesmo tempo de CPU de um bcrypt.compare
// real quando o CPF não existe, senão dá pra perceber por timing (resposta
// mais rápida) que aquele CPF não está cadastrado.
const HASH_FALSO = "$2a$10$C6UzMDM.H6dfI/f/IKcEeO2CB4gvfz9K/uK1pqZUYW6EEqXsyRHzS";
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

  if (!usuario || !usuario.ativo) {
    // Gasta o mesmo tempo de um bcrypt.compare de verdade (ver HASH_FALSO
    // acima) pra não dar pra perceber, pela velocidade da resposta, que
    // esse CPF nem existe.
    await senhaConfere(parsed.data.senha, HASH_FALSO);
    return erroGenerico;
  }

  if (bloqueadoAgora(usuario)) {
    const minutos = minutosDeBloqueioRestantes(usuario);
    return {
      error: `Muitas tentativas erradas. Tente de novo em ${minutos} minuto${minutos === 1 ? "" : "s"}.`,
      values: { cpf: parsed.data.cpf },
    };
  }

  const ok = await senhaConfere(parsed.data.senha, usuario.senhaHash);
  if (!ok) {
    await registrarTentativaFalha(usuario.id);
    return erroGenerico;
  }

  await limparTentativasFalhas(usuario.id);
  await criarSessao(usuario.id);
  redirect("/");
}

export async function sair() {
  await encerrarSessaoAtual();
  redirect("/login");
}
