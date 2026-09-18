import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buscarConciliacaoCartoes, type AgrupamentoConciliacao, type StatusConciliacao } from "@/lib/cartoes/conciliacao";

const FORMATO_MOEDA = "#,##0.00;-#,##0.00";
const ROTULO_STATUS: Record<StatusConciliacao, string> = {
  CONCILIADO: "Conciliado",
  DIVERGENTE: "Divergente",
  PENDENTE: "Pendente",
};

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export async function GET(request: NextRequest) {
  await exigirPermissao("CARTOES", "visualizar");

  const params = request.nextUrl.searchParams;
  const postoId = params.get("postoId");
  const inicio = params.get("inicio");
  const fim = params.get("fim");
  const adquirenteIds = params.getAll("adquirenteId");
  const statusFiltro = params.get("status") as StatusConciliacao | null;
  const filtrarPor = params.get("filtrarPor") === "venda" ? "venda" : "pagamento";
  const agruparParam = params.get("agruparPor");
  const agruparPor: AgrupamentoConciliacao =
    agruparParam === "venda" || agruparParam === "adquirente" ? agruparParam : "recebimento";

  if (!postoId || !inicio || !fim) {
    return new Response("Escolha um posto e o período.", { status: 400 });
  }

  const [posto, todasLinhas] = await Promise.all([
    prisma.posto.findUnique({ where: { id: postoId } }),
    buscarConciliacaoCartoes({
      postoId,
      dataInicio: dataUTC(inicio),
      dataFim: dataUTC(fim, true),
      adquirenteIds,
      filtrarPor,
      agruparPor,
    }),
  ]);
  if (!posto) {
    return new Response("Posto não encontrado.", { status: 404 });
  }
  const linhas = statusFiltro ? todasLinhas.filter((l) => l.status === statusFiltro) : todasLinhas;

  const ROTULO_COLUNA_DATA: Record<AgrupamentoConciliacao, string> = {
    recebimento: "Data pagamento",
    venda: "Data venda",
    adquirente: "Período",
  };

  const titulo = `CONCILIAÇÃO DE CARTÕES - ${posto.nome} - ${inicio} a ${fim}`;
  const cabecalho = [
    ROTULO_COLUNA_DATA[agruparPor],
    "Adquirente",
    "Prazo",
    "Qtd vendas",
    "Esperado",
    "Extrato Débito",
    "Extrato Crédito",
    "Diferença",
    "Status",
  ];
  const aoa: (string | number)[][] = [
    [titulo],
    cabecalho,
    ...linhas.map((l) => [
      l.data
        ? l.data.split("-").reverse().join("/")
        : `${l.dataLinkDe.split("-").reverse().join("/")} a ${l.dataLinkAte.split("-").reverse().join("/")}`,
      l.adquirente,
      l.fontePrazo === "ARQUIVO" ? "Arquivo" : "Sistema (regra fixa)",
      l.qtdVendas,
      l.esperado,
      l.extratoDebito,
      l.extratoCredito,
      l.diferenca,
      ROTULO_STATUS[l.status],
    ]),
  ];

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];

  for (let r = 2; r < aoa.length; r++) {
    for (const c of [4, 5, 6, 7]) {
      const celula = planilha[XLSX.utils.encode_cell({ r, c })];
      if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
    }
  }

  planilha["!cols"] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Conciliação de Cartões");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nomeArquivo = `conciliacao-cartoes-${posto.nome}-${inicio}-a-${fim}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
