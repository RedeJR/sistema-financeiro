import "server-only";
import { prisma } from "@/lib/prisma";
import { classificarModalidadeVenda, type ModalidadeVenda } from "./normalizar";
import { calcularAjustesAntecipacao } from "./antecipacoes";

export type LinhaResumoMensal = {
  adquirente: string;
  debito: number;
  credito: number;
  pix: number;
  totalVendas: number; // débito + crédito + pix (valor líquido)
  entradas: number; // o que caiu no banco (extrato)
  diferenca: number; // entradas − vendas
};

export type PostoResumoMensal = {
  postoId: string;
  posto: string;
  linhas: LinhaResumoMensal[];
  total: LinhaResumoMensal;
  vendasSemLiquido: number; // vendas do arquivo sem valor líquido (não entram na soma)
  // Período coberto pelo que está no sistema — pra saber se uma diferença é
  // falta de venda ou de extrato. Vendas: datas de venda das vendas somadas
  // (com "vendas por data do pagamento" pode começar antes do mês). Extratos:
  // primeiro e último lançamento de qualquer banco do posto no mês.
  vendasDe: string | null;
  vendasAte: string | null;
  extratosDe: string | null;
  extratosAte: string | null;
};

export type VendasPor = "venda" | "pagamento";

// Adquirentes com PIX de maquininha que às vezes cai na categoria genérica
// "PIX" do extrato — atribuídas pelo domicílio cadastrado em Taxas de
// Cartão (a Cielo varia de banco, então fica de fora; mesma regra de
// conciliacao.ts).
const ADQUIRENTES_PIX_POR_DOMICILIO = new Set(["PAGSEGURO", "REDE", "STONE", "GETNET"]);

// "01 a 18/09" quando é o mesmo mês, "28/08 a 18/09" quando atravessa meses.
export function formatarPeriodoReferencia(de: string | null, ate: string | null): string {
  if (!de || !ate) return "sem dados no mês";
  const [ad, am] = de.split("-").slice(1).reverse();
  const [bd, bm] = ate.split("-").slice(1).reverse();
  return am === bm ? `${ad} a ${bd}/${bm}` : `${ad}/${am} a ${bd}/${bm}`;
}

function grupoAdquirente(nome: string): string {
  return nome.startsWith("CIELO") ? "CIELO" : nome;
}

function linhaVazia(adquirente: string): LinhaResumoMensal {
  return { adquirente, debito: 0, credito: 0, pix: 0, totalVendas: 0, entradas: 0, diferenca: 0 };
}

const CAMPO_POR_MODALIDADE: Record<ModalidadeVenda, "debito" | "credito" | "pix"> = {
  DEBITO: "debito",
  CREDITO: "credito",
  PIX: "pix",
};

// Compara, no mês, o total vendido (líquido, separado por modalidade) com o
// total que entrou no banco por adquirente — pra ver se um compensa o outro
// mesmo quando o repasse não bate 100% (ex: operação de crédito com trava
// de cartões). Linhas por adquirente incluem categorias que só têm entrada
// no banco (sem nenhuma venda no sistema), pra deixar visível o que falta
// importar.
export async function buscarResumoMensal(params: {
  mes: string; // YYYY-MM
  postoId?: string;
  vendasPor: VendasPor;
}): Promise<PostoResumoMensal[]> {
  const { mes, postoId, vendasPor } = params;
  const [ano, mesNum] = mes.split("-").map(Number);
  const dataInicio = new Date(Date.UTC(ano, mesNum - 1, 1));
  const dataFim = new Date(Date.UTC(ano, mesNum, 0, 23, 59, 59, 999));
  const campoData = vendasPor === "venda" ? "dataVenda" : "dataPagamento";

  const [transacoes, categorias, taxas] = await Promise.all([
    prisma.transacaoCartao.findMany({
      where: { [campoData]: { gte: dataInicio, lte: dataFim }, ...(postoId ? { postoId } : {}) },
      include: { adquirente: true, posto: true },
    }),
    prisma.categoriaExtrato.findMany({ where: { tipo: { in: ["ADQUIRENTE", "VOUCHER"] } } }),
    prisma.taxaCartao.findMany({
      where: { domicilioBancoId: { not: null }, ...(postoId ? { postoId } : {}) },
      include: { adquirente: true },
    }),
  ]);

  const categoriaPix = await prisma.categoriaExtrato.findFirst({ where: { nome: "PIX" } });
  const categoriaNome = new Map(categorias.map((c) => [c.id, c.nome]));

  const lancamentos = await prisma.lancamentoExtrato.findMany({
    where: {
      data: { gte: dataInicio, lte: dataFim },
      categoriaId: { in: [...categorias.map((c) => c.id), ...(categoriaPix ? [categoriaPix.id] : [])] },
      ...(postoId ? { postoId } : {}),
    },
    select: { postoId: true, bancoId: true, categoriaId: true, valor: true },
  });

  // posto|banco -> adquirente dona do PIX genérico daquele banco. Quando
  // duas adquirentes do posto compartilham o mesmo domicílio (ex: Rede
  // liquidando na conta da Stone), o Pix de maquininha genérico é sempre
  // da Stone (confirmado com a usuária) — as demais já capturam o próprio
  // Pix pela modalidade "Pix" do arquivo de vendas delas. Só fica sem dono
  // (null) quando o empate é entre duas adquirentes que não a Stone.
  const donoPixPorBanco = new Map<string, string | null>();
  for (const t of taxas) {
    const nome = grupoAdquirente(t.adquirente.nome);
    if (!ADQUIRENTES_PIX_POR_DOMICILIO.has(nome) || !t.domicilioBancoId) continue;
    const chave = `${t.postoId}|${t.domicilioBancoId}`;
    const atual = donoPixPorBanco.get(chave);
    if (!donoPixPorBanco.has(chave)) donoPixPorBanco.set(chave, nome);
    else if (atual !== nome) donoPixPorBanco.set(chave, nome === "STONE" || atual === "STONE" ? "STONE" : null);
  }

  const coberturaExtratos = await prisma.lancamentoExtrato.groupBy({
    by: ["postoId"],
    where: { data: { gte: dataInicio, lte: dataFim }, ...(postoId ? { postoId } : {}) },
    _min: { data: true },
    _max: { data: true },
  });
  const extratosPorPosto = new Map(coberturaExtratos.map((c) => [c.postoId, c]));

  const porPosto = new Map<string, { posto: string; linhas: Map<string, LinhaResumoMensal>; semLiquido: number; vendasDe: string | null; vendasAte: string | null }>();
  function grupoPosto(id: string, nome: string) {
    let g = porPosto.get(id);
    if (!g) porPosto.set(id, (g = { posto: nome, linhas: new Map(), semLiquido: 0, vendasDe: null, vendasAte: null }));
    return g;
  }
  function linha(g: ReturnType<typeof grupoPosto>, adquirente: string) {
    let l = g.linhas.get(adquirente);
    if (!l) g.linhas.set(adquirente, (l = linhaVazia(adquirente)));
    return l;
  }

  for (const t of transacoes) {
    const g = grupoPosto(t.postoId, t.posto.nome);
    const dataVenda = t.dataVenda.toISOString().slice(0, 10);
    if (!g.vendasDe || dataVenda < g.vendasDe) g.vendasDe = dataVenda;
    if (!g.vendasAte || dataVenda > g.vendasAte) g.vendasAte = dataVenda;
    if (t.valorLiquido === null) {
      g.semLiquido++;
      continue;
    }
    const l = linha(g, grupoAdquirente(t.adquirente.nome));
    l[CAMPO_POR_MODALIDADE[classificarModalidadeVenda(t.tipoVenda, t.adquirente.nome)]] += Number(t.valorLiquido);
  }

  // Antecipação de recebíveis: só quando as vendas são contadas por data do
  // pagamento — o valor recebido entra no dia em que caiu e sai dos dias do
  // período antecipado, sempre na coluna Crédito.
  if (vendasPor === "pagamento") {
    const ajustes = await calcularAjustesAntecipacao({ postoId, dataInicio, dataFim });
    for (const a of ajustes) {
      const g = grupoPosto(a.postoId, a.postoNome);
      linha(g, grupoAdquirente(a.adquirenteNome)).credito += a.delta;
    }
  }

  const nomesPostos = new Map<string, string>();
  if (lancamentos.length > 0) {
    const ids = [...new Set(lancamentos.map((l) => l.postoId))].filter((id) => !porPosto.has(id));
    if (ids.length > 0) {
      for (const p of await prisma.posto.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })) {
        nomesPostos.set(p.id, p.nome);
      }
    }
  }
  for (const lc of lancamentos) {
    let adquirente: string | undefined;
    if (lc.categoriaId === categoriaPix?.id) {
      adquirente = donoPixPorBanco.get(`${lc.postoId}|${lc.bancoId}`) ?? undefined;
    } else {
      adquirente = categoriaNome.get(lc.categoriaId ?? "");
    }
    if (!adquirente) continue;
    const g = grupoPosto(lc.postoId, porPosto.get(lc.postoId)?.posto ?? nomesPostos.get(lc.postoId) ?? "");
    linha(g, adquirente).entradas += Number(lc.valor);
  }

  const resultado: PostoResumoMensal[] = [];
  for (const [id, g] of porPosto) {
    const linhas = [...g.linhas.values()]
      .map((l) => {
        const totalVendas = l.debito + l.credito + l.pix;
        return { ...l, totalVendas, diferenca: l.entradas - totalVendas };
      })
      .sort((a, b) => a.adquirente.localeCompare(b.adquirente));
    const total = linhas.reduce((acc, l) => {
      acc.debito += l.debito;
      acc.credito += l.credito;
      acc.pix += l.pix;
      acc.totalVendas += l.totalVendas;
      acc.entradas += l.entradas;
      return acc;
    }, linhaVazia("Total"));
    total.diferenca = total.entradas - total.totalVendas;
    const extratos = extratosPorPosto.get(id);
    resultado.push({
      postoId: id,
      posto: g.posto,
      linhas,
      total,
      vendasSemLiquido: g.semLiquido,
      vendasDe: g.vendasDe,
      vendasAte: g.vendasAte,
      extratosDe: extratos?._min.data?.toISOString().slice(0, 10) ?? null,
      extratosAte: extratos?._max.data?.toISOString().slice(0, 10) ?? null,
    });
  }
  return resultado.filter((p) => p.linhas.length > 0).sort((a, b) => a.posto.localeCompare(b.posto));
}
