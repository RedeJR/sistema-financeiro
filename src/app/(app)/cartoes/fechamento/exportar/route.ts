import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { buscarFechamentoCartoes } from "@/lib/cartoes/fechamento";

const FORMATO_MOEDA = "#,##0.00;-#,##0.00";

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export async function GET(request: NextRequest) {
  await exigirPermissao("CARTOES", "visualizar");

  const params = request.nextUrl.searchParams;
  const postoId = params.get("postoId") || undefined;
  const inicio = params.get("inicio");
  const fim = params.get("fim");
  const adquirenteId = params.get("adquirenteId") || undefined;

  if (!inicio || !fim) {
    return new Response("Escolha o período.", { status: 400 });
  }

  const linhas = await buscarFechamentoCartoes({ postoId, adquirenteId, dataInicio: dataUTC(inicio), dataFim: dataUTC(fim, true) });

  const titulo = `FECHAMENTO DE CARTÕES - ${inicio} a ${fim}`;
  const cabecalho = ["Posto", "Adquirente", "Qtd", "Total Bruto", "Total Líquido", "Taxas"];
  const aoa: (string | number)[][] = [
    [titulo],
    cabecalho,
    ...linhas.map((l) => [l.posto, l.adquirente, l.qtd, l.totalBruto, l.totalLiquido, l.taxa]),
  ];

  const totalBruto = linhas.reduce((s, l) => s + l.totalBruto, 0);
  const totalLiquido = linhas.reduce((s, l) => s + l.totalLiquido, 0);
  const totalTaxa = linhas.reduce((s, l) => s + l.taxa, 0);
  aoa.push(["", "Total geral", "", totalBruto, totalLiquido, totalTaxa]);

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];

  for (let r = 2; r < aoa.length; r++) {
    for (const c of [3, 4, 5]) {
      const celula = planilha[XLSX.utils.encode_cell({ r, c })];
      if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
    }
  }

  planilha["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Fechamento de Cartões");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nomeArquivo = `fechamento-cartoes-${inicio}-a-${fim}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
