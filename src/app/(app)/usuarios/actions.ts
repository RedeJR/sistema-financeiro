"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, exigirUsuario, hashSenha } from "@/lib/auth";
import { cpfValido, limparCpf } from "@/lib/cpf";
import { MODULOS } from "@/lib/modulos";
import { isUniqueConstraintError, valoresDoFormulario, type ActionState } from "@/lib/form-state";

const ROTA = "/usuarios";

function lerPermissoes(formData: FormData) {
  return MODULOS.map((m) => ({
    modulo: m.valor,
    podeVisualizar: formData.get(`visualizar_${m.valor}`) === "on" || formData.get(`editar_${m.valor}`) === "on",
    podeEditar: formData.get(`editar_${m.valor}`) === "on",
  }));
}

const schemaBase = z.object({
  nome: z.string().trim().min(1, "Informe o nome."),
  cpf: z
    .string()
    .trim()
    .min(1, "Informe o CPF.")
    .refine((v) => cpfValido(v), "CPF inválido."),
  // Opcional, mas sem ele "Esqueci minha senha" não funciona pra essa
  // pessoa (ver src/app/esqueci-senha).
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => !v || z.email().safeParse(v).success, "Email inválido."),
});

export async function criarUsuario(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("USUARIOS", "editar");

  const schema = schemaBase.extend({
    senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
  });
  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    cpf: formData.get("cpf"),
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  const cpf = limparCpf(parsed.data.cpf);
  const senhaHash = await hashSenha(parsed.data.senha);
  const permissoes = lerPermissoes(formData);

  try {
    await prisma.usuario.create({
      data: {
        nome: parsed.data.nome,
        cpf,
        email: parsed.data.email,
        senhaHash,
        permissoes: { create: permissoes },
      },
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      const alvo = (e as { meta?: { target?: string[] } }).meta?.target;
      const mensagem = alvo?.includes("email")
        ? "Já existe um usuário com esse email."
        : "Já existe um usuário com esse CPF.";
      return { error: mensagem, values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function atualizarUsuario(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("USUARIOS", "editar");

  const schema = schemaBase.extend({
    novaSenha: z
      .string()
      .optional()
      .refine((v) => !v || v.length >= 8, "A nova senha precisa ter pelo menos 8 caracteres."),
  });
  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    cpf: formData.get("cpf"),
    email: formData.get("email"),
    novaSenha: formData.get("novaSenha") || undefined,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  const cpf = limparCpf(parsed.data.cpf);
  const permissoes = lerPermissoes(formData);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          nome: parsed.data.nome,
          cpf,
          email: parsed.data.email,
          ...(parsed.data.novaSenha ? { senhaHash: await hashSenha(parsed.data.novaSenha) } : {}),
        },
      });
      await tx.permissao.deleteMany({ where: { usuarioId: id } });
      await tx.permissao.createMany({
        data: permissoes.map((p) => ({ ...p, usuarioId: id })),
      });
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      const alvo = (e as { meta?: { target?: string[] } }).meta?.target;
      const mensagem = alvo?.includes("email")
        ? "Já existe um usuário com esse email."
        : "Já existe um usuário com esse CPF.";
      return { error: mensagem, values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function alternarAtivoUsuario(formData: FormData) {
  await exigirPermissao("USUARIOS", "editar");
  const usuarioLogado = await exigirUsuario();

  const id = formData.get("id");
  if (typeof id !== "string") return;
  if (id === usuarioLogado.id) {
    redirect(`${ROTA}?erro=auto-desativar`);
  }

  const atual = await prisma.usuario.findUniqueOrThrow({ where: { id } });
  await prisma.usuario.update({ where: { id }, data: { ativo: !atual.ativo } });
  if (atual.ativo) {
    // estava ativo, virou inativo: derruba as sessões abertas dele
    await prisma.sessao.deleteMany({ where: { usuarioId: id } });
  }
  revalidatePath(ROTA);
}

export async function excluirUsuario(formData: FormData) {
  await exigirPermissao("USUARIOS", "editar");
  const usuarioLogado = await exigirUsuario();

  const id = formData.get("id");
  if (typeof id !== "string") return;
  if (id === usuarioLogado.id) {
    redirect(`${ROTA}?erro=auto-excluir`);
  }

  await prisma.usuario.delete({ where: { id } });
  revalidatePath(ROTA);
}
