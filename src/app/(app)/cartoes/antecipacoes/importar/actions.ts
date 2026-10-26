"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { normalizarTexto, resolverNome } from "@/lib/despesas/importacao";
import {
  lerPlanilhaAntecipacoes,
  type LinhaAntecipacaoParaImportar,
  type LinhaAntecipacaoPreview,
} from "@/lib/cartoes/importarAntecipacoes";

const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export type ResultadoAnalise = { erro: string } | { arquivo: string; linhas: LinhaAntecipacaoPreview[] };

// Lê a planilha e devolve, linha a linha, o que o sistema entendeu — NADA é
// gravado aqui. A usuária confere/corrige na tela e só então confirma
// (importarAntecipacoes).
export async function analisarPlanilhaAntecipacoes(formData: FormData): Promise<ResultadoAnalise> {
  await exigirPermissao("CARTOES", "editar");

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha a planilha (.xlsx) pra importar." };
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Arquivo grande demais (máximo 5 MB)." };

  let lidas;
  try {
    lidas = lerPlanilhaAntecipacoes(Buffer.from(await arquivo.arrayBuffer()));
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui ler a planilha." };
  }
  if (lidas.length === 0) return { erro: "A planilha não tem nenhuma antecipação abaixo do cabeçalho." };
  if (lidas.length > 500) return { erro: "Planilha com mais de 500 linhas — divida em partes." };

  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, select: { id: true, nome: true } }),
  ]);
  const semApelidos = new Map<string, string>();

  const datas = lidas.map((l) => l.dataRecebimento).filter((d): d is string => !!d).sort();
  const existentes = datas.length
    ? await prisma.antecipacaoCartao.findMany({
        where: { dataRecebimento: { gte: new Date(`${datas[0]}T00:00:00.000Z`), lte: new Date(`${datas[datas.length - 1]}T00:00:00.000Z`) } },
        select: { postoId: true, adquirenteId: true, dataRecebimento: true, valorFace: true },
      })
    : [];
  const chaveExistente = new Set(existentes.map((e) => `${e.postoId}|${e.adquirenteId}|${e.dataRecebimento.toISOString().slice(0, 10)}|${Number(e.valorFace).toFixed(2)}`));

  const vistos = new Map<string, number>();
  const linhas: LinhaAntecipacaoPreview[] = lidas.map((l) => {
    const posto = resolverNome(l.posto, postos, semApelidos, { inverso: true });
    const adq = resolverNome(l.adquirente, adquirentes, semApelidos);
    let duplicada: LinhaAntecipacaoPreview["duplicada"] = null;
    if (posto.id && adq.id && l.dataRecebimento && l.valorFace !== null) {
      const chave = `${posto.id}|${adq.id}|${l.dataRecebimento}|${l.valorFace.toFixed(2)}`;
      const anterior = vistos.get(chave);
      if (anterior !== undefined) duplicada = { onde: "arquivo", detalhe: `Igual à linha ${anterior} da própria planilha.` };
      else {
        vistos.set(chave, l.linha);
        if (chaveExistente.has(chave)) duplicada = { onde: "sistema", detalhe: "Já existe uma antecipação com o mesmo posto, adquirente, dia e valor." };
      }
    }
    return { ...l, postoId: posto.id, adquirenteId: adq.id, duplicada };
  });

  return { arquivo: arquivo.name, linhas };
}

export type ResultadoImportacao = { erro: string } | { criadas: number };

// Grava as linhas que a usuária confirmou.
export async function importarAntecipacoes(linhas: LinhaAntecipacaoParaImportar[]): Promise<ResultadoImportacao> {
  await exigirPermissao("CARTOES", "editar");
  if (!Array.isArray(linhas) || linhas.length === 0) return { erro: "Nenhuma linha selecionada." };
  if (linhas.length > 500) return { erro: "Linhas demais de uma vez." };

  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ select: { id: true } }),
    prisma.adquirenteCartao.findMany({ select: { id: true } }),
  ]);
  const idsPostos = new Set(postos.map((p) => p.id));
  const idsAdquirentes = new Set(adquirentes.map((a) => a.id));
  const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

  for (const l of linhas) {
    if (
      !idsPostos.has(l.postoId) ||
      !idsAdquirentes.has(l.adquirenteId) ||
      !ehData(l.dataRecebimento) ||
      !ehData(l.periodoDe) ||
      !ehData(l.periodoAte) ||
      l.periodoAte < l.periodoDe ||
      !(l.valorFace > 0) ||
      !(l.valorLiquido > 0) ||
      l.valorLiquido > l.valorFace
    ) {
      return { erro: `Linha ${l.linha} da planilha está incompleta ou inválida.` };
    }
  }

  await prisma.antecipacaoCartao.createMany({
    data: linhas.map((l) => ({
      postoId: l.postoId,
      adquirenteId: l.adquirenteId,
      dataRecebimento: new Date(`${l.dataRecebimento}T00:00:00.000Z`),
      periodoDe: new Date(`${l.periodoDe}T00:00:00.000Z`),
      periodoAte: new Date(`${l.periodoAte}T00:00:00.000Z`),
      valorFace: l.valorFace.toFixed(2),
      valorLiquido: l.valorLiquido.toFixed(2),
      observacao: normalizarTexto(l.observacao) ? l.observacao.trim() : null,
    })),
  });

  revalidatePath("/cartoes/antecipacoes");
  revalidatePath("/cartoes");
  revalidatePath("/fluxo-de-caixa");
  return { criadas: linhas.length };
}
