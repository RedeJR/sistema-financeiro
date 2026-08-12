import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { gerarFechamento, MESES_PT } from "@/lib/extratos/fechamento";

// Gera um .xlsx de verdade (não CSV) — o CSV anterior guardava os valores
// como texto "1234,56" (vírgula decimal), e o Excel decide sozinho, pela
// configuração regional do Windows, se lê vírgula como decimal ou como
// separador de milhar. Numa máquina configurada em padrão americano
// (decimal = ponto), "56945,98" vira o inteiro 5694598 — exatamente o
// problema relatado. Um .xlsx de verdade guarda o VALOR numérico real, sem
// depender de configuração regional nenhuma pra interpretar o número certo.
const FORMATO_MOEDA = "#,##0.00;-#,##0.00";

export async function GET(request: NextRequest) {
  await exigirPermissao("EXTRATOS", "visualizar");

  const params = request.nextUrl.searchParams;
  const postoId = params.get("postoId");
  const bancoId = params.get("bancoId");
  const mes = params.get("mes"); // "YYYY-MM"
  // Vem de page.tsx já como número puro (String(57506.24) -> "57506.24"), não
  // como texto digitado pela usuária ("57.506,24"). Rodar isso de novo pelo
  // paraDecimalString (que assume formato BR: ponto=milhar, vírgula=decimal)
  // tratava o único ponto decimal como separador de milhar e removia ele —
  // "57506.24" virava 5750624, 100x maior. Bug antigo (já existia na versão
  // CSV), só ficava invisível enquanto o saldo inicial usado era 0.
  const saldoInicialNum = Number(params.get("saldoInicial") ?? "0");

  if (!postoId || !bancoId || !mes) {
    return new Response("Escolha um posto, um banco e um mês.", { status: 400 });
  }
  const [anoStr, mesStr] = mes.split("-");
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);

  const resultado = await gerarFechamento({ postoId, bancoId, ano, mes: mesNum, saldoInicial: saldoInicialNum });

  const cabecalho = ["Dia", ...resultado.categorias.map((c) => c.nome), "Saldo"];
  // Célula vazia em vez de 0 — mais fácil de ler numa planilha com muitas
  // colunas de categoria, igual o CSV anterior já fazia.
  const numOuVazio = (v: number) => (Math.round(v * 100) === 0 ? "" : v);

  const linhas = resultado.linhas.map((l) => [l.dia, ...l.porCategoria.map(numOuVazio), numOuVazio(l.saldoAcumulado)]);
  const linhaTotal = ["Total", ...resultado.totalPorCategoria.map(numOuVazio), numOuVazio(resultado.saldoFinal)];

  const titulo = `FECHAMENTO - ${MESES_PT[resultado.mes]}/${resultado.ano} - ${resultado.postoNome} - ${resultado.bancoNome}`;
  const aoa: (string | number)[][] = [[titulo], cabecalho, ...linhas, linhaTotal];

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];

  // Aplica o formato de moeda só nas células numéricas (linhas de dados +
  // total, colunas de categoria + saldo — pula a coluna "Dia" e a linha de
  // título/cabeçalho).
  const primeiraLinhaDados = 2; // 0=título, 1=cabeçalho
  const ultimaLinha = aoa.length - 1;
  for (let r = primeiraLinhaDados; r <= ultimaLinha; r++) {
    for (let c = 1; c < cabecalho.length; c++) {
      const endereco = XLSX.utils.encode_cell({ r, c });
      const celula = planilha[endereco];
      if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
    }
  }

  planilha["!cols"] = [{ wch: 6 }, ...cabecalho.slice(1).map(() => ({ wch: 14 }))];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Fechamento");

  // Uma aba por categoria detalhada (Outros, Venda a Prazo — ver DETALHE_NOME
  // em fechamento.ts) com data/valor/observação lançamento a lançamento,
  // pedido da usuária pra não precisar abrir a Conciliação de Extratos só
  // pra ver de onde veio cada valor dessas colunas.
  for (const { categoriaNome, linhas: linhasDetalhe } of resultado.detalhes) {
    const cabecalhoDetalhe = ["Dia", "Data", "Valor", "Observação", "Descrição (extrato)"];
    const linhasAoa = linhasDetalhe.map((l) => [
      l.dia,
      l.data.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
      l.valor,
      l.observacao,
      l.descricaoBanco,
    ]);
    const totalDetalhe = linhasDetalhe.reduce((s, l) => s + l.valor, 0);
    const tituloDetalhe = `${categoriaNome} - ${MESES_PT[resultado.mes]}/${resultado.ano} - ${resultado.postoNome} - ${resultado.bancoNome}`;
    const aoaDetalhe: (string | number)[][] = [
      [tituloDetalhe],
      cabecalhoDetalhe,
      ...linhasAoa,
      ["", "Total", numOuVazio(totalDetalhe), "", ""],
    ];
    const planilhaDetalhe = XLSX.utils.aoa_to_sheet(aoaDetalhe);
    planilhaDetalhe["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalhoDetalhe.length - 1 } }];
    for (let r = 2; r < aoaDetalhe.length; r++) {
      const endereco = XLSX.utils.encode_cell({ r, c: 2 }); // coluna Valor
      const celula = planilhaDetalhe[endereco];
      if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
    }
    planilhaDetalhe["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 50 }, { wch: 50 }];
    // Nome de aba do Excel: máx. 31 caracteres, sem / \ ? * [ ].
    const nomeAba = categoriaNome.slice(0, 31).replace(/[/\\?*[\]]/g, "-");
    XLSX.utils.book_append_sheet(workbook, planilhaDetalhe, nomeAba);
  }

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const nomeArquivo = `fechamento-${resultado.postoNome}-${resultado.bancoNome}-${resultado.ano}-${String(resultado.mes).padStart(2, "0")}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
