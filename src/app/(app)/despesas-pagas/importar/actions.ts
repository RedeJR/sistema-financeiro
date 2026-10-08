"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import {
  lerPlanilhaDespesas,
  normalizarTexto,
  resolverNome,
  type LinhaParaImportar,
  type LinhaPreview,
} from "@/lib/despesas/importacao";

const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export type ResultadoAnalise = { erro: string } | { arquivo: string; linhas: LinhaPreview[] };

function mapaApelidos(apelidos: { tipo: string; texto: string; refId: string }[], tipo: string): Map<string, string> {
  return new Map(apelidos.filter((a) => a.tipo === tipo).map((a) => [a.texto, a.refId]));
}

// Lê a planilha e devolve, linha a linha, o que o sistema entendeu — NADA é
// gravado aqui. A usuária confere/corrige na tela e só então confirma
// (importarDespesas).
export async function analisarPlanilha(formData: FormData): Promise<ResultadoAnalise> {
  await exigirPermissao("DESPESAS_PAGAS", "editar");

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha a planilha (.xlsx) pra importar." };
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Arquivo grande demais (máximo 5 MB)." };

  let lidas;
  try {
    lidas = lerPlanilhaDespesas(Buffer.from(await arquivo.arrayBuffer()));
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui ler a planilha." };
  }
  if (lidas.length === 0) return { erro: "A planilha não tem nenhuma despesa abaixo do cabeçalho." };
  if (lidas.length > 1000) return { erro: "Planilha com mais de 1.000 linhas — divida em partes." };

  const [postos, fornecedores, planos, apelidos] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, select: { id: true, nome: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, select: { id: true, nome: true } }),
    prisma.planoConta.findMany({ where: { ativo: true }, select: { id: true, nome: true } }),
    prisma.apelidoImportacao.findMany(),
  ]);
  const apPosto = mapaApelidos(apelidos, "POSTO");
  const apForn = mapaApelidos(apelidos, "FORNECEDOR");
  const apPlano = mapaApelidos(apelidos, "PLANO_CONTA");

  // Despesas já pagas no período da planilha, pra avisar de duplicidade.
  const datas = lidas.map((l) => l.data).filter((d): d is string => !!d).sort();
  const existentes = datas.length
    ? await prisma.contaAPagar.findMany({
        where: {
          paga: true,
          dataPagamento: {
            gte: new Date(`${datas[0]}T00:00:00.000Z`),
            lte: new Date(`${datas[datas.length - 1]}T00:00:00.000Z`),
          },
        },
        select: {
          postoId: true,
          postoPagamentoId: true,
          dataPagamento: true,
          valor: true,
          descricao: true,
          fornecedor: { select: { nome: true } },
          bancoPagamento: { select: { nome: true } },
        },
      })
    : [];
  const existentesPorChave = new Map<string, typeof existentes>();
  for (const e of existentes) {
    const chave = `${e.postoPagamentoId ?? e.postoId}|${e.dataPagamento!.toISOString().slice(0, 10)}|${Number(e.valor).toFixed(2)}`;
    existentesPorChave.set(chave, [...(existentesPorChave.get(chave) ?? []), e]);
  }

  const vistosNoArquivo = new Map<string, number>();
  const linhas: LinhaPreview[] = lidas.map((l) => {
    const pagador = resolverNome(l.posto, postos, apPosto, { inverso: true });
    const forn = resolverNome(l.fornecedor, fornecedores, apForn);
    const plano = resolverNome(l.plano, planos, apPlano);
    // O fornecedor às vezes é outro posto ("POSTO AVEIRO", "GUAIPÁ"): a despesa é
    // DAQUELE posto, paga com o caixa do posto pagador. Senão o dono é o próprio pagador.
    const dono = resolverNome(l.fornecedor, postos, apPosto, { inverso: true });

    let duplicada: LinhaPreview["duplicada"] = null;
    if (l.data && l.valor !== null && pagador.id) {
      const chaveArquivo = `${pagador.id}|${l.data}|${l.valor.toFixed(2)}|${normalizarTexto(l.fornecedor)}|${normalizarTexto(l.descricao)}`;
      const anterior = vistosNoArquivo.get(chaveArquivo);
      if (anterior !== undefined) {
        duplicada = { onde: "arquivo", detalhe: `Igual à linha ${anterior} da própria planilha.` };
      } else {
        vistosNoArquivo.set(chaveArquivo, l.linha);
        const lista = existentesPorChave.get(`${pagador.id}|${l.data}|${l.valor.toFixed(2)}`);
        const achada = lista?.shift();
        if (achada) {
          duplicada = {
            onde: "sistema",
            detalhe: `Já lançada: ${achada.fornecedor.nome}${achada.descricao ? ` — ${achada.descricao}` : ""} (${achada.bancoPagamento?.nome ?? "sem banco"}).`,
          };
        }
      }
    }

    return {
      linha: l.linha,
      data: l.data,
      valor: l.valor,
      descricao: l.descricao,
      postoTexto: l.posto,
      fornecedorTexto: l.fornecedor,
      planoTexto: l.plano,
      postoPagadorId: pagador.id,
      postoPagadorOrigem: pagador.origem,
      postoDonoId: dono.id ?? pagador.id,
      fornecedorId: forn.id,
      fornecedorOrigem: forn.origem,
      planoContaId: plano.id,
      planoOrigem: plano.origem,
      erros: l.erros,
      duplicada,
    };
  });

  return { arquivo: arquivo.name, linhas };
}

export type ResultadoImportacao = { erro: string } | { criadas: number; menorData: string; maiorData: string };

// Grava as linhas que a usuária confirmou: despesa avulsa paga em DINHEIRO,
// igual à "Despesa avulsa" feita à mão. Também guarda o "de-para" (o que estava
// escrito na planilha -> o cadastro escolhido) pras próximas importações.
export async function importarDespesas(linhas: LinhaParaImportar[]): Promise<ResultadoImportacao> {
  await exigirPermissao("DESPESAS_PAGAS", "editar");
  if (!Array.isArray(linhas) || linhas.length === 0) return { erro: "Nenhuma linha selecionada." };
  if (linhas.length > 1000) return { erro: "Linhas demais de uma vez." };

  for (const l of linhas) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(l.data) ||
      !(l.valor > 0) ||
      !l.postoPagadorId ||
      !l.postoDonoId ||
      !l.fornecedorId ||
      !l.planoContaId
    ) {
      return { erro: `Linha ${l.linha} da planilha está incompleta.` };
    }
  }

  const [dinheiro, postos, fornecedores, planos] = await Promise.all([
    prisma.banco.findFirst({ where: { nome: "DINHEIRO" } }),
    prisma.posto.findMany({ select: { id: true, nome: true } }),
    prisma.fornecedor.findMany({ select: { id: true, nome: true } }),
    prisma.planoConta.findMany({ select: { id: true, nome: true } }),
  ]);
  if (!dinheiro) return { erro: 'O banco "DINHEIRO" não está cadastrado.' };
  const idsPostos = new Set(postos.map((p) => p.id));
  const idsFornecedores = new Set(fornecedores.map((f) => f.id));
  const idsPlanos = new Set(planos.map((p) => p.id));
  for (const l of linhas) {
    if (
      !idsPostos.has(l.postoPagadorId) ||
      !idsPostos.has(l.postoDonoId) ||
      !idsFornecedores.has(l.fornecedorId) ||
      !idsPlanos.has(l.planoContaId)
    ) {
      return { erro: `Linha ${l.linha}: posto, fornecedor ou plano de contas inválido.` };
    }
  }

  const dados = linhas.map((l) => {
    const data = new Date(`${l.data}T00:00:00.000Z`);
    return {
      postoId: l.postoDonoId,
      postoPagamentoId: l.postoPagadorId !== l.postoDonoId ? l.postoPagadorId : null,
      fornecedorId: l.fornecedorId,
      planoContaId: l.planoContaId,
      valor: l.valor.toFixed(2),
      descricao: l.descricao.trim() || null,
      dataEmissao: data,
      dataVencimento: data,
      dataPagamento: data,
      paga: true,
      avulsa: true,
      bancoPagamentoId: dinheiro.id,
    };
  });

  // De-para: só o que NÃO é igual ao nome cadastrado (o resto o sistema acha sozinho).
  const nomePosto = new Map(postos.map((p) => [p.id, normalizarTexto(p.nome)]));
  const nomeForn = new Map(fornecedores.map((f) => [f.id, normalizarTexto(f.nome)]));
  const nomePlano = new Map(planos.map((p) => [p.id, normalizarTexto(p.nome)]));
  const apelidos = new Map<string, { tipo: "POSTO" | "FORNECEDOR" | "PLANO_CONTA"; texto: string; refId: string }>();
  for (const l of linhas) {
    const candidatos = [
      { tipo: "POSTO" as const, texto: normalizarTexto(l.postoTexto), refId: l.postoPagadorId, nome: nomePosto.get(l.postoPagadorId) },
      { tipo: "FORNECEDOR" as const, texto: normalizarTexto(l.fornecedorTexto), refId: l.fornecedorId, nome: nomeForn.get(l.fornecedorId) },
      { tipo: "PLANO_CONTA" as const, texto: normalizarTexto(l.planoTexto), refId: l.planoContaId, nome: nomePlano.get(l.planoContaId) },
    ];
    // Fornecedor que é, na verdade, outro posto ("MS SÃO MATHEUS" = POSTO MS
    // MONTEMAGNO): quando a despesa foi pro posto dele (diferente do pagador),
    // lembra isso também.
    if (l.postoDonoId !== l.postoPagadorId) {
      candidatos.push({
        tipo: "POSTO" as const,
        texto: normalizarTexto(l.fornecedorTexto),
        refId: l.postoDonoId,
        nome: nomePosto.get(l.postoDonoId),
      });
    }
    for (const c of candidatos) {
      if (c.texto && c.texto !== c.nome) apelidos.set(`${c.tipo}|${c.texto}`, { tipo: c.tipo, texto: c.texto, refId: c.refId });
    }
  }

  await prisma.$transaction(
    [
      prisma.contaAPagar.createMany({ data: dados }),
      ...[...apelidos.values()].map((a) =>
        prisma.apelidoImportacao.upsert({
          where: { tipo_texto: { tipo: a.tipo, texto: a.texto } },
          update: { refId: a.refId },
          create: a,
        })
      ),
    ],
    { timeout: 60000, maxWait: 15000 }
  );

  revalidatePath("/despesas-pagas");
  revalidatePath("/contas-a-pagar");
  const datas = linhas.map((l) => l.data).sort();
  return { criadas: dados.length, menorData: datas[0], maiorData: datas[datas.length - 1] };
}
