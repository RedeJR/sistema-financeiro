import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buscarConferenciaTaxas } from "@/lib/cartoes/conferenciaTaxas";

const FORMATO_MOEDA = "#,##0.00;-#,##0.00";
const FORMATO_PCT = "0.00\\%;-0.00\\%";

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export async function GET(request: NextRequest) {
  await exigirPermissao("CARTOES", "visualizar");

  const params = request.nextUrl.searchParams;
  const postoId = params.get("postoId");
  const inicio = params.get("inicio");
  const fim = params.get("fim");
  const adquirenteId = params.get("adquirenteId") || undefined;

  if (!postoId || !inicio || !fim) {
    return new Response("Escolha um posto e o período.", { status: 400 });
  }

  const [posto, linhas] = await Promise.all([
    prisma.posto.findUnique({ where: { id: postoId } }),
    buscarConferenciaTaxas({ postoId, dataInicio: dataUTC(inicio), dataFim: dataUTC(fim, true), adquirenteId }),
  ]);
  if (!posto) {
    return new Response("Posto não encontrado.", { status: 404 });
  }

  const titulo = `CONFERÊNCIA DE TAXAS - ${posto.nome} - ${inicio} a ${fim}`;
  const cabecalho = [
    "Adquirente",
    "Modalidade (arquivo)",
    "Qtd",
    "Bruto",
    "Prazo cadastrado (dias)",
    "Prazo real (dias)",
    "Taxa cadastrada (%)",
    "Taxa real (%)",
  ];
  const aoa: (string | number)[][] = [
    [titulo],
    cabecalho,
    ...linhas.map((l) => [
      l.adquirente,
      l.tipoVenda,
      l.qtd,
      l.somaBruto,
      l.semTaxaCadastrada ? "sem cadastro" : (l.prazoCadastradoDias ?? ""),
      l.prazoRealDias ?? "",
      l.semTaxaCadastrada ? "sem cadastro" : (l.taxaCadastradaPct ?? ""),
      l.taxaRealPct ?? "",
    ]),
  ];

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];

  for (let r = 2; r < aoa.length; r++) {
    const celulaBruto = planilha[XLSX.utils.encode_cell({ r, c: 3 })];
    if (celulaBruto && celulaBruto.t === "n") celulaBruto.z = FORMATO_MOEDA;
    for (const c of [6, 7]) {
      const celula = planilha[XLSX.utils.encode_cell({ r, c })];
      if (celula && celula.t === "n") celula.z = FORMATO_PCT;
    }
  }

  planilha["!cols"] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 8 },
    { wch: 14 },
    { wch: 20 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Conferência de Taxas");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nomeArquivo = `conferencia-taxas-${posto.nome}-${inicio}-a-${fim}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
