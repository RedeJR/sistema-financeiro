import "server-only";
import { prisma } from "@/lib/prisma";
import { classificarModalidadeVenda, ehVendaEmDinheiro, ORDEM_MODALIDADE_VENDA, type ModalidadeVenda } from "./normalizar";
import { MAQUININHAS_COM_VOUCHER } from "./vouchersDuplicados";
import { calcularAjustesAntecipacao } from "./antecipacoes";

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
  // Intervalo de DATA DE PAGAMENTO prevista (não data da venda) — é a
  // pergunta que importa num relatório "a receber": quando esse dinheiro
  // cai. Null quando todas as vendas da linha são sem data de repasse
  // (qtdSemDataRepasse cobre esse caso). Pra linha de crédito afetada por
  // antecipação, o intervalo é restrito aos dias que ainda têm saldo de
  // verdade por receber (ver ajuste mais abaixo) — não ao período de venda
  // nem ao intervalo de pagamento original inteiro.
  pagamentoDe: Date | null;
  pagamentoAte: Date | null;
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
    // Agrupa por dataPagamento (não dataVenda) — o "Período" mostrado é
    // quando o dinheiro cai, não quando a venda foi feita.
    prisma.transacaoCartao.groupBy({
      by: ["postoId", "adquirenteId", "tipoVenda", "dataPagamento"],
      where,
      _count: { _all: true },
      _sum: { valorBruto: true, valorLiquido: true },
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
    if (ehVendaEmDinheiro(g.tipoVenda)) continue;
    const adquirente = nomeAdquirente.get(g.adquirenteId) ?? g.adquirenteId;
    const modalidade = classificarModalidadeVenda(g.tipoVenda, adquirente);
    const chave = `${g.postoId}|${g.adquirenteId}|${modalidade}`;
    const data = g.dataPagamento; // pode ser null (voucher sem data de repasse)
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
        pagamentoDe: data,
        pagamentoAte: data,
      });
    } else {
      atual.qtd += g._count._all;
      atual.totalBruto += Number(g._sum.valorBruto ?? 0);
      atual.totalLiquido += Number(g._sum.valorLiquido ?? 0);
      atual.qtdSemDataRepasse += semDataGrupo;
      if (data) {
        if (!atual.pagamentoDe || data < atual.pagamentoDe) atual.pagamentoDe = data;
        if (!atual.pagamentoAte || data > atual.pagamentoAte) atual.pagamentoAte = data;
      }
    }
  }

  // Antecipação de recebíveis (tela Antecipações) — nos dois modos, o valor
  // bruto/líquido de cada venda em TransacaoCartao fica como veio no arquivo
  // da adquirente (a antecipação não reescreve a venda, só ajusta por fora,
  // igual a conciliação já faz — ver antecipacoes.ts).
  if (base === "venda") {
    // Venda com dataPagamento depois do fim do período conta como "a
    // receber" acima, mas pode já ter caído antes — adiantada por uma
    // antecipação cujo período de recebíveis cobre essa dataPagamento.
    // Olha pra frente (dataPagamento depois de dataFim) e abate bruto/
    // líquido de cada linha de CRÉDITO na proporção já antecipada.
    const doisAnosDepois = new Date(dataFim);
    doisAnosDepois.setUTCFullYear(doisAnosDepois.getUTCFullYear() + 2);
    const diaSeguinte = new Date(dataFim);
    diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);

    const ajustes = await calcularAjustesAntecipacao({ postoId, dataInicio: diaSeguinte, dataFim: doisAnosDepois });
    for (const a of ajustes) {
      if (a.delta >= 0) continue; // só as reduções (dinheiro já antecipado), não o dia do recebimento em si
      if (adquirenteId && a.adquirenteId !== adquirenteId) continue;
      const chave = `${a.postoId}|${a.adquirenteId}|CREDITO`;
      const linha = linhas.get(chave);
      if (!linha) continue; // sem venda de crédito pendente pra essa adquirente — nada a abater
      // O rateio por dia soma todo mundo esperado naquele dataPagamento, não só
      // as vendas deste período — pode abater um pouco mais do que esta linha
      // tem (se parte do esperado do dia vier de venda fora do período pedido).
      // Nunca deixa negativo.
      linha.totalLiquido = Math.max(0, linha.totalLiquido + a.delta); // delta já é negativo
      linha.totalBruto = Math.max(0, linha.totalBruto + a.deltaBruto);
    }

    // O período mostrado não pode continuar indo até a data de pagamento mais
    // distante de antes da antecipação — isso incluiria dias que a
    // antecipação já esvaziou de verdade (dinheiro já caiu). Reconstrói o
    // intervalo olhando, dia a dia (por dataPagamento), quanto ainda sobra
    // depois de aplicar as mesmas reduções acima.
    const brutoPorDiaChave = new Map<string, Map<string, number>>();
    for (const g of grupos) {
      if (!g.dataPagamento) continue;
      const nomeAdq = nomeAdquirente.get(g.adquirenteId) ?? g.adquirenteId;
      if (classificarModalidadeVenda(g.tipoVenda, nomeAdq) !== "CREDITO") continue;
      const k = `${g.postoId}|${g.adquirenteId}`;
      const dia = g.dataPagamento.toISOString().slice(0, 10);
      const m = brutoPorDiaChave.get(k) ?? new Map<string, number>();
      m.set(dia, (m.get(dia) ?? 0) + Number(g._sum.valorBruto ?? 0));
      brutoPorDiaChave.set(k, m);
    }
    const reducaoPorDiaChave = new Map<string, Map<string, number>>();
    for (const a of ajustes) {
      if (a.delta >= 0) continue;
      const k = `${a.postoId}|${a.adquirenteId}`;
      const m = reducaoPorDiaChave.get(k) ?? new Map<string, number>();
      m.set(a.data, (m.get(a.data) ?? 0) + a.deltaBruto); // deltaBruto já é negativo
      reducaoPorDiaChave.set(k, m);
    }
    for (const [k, diasBruto] of brutoPorDiaChave) {
      const reducoes = reducaoPorDiaChave.get(k);
      if (!reducoes) continue; // sem antecipação tocando essa linha — mantém o intervalo original
      const linha = linhas.get(`${k}|CREDITO`);
      if (!linha) continue;
      let novoDe: Date | null = null;
      let novoAte: Date | null = null;
      for (const [dia, bruto] of diasBruto) {
        const residual = bruto + (reducoes.get(dia) ?? 0);
        if (residual <= 0.01) continue; // esse dia já foi todo antecipado — não entra no intervalo
        const d = new Date(`${dia}T00:00:00.000Z`);
        if (!novoDe || d < novoDe) novoDe = d;
        if (!novoAte || d > novoAte) novoAte = d;
      }
      linha.pagamentoDe = novoDe;
      linha.pagamentoAte = novoAte;
    }
  } else {
    // Vendas cujo pagamento previsto (nominal, do arquivo) cai dentro do
    // período já foram somadas acima — mas se uma delas já tinha sido
    // antecipada (dinheiro caiu antes, não na data nominal), ela não cai de
    // verdade nesse período: tira o nominal e põe no lugar certo o que
    // realmente caiu — o líquido da antecipação, no dia do recebimento dela
    // (só quando esse dia também está dentro do período pedido).
    const ajustes = await calcularAjustesAntecipacao({ postoId, dataInicio, dataFim });
    for (const a of ajustes) {
      if (adquirenteId && a.adquirenteId !== adquirenteId) continue;
      const chave = `${a.postoId}|${a.adquirenteId}|CREDITO`;
      const linha = linhas.get(chave);
      if (!linha) {
        if (a.delta <= 0) continue; // nada pra criar: é só uma redução sem linha base
        linhas.set(chave, {
          posto: nomePosto.get(a.postoId) ?? a.postoId,
          postoId: a.postoId,
          adquirente: a.adquirenteNome,
          modalidade: "CREDITO",
          qtd: 0,
          totalBruto: Math.max(0, a.deltaBruto),
          totalLiquido: Math.max(0, a.delta),
          qtdSemDataRepasse: 0,
          pagamentoDe: new Date(`${a.data}T00:00:00.000Z`),
          pagamentoAte: new Date(`${a.data}T00:00:00.000Z`),
        });
        continue;
      }
      linha.totalLiquido = Math.max(0, linha.totalLiquido + a.delta);
      linha.totalBruto = Math.max(0, linha.totalBruto + a.deltaBruto);
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
      if (l.pagamentoDe && (atual.de === null || l.pagamentoDe < atual.de)) atual.de = l.pagamentoDe;
      if (l.pagamentoAte && (atual.ate === null || l.pagamentoAte > atual.ate)) atual.ate = l.pagamentoAte;
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
