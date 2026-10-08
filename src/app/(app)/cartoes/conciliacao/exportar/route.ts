import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buscarConciliacaoVariosPostos, type AgrupamentoConciliacao, type StatusConciliacao } from "@/lib/cartoes/conciliacao";

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
  let postoIds = params.getAll("postoId").filter(Boolean);
  const inicio = params.get("inicio");
  const fim = params.get("fim");
  const adquirenteIds = params.getAll("adquirenteId");
  const statusFiltro = params.get("status") as StatusConciliacao | null;
  const filtrarPor = params.get("filtrarPor") === "venda" ? "venda" : "pagamento";
  const agruparParam = params.get("agruparPor");
  const agruparPor: AgrupamentoConciliacao = agruparParam === "adquirente" ? agruparParam : "recebimento";

  if (!inicio || !fim) {
    return new Response("Escolha o período.", { status: 400 });
  }
  if (postoIds.length === 0) {
    postoIds = (await prisma.posto.findMany({ where: { ativo: true }, select: { id: true } })).map((p) => p.id);
  }

  const [postosSel, todasLinhas] = await Promise.all([
    prisma.posto.findMany({ where: { id: { in: postoIds } }, orderBy: { nome: "asc" } }),
    buscarConciliacaoVariosPostos({
      postoIds,
      dataInicio: dataUTC(inicio),
      dataFim: dataUTC(fim, true),
      adquirenteIds,
      filtrarPor,
      agruparPor,
    }),
  ]);
  if (postosSel.length === 0) {
    return new Response("Posto não encontrado.", { status: 404 });
  }
  const linhas = statusFiltro ? todasLinhas.filter((l) => l.status === statusFiltro) : todasLinhas;

  const ROTULO_COLUNA_DATA: Record<AgrupamentoConciliacao, string> = {
    recebimento: "Data pagamento",
    adquirente: "Período",
  };

  const titulo = `CONCILIAÇÃO DE CARTÕES - ${postosSel.map((p) => p.nome).join(", ")} - ${inicio} a ${fim}`;
  const cabecalho = [
    "Posto",
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
      l.posto,
      l.data
        ? l.data.split("-").reverse().join("/")
        : `${l.dataLinkDe.split("-").reverse().join("/")} a ${l.dataLinkAte.split("-").reverse().join("/")}`,
      l.adquirente,
      l.fontePrazo === "ARQUIVO" ? "Arquivo" : l.fontePrazo === "MISTO" ? "Arquivo + regra fixa" : "Sistema (regra fixa)",
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
    for (const c of [5, 6, 7, 8]) {
      const celula = planilha[XLSX.utils.encode_cell({ r, c })];
      if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
    }
  }

  planilha["!cols"] = [
    { wch: 18 },
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
  const nomeArquivo = `conciliacao-cartoes-${postosSel.length > 1 ? "varios-postos" : postosSel[0].nome}-${inicio}-a-${fim}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
