import * as XLSX from "xlsx";
import { normalizarTexto, paraDataISO, paraNumero } from "@/lib/despesas/importacao";

// Leitura da planilha de antecipações de recebíveis (Cartões > Antecipações >
// Importar planilha). Função pura — a parte que fala com o banco fica em
// src/app/(app)/cartoes/antecipacoes/importar/actions.ts.

export type LinhaAntecipacao = {
  linha: number; // número da linha na planilha (cabeçalho = 1)
  posto: string;
  adquirente: string;
  dataRecebimento: string | null; // YYYY-MM-DD — dia em que o dinheiro caiu
  periodoDe: string | null;
  periodoAte: string | null;
  valorFace: number | null; // valor bruto dos recebíveis antecipados
  valorLiquido: number | null; // o que caiu no banco
  observacao: string;
  erros: string[];
};

type Campo = keyof Omit<LinhaAntecipacao, "linha" | "erros">;

const CABECALHOS: Record<string, Campo> = {
  POSTO: "posto",
  ADQUIRENTE: "adquirente",
  OPERADORA: "adquirente",
  "DATA EM QUE CAIU": "dataRecebimento",
  "CAIU EM": "dataRecebimento",
  "DATA DO RECEBIMENTO": "dataRecebimento",
  "DATA RECEBIMENTO": "dataRecebimento",
  "CAI DIA": "dataRecebimento",
  "PERIODO DE": "periodoDe",
  "PERIODO INICIO": "periodoDe",
  "INICIO DO PERIODO": "periodoDe",
  "PERIODO ATE": "periodoAte",
  "PERIODO FIM": "periodoAte",
  "FIM DO PERIODO": "periodoAte",
  "VALOR BRUTO": "valorFace",
  "VALOR DOS RECEBIVEIS": "valorFace",
  BRUTO: "valorFace",
  "VALOR LIQUIDO": "valorLiquido",
  "LIQUIDO RECEBIDO": "valorLiquido",
  LIQUIDO: "valorLiquido",
  OBSERVACAO: "observacao",
  OBS: "observacao",
};

const OBRIGATORIAS: Campo[] = ["posto", "adquirente", "dataRecebimento", "periodoDe", "periodoAte", "valorFace", "valorLiquido"];

const NOME_COLUNA: Record<Campo, string> = {
  posto: "POSTO",
  adquirente: "ADQUIRENTE",
  dataRecebimento: "DATA EM QUE CAIU",
  periodoDe: "PERÍODO DE",
  periodoAte: "PERÍODO ATÉ",
  valorFace: "VALOR BRUTO",
  valorLiquido: "VALOR LÍQUIDO",
  observacao: "OBSERVAÇÃO",
};

export function lerPlanilhaAntecipacoes(buffer: Buffer): LinhaAntecipacao[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("A planilha está vazia.");
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  const idxCabecalho = linhas.findIndex(
    (l) => l.some((c) => CABECALHOS[normalizarTexto(c)] === "posto") && l.some((c) => CABECALHOS[normalizarTexto(c)] === "valorFace")
  );
  if (idxCabecalho === -1) {
    throw new Error(`Não achei o cabeçalho. A primeira linha precisa ter as colunas: ${OBRIGATORIAS.map((c) => NOME_COLUNA[c]).join(", ")}.`);
  }
  const coluna: Partial<Record<Campo, number>> = {};
  linhas[idxCabecalho].forEach((c, i) => {
    const campo = CABECALHOS[normalizarTexto(c)];
    if (campo && coluna[campo] === undefined) coluna[campo] = i;
  });
  const faltando = OBRIGATORIAS.filter((c) => coluna[c] === undefined);
  if (faltando.length > 0) throw new Error(`Faltam colunas na planilha: ${faltando.map((c) => NOME_COLUNA[c]).join(", ")}.`);

  const resultado: LinhaAntecipacao[] = [];
  linhas.slice(idxCabecalho + 1).forEach((l, i) => {
    const pega = (c: Campo) => (coluna[c] === undefined ? null : l[coluna[c]!]);
    if (l.every((c) => c === null || String(c).trim() === "")) return; // linha em branco
    const erros: string[] = [];
    const dataRecebimento = paraDataISO(pega("dataRecebimento"));
    const periodoDe = paraDataISO(pega("periodoDe"));
    const periodoAte = paraDataISO(pega("periodoAte"));
    const face = paraNumero(pega("valorFace"));
    const liquido = paraNumero(pega("valorLiquido"));
    if (!dataRecebimento) erros.push("Data em que o dinheiro caiu inválida ou em branco.");
    if (!periodoDe || !periodoAte) erros.push("Período inválido ou em branco.");
    else if (periodoAte < periodoDe) erros.push("O fim do período é antes do início.");
    if (face === null || face <= 0) erros.push("Valor bruto inválido ou zerado.");
    if (liquido === null || liquido <= 0) erros.push("Valor líquido inválido ou zerado.");
    else if (face !== null && liquido > face) erros.push("O líquido é maior que o valor bruto.");
    resultado.push({
      linha: idxCabecalho + 2 + i,
      posto: String(pega("posto") ?? "").trim(),
      adquirente: String(pega("adquirente") ?? "").trim(),
      dataRecebimento,
      periodoDe,
      periodoAte,
      valorFace: face !== null && face > 0 ? face : null,
      valorLiquido: liquido !== null && liquido > 0 ? liquido : null,
      observacao: String(pega("observacao") ?? "").trim(),
      erros,
    });
  });
  return resultado;
}

export type LinhaAntecipacaoPreview = LinhaAntecipacao & {
  postoId: string | null;
  adquirenteId: string | null;
  // "sistema" = já existe antecipação do mesmo posto, adquirente, dia e valor;
  // "arquivo" = linha igual a outra do próprio arquivo.
  duplicada: { onde: "sistema" | "arquivo"; detalhe: string } | null;
};

export type LinhaAntecipacaoParaImportar = {
  linha: number;
  postoId: string;
  adquirenteId: string;
  dataRecebimento: string;
  periodoDe: string;
  periodoAte: string;
  valorFace: number;
  valorLiquido: number;
  observacao: string;
};
