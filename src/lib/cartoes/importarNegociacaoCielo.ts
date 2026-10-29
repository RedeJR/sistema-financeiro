// Leitura do arquivo "Negociação de recebíveis — detalhe" da Cielo (portal Cielo >
// Negociação de recebíveis > exportar CSV). Cada linha é um dia original de pagamento
// + bandeira de uma negociação (antecipação); o que interessa aqui é, por negociação,
// quanto foi antecipado de cada dia. Função pura — a parte que fala com o banco fica em
// src/app/(app)/cartoes/antecipacoes/importar-cielo/actions.ts.

export type NegociacaoCielo = {
  dataRecebimento?: string; // YYYY-MM-DD — quando o arquivo já informa o dia em que o dinheiro caiu (Stone)
  id: string; // "Identificação na Cielo" (Stone: "Stone <vencimento>")
  valorFace: number; // soma do "Valor antecipado"
  valorLiquido: number; // soma do "Valor líquido da antecipação"
  periodoDe: string; // YYYY-MM-DD — menor dia original
  periodoAte: string; // YYYY-MM-DD — maior dia original
  dias: { data: string; valor: number }[];
};

function paraNumero(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", ".").replace("%", "").trim());
}

function paraDataISO(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function lerNegociacoesCielo(texto: string): NegociacaoCielo[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  // alguns exports trazem um cabeçalho de contato/filtros antes da tabela
  const ini = Math.max(0, linhas.findIndex((l) => /^Data de pagamento original/i.test(l)));
  const cab = linhas[ini]?.split(";").map((c) => c.trim()) ?? [];
  const iData = cab.findIndex((c) => /^Data de pagamento original/i.test(c));
  const iId = cab.findIndex((c) => /^Identifica/i.test(c));
  const iFace = cab.findIndex((c) => /^Valor antecipado/i.test(c));
  const iLiquido = cab.findIndex((c) => /^Valor l.quido da antecipa/i.test(c));
  if ([iData, iId, iFace, iLiquido].some((i) => i === -1)) {
    throw new Error("Não é o arquivo de negociação de recebíveis (detalhe) da Cielo — faltam as colunas de data original, identificação e valor antecipado.");
  }

  const porId = new Map<string, NegociacaoCielo>();
  for (const l of linhas.slice(ini + 1)) {
    const c = l.split(";");
    const data = paraDataISO(c[iData] ?? "");
    const face = paraNumero(c[iFace] ?? "");
    const liquido = paraNumero(c[iLiquido] ?? "");
    const id = (c[iId] ?? "").trim();
    if (!data || !id || !Number.isFinite(face) || !Number.isFinite(liquido)) continue;
    let n = porId.get(id);
    if (!n) {
      n = { id, valorFace: 0, valorLiquido: 0, periodoDe: data, periodoAte: data, dias: [] };
      porId.set(id, n);
    }
    n.valorFace += face;
    n.valorLiquido += liquido;
    if (data < n.periodoDe) n.periodoDe = data;
    if (data > n.periodoAte) n.periodoAte = data;
    const dia = n.dias.find((d) => d.data === data);
    if (dia) dia.valor += face;
    else n.dias.push({ data, valor: face });
  }
  for (const n of porId.values()) {
    n.valorFace = Math.round(n.valorFace * 100) / 100;
    n.valorLiquido = Math.round(n.valorLiquido * 100) / 100;
    n.dias = n.dias.map((d) => ({ data: d.data, valor: Math.round(d.valor * 100) / 100 })).sort((a, b) => a.data.localeCompare(b.data));
  }
  return [...porId.values()];
}
