import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buscarRelatorioCaixa } from "@/lib/cartoes/relatorio";

const FORMATO_MOEDA = "#,##0.00;-#,##0.00";

// datetime-local ("AAAA-MM-DDTHH:MM") tratado como UTC direto — mesmo
// padrão da tela de Relatório de Caixa.
function paraDatetimeUTC(valor: string): Date {
  return new Date(`${valor}:00.000Z`);
}

function formatarDataHora(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "UTC" });
}

export async function GET(request: NextRequest) {
  await exigirPermissao("CONFERENCIA_CAIXA", "visualizar");

  const params = request.nextUrl.searchParams;
  const postoId = params.get("postoId");
  const inicioParam = params.get("inicio");
  const fimParam = params.get("fim");

  if (!postoId || !inicioParam || !fimParam) {
    return new Response("Escolha um posto e o período do turno.", { status: 400 });
  }

  const inicio = paraDatetimeUTC(inicioParam);
  const fim = paraDatetimeUTC(fimParam);

  const [posto, relatorio] = await Promise.all([
    prisma.posto.findUnique({ where: { id: postoId } }),
    buscarRelatorioCaixa({ postoId, inicio, fim }),
  ]);
  if (!posto) {
    return new Response("Posto não encontrado.", { status: 404 });
  }

  // Registra que esse relatório foi baixado, pra aparecer na aba
  // Conferência pra "as meninas" marcarem se bateu com o caixa físico —
  // baixar de novo o mesmo turno só atualiza o valor/data, sem mexer no
  // status já marcado.
  await prisma.conferenciaCaixa.upsert({
    where: { postoId_inicio_fim: { postoId, inicio, fim } },
    create: { postoId, inicio, fim, valorTotal: relatorio.totalBruto },
    update: { valorTotal: relatorio.totalBruto },
  });

  const titulo = `RELATÓRIO DE CAIXA - ${posto.nome} - ${formatarDataHora(inicio)} a ${formatarDataHora(fim)}`;

  const cabecalhoResumo = ["Adquirente", "Qtd", "Valor bruto", "Taxa", "Valor líquido"];
  const aoaResumo: (string | number)[][] = [
    [titulo],
    cabecalhoResumo,
    ...relatorio.resumo.map((r) => [r.adquirente, r.qtd, r.totalBruto, r.totalTaxa, r.totalLiquido]),
    ["Total geral", relatorio.linhas.length, relatorio.totalBruto, "", ""],
  ];
  const planilhaResumo = XLSX.utils.aoa_to_sheet(aoaResumo);
  planilhaResumo["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalhoResumo.length - 1 } }];
  for (let r = 2; r < aoaResumo.length; r++) {
    for (const c of [2, 3, 4]) {
      const celula = planilhaResumo[XLSX.utils.encode_cell({ r, c })];
      if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
    }
  }
  planilhaResumo["!cols"] = [{ wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  const cabecalhoDetalhe = ["Data", "Hora", "Adquirente", "Modalidade", "Valor bruto"];
  const aoaDetalhe: (string | number)[][] = [
    [titulo],
    cabecalhoDetalhe,
    ...relatorio.linhas.map((l) => [
      l.dataVenda.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
      l.horaVenda || "—",
      l.adquirente,
      l.tipoVenda,
      l.valorBruto,
    ]),
  ];
  const planilhaDetalhe = XLSX.utils.aoa_to_sheet(aoaDetalhe);
  planilhaDetalhe["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalhoDetalhe.length - 1 } }];
  for (let r = 2; r < aoaDetalhe.length; r++) {
    const celula = planilhaDetalhe[XLSX.utils.encode_cell({ r, c: 4 })];
    if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
  }
  planilhaDetalhe["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 20 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilhaResumo, "Resumo");
  XLSX.utils.book_append_sheet(workbook, planilhaDetalhe, "Detalhamento");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nomeArquivo = `relatorio-caixa-${posto.nome}-${inicioParam.replace(/[:T]/g, "-")}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
