import * as XLSX from "xlsx";
import { normalizarTexto, paraDataISO, paraNumero } from "@/lib/despesas/importacao";

// Leitura da planilha de Vendas a Prazo (Vendas a Prazo > Importar planilha). Função pura, sem banco — a parte
// que fala com o banco fica em src/app/(app)/vendas-a-prazo/importar/actions.ts.

export type LinhaPlanilhaVenda = {
  linha: number; // número da linha na planilha (cabeçalho = 1)
  posto: string;
  cliente: string;
  periodoDe: string | null; // YYYY-MM-DD
  periodoAte: string | null;
  valor: number | null;
  dataPagamento: string | null;
  observacao: string;
  erros: string[];
};

type Campo = "posto" | "cliente" | "periodoDe" | "periodoAte" | "periodo" | "valor" | "dataPagamento" | "observacao";

// Cabeçalhos aceitos (sem acento e em maiúsculas — ver normalizarTexto). O modelo usa o primeiro de cada grupo.
const CABECALHOS: Record<string, Campo> = {
  POSTO: "posto",
  CLIENTE: "cliente",
  "PERIODO DE": "periodoDe",
  "PERIODO DO ABASTECIMENTO DE": "periodoDe",
  "ABASTECIMENTO DE": "periodoDe",
  INICIO: "periodoDe",
  "PERIODO ATE": "periodoAte",
  "PERIODO DO ABASTECIMENTO ATE": "periodoAte",
  "ABASTECIMENTO ATE": "periodoAte",
  FIM: "periodoAte",
  // uma coluna só, no formato "01/10/2026 a 15/10/2026"
  PERIODO: "periodo",
  "PERIODO DO ABASTECIMENTO": "periodo",
  "VALOR TOTAL": "valor",
  VALOR: "valor",
  "DATA DE PAGAMENTO": "dataPagamento",
  "DATA PAGAMENTO": "dataPagamento",
  PAGAMENTO: "dataPagamento",
  VENCIMENTO: "dataPagamento",
  OBSERVACAO: "observacao",
};

// "01/10/2026 a 15/10/2026" (ou com "ate", "-", "–") -> [de, ate]
function dividirPeriodo(v: unknown): [string | null, string | null] {
  const datas = String(v ?? "").match(/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/g);
  if (!datas || datas.length < 2) return [null, null];
  return [paraDataISO(datas[0]), paraDataISO(datas[1])];
}

export function lerPlanilhaVendasAPrazo(buffer: Buffer): LinhaPlanilhaVenda[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("A planilha está vazia.");
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  const idxCabecalho = linhas.findIndex((l) => l.some((c) => normalizarTexto(c) === "CLIENTE") && l.some((c) => CABECALHOS[normalizarTexto(c)] === "valor"));
  if (idxCabecalho === -1) {
    throw new Error("Não achei o cabeçalho. A primeira linha precisa ter as colunas: POSTO, CLIENTE, PERÍODO DE, PERÍODO ATÉ, VALOR TOTAL e DATA DE PAGAMENTO.");
  }
  const coluna: Partial<Record<Campo, number>> = {};
  linhas[idxCabecalho].forEach((c, i) => {
    const campo = CABECALHOS[normalizarTexto(c)];
    if (campo && coluna[campo] === undefined) coluna[campo] = i;
  });
  const temPeriodo = (coluna.periodoDe !== undefined && coluna.periodoAte !== undefined) || coluna.periodo !== undefined;
  const faltando = [
    ...(["posto", "cliente", "valor", "dataPagamento"] as const).filter((c) => coluna[c] === undefined).map((c) => ({ posto: "POSTO", cliente: "CLIENTE", valor: "VALOR TOTAL", dataPagamento: "DATA DE PAGAMENTO" })[c]),
    ...(temPeriodo ? [] : ["PERÍODO DE e PERÍODO ATÉ"]),
  ];
  if (faltando.length > 0) throw new Error(`Faltam colunas na planilha: ${faltando.join(", ")}.`);

  const resultado: LinhaPlanilhaVenda[] = [];
  linhas.slice(idxCabecalho + 1).forEach((l, i) => {
    if (l.every((c) => c === null || String(c).trim() === "")) return; // linha em branco
    const pega = (c: Campo) => (coluna[c] === undefined ? null : l[coluna[c]!]);
    const erros: string[] = [];
    let [periodoDe, periodoAte] = [paraDataISO(pega("periodoDe")), paraDataISO(pega("periodoAte"))];
    if ((!periodoDe || !periodoAte) && coluna.periodo !== undefined) [periodoDe, periodoAte] = dividirPeriodo(pega("periodo"));
    const valor = paraNumero(pega("valor"));
    const dataPagamento = paraDataISO(pega("dataPagamento"));
    const cliente = String(pega("cliente") ?? "").trim();
    if (!cliente) erros.push("Cliente em branco.");
    if (!periodoDe || !periodoAte) erros.push("Período do abastecimento inválido ou em branco.");
    else if (periodoAte < periodoDe) erros.push("O fim do período é antes do início.");
    if (valor === null || valor <= 0) erros.push("Valor total inválido ou zerado.");
    if (!dataPagamento) erros.push("Data de pagamento inválida ou em branco.");
    resultado.push({
      linha: idxCabecalho + 2 + i,
      posto: String(pega("posto") ?? "").trim(),
      cliente,
      periodoDe,
      periodoAte,
      valor: valor !== null && valor > 0 ? valor : null,
      dataPagamento,
      observacao: String(pega("observacao") ?? "").trim(),
      erros,
    });
  });
  return resultado;
}

export type LinhaPreviewVenda = {
  linha: number;
  postoTexto: string;
  postoId: string | null;
  postoOrigem: "apelido" | "exato" | "sugerido" | null;
  cliente: string;
  periodoDe: string | null;
  periodoAte: string | null;
  valor: number | null;
  dataPagamento: string | null;
  observacao: string;
  erros: string[];
  duplicada: { onde: "arquivo" | "sistema"; detalhe: string } | null;
};

export type LinhaParaImportarVenda = {
  linha: number;
  postoTexto: string;
  postoId: string;
  cliente: string;
  periodoDe: string;
  periodoAte: string;
  valor: number;
  dataPagamento: string;
  observacao: string;
};
