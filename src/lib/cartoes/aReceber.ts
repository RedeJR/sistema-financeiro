import "server-only";
import { prisma } from "@/lib/prisma";
import { classificarModalidadeVenda, ORDEM_MODALIDADE_VENDA, type ModalidadeVenda } from "./normalizar";
import { MAQUININHAS_COM_VOUCHER } from "./vouchersDuplicados";

export type BaseAReceber = "venda" | "recebimento";

export type LinhaAReceber = {
  posto: string;
  postoId: string;
  adquirente: string;
  modalidade: ModalidadeVenda;
  qtd: number;
  totalBruto: number;
  totalLiquido: number;
  // Vendas sem data de repasse (ex: VR) entram como "a receber" — sem data,
  // não dá pra saber se já caíram.
  qtdSemDataRepasse: number;
  vendaDe: Date;
  vendaAte: Date;
};

// Vendas a receber, pra entrega do dia 01 (valores que ainda vão cair na conta).
//  - base "venda": vendas feitas no período que ainda não tinham sido pagas no
//    último dia dele (dataPagamento depois do fim, ou sem data de repasse).
//  - base "recebimento": vendas cujo pagamento previsto cai dentro do período,
//    de qualquer data de venda.
export async function buscarVendasAReceber(params: {
  postoId?: string;
  adquirenteId?: string;
  dataInicio: Date;
  dataFim: Date;
  base: BaseAReceber;
}): Promise<LinhaAReceber[]> {
  const { postoId, adquirenteId, dataInicio, dataFim, base } = params;

  const filtroBase =
    base === "venda"
      ? {
          dataVenda: { gte: dataInicio, lte: dataFim },
          // Sem data de pagamento só conta pra voucher (VR etc., cujo relatório
          // não traz repasse). Venda sem data numa maquininha é voucher que
          // ela captura mas não paga (ex: "Voucher" da PagSeguro, relatório de
          // "parceiros" da Cielo) — fica fora.
          OR: [
            { dataPagamento: { gt: dataFim } },
            { dataPagamento: null, adquirente: { nome: { notIn: MAQUININHAS_COM_VOUCHER } } },
          ],
        }
      : { dataPagamento: { gte: dataInicio, lte: dataFim } };
  const where = {
    ...filtroBase,
    ...(postoId ? { postoId } : {}),
    ...(adquirenteId ? { adquirenteId } : {}),
  };

  const [grupos, semData, postos, adquirentes] = await Promise.all([
    prisma.transacaoCartao.groupBy({
      by: ["postoId", "adquirenteId", "tipoVenda"],
      where,
      _count: { _all: true },
      _sum: { valorBruto: true, valorLiquido: true },
      _min: { dataVenda: true },
      _max: { dataVenda: true },
    }),
    prisma.transacaoCartao.groupBy({
      by: ["postoId", "adquirenteId", "tipoVenda"],
      where: { ...where, dataPagamento: null },
      _count: { _all: true },
    }),
    prisma.posto.findMany({ select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ select: { id: true, nome: true } }),
  ]);

  const nomePosto = new Map(postos.map((p) => [p.id, p.nome]));
  const nomeAdquirente = new Map(adquirentes.map((a) => [a.id, a.nome]));
  const semDataPorChave = new Map(semData.map((s) => [`${s.postoId}|${s.adquirenteId}|${s.tipoVenda}`, s._count._all]));

  const linhas = new Map<string, LinhaAReceber>();
  for (const g of grupos) {
    const adquirente = nomeAdquirente.get(g.adquirenteId) ?? g.adquirenteId;
    const modalidade = classificarModalidadeVenda(g.tipoVenda, adquirente);
    const chave = `${g.postoId}|${g.adquirenteId}|${modalidade}`;
    const de = g._min.dataVenda!;
    const ate = g._max.dataVenda!;
    const atual = linhas.get(chave);
    const semDataGrupo = semDataPorChave.get(`${g.postoId}|${g.adquirenteId}|${g.tipoVenda}`) ?? 0;
    if (!atual) {
      linhas.set(chave, {
        posto: nomePosto.get(g.postoId) ?? g.postoId,
        postoId: g.postoId,
        adquirente,
        modalidade,
        qtd: g._count._all,
        totalBruto: Number(g._sum.valorBruto ?? 0),
        totalLiquido: Number(g._sum.valorLiquido ?? 0),
        qtdSemDataRepasse: semDataGrupo,
        vendaDe: de,
        vendaAte: ate,
      });
    } else {
      atual.qtd += g._count._all;
      atual.totalBruto += Number(g._sum.valorBruto ?? 0);
      atual.totalLiquido += Number(g._sum.valorLiquido ?? 0);
      atual.qtdSemDataRepasse += semDataGrupo;
      if (de < atual.vendaDe) atual.vendaDe = de;
      if (ate > atual.vendaAte) atual.vendaAte = ate;
    }
  }

  return [...linhas.values()].sort(
    (a, b) =>
      a.posto.localeCompare(b.posto) ||
      ORDEM_MODALIDADE_VENDA[a.modalidade] - ORDEM_MODALIDADE_VENDA[b.modalidade] ||
      a.adquirente.localeCompare(b.adquirente)
  );
}

export function formatarPeriodoVendas(de: Date, ate: Date): string {
  const f = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
  return de.getTime() === ate.getTime() ? f(de) : `${f(de)} a ${f(ate)}`;
}

// Blocos da planilha de entrega do dia 01: Crédito, Débito e Outros, com as
// linhas fixas de cada um (aparecem com "—" quando não há valor).
export type LinhaBloco = { rotulo: string; bruto: number; de: Date | null; ate: Date | null };
export type BlocoAReceber = { titulo: "Crédito" | "Débito" | "Outros"; linhas: LinhaBloco[]; total: number };
export type PostoAReceber = { posto: string; postoId: string; blocos: BlocoAReceber[]; total: number };

const MAQUININHAS = new Set(["CIELO", "CIELO TEF", "GETNET", "PAGSEGURO", "REDE", "STONE"]);

const LINHAS_FIXAS: Record<BlocoAReceber["titulo"], string[]> = {
  Crédito: ["CIELO CRÉDITO", "GETNET CRÉDITO", "PAGSEGURO CRÉDITO", "REDE CRÉDITO", "STONE CRÉDITO", "SODEXO / PLUXEE", "VR", "SEM PARAR"],
  Débito: ["CIELO DÉBITO", "GETNET DÉBITO", "PAGSEGURO DÉBITO", "REDE DÉBITO", "STONE DÉBITO", "PIX", "SAQ PAY"],
  Outros: ["ABASTECE AÍ / PREMMIA"],
};

function destinoDaLinha(l: LinhaAReceber): { bloco: BlocoAReceber["titulo"]; rotulo: string } {
  const nome = l.adquirente;
  if (MAQUININHAS.has(nome)) {
    const base = nome === "CIELO TEF" ? "CIELO" : nome;
    if (l.modalidade === "CREDITO") return { bloco: "Crédito", rotulo: `${base} CRÉDITO` };
    if (l.modalidade === "PIX") return { bloco: "Débito", rotulo: "PIX" };
    return { bloco: "Débito", rotulo: `${base} DÉBITO` };
  }
  if (nome === "PLUXEE") return { bloco: "Crédito", rotulo: "SODEXO / PLUXEE" };
  if (nome === "VR" || nome === "SEM PARAR" || nome === "ALELO") return { bloco: "Crédito", rotulo: nome };
  if (nome === "SAQPAY") return { bloco: "Débito", rotulo: "SAQ PAY" };
  if (nome === "ABASTECE AÍ" || nome === "PREMMIA") return { bloco: "Outros", rotulo: "ABASTECE AÍ / PREMMIA" };
  return { bloco: "Outros", rotulo: nome };
}

export function agruparEmBlocos(linhas: LinhaAReceber[]): PostoAReceber[] {
  const porPosto = new Map<string, { posto: string; postoId: string; itens: LinhaAReceber[] }>();
  for (const l of linhas) {
    const atual = porPosto.get(l.postoId) ?? { posto: l.posto, postoId: l.postoId, itens: [] };
    atual.itens.push(l);
    porPosto.set(l.postoId, atual);
  }

  return [...porPosto.values()].map(({ posto, postoId, itens }) => {
    const acumulado = new Map<string, LinhaBloco>();
    const blocoDoRotulo = new Map<string, BlocoAReceber["titulo"]>();
    for (const l of itens) {
      const { bloco, rotulo } = destinoDaLinha(l);
      const chave = `${bloco}|${rotulo}`;
      blocoDoRotulo.set(chave, bloco);
      const atual = acumulado.get(chave) ?? { rotulo, bruto: 0, de: null, ate: null };
      atual.bruto += l.totalBruto;
      atual.de = atual.de === null || l.vendaDe < atual.de ? l.vendaDe : atual.de;
      atual.ate = atual.ate === null || l.vendaAte > atual.ate ? l.vendaAte : atual.ate;
      acumulado.set(chave, atual);
    }

    const blocos = (Object.keys(LINHAS_FIXAS) as BlocoAReceber["titulo"][]).map((titulo) => {
      const fixas = LINHAS_FIXAS[titulo];
      const extras = [...acumulado.entries()]
        .filter(([chave]) => blocoDoRotulo.get(chave) === titulo && !fixas.includes(acumulado.get(chave)!.rotulo))
        .map(([, v]) => v.rotulo)
        .sort();
      const linhasBloco = [...fixas, ...extras].map((rotulo) => acumulado.get(`${titulo}|${rotulo}`) ?? { rotulo, bruto: 0, de: null, ate: null });
      return { titulo, linhas: linhasBloco, total: linhasBloco.reduce((s, x) => s + x.bruto, 0) };
    });
    return { posto, postoId, blocos, total: blocos.reduce((s, b) => s + b.total, 0) };
  });
}
