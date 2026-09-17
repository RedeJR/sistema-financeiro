import "server-only";
import { prisma } from "@/lib/prisma";

export type StatusConciliacao = "CONCILIADO" | "DIVERGENTE" | "PENDENTE";

export type LinhaConciliacao = {
  data: string; // YYYY-MM-DD
  adquirente: string;
  adquirenteId: string;
  categoriaId: string | null;
  fontePrazo: "ARQUIVO" | "SISTEMA"; // Stone infere por regra fixa; as demais vêm do próprio arquivo
  qtdVendas: number;
  esperado: number; // soma do valorLiquido das vendas com essa dataPagamento
  extratoDebito: number;
  extratoCredito: number;
  extratoTotal: number;
  diferenca: number;
  status: StatusConciliacao;
};

const TOLERANCIA = 0.05;

// Stone não traz data de pagamento no arquivo — infere por regra fixa
// (Pix D+0, Débito D+1, Crédito D+2, ver stone.ts). Todas as outras leem a
// data (ou o prazo, no caso da Rede) direto do arquivo de cada venda.
function fontePrazoPorAdquirente(nome: string): "ARQUIVO" | "SISTEMA" {
  return nome === "STONE" ? "SISTEMA" : "ARQUIVO";
}

export async function buscarConciliacaoCartoes(params: {
  postoId: string;
  dataInicio: Date;
  dataFim: Date;
  adquirenteId?: string;
}): Promise<LinhaConciliacao[]> {
  const { postoId, dataInicio, dataFim, adquirenteId } = params;

  const [transacoes, categorias] = await Promise.all([
    prisma.transacaoCartao.findMany({
      where: {
        postoId,
        dataPagamento: { gte: dataInicio, lte: dataFim },
        ...(adquirenteId ? { adquirenteId } : {}),
      },
      include: { adquirente: true },
    }),
    prisma.categoriaExtrato.findMany({ where: { tipo: { in: ["ADQUIRENTE", "VOUCHER"] } } }),
  ]);

  const categoriaPorNomeAdquirente = new Map(categorias.map((c) => [c.nome, c]));

  // Esperado: agrupa vendas por (adquirente, dataPagamento).
  const gruposEsperado = new Map<string, { adquirente: string; adquirenteId: string; data: string; qtd: number; soma: number }>();
  for (const t of transacoes) {
    if (!t.dataPagamento || t.valorLiquido === null) continue;
    const data = t.dataPagamento.toISOString().slice(0, 10);
    const chave = `${t.adquirenteId}|${data}`;
    const grupo = gruposEsperado.get(chave) ?? { adquirente: t.adquirente.nome, adquirenteId: t.adquirenteId, data, qtd: 0, soma: 0 };
    grupo.qtd++;
    grupo.soma += Number(t.valorLiquido);
    gruposEsperado.set(chave, grupo);
  }

  const adquirentesEnvolvidos = [...new Set(transacoes.map((t) => t.adquirenteId))];
  const categoriaIdsEnvolvidas = adquirentesEnvolvidos
    .map((id) => {
      const nome = transacoes.find((t) => t.adquirenteId === id)?.adquirente.nome;
      return nome ? categoriaPorNomeAdquirente.get(nome)?.id : undefined;
    })
    .filter((id): id is string => Boolean(id));

  const lancamentos =
    categoriaIdsEnvolvidas.length > 0
      ? await prisma.lancamentoExtrato.findMany({
          where: {
            postoId,
            categoriaId: { in: categoriaIdsEnvolvidas },
            data: { gte: dataInicio, lte: dataFim },
          },
        })
      : [];

  const categoriaIdParaNome = new Map(categorias.map((c) => [c.id, c.nome]));
  const nomeParaExtrato = new Map<string, { debito: number; credito: number }>();
  for (const l of lancamentos) {
    const nomeAdquirente = categoriaIdParaNome.get(l.categoriaId ?? "");
    if (!nomeAdquirente) continue;
    const data = l.data.toISOString().slice(0, 10);
    const chave = `${nomeAdquirente}|${data}`;
    const atual = nomeParaExtrato.get(chave) ?? { debito: 0, credito: 0 };
    if (l.tipoAdquirente === "DEBITO") atual.debito += Number(l.valor);
    else atual.credito += Number(l.valor); // CREDITO, ou sem tipo (categoria VOUCHER)
    nomeParaExtrato.set(chave, atual);
  }

  const resultado: LinhaConciliacao[] = [];
  const todasChaves = new Set([...gruposEsperado.keys()]);

  // Chaves do extrato usam "nomeAdquirente|data" (não tem adquirenteId
  // direto) — só vira linha se algum adquirenteId conhecido tiver esse
  // nome (senão não dá pra classificar, mas também está fora de escopo:
  // nenhuma venda dessa adquirente apareceu no período pedido).
  const idPorNome = new Map(transacoes.map((t) => [t.adquirente.nome, t.adquirenteId]));
  for (const [chave, extrato] of nomeParaExtrato) {
    const [nome, data] = chave.split("|");
    const adquirenteId = idPorNome.get(nome);
    if (!adquirenteId) continue; // categoria de extrato sem nenhuma venda desse adquirente no período — fora de escopo
    todasChaves.add(`${adquirenteId}|${data}`);
  }

  for (const chave of todasChaves) {
    const [adqId, data] = chave.split("|");
    const esperadoGrupo = gruposEsperado.get(chave);
    const nome = esperadoGrupo?.adquirente ?? transacoes.find((t) => t.adquirenteId === adqId)?.adquirente.nome ?? "";
    const extrato = nomeParaExtrato.get(`${nome}|${data}`) ?? { debito: 0, credito: 0 };
    const extratoTotal = extrato.debito + extrato.credito;
    const esperado = esperadoGrupo?.soma ?? 0;
    const diferenca = extratoTotal - esperado;

    let status: StatusConciliacao;
    if (extratoTotal === 0) status = "PENDENTE";
    else if (Math.abs(diferenca) <= TOLERANCIA) status = "CONCILIADO";
    else status = "DIVERGENTE";

    resultado.push({
      data,
      adquirente: nome,
      adquirenteId: adqId,
      categoriaId: categoriaPorNomeAdquirente.get(nome)?.id ?? null,
      fontePrazo: fontePrazoPorAdquirente(nome),
      qtdVendas: esperadoGrupo?.qtd ?? 0,
      esperado,
      extratoDebito: extrato.debito,
      extratoCredito: extrato.credito,
      extratoTotal,
      diferenca,
      status,
    });
  }

  return resultado.sort((a, b) => a.data.localeCompare(b.data) || a.adquirente.localeCompare(b.adquirente));
}
