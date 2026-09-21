import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { buscarResumoMensal, formatarPeriodoReferencia } from "@/lib/cartoes/resumoMensal";

const FORMATO_MOEDA = "#,##0.00;-#,##0.00";

export async function GET(request: NextRequest) {
  await exigirPermissao("CARTOES", "visualizar");

  const params = request.nextUrl.searchParams;
  const mes = params.get("mes");
  const postoId = params.get("postoId") || undefined;
  const vendasPor = params.get("vendasPor") === "pagamento" ? "pagamento" : "venda";

  if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return new Response("Escolha o mês.", { status: 400 });
  }

  const postos = await buscarResumoMensal({ mes, postoId, vendasPor });

  const titulo = `RESUMO MENSAL DE CARTÕES - ${mes} - vendas por data ${vendasPor === "venda" ? "da venda" : "do pagamento"} (valor líquido)`;
  const cabecalho = ["Posto", "Adquirente", "Débito", "Crédito", "Pix", "Total vendas", "Entradas no banco", "Diferença", "Entradas / vendas"];
  const aoa: (string | number)[][] = [[titulo], cabecalho];
  const totais = { debito: 0, credito: 0, pix: 0, totalVendas: 0, entradas: 0, diferenca: 0 };

  for (const p of postos) {
    for (const l of [...p.linhas, p.total]) {
      aoa.push([
        p.posto,
        l === p.total ? "Total do posto" : l.adquirente,
        l.debito,
        l.credito,
        l.pix,
        l.totalVendas,
        l.entradas,
        l.diferenca,
        l.totalVendas === 0 ? "" : l.entradas / l.totalVendas,
      ]);
    }
    aoa.push([
      p.posto,
      "Períodos",
      `Vendas ref. ${formatarPeriodoReferencia(p.vendasDe, p.vendasAte)} · Extratos ref. ${formatarPeriodoReferencia(p.extratosDe, p.extratosAte)}`,
    ]);
    totais.debito += p.total.debito;
    totais.credito += p.total.credito;
    totais.pix += p.total.pix;
    totais.totalVendas += p.total.totalVendas;
    totais.entradas += p.total.entradas;
    totais.diferenca += p.total.diferenca;
  }
  if (postos.length > 1) {
    aoa.push([
      "",
      "Total geral",
      totais.debito,
      totais.credito,
      totais.pix,
      totais.totalVendas,
      totais.entradas,
      totais.diferenca,
      totais.totalVendas === 0 ? "" : totais.entradas / totais.totalVendas,
    ]);
  }

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];
  for (let r = 2; r < aoa.length; r++) {
    for (const c of [2, 3, 4, 5, 6, 7]) {
      const celula = planilha[XLSX.utils.encode_cell({ r, c })];
      if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
    }
    const pct = planilha[XLSX.utils.encode_cell({ r, c: 8 })];
    if (pct && pct.t === "n") pct.z = "0.0%";
  }
  planilha["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 16 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Resumo mensal");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="resumo-mensal-cartoes-${mes}.xlsx"`,
    },
  });
}
