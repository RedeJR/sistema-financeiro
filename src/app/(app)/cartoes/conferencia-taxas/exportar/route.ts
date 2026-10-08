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
  let postoIds = params.getAll("postoId").filter(Boolean);
  const inicio = params.get("inicio");
  const fim = params.get("fim");
  const adquirenteId = params.get("adquirenteId") || undefined;

  if (!inicio || !fim) {
    return new Response("Escolha o período.", { status: 400 });
  }
  if (postoIds.length === 0) {
    postoIds = (await prisma.posto.findMany({ where: { ativo: true }, select: { id: true } })).map((p) => p.id);
  }

  const [postosSel, linhas] = await Promise.all([
    prisma.posto.findMany({ where: { id: { in: postoIds } }, orderBy: { nome: "asc" } }),
    buscarConferenciaTaxas({ postoIds, dataInicio: dataUTC(inicio), dataFim: dataUTC(fim, true), adquirenteId }),
  ]);
  if (postosSel.length === 0) {
    return new Response("Posto não encontrado.", { status: 404 });
  }

  const titulo = `CONFERÊNCIA DE TAXAS - ${postosSel.map((p) => p.nome).join(", ")} - ${inicio} a ${fim}`;
  const cabecalho = [
    "Posto",
    "Adquirente",
    "Modalidade (arquivo)",
    "Qtd",
    "Bruto",
    "Taxa R$",
    "Líquido",
    "Vendas sem líquido",
    "Prazo cadastrado (dias)",
    "Prazo real (dias)",
    "Taxa cadastrada (%)",
    "Taxa real (%)",
  ];
  const aoa: (string | number)[][] = [
    [titulo],
    cabecalho,
    ...linhas.map((l) => [
      l.posto,
      l.adquirente,
      l.tipoVenda,
      l.qtd,
      l.somaBruto,
      l.somaTaxa,
      l.somaLiquido,
      l.qtdSemLiquido,
      l.semTaxaCadastrada ? "sem cadastro" : (l.prazoCadastradoDias ?? ""),
      l.prazoRealDias ?? "",
      l.semTaxaCadastrada ? "sem cadastro" : (l.taxaCadastradaPct ?? ""),
      l.taxaRealPct ?? "",
    ]),
  ];

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];

  for (let r = 2; r < aoa.length; r++) {
    for (const c of [4, 5, 6]) {
      const celulaMoeda = planilha[XLSX.utils.encode_cell({ r, c })];
      if (celulaMoeda && celulaMoeda.t === "n") celulaMoeda.z = FORMATO_MOEDA;
    }
    for (const c of [10, 11]) {
      const celula = planilha[XLSX.utils.encode_cell({ r, c })];
      if (celula && celula.t === "n") celula.z = FORMATO_PCT;
    }
  }

  planilha["!cols"] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 24 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Conferência de Taxas");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nomeArquivo = `conferencia-taxas-${postosSel.length > 1 ? "varios-postos" : postosSel[0].nome}-${inicio}-a-${fim}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
