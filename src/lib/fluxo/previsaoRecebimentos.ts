import "server-only";
import { prisma } from "@/lib/prisma";
import { calcularAjustesAntecipacao } from "@/lib/cartoes/antecipacoes";
import {
  classificarTipoFechamento,
  ehDiaUtil,
  paraProximoDiaUtilSeNecessario,
  proximoDiaUtil,
} from "@/lib/cartoes/normalizar";

// Recebimento do Fluxo de Caixa (Débito/Pix e Crédito/Voucher), por posto e dia útil, em três
// camadas — cada valor sabe de onde veio (regra combinada com a usuária, 16/10/2026):
//
//  1. REALIZADO: dia já passado com extrato importado — vale o que entrou no banco.
//  2. CONHECIDO: o que as vendas JÁ importadas agendam (data de pagamento vinda da adquirente:
//     crédito Cielo/Rede, Alelo, NAIP, Pluxee, VR...), já com as antecipações cadastradas.
//  3. ESTIMADO: só o que ainda não foi importado — vendas depois do último dia importado de
//     cada adquirente (débito, Pix, crédito curto). Média de venda líquida por DIA DA SEMANA
//     (últimas 4 semanas) do próprio posto/adquirente, jogada pra data de pagamento pelo
//     mesmo prazo, em dias úteis, que essas vendas tiveram (feriado e fim de semana saem da
//     regra de dias úteis, não de uma média de recebimento).
//
// Venda importada vira "conhecida" e só o resto é estimado, então nada conta em dobro.
// Aplicativos e tags (Sem Parar, Abastece Aí, Premmia, SAQPAY) ficam fora — seguem no "Outros".
// Só lê: não grava nada em vendas, extratos ou taxas.

const MAQUININHAS = ["CIELO", "CIELO TEF", "CIELO ALUGUEL", "STONE", "PAGSEGURO", "REDE", "GETNET"];
const CATEGORIAS_FORA_DO_FLUXO = new Set(["SAQPAY", "SEM PARAR", "ABASTECE AÍ", "PREMMIA"]);
const SEMANAS_DE_HISTORICO = 4;
const MAX_LAG_ESTIMADO = 5; // dias úteis; acima disso (crédito 30 dias) só vale o que já é conhecido
const TOLERANCIA_ATIVA_DIAS = 10; // adquirente sem venda há mais que isso (vs. a mais recente) é considerada encerrada
const MIN_LANCAMENTOS_BANCO_ATIVO = 20; // conta bancária com menos linhas que isso nos últimos 40 dias não conta pra cobertura do extrato

type Grupo = "deb" | "cred";
type Par = { deb: number; cred: number };

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dataUTC(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
function somarDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function hojeNoBrasil(): Date {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return dataUTC(hoje);
}
function diaUtilDe(d: Date): string {
  return iso(paraProximoDiaUtilSeNecessario(d));
}
function grupoDe(tipo: string): Grupo | null {
  if (tipo === "DEBITO" || tipo === "PIX") return "deb";
  if (tipo === "CREDITO" || tipo === "VOUCHER") return "cred";
  return null; // aplicativo/tag e saque Pix
}
// Dias úteis entre a venda (exclusive) e o pagamento (inclusive): 0 = mesmo dia, 1 = D+1 útil...
function atrasoEmDiasUteis(venda: Date, pagamento: Date): number {
  let n = 0;
  for (let d = somarDias(venda, 1); d <= pagamento; d = somarDias(d, 1)) if (ehDiaUtil(d)) n++;
  return n;
}
function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function dm(s: string): string {
  return s.split("-").reverse().slice(0, 2).join("/");
}
function somar(m: Map<string, Par>, chave: string, grupo: Grupo, valor: number) {
  const a = m.get(chave) ?? { deb: 0, cred: 0 };
  a[grupo] += valor;
  m.set(chave, a);
}

export type PrevisaoRecebimento = {
  debitoPix: number;
  creditoVoucher: number;
  fonte: "REALIZADO" | "PREVISTO";
  detalheDebitoPix: string;
  detalheCreditoVoucher: string;
  vendasAte: string | null; // último dia de venda importado do posto (limite do "conhecido")
  extratoAte: string | null; // até quando há extrato completo do posto (limite do "realizado")
};

// `simulacao` só serve pra testar a regra: finge que só existiam as vendas até `vendasAte` (sem
// antecipações) e não usa o extrato — compara a previsão com o que de fato entrou depois.
export async function previsaoDeRecebimentos(params: {
  postoIds: string[];
  dias: string[];
  simulacao?: { vendasAte: string };
}): Promise<Map<string, PrevisaoRecebimento>> {
  const { postoIds, dias, simulacao } = params;
  const corteVenda = simulacao ? { dataVenda: { lte: dataUTC(simulacao.vendasAte) } } : {};
  const resultado = new Map<string, PrevisaoRecebimento>();
  if (postoIds.length === 0 || dias.length === 0) return resultado;

  const hoje = hojeNoBrasil();
  const diasSet = new Set(dias);
  const minDia = dataUTC(dias[0]);
  const maxDia = dataUTC(dias[dias.length - 1]);

  const adquirentes = await prisma.adquirenteCartao.findMany({ select: { id: true, nome: true } });
  const nomeAdq = new Map(adquirentes.map((a) => [a.id, a.nome]));

  // ---------------- 2) CONHECIDO: o que as vendas importadas agendam ----------------
  const pagamentos = await prisma.transacaoCartao.groupBy({
    by: ["postoId", "adquirenteId", "dataPagamento", "tipoVenda"],
    where: {
      postoId: { in: postoIds },
      valorLiquido: { not: null },
      dataPagamento: { gte: somarDias(minDia, -10), lte: maxDia },
      ...corteVenda,
    },
    _sum: { valorLiquido: true },
  });
  const conhecido = new Map<string, Par>();
  for (const p of pagamentos) {
    if (!p.dataPagamento) continue;
    const grupo = grupoDe(classificarTipoFechamento(p.tipoVenda, nomeAdq.get(p.adquirenteId) ?? ""));
    if (!grupo) continue;
    const dia = diaUtilDe(p.dataPagamento);
    if (diasSet.has(dia)) somar(conhecido, `${p.postoId}|${dia}`, grupo, Number(p._sum.valorLiquido ?? 0));
  }
  // Antecipações cadastradas: tiram o valor dos dias antecipados e põem o líquido no dia em que caiu.
  const ajustes = simulacao
    ? []
    : await calcularAjustesAntecipacao({ postoId: postoIds, dataInicio: somarDias(minDia, -10), dataFim: maxDia });
  for (const a of ajustes) {
    const dia = diaUtilDe(dataUTC(a.data));
    if (diasSet.has(dia)) somar(conhecido, `${a.postoId}|${dia}`, "cred", a.delta);
  }

  // ---------------- 3) ESTIMADO: vendas ainda não importadas ----------------
  const ultimas = await prisma.transacaoCartao.groupBy({
    by: ["postoId", "adquirenteId"],
    where: { postoId: { in: postoIds }, adquirente: { nome: { in: MAQUININHAS } }, ...corteVenda },
    _max: { dataVenda: true },
  });
  const maisRecente = ultimas.reduce<Date | null>((m, u) => (u._max.dataVenda && (!m || u._max.dataVenda > m) ? u._max.dataVenda : m), null);
  const baseAte = new Map<string, Date>(); // posto|adquirente -> último dia de venda importado (só adquirentes ativas)
  const vendasAtePosto = new Map<string, Date>();
  if (maisRecente) {
    const corte = somarDias(maisRecente, -TOLERANCIA_ATIVA_DIAS);
    for (const u of ultimas) {
      const d = u._max.dataVenda;
      if (!d || d < corte) continue;
      baseAte.set(`${u.postoId}|${u.adquirenteId}`, d);
      const atual = vendasAtePosto.get(u.postoId);
      if (!atual || d < atual) vendasAtePosto.set(u.postoId, d);
    }
  }

  const estimado = new Map<string, Par>();
  if (baseAte.size > 0) {
    const menorBase = [...baseAte.values()].reduce((m, d) => (d < m ? d : m));
    const historico = await prisma.transacaoCartao.groupBy({
      by: ["postoId", "adquirenteId", "dataVenda", "tipoVenda", "dataPagamento"],
      where: {
        postoId: { in: postoIds },
        adquirente: { nome: { in: MAQUININHAS } },
        valorLiquido: { not: null },
        dataPagamento: { not: null },
        dataVenda: { gte: somarDias(menorBase, -(SEMANAS_DE_HISTORICO * 7)), lte: [...baseAte.values()].reduce((m, d) => (d > m ? d : m)) },
      },
      _sum: { valorLiquido: true },
    });
    // média de venda líquida por (posto, adquirente, tipo, atraso, dia da semana da venda)
    const media = new Map<string, { postoId: string; adquirenteId: string; grupo: Grupo; lag: number; dow: number; soma: number }>();
    for (const h of historico) {
      const base = baseAte.get(`${h.postoId}|${h.adquirenteId}`);
      if (!base || h.dataVenda > base || h.dataVenda <= somarDias(base, -(SEMANAS_DE_HISTORICO * 7))) continue;
      const tipo = classificarTipoFechamento(h.tipoVenda, nomeAdq.get(h.adquirenteId) ?? "");
      if (tipo !== "DEBITO" && tipo !== "PIX" && tipo !== "CREDITO") continue;
      const lag = atrasoEmDiasUteis(h.dataVenda, h.dataPagamento!);
      if (lag > MAX_LAG_ESTIMADO) continue;
      const dow = h.dataVenda.getUTCDay();
      const chave = `${h.postoId}|${h.adquirenteId}|${grupoDe(tipo)}|${lag}|${dow}`;
      const a = media.get(chave) ?? { postoId: h.postoId, adquirenteId: h.adquirenteId, grupo: grupoDe(tipo)!, lag, dow, soma: 0 };
      a.soma += Number(h._sum.valorLiquido ?? 0);
      media.set(chave, a);
    }
    for (const m of media.values()) {
      const base = baseAte.get(`${m.postoId}|${m.adquirenteId}`)!;
      const porSemana = m.soma / SEMANAS_DE_HISTORICO;
      for (let s = somarDias(base, 1); s <= maxDia; s = somarDias(s, 1)) {
        if (s.getUTCDay() !== m.dow) continue;
        const pagamento = m.lag === 0 ? s : proximoDiaUtil(s, m.lag);
        const dia = diaUtilDe(pagamento);
        if (diasSet.has(dia)) somar(estimado, `${m.postoId}|${dia}`, m.grupo, porSemana);
      }
    }
  }

  // ---------------- 1) REALIZADO: extrato dos dias passados ----------------
  const ontem = somarDias(hoje, -1);
  const limiteReal = ontem < maxDia ? ontem : maxDia;
  const bancos = await prisma.lancamentoExtrato.groupBy({
    by: ["postoId", "bancoId"],
    where: { postoId: { in: postoIds }, data: { gte: somarDias(hoje, -40) } },
    _max: { data: true },
    _count: { _all: true },
  });
  const extratoAte = new Map<string, Date>(); // menor "último dia" entre as contas bancárias ativas do posto
  for (const b of bancos) {
    if (b._count._all < MIN_LANCAMENTOS_BANCO_ATIVO || !b._max.data) continue;
    const atual = extratoAte.get(b.postoId);
    if (!atual || b._max.data < atual) extratoAte.set(b.postoId, b._max.data);
  }
  const realizado = new Map<string, Par>();
  if (limiteReal >= minDia) {
    const lancamentos = await prisma.lancamentoExtrato.findMany({
      where: { postoId: { in: postoIds }, valor: { gt: 0 }, data: { gte: somarDias(minDia, -10), lte: limiteReal } },
      select: { postoId: true, data: true, valor: true, tipoAdquirente: true, categoria: { select: { nome: true, tipo: true } } },
    });
    for (const l of lancamentos) {
      const c = l.categoria;
      if (!c) continue;
      let grupo: Grupo | null = null;
      if (c.tipo === "ADQUIRENTE") grupo = l.tipoAdquirente === "DEBITO" ? "deb" : "cred";
      else if (c.tipo === "VOUCHER" && !CATEGORIAS_FORA_DO_FLUXO.has(c.nome)) grupo = "cred";
      else if (c.nome === "PIX") grupo = "deb";
      if (!grupo) continue;
      const dia = diaUtilDe(l.data);
      if (diasSet.has(dia)) somar(realizado, `${l.postoId}|${dia}`, grupo, Number(l.valor));
    }
  }

  // ---------------- junta as camadas ----------------
  for (const postoId of postoIds) {
    const extAte = extratoAte.get(postoId) ?? null;
    const vendasAte = vendasAtePosto.get(postoId) ?? null;
    for (const dia of dias) {
      const d = dataUTC(dia);
      const ehRealizado = !simulacao && d < hoje && extAte !== null && d <= extAte;
      const k = `${postoId}|${dia}`;
      const real = realizado.get(k) ?? { deb: 0, cred: 0 };
      const con = conhecido.get(k) ?? { deb: 0, cred: 0 };
      const est = estimado.get(k) ?? { deb: 0, cred: 0 };
      const arred = (n: number) => Math.round(n * 100) / 100;
      const montar = (g: Grupo): { valor: number; detalhe: string } => {
        if (ehRealizado) return { valor: arred(real[g]), detalhe: `Realizado: o que entrou no extrato nesse dia (extrato até ${extAte ? dm(iso(extAte)) : "—"}).` };
        const valor = arred(con[g] + est[g]);
        const base = vendasAte ? `vendas importadas até ${dm(iso(vendasAte))}` : "sem vendas importadas";
        return {
          valor,
          detalhe: `Previsto = ${brl(con[g])} conhecido (vendas já importadas, com antecipações cadastradas) + ${brl(est[g])} estimado (média de venda por dia da semana, últimas ${SEMANAS_DE_HISTORICO} semanas; ${base}).`,
        };
      };
      const deb = montar("deb");
      const cred = montar("cred");
      resultado.set(k, {
        debitoPix: deb.valor,
        creditoVoucher: cred.valor,
        fonte: ehRealizado ? "REALIZADO" : "PREVISTO",
        detalheDebitoPix: deb.detalhe,
        detalheCreditoVoucher: cred.detalhe,
        vendasAte: vendasAte ? iso(vendasAte) : null,
        extratoAte: extAte ? iso(extAte) : null,
      });
    }
  }
  return resultado;
}
