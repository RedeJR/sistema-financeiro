import "server-only";
import { prisma } from "@/lib/prisma";
import { calcularAjustesAntecipacao } from "./antecipacoes";

export type StatusConciliacao = "CONCILIADO" | "DIVERGENTE" | "PENDENTE";
export type AgrupamentoConciliacao = "recebimento" | "adquirente";

export type LinhaConciliacao = {
  chave: string;
  data: string | null; // YYYY-MM-DD — null quando agrupado só por adquirente (soma o período inteiro)
  dataLinkDe: string; // intervalo usado no link "Ver lançamentos"
  dataLinkAte: string;
  adquirente: string;
  adquirenteId: string;
  categoriaId: string | null;
  fontePrazo: "ARQUIVO" | "SISTEMA" | "MISTO"; // Stone infere por regra fixa; as demais vêm do próprio arquivo; grupo com os dois = MISTO
  qtdVendas: number;
  esperado: number; // soma do valorLiquido das vendas
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

function calcularStatus(extratoTotal: number, diferenca: number): StatusConciliacao {
  if (extratoTotal === 0) return "PENDENTE";
  if (Math.abs(diferenca) <= TOLERANCIA) return "CONCILIADO";
  return "DIVERGENTE";
}

export async function buscarConciliacaoCartoes(params: {
  postoId: string;
  dataInicio: Date;
  dataFim: Date;
  adquirenteIds?: string[];
  filtrarPor?: "pagamento" | "venda";
  agruparPor?: AgrupamentoConciliacao;
}): Promise<LinhaConciliacao[]> {
  const { postoId, dataInicio, dataFim, adquirenteIds, filtrarPor = "pagamento", agruparPor = "recebimento" } = params;
  const campoData = filtrarPor === "venda" ? "dataVenda" : "dataPagamento";

  const taxas = await prisma.taxaCartao.findMany({
    where: { postoId },
    select: { adquirenteId: true, domicilioBancoId: true, grupoConciliacao: true },
  });

  // Grupo de conciliação (ver TaxaCartao.grupoConciliacao): adquirentes do
  // posto com o mesmo grupo viram uma linha só. Ao filtrar por uma delas, o
  // grupo inteiro entra — senão o extrato do grupo (que mistura as duas)
  // ficaria comparado só com parte das vendas.
  const grupoPorAdquirenteId = new Map<string, string>();
  for (const t of taxas) if (t.grupoConciliacao) grupoPorAdquirenteId.set(t.adquirenteId, t.grupoConciliacao);
  let adquirenteIdsEfetivos = adquirenteIds;
  if (adquirenteIds && adquirenteIds.length > 0) {
    const gruposPedidos = new Set(adquirenteIds.map((id) => grupoPorAdquirenteId.get(id)).filter(Boolean));
    adquirenteIdsEfetivos = [
      ...new Set([...adquirenteIds, ...[...grupoPorAdquirenteId].filter(([, g]) => gruposPedidos.has(g)).map(([id]) => id)]),
    ];
  }

  const [transacoes, categorias] = await Promise.all([
    prisma.transacaoCartao.findMany({
      where: {
        postoId,
        [campoData]: { gte: dataInicio, lte: dataFim },
        ...(adquirenteIdsEfetivos && adquirenteIdsEfetivos.length > 0 ? { adquirenteId: { in: adquirenteIdsEfetivos } } : {}),
      },
      include: { adquirente: true },
    }),
    prisma.categoriaExtrato.findMany({ where: { tipo: { in: ["ADQUIRENTE", "VOUCHER"] } } }),
  ]);

  const categoriaPorNomeAdquirente = new Map(categorias.map((c) => [c.nome, c]));
  // PIX de Cielo/Pagseguro/Rede/Stone/Getnet às vezes cai na conta do banco
  // categorizado como "PIX" genérico, não como a categoria da adquirente
  // (ver categorizer.ts) — como cada uma cai num banco fixo (exceto a
  // Cielo, que varia), usa o domicílio cadastrado em Taxas de Cartão pra
  // saber de quem é. Sem isso, PIX de maquininha ficava fora da conciliação
  // inteira, parecendo divergência todo santo dia.
  const domicilioBancoPorAdquirente = new Map(taxas.filter((t) => t.domicilioBancoId).map((t) => [t.adquirenteId, t.domicilioBancoId!]));

  // Esperado: agrupa vendas por (adquirente, dataPagamento) — sempre pela
  // data de pagamento, independente do filtro ter sido por venda ou
  // pagamento (é o que o extrato precisa bater).
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

  const nomePorAdquirenteId = new Map(transacoes.map((t) => [t.adquirenteId, t.adquirente.nome]));

  // Antecipação de recebíveis (tela Antecipações): no dia em que caiu conta o
  // líquido como esperado e, nos dias do período antecipado, tira o valor
  // cheio — só faz sentido olhando por data de pagamento.
  if (filtrarPor === "pagamento") {
    const ajustes = await calcularAjustesAntecipacao({ postoId, dataInicio, dataFim });
    for (const a of ajustes) {
      if (adquirenteIdsEfetivos && adquirenteIdsEfetivos.length > 0 && !adquirenteIdsEfetivos.includes(a.adquirenteId)) continue;
      nomePorAdquirenteId.set(a.adquirenteId, a.adquirenteNome);
      const chave = `${a.adquirenteId}|${a.data}`;
      const grupo = gruposEsperado.get(chave) ?? { adquirente: a.adquirenteNome, adquirenteId: a.adquirenteId, data: a.data, qtd: 0, soma: 0 };
      grupo.soma += a.delta;
      gruposEsperado.set(chave, grupo);
    }
  }

  const adquirentesEnvolvidos = [...nomePorAdquirenteId.keys()];
  const categoriaIdsEnvolvidas = adquirentesEnvolvidos
    .map((id) => {
      const nome = nomePorAdquirenteId.get(id);
      return nome ? categoriaPorNomeAdquirente.get(nome)?.id : undefined;
    })
    .filter((id): id is string => Boolean(id));

  // Quando o filtro é por data de venda, a data de pagamento esperada pode
  // cair bem depois do período pedido (ex: Sem Parar D+30) — busca o
  // extrato numa janela que cubra todas as datas de pagamento encontradas,
  // não só o período original do filtro.
  const datasEsperado = [...gruposEsperado.values()].map((g) => g.data);
  const dataMinExtrato = datasEsperado.length > 0 ? new Date(`${datasEsperado.reduce((a, b) => (a < b ? a : b))}T00:00:00.000Z`) : dataInicio;
  const dataMaxExtrato = datasEsperado.length > 0 ? new Date(`${datasEsperado.reduce((a, b) => (a > b ? a : b))}T23:59:59.999Z`) : dataFim;

  const lancamentos =
    categoriaIdsEnvolvidas.length > 0
      ? await prisma.lancamentoExtrato.findMany({
          where: {
            postoId,
            categoriaId: { in: categoriaIdsEnvolvidas },
            data: { gte: dataMinExtrato, lte: dataMaxExtrato },
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

  // PIX de maquininha (Cielo, Pagseguro, Rede, Stone, Getnet) fica na
  // categoria genérica "PIX" quando o categorizador não reconhece de quem
  // é — busca por domicílio bancário (cada uma cai num banco fixo, exceto
  // a Cielo, que varia e por isso fica de fora — precisa revisar essa "a
  // olho", como a própria usuária já validou).
  const bancoIdParaAdquirenteNome = new Map<string, string>();
  for (const adqId of adquirentesEnvolvidos) {
    const bancoId = domicilioBancoPorAdquirente.get(adqId);
    const nome = nomePorAdquirenteId.get(adqId);
    if (bancoId && nome && nome !== "CIELO" && nome !== "CIELO TEF" && nome !== "CIELO ALUGUEL") {
      bancoIdParaAdquirenteNome.set(bancoId, nome);
    }
  }
  if (bancoIdParaAdquirenteNome.size > 0) {
    const categoriaPix = await prisma.categoriaExtrato.findFirst({ where: { nome: "PIX" } });
    if (categoriaPix) {
      const lancamentosPix = await prisma.lancamentoExtrato.findMany({
        where: {
          postoId,
          categoriaId: categoriaPix.id,
          bancoId: { in: [...bancoIdParaAdquirenteNome.keys()] },
          data: { gte: dataMinExtrato, lte: dataMaxExtrato },
        },
      });
      for (const l of lancamentosPix) {
        const nomeAdquirente = bancoIdParaAdquirenteNome.get(l.bancoId);
        if (!nomeAdquirente) continue;
        const data = l.data.toISOString().slice(0, 10);
        const chave = `${nomeAdquirente}|${data}`;
        const atual = nomeParaExtrato.get(chave) ?? { debito: 0, credito: 0 };
        atual.credito += Number(l.valor);
        nomeParaExtrato.set(chave, atual);
      }
    }
  }

  // Linhas na granularidade máxima: uma por (adquirente, data de
  // pagamento) — base pra qualquer um dos agrupamentos abaixo.
  const idPorNome = new Map([...nomePorAdquirenteId].map(([id, nome]) => [nome, id]));
  const todasChaves = new Set([...gruposEsperado.keys()]);
  for (const chave of nomeParaExtrato.keys()) {
    const [nome, data] = chave.split("|");
    const adquirenteId = idPorNome.get(nome);
    if (!adquirenteId) continue; // categoria de extrato sem nenhuma venda desse adquirente no período — fora de escopo
    todasChaves.add(`${adquirenteId}|${data}`);
  }

  let linhasDetalhadas: LinhaConciliacao[] = [];
  for (const chave of todasChaves) {
    const [adqId, data] = chave.split("|");
    const esperadoGrupo = gruposEsperado.get(chave);
    const nome = esperadoGrupo?.adquirente ?? nomePorAdquirenteId.get(adqId) ?? "";
    const extrato = nomeParaExtrato.get(`${nome}|${data}`) ?? { debito: 0, credito: 0 };
    const extratoTotal = extrato.debito + extrato.credito;
    const esperado = esperadoGrupo?.soma ?? 0;
    const diferenca = extratoTotal - esperado;

    linhasDetalhadas.push({
      chave,
      data,
      dataLinkDe: data,
      dataLinkAte: data,
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
      status: calcularStatus(extratoTotal, diferenca),
    });
  }

  // Junta as linhas das adquirentes do mesmo grupo, dia a dia.
  if (grupoPorAdquirenteId.size > 0) {
    const semGrupo: LinhaConciliacao[] = [];
    const porGrupoDia = new Map<string, LinhaConciliacao>();
    for (const l of linhasDetalhadas) {
      const grupo = grupoPorAdquirenteId.get(l.adquirenteId);
      if (!grupo) {
        semGrupo.push(l);
        continue;
      }
      const chave = `${grupo}|${l.data}`;
      const atual = porGrupoDia.get(chave);
      if (!atual) {
        porGrupoDia.set(chave, { ...l, chave: `grupo:${chave}`, adquirente: grupo, adquirenteId: `grupo:${grupo}`, categoriaId: null });
        continue;
      }
      atual.qtdVendas += l.qtdVendas;
      atual.esperado += l.esperado;
      atual.extratoDebito += l.extratoDebito;
      atual.extratoCredito += l.extratoCredito;
      if (atual.fontePrazo !== l.fontePrazo) atual.fontePrazo = "MISTO";
    }
    const agrupadas = [...porGrupoDia.values()].map((g) => {
      const extratoTotal = g.extratoDebito + g.extratoCredito;
      const diferenca = extratoTotal - g.esperado;
      return { ...g, extratoTotal, diferenca, status: calcularStatus(extratoTotal, diferenca) };
    });
    linhasDetalhadas = [...semGrupo, ...agrupadas];
  }

  if (agruparPor === "recebimento") {
    return linhasDetalhadas.sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || a.adquirente.localeCompare(b.adquirente));
  }

  // agruparPor === "adquirente": soma o período inteiro, uma linha por
  // adquirente.
  const periodoDe = dataInicio.toISOString().slice(0, 10);
  const periodoAte = dataFim.toISOString().slice(0, 10);
  const porAdquirente = new Map<string, LinhaConciliacao>();
  for (const l of linhasDetalhadas) {
    const grupo = porAdquirente.get(l.adquirenteId) ?? {
      ...l,
      chave: l.adquirenteId,
      data: null,
      dataLinkDe: periodoDe,
      dataLinkAte: periodoAte,
      qtdVendas: 0,
      esperado: 0,
      extratoDebito: 0,
      extratoCredito: 0,
      extratoTotal: 0,
      diferenca: 0,
    };
    grupo.qtdVendas += l.qtdVendas;
    grupo.esperado += l.esperado;
    grupo.extratoDebito += l.extratoDebito;
    grupo.extratoCredito += l.extratoCredito;
    porAdquirente.set(l.adquirenteId, grupo);
  }
  return [...porAdquirente.values()]
    .map((g) => {
      const extratoTotal = g.extratoDebito + g.extratoCredito;
      const diferenca = extratoTotal - g.esperado;
      return { ...g, extratoTotal, diferenca, status: calcularStatus(extratoTotal, diferenca) };
    })
    .sort((a, b) => a.adquirente.localeCompare(b.adquirente));
}
