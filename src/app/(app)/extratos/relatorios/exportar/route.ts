import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { buscarRelatorioCampoExtrato, CAMPOS_RELATORIO_EXTRATO, type CampoRelatorioExtrato } from "@/lib/extratos/relatorioCampos";

const FORMATO_MOEDA = "#,##0.00;-#,##0.00";

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export async function GET(request: NextRequest) {
  await exigirPermissao("EXTRATOS", "visualizar");

  const params = request.nextUrl.searchParams;
  const postoId = params.get("postoId") || undefined;
  const de = params.get("de");
  const ate = params.get("ate");
  const campoParam = params.get("campo");
  const campo: CampoRelatorioExtrato = CAMPOS_RELATORIO_EXTRATO.some((c) => c.valor === campoParam)
    ? (campoParam as CampoRelatorioExtrato)
    : "OUTROS";

  if (!de || !ate) {
    return new Response("Escolha o período.", { status: 400 });
  }

  const blocos = await buscarRelatorioCampoExtrato({ campo, postoId, dataInicio: dataUTC(de), dataFim: dataUTC(ate, true) });
  const labelCampo = CAMPOS_RELATORIO_EXTRATO.find((c) => c.valor === campo)!.label;

  const cabecalho = ["Posto", "Data", "Valor", "Descrição"];
  const aoa: (string | number)[][] = [[`${labelCampo.toUpperCase()} - ${de} a ${ate}`], cabecalho];
  for (const b of blocos) {
    for (const l of b.linhas) {
      aoa.push([b.postoNome, l.data.toISOString().slice(0, 10), l.valor, l.descricao]);
    }
    aoa.push(["", `Total ${b.postoNome}`, b.total, ""]);
  }
  const totalGeral = blocos.reduce((s, b) => s + b.total, 0);
  aoa.push(["", "Total geral", totalGeral, ""]);

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];

  for (let r = 2; r < aoa.length; r++) {
    const celula = planilha[XLSX.utils.encode_cell({ r, c: 2 })];
    if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
  }

  planilha["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 40 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, labelCampo.slice(0, 31));

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nomeArquivo = `${labelCampo.toLowerCase().replace(/\s+/g, "-")}-${de}-a-${ate}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
