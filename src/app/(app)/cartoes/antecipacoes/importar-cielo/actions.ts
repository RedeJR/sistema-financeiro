"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { lerNegociacoesCielo, type NegociacaoCielo } from "@/lib/cartoes/importarNegociacaoCielo";
import { lerRecebiveisStone } from "@/lib/cartoes/importarRecebiveisStone";

const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const TOLERANCIA = 0.05;

export type ItemNegociacao = Omit<NegociacaoCielo, "dataRecebimento"> & {
  antecipacaoId: string | null; // antecipação já cadastrada que o sistema achou pra essa negociação
  dataRecebimento: string | null; // dia em que o dinheiro caiu (da antecipação achada; a usuária informa se for nova)
  valorFaceCadastrado: number | null;
};

export type ResultadoAnaliseCielo = { erro: string } | { arquivo: string; itens: ItemNegociacao[] };

// Lê o arquivo "Negociação de recebíveis (detalhe)" da Cielo e casa cada negociação com a
// antecipação já cadastrada do posto (mesmo líquido ou mesmo bruto). NADA é gravado aqui.
export async function analisarNegociacaoCielo(formData: FormData): Promise<ResultadoAnaliseCielo> {
  await exigirPermissao("CARTOES", "editar");
  const arquivo = formData.get("arquivo");
  const postoId = String(formData.get("postoId") ?? "");
  const nomeAdquirente = formData.get("adquirente") === "STONE" ? "STONE" : "CIELO";
  if (!postoId) return { erro: "Escolha o posto." };
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo (.csv) da Cielo." };
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Arquivo grande demais (máximo 5 MB)." };

  let negociacoes: NegociacaoCielo[];
  try {
    const bytes = await arquivo.arrayBuffer();
    negociacoes =
      nomeAdquirente === "STONE"
        ? lerRecebiveisStone(new TextDecoder("utf-8").decode(bytes))
        : lerNegociacoesCielo(new TextDecoder("windows-1252").decode(bytes));
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui ler o arquivo." };
  }
  if (negociacoes.length === 0) return { erro: "O arquivo não tem nenhuma negociação." };

  const adq = await prisma.adquirenteCartao.findFirst({ where: { nome: nomeAdquirente }, select: { id: true } });
  if (!adq) return { erro: `Adquirente ${nomeAdquirente} não cadastrada.` };
  const existentes = await prisma.antecipacaoCartao.findMany({ where: { postoId, adquirenteId: adq.id } });
  const usadas = new Set<string>();
  const itens: ItemNegociacao[] = negociacoes
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => {
      const par =
        existentes.find((e) => !usadas.has(e.id) && n.dataRecebimento && e.dataRecebimento.toISOString().slice(0, 10) === n.dataRecebimento) ??
        existentes.find(
          (e) =>
            !usadas.has(e.id) &&
            (Math.abs(Number(e.valorLiquido) - n.valorLiquido) <= TOLERANCIA || Math.abs(Number(e.valorFace) - n.valorFace) <= TOLERANCIA)
        );
      if (par) usadas.add(par.id);
      return {
        ...n,
        antecipacaoId: par?.id ?? null,
        dataRecebimento: par ? par.dataRecebimento.toISOString().slice(0, 10) : (n.dataRecebimento ?? null),
        valorFaceCadastrado: par ? Number(par.valorFace) : null,
      };
    });
  return { arquivo: arquivo.name, itens };
}

export type ItemParaGravar = {
  antecipacaoId: string | null;
  dataRecebimento: string;
  valorFace: number;
  valorLiquido: number;
  periodoDe: string;
  periodoAte: string;
  dias: { data: string; valor: number }[];
};

export type ResultadoGravacaoCielo = { erro: string } | { atualizadas: number; criadas: number };

// Grava o que a usuária confirmou: atualiza a antecipação achada (bruto, período e dia a dia
// vindos da Cielo) ou cria uma nova.
export async function gravarNegociacaoCielo(postoId: string, nomeAdquirente: "CIELO" | "STONE", itens: ItemParaGravar[]): Promise<ResultadoGravacaoCielo> {
  await exigirPermissao("CARTOES", "editar");
  if (!Array.isArray(itens) || itens.length === 0) return { erro: "Nenhuma negociação selecionada." };
  if (itens.length > 200) return { erro: "Negociações demais de uma vez." };
  const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const cielo = await prisma.adquirenteCartao.findFirst({ where: { nome: nomeAdquirente === "STONE" ? "STONE" : "CIELO" }, select: { id: true } });
  const posto = await prisma.posto.findUnique({ where: { id: postoId }, select: { id: true } });
  if (!cielo || !posto) return { erro: "Posto ou adquirente inválido." };

  for (const i of itens) {
    if (
      !ehData(i.dataRecebimento) ||
      !ehData(i.periodoDe) ||
      !ehData(i.periodoAte) ||
      i.periodoAte < i.periodoDe ||
      !(i.valorFace > 0) ||
      !(i.valorLiquido > 0) ||
      i.valorLiquido > i.valorFace ||
      !Array.isArray(i.dias) ||
      i.dias.length === 0 ||
      i.dias.some((d) => !ehData(d.data) || !(d.valor > 0))
    ) {
      return { erro: "Há negociação incompleta ou inválida — informe o dia em que o dinheiro caiu." };
    }
  }

  let atualizadas = 0;
  let criadas = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const i of itens) {
        const dados = {
          dataRecebimento: new Date(`${i.dataRecebimento}T00:00:00.000Z`),
          periodoDe: new Date(`${i.periodoDe}T00:00:00.000Z`),
          periodoAte: new Date(`${i.periodoAte}T00:00:00.000Z`),
          valorFace: i.valorFace.toFixed(2),
          valorLiquido: i.valorLiquido.toFixed(2),
        };
        let id = i.antecipacaoId;
        if (id) {
          const atual = await tx.antecipacaoCartao.findFirst({ where: { id, postoId, adquirenteId: cielo.id }, select: { id: true } });
          if (!atual) throw new Error("Antecipação não encontrada.");
          await tx.antecipacaoCartao.update({ where: { id }, data: dados });
          await tx.antecipacaoCartaoDia.deleteMany({ where: { antecipacaoId: id } });
          atualizadas++;
        } else {
          id = (await tx.antecipacaoCartao.create({ data: { ...dados, postoId, adquirenteId: cielo.id, observacao: nomeAdquirente === "STONE" ? "Recebíveis Stone" : "Negociação Cielo" } })).id;
          criadas++;
        }
        await tx.antecipacaoCartaoDia.createMany({
          data: i.dias.map((d) => ({ antecipacaoId: id!, data: new Date(`${d.data}T00:00:00.000Z`), valor: d.valor.toFixed(2) })),
        });
      }
    },
    { timeout: 60000, maxWait: 15000 }
  );

  revalidatePath("/cartoes/antecipacoes");
  revalidatePath("/cartoes");
  revalidatePath("/fluxo-de-caixa");
  return { atualizadas, criadas };
}
