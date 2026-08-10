"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { isForeignKeyConstraintError, valoresDoFormulario, type ActionState } from "@/lib/form-state";

const ROTA = "/contas-a-pagar";
const MAX_PARCELAS = 60;

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

// Cadastro rápido de fornecedor sem sair da tela de Contas a Pagar (ver
// PROJETO_SISTEMA_FINANCEIRO.md, "lápis" de edição inline). Não usa
// useActionState/redirect — é chamado direto de um onClick no formulário,
// que já está com outros campos preenchidos e não pode perder isso.
export async function criarFornecedorRapido(
  nome: string,
  documento: string | null
): Promise<{ id: string; nome: string } | { error: string }> {
  await exigirPermissao("CADASTROS", "editar");

  const nomeLimpo = nome.trim().toUpperCase();
  if (!nomeLimpo) return { error: "Informe o nome do fornecedor." };

  const fornecedor = await prisma.fornecedor.create({
    data: { nome: nomeLimpo, documento: documento?.trim() || null },
  });

  revalidatePath("/cadastros/fornecedores");
  return { id: fornecedor.id, nome: fornecedor.nome };
}

function validarValor(v: string): string | null {
  return paraDecimalString(v);
}

const schemaComuns = z.object({
  postoId: z.string().trim().min(1, "Escolha um posto."),
  fornecedorId: z.string().trim().min(1, "Escolha um fornecedor."),
  planoContaId: z.string().trim().min(1, "Escolha uma conta do plano de contas."),
  dataEmissao: z.string().trim().min(1, "Informe a data de emissão."),
  numeroDocumento: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  descricao: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

// A versão "única" (não parcelada) ainda usa dataVencimento/valor simples.
const schemaUnica = schemaComuns.extend({
  dataVencimento: z.string().trim().min(1, "Informe a data de vencimento."),
  valor: z
    .string()
    .trim()
    .min(1, "Informe o valor.")
    .transform((v, ctx) => {
      const decimal = validarValor(v);
      if (decimal === null) {
        ctx.addIssue({ code: "custom", message: "Valor inválido." });
        return z.NEVER;
      }
      return decimal;
    }),
});

export async function criarContaAPagar(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CONTAS_A_PAGAR", "editar");

  const recorrente = formData.get("recorrente") === "on";
  const numeroParcelas = Math.max(1, Math.min(MAX_PARCELAS, Number(formData.get("numeroParcelas")) || 1));

  if (recorrente && numeroParcelas > 1) {
    return {
      error: "Uma despesa recorrente não pode ser parcelada ao mesmo tempo.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    if (numeroParcelas > 1 && !recorrente) {
      // Parcelas editadas individualmente na tela (uma linha de
      // vencimento+valor por parcela, pré-preenchidas mas ajustáveis antes
      // de salvar). Só precisa dos campos comuns aqui (dataVencimento/valor
      // vêm da grade, não desses campos base).
      const parsedComuns = schemaComuns.safeParse({
        postoId: formData.get("postoId"),
        fornecedorId: formData.get("fornecedorId"),
        planoContaId: formData.get("planoContaId"),
        dataEmissao: formData.get("dataEmissao"),
        numeroDocumento: formData.get("numeroDocumento"),
        descricao: formData.get("descricao"),
      });
      if (!parsedComuns.success) {
        return {
          error: parsedComuns.error.issues[0]?.message ?? "Dados inválidos.",
          values: valoresDoFormulario(formData),
        };
      }
      const dataEmissao = dataUTC(parsedComuns.data.dataEmissao);
      const base = {
        postoId: parsedComuns.data.postoId,
        fornecedorId: parsedComuns.data.fornecedorId,
        planoContaId: parsedComuns.data.planoContaId,
        numeroDocumento: parsedComuns.data.numeroDocumento,
        descricao: parsedComuns.data.descricao,
      };

      const vencimentos = formData.getAll("parcelaVencimento").map(String);
      const valoresBrutos = formData.getAll("parcelaValor").map(String);
      if (vencimentos.length !== numeroParcelas || valoresBrutos.length !== numeroParcelas) {
        return { error: "Preencha vencimento e valor de todas as parcelas.", values: valoresDoFormulario(formData) };
      }
      const linhas: { dataVencimento: Date; valor: string }[] = [];
      for (let i = 0; i < numeroParcelas; i++) {
        if (!vencimentos[i]) {
          return { error: `Informe o vencimento da parcela ${i + 1}.`, values: valoresDoFormulario(formData) };
        }
        const valorParcela = validarValor(valoresBrutos[i]);
        if (valorParcela === null) {
          return { error: `Valor inválido na parcela ${i + 1}.`, values: valoresDoFormulario(formData) };
        }
        linhas.push({ dataVencimento: dataUTC(vencimentos[i]), valor: valorParcela });
      }

      const grupoParcelamentoId = randomUUID();
      await prisma.contaAPagar.createMany({
        data: linhas.map((linha, i) => ({
          ...base,
          dataEmissao,
          dataVencimento: linha.dataVencimento,
          valor: linha.valor,
          grupoParcelamentoId,
          numeroParcela: i + 1,
          totalParcelas: numeroParcelas,
        })),
      });
    } else {
      // Única ou recorrente: um único safeParse lendo direto do FormData
      // (não reaproveita nenhum resultado já transformado de outro schema —
      // passar um numeroDocumento/descricao já virado null de volta pro
      // schema dava "expected string, received null", já que optional()
      // aceita undefined mas não null).
      const parsedUnica = schemaUnica.safeParse({
        postoId: formData.get("postoId"),
        fornecedorId: formData.get("fornecedorId"),
        planoContaId: formData.get("planoContaId"),
        dataEmissao: formData.get("dataEmissao"),
        numeroDocumento: formData.get("numeroDocumento"),
        descricao: formData.get("descricao"),
        dataVencimento: formData.get("dataVencimento"),
        valor: formData.get("valor"),
      });
      if (!parsedUnica.success) {
        return {
          error: parsedUnica.error.issues[0]?.message ?? "Dados inválidos.",
          values: valoresDoFormulario(formData),
        };
      }
      const dataEmissao = dataUTC(parsedUnica.data.dataEmissao);
      const dataVencimento = dataUTC(parsedUnica.data.dataVencimento);
      const base = {
        postoId: parsedUnica.data.postoId,
        fornecedorId: parsedUnica.data.fornecedorId,
        planoContaId: parsedUnica.data.planoContaId,
        numeroDocumento: parsedUnica.data.numeroDocumento,
        descricao: parsedUnica.data.descricao,
      };

      if (recorrente) {
        const id = randomUUID();
        await prisma.contaAPagar.create({
          data: {
            id,
            ...base,
            dataEmissao,
            dataVencimento,
            valor: parsedUnica.data.valor,
            recorrente: true,
            grupoRecorrenciaId: id,
          },
        });
      } else {
        await prisma.contaAPagar.create({
          data: { ...base, dataEmissao, dataVencimento, valor: parsedUnica.data.valor },
        });
      }
    }
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      return {
        error: "Posto, fornecedor ou conta do plano de contas inválido.",
        values: valoresDoFormulario(formData),
      };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function atualizarContaAPagar(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CONTAS_A_PAGAR", "editar");

  const atual = await prisma.contaAPagar.findUniqueOrThrow({ where: { id } });
  if (atual.paga) {
    return {
      error: "Essa conta já foi paga — não dá mais pra editar por aqui. Pra corrigir, desfaça o pagamento em Despesas Pagas.",
    };
  }

  const parsed = schemaUnica.safeParse({
    postoId: formData.get("postoId"),
    fornecedorId: formData.get("fornecedorId"),
    planoContaId: formData.get("planoContaId"),
    dataEmissao: formData.get("dataEmissao"),
    dataVencimento: formData.get("dataVencimento"),
    numeroDocumento: formData.get("numeroDocumento"),
    valor: formData.get("valor"),
    descricao: formData.get("descricao"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.contaAPagar.update({
      where: { id },
      data: {
        ...parsed.data,
        dataEmissao: dataUTC(parsed.data.dataEmissao),
        dataVencimento: dataUTC(parsed.data.dataVencimento),
      },
    });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      return {
        error: "Posto, fornecedor ou conta do plano de contas inválido.",
        values: valoresDoFormulario(formData),
      };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function excluirContaAPagar(formData: FormData) {
  await exigirPermissao("CONTAS_A_PAGAR", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  // paga: false no filtro em vez de checar antes — contas já pagas ficam
  // travadas pra exclusão por aqui (desfaz o pagamento em Despesas Pagas
  // pra poder mexer de novo).
  const { count } = await prisma.contaAPagar.deleteMany({ where: { id, paga: false } });
  if (count === 0) {
    redirect(`${ROTA}?erro=ja-paga`);
  }
  revalidatePath(ROTA);
}

export async function excluirContasEmMassa(formData: FormData) {
  await exigirPermissao("CONTAS_A_PAGAR", "editar");
  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string");
  if (ids.length === 0) return;
  await prisma.contaAPagar.deleteMany({ where: { id: { in: ids }, paga: false } });
  revalidatePath(ROTA);
}
