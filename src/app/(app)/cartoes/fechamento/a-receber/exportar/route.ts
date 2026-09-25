import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { agruparEmBlocos, buscarVendasAReceber, formatarPeriodoVendas, type BaseAReceber } from "@/lib/cartoes/aReceber";

const FORMATO_MOEDA = "#,##0.00;-#,##0.00";

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export async function GET(request: NextRequest) {
  await exigirPermissao("CARTOES", "visualizar");

  const params = request.nextUrl.searchParams;
  const postoId = params.get("postoId") || undefined;
  const adquirenteId = params.get("adquirenteId") || undefined;
  const inicio = params.get("inicio");
  const fim = params.get("fim");
  const base: BaseAReceber = params.get("base") === "recebimento" ? "recebimento" : "venda";

  if (!inicio || !fim) {
    return new Response("Escolha o período.", { status: 400 });
  }

  const linhas = await buscarVendasAReceber({ postoId, adquirenteId, dataInicio: dataUTC(inicio), dataFim: dataUTC(fim, true), base });

  const titulo = `VALORES A RECEBER - ${inicio} a ${fim} - por data ${base === "venda" ? "da venda" : "de recebimento"}`;
  const cabecalho = ["Posto", "Adquirente", "Valor Bruto", "Período"];
  const aoa: (string | number)[][] = [[titulo], cabecalho];
  // Mesmos blocos da planilha de entrega: Crédito, Débito e Outros, cada um
  // com seu total, e o total do posto no fim.
  const postos = agruparEmBlocos(linhas);
  for (const p of postos) {
    for (const bloco of p.blocos) {
      for (const l of bloco.linhas) {
        aoa.push([p.posto, l.rotulo, l.bruto, l.de && l.ate ? formatarPeriodoVendas(l.de, l.ate) : ""]);
      }
      aoa.push([p.posto, `TOTAL ${bloco.titulo.toUpperCase()}`, bloco.total, ""]);
    }
    aoa.push([p.posto, `TOTAL ${p.posto}`, p.total, ""]);
  }
  aoa.push(["", "TOTAL GERAL", postos.reduce((s, p) => s + p.total, 0), ""]);

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];
  for (let r = 2; r < aoa.length; r++) {
    for (const c of [2]) {
      const celula = planilha[XLSX.utils.encode_cell({ r, c })];
      if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
    }
  }
  planilha["!cols"] = [{ wch: 18 }, { wch: 26 }, { wch: 16 }, { wch: 18 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Valores a receber");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="valores-a-receber-${inicio}-a-${fim}.xlsx"`,
    },
  });
}
