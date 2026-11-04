"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { normalizarTexto, resolverNome } from "@/lib/despesas/importacao";
import {
  lerPlanilhaVendasAPrazo,
  type LinhaParaImportarVenda,
  type LinhaPreviewVenda,
} from "@/lib/vendasAPrazo/importacao";
import { rodarVinculoAutomaticoVendasAPrazo } from "@/lib/vendasAPrazo/vinculo";

const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export type ResultadoAnaliseVendas = { erro: string } | { arquivo: string; linhas: LinhaPreviewVenda[] };

// Lê a planilha e devolve, linha a linha, o que o sistema entendeu — NADA é gravado aqui. A usuária confere e
// corrige na tela e só então confirma (importarVendasAPrazo).
export async function analisarPlanilhaVendas(formData: FormData): Promise<ResultadoAnaliseVendas> {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha a planilha (.xlsx) pra importar." };
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Arquivo grande demais (máximo 5 MB)." };

  let lidas;
  try {
    lidas = lerPlanilhaVendasAPrazo(Buffer.from(await arquivo.arrayBuffer()));
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui ler a planilha." };
  }
  if (lidas.length === 0) return { erro: "A planilha não tem nenhuma venda abaixo do cabeçalho." };
  if (lidas.length > 1000) return { erro: "Planilha com mais de 1.000 linhas — divida em partes." };

  const [postos, apelidos, existentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, select: { id: true, nome: true } }),
    prisma.apelidoImportacao.findMany({ where: { tipo: "POSTO" } }),
    prisma.vendaAPrazo.findMany({ select: { postoId: true, cliente: true, periodoDe: true, periodoAte: true, valor: true, dataPagamento: true } }),
  ]);
  const apPosto = new Map(apelidos.map((a) => [a.texto, a.refId]));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const chaveVenda = (postoId: string, cliente: string, de: string, ate: string, valor: number, pgto: string) =>
    `${postoId}|${normalizarTexto(cliente)}|${de}|${ate}|${valor.toFixed(2)}|${pgto}`;
  const jaNoSistema = new Set(existentes.map((e) => chaveVenda(e.postoId, e.cliente, iso(e.periodoDe), iso(e.periodoAte), Number(e.valor), iso(e.dataPagamento))));

  const vistas = new Map<string, number>();
  const linhas: LinhaPreviewVenda[] = lidas.map((l) => {
    const posto = resolverNome(l.posto, postos, apPosto, { inverso: true });
    const erros = [...l.erros];
    if (!l.posto) erros.push("Posto em branco.");

    let duplicada: LinhaPreviewVenda["duplicada"] = null;
    if (posto.id && l.periodoDe && l.periodoAte && l.valor !== null && l.dataPagamento && l.cliente) {
      const chave = chaveVenda(posto.id, l.cliente, l.periodoDe, l.periodoAte, l.valor, l.dataPagamento);
      const anterior = vistas.get(chave);
      if (anterior !== undefined) duplicada = { onde: "arquivo", detalhe: `Igual à linha ${anterior} da própria planilha.` };
      else {
        vistas.set(chave, l.linha);
        if (jaNoSistema.has(chave)) duplicada = { onde: "sistema", detalhe: "Já lançada em Vendas a Prazo (mesmo posto, cliente, período, valor e pagamento)." };
      }
    }

    return {
      linha: l.linha,
      postoTexto: l.posto,
      postoId: posto.id,
      postoOrigem: posto.origem,
      cliente: l.cliente,
      periodoDe: l.periodoDe,
      periodoAte: l.periodoAte,
      valor: l.valor,
      dataPagamento: l.dataPagamento,
      observacao: l.observacao,
      erros,
      duplicada,
    };
  });

  return { arquivo: arquivo.name, linhas };
}

export type ResultadoImportacaoVendas = { erro: string } | { criadas: number; vinculadas: number };

export async function importarVendasAPrazo(linhas: LinhaParaImportarVenda[]): Promise<ResultadoImportacaoVendas> {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");
  if (linhas.length === 0) return { erro: "Nenhuma linha marcada pra lançar." };
  if (linhas.length > 1000) return { erro: "Mais de 1.000 linhas de uma vez — divida em partes." };

  const postos = await prisma.posto.findMany({ where: { ativo: true }, select: { id: true } });
  const idsPostos = new Set(postos.map((p) => p.id));
  const dados = [];
  for (const l of linhas) {
    if (!idsPostos.has(l.postoId)) return { erro: `Linha ${l.linha}: posto inválido.` };
    if (!l.cliente.trim()) return { erro: `Linha ${l.linha}: cliente em branco.` };
    if (!(l.valor > 0)) return { erro: `Linha ${l.linha}: valor inválido.` };
    if (!l.periodoDe || !l.periodoAte || l.periodoAte < l.periodoDe) return { erro: `Linha ${l.linha}: período inválido.` };
    if (!l.dataPagamento) return { erro: `Linha ${l.linha}: data de pagamento inválida.` };
    dados.push({
      postoId: l.postoId,
      cliente: l.cliente.trim(),
      periodoDe: new Date(`${l.periodoDe}T00:00:00.000Z`),
      periodoAte: new Date(`${l.periodoAte}T00:00:00.000Z`),
      valor: l.valor.toFixed(2),
      dataPagamento: new Date(`${l.dataPagamento}T00:00:00.000Z`),
      observacao: l.observacao.trim() || null,
    });
  }

  // O nome do posto que ela escolheu pra uma linha que o sistema não reconheceu fica lembrado pras próximas planilhas.
  const apelidos = new Map<string, { texto: string; refId: string }>();
  for (const l of linhas) {
    const texto = normalizarTexto(l.postoTexto);
    if (texto) apelidos.set(texto, { texto, refId: l.postoId });
  }
  const nomesPostos = new Map((await prisma.posto.findMany({ select: { id: true, nome: true } })).map((p) => [p.id, normalizarTexto(p.nome)]));

  await prisma.$transaction(
    [
      prisma.vendaAPrazo.createMany({ data: dados }),
      ...[...apelidos.values()]
        .filter((a) => nomesPostos.get(a.refId) !== a.texto)
        .map((a) => prisma.apelidoImportacao.upsert({ where: { tipo_texto: { tipo: "POSTO", texto: a.texto } }, update: { refId: a.refId }, create: { tipo: "POSTO", texto: a.texto, refId: a.refId } })),
    ],
    { timeout: 60000, maxWait: 15000 }
  );

  // Já tenta ligar ao extrato o que der pra ligar sem dúvida.
  const { vinculos } = await rodarVinculoAutomaticoVendasAPrazo();
  revalidatePath("/vendas-a-prazo");
  return { criadas: dados.length, vinculadas: vinculos };
}
