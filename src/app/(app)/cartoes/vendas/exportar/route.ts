import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buscarVendasCartoes } from "@/lib/cartoes/vendas";
import { ROTULO_MODALIDADE_VENDA } from "@/lib/cartoes/normalizar";

const FORMATO_MOEDA = "#,##0.00;-#,##0.00";

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

  if (!postoId || !inicio || !fim) {
    return new Response("Escolha um posto e o período.", { status: 400 });
  }

  const [posto, linhas] = await Promise.all([
    prisma.posto.findUnique({ where: { id: postoId } }),
    buscarVendasCartoes({ postoId, adquirenteIds, dataInicio: dataUTC(inicio), dataFim: dataUTC(fim, true) }),
  ]);
  if (!posto) {
    return new Response("Posto não encontrado.", { status: 404 });
  }

  const titulo = `VENDAS DE CARTÕES - ${posto.nome} - ${inicio} a ${fim}`;
  const cabecalho = ["Data", "Adquirente", "Modalidade", "Qtd", "Bruto", "Líquido", "Taxa"];
  const aoa: (string | number)[][] = [
    [titulo],
    cabecalho,
    ...linhas.map((l) => [
      l.data.split("-").reverse().join("/"),
      l.adquirente,
      ROTULO_MODALIDADE_VENDA[l.modalidade],
      l.qtd,
      l.totalBruto,
      l.totalLiquido,
      l.taxa,
    ]),
  ];

  const totalBruto = linhas.reduce((s, l) => s + l.totalBruto, 0);
  const totalLiquido = linhas.reduce((s, l) => s + l.totalLiquido, 0);
  const totalTaxa = linhas.reduce((s, l) => s + l.taxa, 0);
  aoa.push(["", "Total", "", "", totalBruto, totalLiquido, totalTaxa]);

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];

  for (let r = 2; r < aoa.length; r++) {
    for (const c of [4, 5, 6]) {
      const celula = planilha[XLSX.utils.encode_cell({ r, c })];
      if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
    }
  }

  planilha["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Vendas de Cartões");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nomeArquivo = `vendas-cartoes-${posto.nome}-${inicio}-a-${fim}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
