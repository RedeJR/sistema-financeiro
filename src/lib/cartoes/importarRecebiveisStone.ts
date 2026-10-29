import type { NegociacaoCielo } from "./importarNegociacaoCielo";

// Leitura do arquivo de recebíveis da Stone (portal Stone > Recebíveis > exportar CSV, uma linha
// por parcela). Parcela com "data de vencimento" diferente da "original" foi antecipada: o dinheiro
// caiu no vencimento e o recebível era do dia original. Cada dia de vencimento com antecipação vira
// uma antecipação (a Stone não dá número de negociação), com o valor de cada dia original.
// Função pura — a parte que fala com o banco fica em importar-cielo/actions.ts.

function paraNumero(s: string): number {
  return Number((s ?? "").replace(/\./g, "").replace(",", ".").trim());
}

function paraDataISO(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec((s ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function lerRecebiveisStone(texto: string): NegociacaoCielo[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const cab = linhas[0]?.split(";").map((c) => c.trim().toUpperCase()) ?? [];
  const iVenc = cab.findIndex((c) => c === "DATA DE VENCIMENTO");
  const iOrig = cab.findIndex((c) => c === "DATA DE VENCIMENTO ORIGINAL");
  const iBruto = cab.findIndex((c) => c === "VALOR BRUTO");
  const iLiquido = cab.findIndex((c) => c.startsWith("VALOR L") && c.endsWith("QUIDO"));
  const iDescAnt = cab.findIndex((c) => c.startsWith("DESCONTO DE ANTECIPA"));
  if ([iVenc, iOrig, iBruto, iLiquido, iDescAnt].some((i) => i === -1)) {
    throw new Error("Não é o arquivo de recebíveis da Stone — faltam as colunas de vencimento, vencimento original, valor líquido e desconto de antecipação.");
  }

  const porVenc = new Map<string, NegociacaoCielo>();
  for (const l of linhas.slice(1)) {
    const c = l.split(";");
    const venc = paraDataISO(c[iVenc] ?? "");
    const orig = paraDataISO(c[iOrig] ?? "");
    const bruto = paraNumero(c[iBruto] ?? "");
    const liquido = paraNumero(c[iLiquido] ?? "");
    const descAnt = paraNumero(c[iDescAnt] ?? "");
    // só parcela antecipada (cancelamento, de bruto negativo, fica de fora)
    if (!venc || !orig || venc === orig || !(bruto > 0) || !Number.isFinite(liquido) || !Number.isFinite(descAnt)) continue;
    // valor do recebível sem o desconto da antecipação (a Stone traz o desconto negativo)
    const face = liquido - descAnt;
    let n = porVenc.get(venc);
    if (!n) {
      n = { id: `Stone ${venc}`, dataRecebimento: venc, valorFace: 0, valorLiquido: 0, periodoDe: orig, periodoAte: orig, dias: [] };
      porVenc.set(venc, n);
    }
    n.valorFace += face;
    n.valorLiquido += liquido;
    if (orig < n.periodoDe) n.periodoDe = orig;
    if (orig > n.periodoAte) n.periodoAte = orig;
    const dia = n.dias.find((d) => d.data === orig);
    if (dia) dia.valor += face;
    else n.dias.push({ data: orig, valor: face });
  }
  for (const n of porVenc.values()) {
    n.valorFace = Math.round(n.valorFace * 100) / 100;
    n.valorLiquido = Math.round(n.valorLiquido * 100) / 100;
    n.dias = n.dias.map((d) => ({ data: d.data, valor: Math.round(d.valor * 100) / 100 })).sort((a, b) => a.data.localeCompare(b.data));
  }
  return [...porVenc.values()];
}
