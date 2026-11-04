import ExcelJS from "exceljs";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Modelo da planilha de Vendas a Prazo: aba "Vendas a Prazo" (onde a assistente preenche, com lista suspensa de
// posto), aba "Listas" (de onde a lista vem) e aba "Como preencher".
export async function GET() {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");

  const [postos, clientes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { nome: true } }),
    prisma.vendaAPrazo.findMany({ distinct: ["cliente"], select: { cliente: true }, orderBy: { cliente: "asc" } }),
  ]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Vendas a Prazo");
  const listas = wb.addWorksheet("Listas");
  const ajuda = wb.addWorksheet("Como preencher");

  ws.columns = [
    { header: "POSTO", key: "posto", width: 22 },
    { header: "CLIENTE", key: "cliente", width: 40 },
    { header: "PERÍODO DE", key: "de", width: 14 },
    { header: "PERÍODO ATÉ", key: "ate", width: 14 },
    { header: "VALOR TOTAL", key: "valor", width: 16 },
    { header: "DATA DE PAGAMENTO", key: "pagamento", width: 20 },
    { header: "OBSERVAÇÃO", key: "observacao", width: 40 },
  ];
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  listas.getCell("A1").value = "POSTOS";
  listas.getCell("B1").value = "CLIENTES JÁ LANÇADOS";
  for (const c of ["A1", "B1"]) listas.getCell(c).font = { bold: true, name: "Arial", size: 10 };
  postos.forEach((p, i) => (listas.getCell(i + 2, 1).value = p.nome));
  clientes.forEach((c, i) => (listas.getCell(i + 2, 2).value = c.cliente));
  listas.getColumn(1).width = 26;
  listas.getColumn(2).width = 50;

  const LINHAS = 500;
  for (let r = 2; r <= LINHAS + 1; r++) {
    ws.getCell(r, 1).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`Listas!$A$2:$A$${Math.max(2, postos.length + 1)}`] };
    ws.getCell(r, 3).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 4).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 5).numFmt = "#,##0.00";
    ws.getCell(r, 6).numFmt = "dd/mm/yyyy";
  }

  const texto = [
    "COMO PREENCHER",
    "",
    "Uma linha por venda a prazo (um pagamento esperado de um cliente). Todos os postos podem ficar na mesma planilha.",
    "POSTO: o posto que vendeu (e em cujo extrato o pagamento vai cair).",
    "CLIENTE: o nome do cliente, sempre escrito do mesmo jeito.",
    "PERÍODO DE / PERÍODO ATÉ: primeiro e último dia dos abastecimentos que esse pagamento cobre (dd/mm/aaaa).",
    "VALOR TOTAL: o valor que o cliente vai pagar, só o número (ex: 12500 ou 12.500,00).",
    "DATA DE PAGAMENTO: o dia combinado de pagamento (dd/mm/aaaa).",
    "OBSERVAÇÃO (opcional): texto livre.",
    "",
    "Se preferir uma coluna só para o período, pode usar PERÍODO com o texto  01/10/2026 a 15/10/2026  no lugar de PERÍODO DE e PERÍODO ATÉ.",
    "",
    "O sistema mostra o que entendeu antes de gravar, avisa o que já está lançado e só grava o que você confirmar. Depois, cada",
    "venda é ligada sozinha ao crédito do extrato quando o valor bate e só existe um candidato perto da data de pagamento.",
    "",
    "Exemplo de linha:  CANTAREIRA | TRANSPORTADORA EXEMPLO LTDA | 01/10/2026 | 15/10/2026 | 12500,00 | 25/11/2026 | frota do mês",
  ];
  texto.forEach((t, i) => {
    const c = ajuda.getCell(i + 1, 1);
    c.value = t;
    c.font = { name: "Arial", size: 10, bold: i === 0 };
  });
  ajuda.getColumn(1).width = 130;

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-vendas-a-prazo.xlsx"',
    },
  });
}
