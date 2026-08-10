import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// .xlsx de verdade (não CSV) — mesmo motivo do exportar de Fechamento: guarda
// o valor numérico real, sem depender da configuração regional do Excel pra
// decidir se vírgula é decimal ou milhar.
const FORMATO_MOEDA = "#,##0.00;-#,##0.00";

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function paraDataPlanilha(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "";
}

export async function GET(request: NextRequest) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "visualizar");

  const params = request.nextUrl.searchParams;
  const postoId = params.get("postoId");
  const de = params.get("de");
  const ate = params.get("ate");

  const contas = await prisma.contaAPagar.findMany({
    where: {
      combustivel: true,
      paga: false,
      ...(postoId ? { postoId } : {}),
      ...(de || ate
        ? {
            dataVencimento: {
              ...(de ? { gte: dataUTC(de) } : {}),
              ...(ate ? { lte: dataUTC(ate) } : {}),
            },
          }
        : {}),
    },
    include: { posto: true, fornecedor: true },
    orderBy: { dataVencimento: "asc" },
  });

  const cabecalho = ["Vencimento", "Descarga", "Posto", "Fornecedor", "Observação", "Valor"];
  const linhas = contas.map((c) => [
    paraDataPlanilha(c.dataVencimento),
    paraDataPlanilha(c.dataDescarga),
    c.posto.nome,
    c.fornecedor.nome,
    c.descricao ?? "",
    Number(c.valor),
  ]);
  const total = contas.reduce((soma, c) => soma + Number(c.valor), 0);
  const linhaTotal = ["", "", "", "", "Total", total];

  const titulo = "COMBUSTÍVEIS A PAGAR";
  const aoa: (string | number)[][] = [[titulo], cabecalho, ...linhas, linhaTotal];

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];

  const colunaValor = cabecalho.length - 1;
  for (let r = 2; r < aoa.length; r++) {
    const endereco = XLSX.utils.encode_cell({ r, c: colunaValor });
    const celula = planilha[endereco];
    if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
  }

  planilha["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 30 }, { wch: 30 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Combustíveis a Pagar");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="combustiveis-a-pagar.xlsx"`,
    },
  });
}
