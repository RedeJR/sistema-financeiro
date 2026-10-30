import "server-only";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { paraProximoDiaUtilSeNecessario } from "./normalizar";
import { encontrarPostoPorCnpj } from "./postos";
import type { ResultadoArquivoCartao } from "./importar";

// Relatório "Guias de Reembolso" da VR (Pagamentos > Guias): uma linha por guia paga, com o produto, a data de
// corte (as vendas até esse dia entram na guia) e a data de pagamento. O relatório de vendas da VR não traz data
// de pagamento, então sem isso as vendas ficam "a receber" pra sempre. O que se vê nos arquivos reais:
//  - PAT (Alimentação PAT, Refeição PAT): corte diário, pagamento 15 dias depois;
//  - Auto, Auxílio Alimentação, Auxílio Refeição: corte semanal (mesmo dia da semana, que varia de posto pra
//    posto) e pagamento depois de um prazo fixo por posto (21 ou 28 dias).
// A guia define a data das vendas que cobre; as vendas ainda sem guia seguem a mesma regra (corte + prazo).

export type GuiaVr = { produto: string; corte: Date; pagamento: Date; bruto: number; liquido: number };
export type ArquivoGuiasVr = { cnpj: string; dataInicial: Date | null; dataFinal: Date | null; guias: GuiaVr[] };

const DIA_MS = 86_400_000;
const NOME_ABA = "guias de reembolso";

function paraData(s: unknown): Date | null {
  const m = String(s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`) : null;
}

function paraNumero(s: unknown): number {
  return Number(String(s ?? "0").replace(",", "."));
}

function chaveProduto(produto: string): string {
  return produto
    .replace(/^VR\s+/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function ehPat(chave: string): boolean {
  return /\bpat\b/.test(chave);
}

export function ehArquivoGuiasVr(buffer: Buffer): boolean {
  try {
    const wb = XLSX.read(buffer, { type: "buffer", bookSheets: true });
    return wb.SheetNames.some((n) => n.trim().toLowerCase() === NOME_ABA);
  } catch {
    return false;
  }
}

export function lerGuiasVr(buffer: Buffer): ArquivoGuiasVr {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const nome = wb.SheetNames.find((n) => n.trim().toLowerCase() === NOME_ABA) ?? wb.SheetNames[0];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: false, defval: "" });

  const iCnpj = linhas.findIndex((l) => String(l[0]).trim().toUpperCase() === "CNPJ");
  const cnpj = iCnpj >= 0 ? String(linhas[iCnpj + 1]?.[0] ?? "").replace(/\D/g, "") : "";
  const dataInicial = iCnpj >= 0 ? paraData(linhas[iCnpj + 1]?.[2]) : null;
  const dataFinal = iCnpj >= 0 ? paraData(linhas[iCnpj + 1]?.[3]) : null;
  const iCab = linhas.findIndex((l) => String(l[0]).trim().toLowerCase().startsWith("número guia") || String(l[0]).trim().toLowerCase().startsWith("numero guia"));
  if (iCab < 0 || !cnpj) throw new Error("Não achei o cabeçalho ou o CNPJ no relatório de guias da VR.");

  const guias: GuiaVr[] = [];
  for (const l of linhas.slice(iCab + 1)) {
    if (!/^\d+$/.test(String(l[0]).trim())) continue;
    if (String(l[3]).trim().toLowerCase() !== "pago") continue;
    const corte = paraData(l[4]);
    const pagamento = paraData(l[5]);
    if (!corte || !pagamento) continue;
    guias.push({ produto: String(l[1]).trim(), corte, pagamento, bruto: paraNumero(l[6]), liquido: paraNumero(l[7]) });
  }
  return { cnpj, dataInicial, dataFinal, guias };
}

function moda(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const c = new Map<number, number>();
  for (const v of valores) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

type Regra = { pat: boolean; prazo: number; diaSemana: number | null };

// Prazo e dia da semana do corte de cada produto, aprendidos com as guias; produto sem guia no arquivo usa a
// regra de outro produto do mesmo tipo (PAT ou semanal) do mesmo posto.
function aprenderRegras(guias: GuiaVr[]): Map<string, Regra> {
  const regras = new Map<string, Regra>();
  const porProduto = new Map<string, GuiaVr[]>();
  for (const g of guias) porProduto.set(chaveProduto(g.produto), [...(porProduto.get(chaveProduto(g.produto)) ?? []), g]);
  for (const [chave, gs] of porProduto) {
    const pat = ehPat(chave);
    // o prazo conta em dias corridos; guia paga depois de feriado/fim de semana (ex: +29) não conta como prazo
    const prazo = moda(gs.map((g) => Math.round((g.pagamento.getTime() - g.corte.getTime()) / DIA_MS))) ?? (pat ? 15 : 28);
    regras.set(chave, { pat, prazo, diaSemana: pat ? null : moda(gs.map((g) => g.corte.getUTCDay())) });
  }
  return regras;
}

function regraDoProduto(regras: Map<string, Regra>, chave: string): Regra | null {
  const propria = regras.get(chave);
  if (propria) return propria;
  const pat = ehPat(chave);
  return [...regras.values()].find((r) => r.pat === pat) ?? null;
}

function corteDaVenda(dataVenda: Date, regra: Regra): Date {
  if (regra.pat || regra.diaSemana === null) return dataVenda;
  const d = new Date(dataVenda);
  while (d.getUTCDay() !== regra.diaSemana) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Define a data de pagamento (e, quando a guia fecha com as vendas, o líquido) das vendas VR do posto.
export async function aplicarGuiasVr(params: { nomeArquivo: string; buffer: Buffer }): Promise<ResultadoArquivoCartao> {
  const { nomeArquivo, buffer } = params;
  const { cnpj, dataInicial, dataFinal, guias } = lerGuiasVr(buffer);
  if (guias.length === 0) return { arquivo: nomeArquivo, status: "ok", adquirente: "VR", gravados: 0, mensagem: "Nenhuma guia paga encontrada no arquivo." };

  const todosPostos = await prisma.posto.findMany({ select: { id: true, nome: true, cnpj: true } });
  const posto = encontrarPostoPorCnpj(todosPostos, cnpj);
  if (!posto) {
    return { arquivo: nomeArquivo, status: "erro", adquirente: "VR", mensagem: `Nenhum posto cadastrado com o CNPJ ${cnpj} do relatório. Confira o cadastro de postos.` };
  }
  const adquirente = await prisma.adquirenteCartao.findUnique({ where: { nome: "VR" } });
  if (!adquirente) return { arquivo: nomeArquivo, status: "erro", adquirente: "VR", mensagem: "Adquirente VR não cadastrada." };

  const vendas = await prisma.transacaoCartao.findMany({ where: { postoId: posto.id, adquirenteId: adquirente.id }, orderBy: { dataVenda: "asc" } });
  if (vendas.length === 0) return { arquivo: nomeArquivo, status: "ok", adquirente: "VR", gravados: 0, mensagem: "O posto não tem vendas da VR importadas — importe as vendas primeiro." };

  const regras = aprenderRegras(guias);
  const guiaPorCorte = new Map(guias.map((g) => [`${chaveProduto(g.produto)}|${iso(g.corte)}`, g]));

  // Vendas de cada guia (cortes anteriores ao dia, até o corte): confere o bruto pra ratear o líquido da guia.
  const novaData = new Map<string, Date>();
  const novoLiquido = new Map<string, { liquido: number; taxa: number }>();
  let porGuia = 0;
  let porRegra = 0;
  let semRegra = 0;
  let indefinidas = 0;
  const vendasPorCorte = new Map<string, typeof vendas>();
  for (const v of vendas) {
    const chave = chaveProduto(v.tipoVenda);
    const regra = regraDoProduto(regras, chave);
    if (!regra) {
      semRegra++;
      continue;
    }
    const corte = corteDaVenda(v.dataVenda, regra);
    const guia = guiaPorCorte.get(`${chave}|${iso(corte)}`);
    if (guia) {
      novaData.set(v.id, guia.pagamento);
      porGuia++;
      const k = `${chave}|${iso(corte)}`;
      vendasPorCorte.set(k, [...(vendasPorCorte.get(k) ?? []), v]);
    } else {
      const previsto = paraProximoDiaUtilSeNecessario(new Date(corte.getTime() + regra.prazo * DIA_MS));
      // O arquivo traz TODAS as guias pagas no período dele: se a regra manda pagar nesse período e não há guia,
      // essa venda não segue o ciclo (foi paga em outra guia/ciclo) — a data fica em aberto em vez de chutar.
      if (dataInicial && dataFinal && previsto >= dataInicial && previsto <= dataFinal) {
        indefinidas++;
        continue;
      }
      novaData.set(v.id, previsto);
      porRegra++;
    }
  }
  // Proporção líquido/bruto de cada produto nas guias (a VR desconta taxas diferentes por produto) — usada nas
  // vendas que ainda não têm guia e estão sem líquido (posto sem taxa da VR cadastrada).
  const proporcaoValida = (g: GuiaVr) => g.bruto > 0 && g.liquido / g.bruto >= 0.8 && g.liquido / g.bruto <= 1.05;
  const proporcaoPorProduto = new Map<string, number>();
  for (const chave of regras.keys()) {
    const gs = guias.filter((g) => chaveProduto(g.produto) === chave && proporcaoValida(g));
    const bruto = gs.reduce((t, g) => t + g.bruto, 0);
    if (bruto > 0) proporcaoPorProduto.set(chave, gs.reduce((t, g) => t + g.liquido, 0) / bruto);
  }
  let liquidosAjustados = 0;
  const comGuiaLiquido = new Set<string>();
  for (const [k, vs] of vendasPorCorte) {
    const guia = guiaPorCorte.get(k)!;
    const soma = vs.reduce((s, v) => s + Number(v.valorBruto), 0);
    if (soma <= 0) continue;
    if (Math.abs(soma - guia.bruto) > 0.05) {
      // guia não fecha com as vendas do período (ajuste, venda de outro mês): usa a proporção da própria guia, se plausível
      if (proporcaoValida(guia)) {
        for (const v of vs) {
          const liquido = Math.round(Number(v.valorBruto) * (guia.liquido / guia.bruto) * 100) / 100;
          novoLiquido.set(v.id, { liquido, taxa: Math.round((Number(v.valorBruto) - liquido) * 100) / 100 });
          comGuiaLiquido.add(v.id);
        }
      }
      continue;
    }
    let acumulado = 0;
    vs.forEach((v, i) => {
      const proporcional = i === vs.length - 1 ? guia.liquido - acumulado : Math.round((guia.liquido * Number(v.valorBruto)) / soma * 100) / 100;
      acumulado += proporcional;
      novoLiquido.set(v.id, { liquido: proporcional, taxa: Math.round((Number(v.valorBruto) - proporcional) * 100) / 100 });
      comGuiaLiquido.add(v.id);
      liquidosAjustados++;
    });
  }

  // Venda sem guia e sem líquido: usa a proporção do produto.
  for (const v of vendas) {
    if (comGuiaLiquido.has(v.id) || v.valorLiquido !== null || !novaData.has(v.id)) continue;
    const p = proporcaoPorProduto.get(chaveProduto(v.tipoVenda));
    if (p === undefined) continue;
    const liquido = Math.round(Number(v.valorBruto) * p * 100) / 100;
    novoLiquido.set(v.id, { liquido, taxa: Math.round((Number(v.valorBruto) - liquido) * 100) / 100 });
    liquidosAjustados++;
  }

  // Grava: datas em lote por dia; líquido venda a venda (poucas).
  const porData = new Map<string, string[]>();
  for (const v of vendas) {
    const d = novaData.get(v.id);
    if (d && iso(d) !== (v.dataPagamento ? iso(v.dataPagamento) : "")) porData.set(iso(d), [...(porData.get(iso(d)) ?? []), v.id]);
  }
  let atualizadas = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const [d, ids] of porData) atualizadas += (await tx.transacaoCartao.updateMany({ where: { id: { in: ids } }, data: { dataPagamento: new Date(`${d}T00:00:00.000Z`) } })).count;
      for (const [id, l] of novoLiquido) await tx.transacaoCartao.update({ where: { id }, data: { valorLiquido: l.liquido.toFixed(2), taxaRs: l.taxa.toFixed(2) } });
    },
    { timeout: 60000, maxWait: 15000 }
  );

  return {
    arquivo: nomeArquivo,
    status: "ok",
    adquirente: "VR",
    gravados: 0,
    atualizados: atualizadas,
    mensagem:
      `Posto ${posto.nome}: ${atualizadas} venda(s) com data de pagamento definida (${porGuia} pelas guias do arquivo, ${porRegra} pela regra de corte e prazo)` +
      `${liquidosAjustados ? `, ${liquidosAjustados} com o líquido da guia` : ""}${indefinidas ? `; ${indefinidas} venda(s) cujo pagamento cairia no período do arquivo sem ter guia ficaram sem data (pagas em outro ciclo — importe também as guias pagas no mês anterior)` : ""}${semRegra ? `; ${semRegra} de produto sem regra ficaram como estavam` : ""}.`,
  };
}
