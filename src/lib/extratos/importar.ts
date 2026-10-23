import "server-only";
import { prisma } from "@/lib/prisma";
import { parseOfx, lerSaldoOfx } from "./parsers/ofx";
import { sugerirCategoria } from "./categorizer";
import { normalizarCodigoBanco } from "./bancos";

export type { CodigoParser } from "./bancos";
export { normalizarCodigoBanco } from "./bancos";

export type ResultadoArquivo = {
  arquivo: string;
  status: "ok" | "erro";
  gravados?: number;
  duplicados?: number;
  foraDoPeriodo?: number;
  deHoje?: number; // lançamentos do dia de hoje (dia ainda aberto) — não são importados
  repetidasNoArquivo?: number; // a mesma transação veio 2x no próprio arquivo (exportação duplicada do banco)
  mensagem?: string;
};

// Data de hoje no Brasil (meia-noite UTC dessa data) — o servidor roda em UTC, e depois das
// 21h o "hoje" UTC já seria amanhã.
function hojeNoBrasil(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${iso}T00:00:00.000Z`);
}

export async function importarExtratos(params: {
  postoId: string;
  bancoId: string;
  arquivos: { nome: string; buffer: Buffer }[];
  usuarioId: string;
  // Identifica esta rodada de importação (ver LancamentoExtrato.importacaoId) — é o que
  // deixa "Cancelar importação" desfazer só o que ela inseriu.
  importacaoId?: string;
  // Opcional: alguns bancos devolvem um período diferente do que foi pedido
  // na hora de baixar o extrato (ex: filtrar por um dia e vir vários) — em
  // vez de importar tudo que veio no arquivo, restringe só ao período que a
  // usuária realmente quer conciliar agora. O resto do arquivo fica de fora
  // (não é gravado nem contado como erro), pra importar depois se precisar.
  de?: Date;
  ate?: Date;
}): Promise<ResultadoArquivo[]> {
  const { postoId, bancoId, arquivos, usuarioId, importacaoId, de, ate } = params;

  const banco = await prisma.banco.findUnique({ where: { id: bancoId } });
  if (!banco) {
    return arquivos.map((a) => ({
      arquivo: a.nome,
      status: "erro" as const,
      mensagem: "Banco não encontrado.",
    }));
  }

  // Sem regra de categorização conhecida pra esse banco (ex: recém
  // cadastrado) não impede a importação — só deixa tudo "sem categoria"
  // pra revisão manual. A leitura do arquivo em si (OFX) é a mesma pra
  // qualquer banco.
  const codigo = normalizarCodigoBanco(banco.codigoArquivo);

  const categorias = await prisma.categoriaExtrato.findMany();
  const categoriaPorNome = new Map(categorias.map((c) => [c.nome.toLowerCase(), c]));

  const resultados: ResultadoArquivo[] = [];
  for (const arq of arquivos) {
    try {
      const lancamentos = await parseOfx(arq.buffer, arq.nome);
      // Arquivo exportado em duplicidade pelo banco (visto no Sul América, 15–16/10/2026): a MESMA
      // transação aparece duas vezes, com FITID diferente mas o mesmo número de documento
      // (CHECKNUM). Transação real repetida (dois PIX iguais no dia) tem documento diferente —
      // conferido em todos os extratos do Bradesco. Tarifa e rendimento usam número de lote, que
      // repete de verdade, então ficam de fora dessa regra.
      const vistosPorDocumento = new Set<string>();
      let repetidasNoArquivo = 0;
      const semLinhaControle = lancamentos.filter((l) => {
        if (l.linhaControle) return false;
        if (!l.documento || /^(TARIFA|RENTAB)/i.test(l.descricao)) return true;
        const k = `${l.data.toISOString()}|${l.descricao}|${l.valor.toFixed(2)}|${l.documento}`;
        if (vistosPorDocumento.has(k)) {
          repetidasNoArquivo++;
          return false;
        }
        vistosPorDocumento.add(k);
        return true;
      });

      // Saldo do banco informado no arquivo: guarda pra conferir o extrato e achar o saldo inicial do mês.
      // O arquivo pode ter sido gerado com lançamentos de hoje (dia aberto, que o sistema não importa),
      // então o saldo é levado pro FIM do último dia fechado: tira do saldo as linhas posteriores a esse dia.
      const saldoArquivo = lerSaldoOfx(arq.buffer);
      if (saldoArquivo) {
        const ontem = new Date(hojeNoBrasil());
        ontem.setUTCDate(ontem.getUTCDate() - 1);
        const ultimaLinha = semLinhaControle.reduce((m, l) => (l.data > m ? l.data : m), semLinhaControle[0]?.data ?? ontem);
        const dataRefSaldo = saldoArquivo.data ?? ultimaLinha;
        const dataSaldo = dataRefSaldo < ontem ? dataRefSaldo : ontem;
        const depoisDoCorte = semLinhaControle.filter((l) => l.data > dataSaldo).reduce((s, l) => s + l.valor, 0);
        const saldoNaData = Math.round((saldoArquivo.saldo - depoisDoCorte) * 100) / 100;
        await prisma.saldoBancario.upsert({
          where: { postoId_bancoId_data: { postoId, bancoId, data: dataSaldo } },
          create: { postoId, bancoId, data: dataSaldo, saldo: saldoNaData.toFixed(2), arquivoOrigem: arq.nome },
          update: { saldo: saldoNaData.toFixed(2), arquivoOrigem: arq.nome },
        });
      }

      if (semLinhaControle.length === 0) {
        resultados.push({
          arquivo: arq.nome,
          status: "ok",
          gravados: 0,
          duplicados: 0,
          mensagem: "Nenhum lançamento encontrado — confira se é mesmo um arquivo OFX válido.",
        });
        continue;
      }

      const dentroDoPeriodo = (data: Date) => (!de || data >= de) && (!ate || data <= ate);
      // Dia de hoje fica de fora (pedido da usuária, 16/10/2026): o extrato do dia ainda está aberto,
      // então importar agora traria um dia pela metade. Amanhã o arquivo completo entra.
      const hoje = hojeNoBrasil();
      const deHoje = semLinhaControle.filter((l) => l.data >= hoje).length;
      const validos = semLinhaControle.filter((l) => l.data < hoje && dentroDoPeriodo(l.data));
      const foraDoPeriodo = semLinhaControle.length - validos.length - deHoje;

      if (validos.length === 0) {
        resultados.push({
          arquivo: arq.nome,
          status: "ok",
          gravados: 0,
          duplicados: 0,
          foraDoPeriodo,
          deHoje,
          mensagem: deHoje > 0 && foraDoPeriodo === 0 ? "Só há lançamentos de hoje (dia ainda aberto) — nada importado." : "Nenhum lançamento do arquivo cai no período selecionado.",
        });
        continue;
      }

      const linhas = validos.map((l) => {
        const sugestao = codigo ? sugerirCategoria(codigo, l.descricao) : null;
        const categoria = sugestao ? categoriaPorNome.get(sugestao.categoriaNome.toLowerCase()) : undefined;
        return {
          postoId,
          bancoId,
          data: l.data,
          descricao: l.descricao,
          valor: l.valor.toFixed(2),
          saldoExtrato: l.saldoExtrato !== null ? l.saldoExtrato.toFixed(2) : null,
          fitid: l.fitid ?? null,
          categoriaId: categoria?.id ?? null,
          tipoAdquirente: sugestao?.tipoAdquirente ?? null,
          observacao: null,
          arquivoOrigem: arq.nome,
          importacaoId: importacaoId ?? null,
          importadoPorId: usuarioId,
        };
      });

      // Linhas com FITID: a constraint (bancoId,fitid) no banco cuida da
      // dedup sozinha (skipDuplicates abaixo) — é o identificador confiável
      // dado pelo próprio banco, então duas linhas com FITIDs diferentes são
      // sempre transações diferentes, mesmo com data/descrição/valor iguais
      // (ex: três tarifas de mesmo valor no mesmo dia).
      //
      // Exceção: o extrato PJ do Santander gera o FITID a partir da conta +
      // hora do DOWNLOAD (ex: "0733130035544202609220958140"), não um id
      // fixo da transação — dois exports do mesmo período saem com FITIDs
      // diferentes pra tudo. Confiar nele criava duplicata toda vez que um
      // período já importado era baixado de novo (visto na prática:
      // 37 lançamentos duplicados, R$15.870,64 só de GETNET/PIX). Pra esse
      // banco, cai no mesmo fallback de "sem FITID confiável" abaixo mesmo
      // quando o campo vem preenchido.
      //
      // Mesmo problema achado no Bradesco em 30/09/2026: Cantareira (28/09)
      // e Sul América (25/09) tiveram o mesmo dia importado duas vezes, de
      // dois arquivos .OFX diferentes, cada um com FITID diferente pra a
      // MESMA transação real — 110 lançamentos duplicados, R$423.229,28.
      //
      // Linhas sem FITID confiável: o fallback é comparar
      // (posto,banco,data,descrição,valor) — só entre ELAS MESMAS, contra o
      // que já existe no banco E dentro do próprio lote sendo importado.
      const fitidNaoConfiavel = codigo === "SANTANDER" || codigo === "BRADESCO";
      const semFitidConfiavel = linhas.filter((l) => l.fitid === null || fitidNaoConfiavel);
      const chaveSemFitid = (l: { postoId: string; bancoId: string; data: Date; descricao: string; valor: string }) =>
        `${l.postoId}|${l.bancoId}|${l.data.toISOString()}|${l.descricao}|${l.valor}`;

      let linhasParaGravar = linhas;
      if (semFitidConfiavel.length > 0) {
        const existentes = await prisma.lancamentoExtrato.findMany({
          where: {
            OR: semFitidConfiavel.map((l) => ({
              postoId: l.postoId,
              bancoId: l.bancoId,
              data: l.data,
              descricao: l.descricao,
              valor: l.valor,
            })),
          },
          select: { postoId: true, bancoId: true, data: true, descricao: true, valor: true },
        });
        // O valor do banco volta como Decimal (toString() tira os zeros: "127000.00"
        // vira "127000") — por isso a chave usa toFixed(2) dos dois lados; sem isso,
        // todo valor redondo (R$ 100,00, R$ 344,40) nunca batia e a reimportação de
        // um dia já importado duplicava essas linhas.
        //
        // Conta ocorrências, não só "já existe": duas saídas idênticas no MESMO
        // dia (ex: dois honorários de R$ 344,40) são lançamentos reais e vêm
        // as duas no mesmo arquivo — descartar a repetida do próprio arquivo
        // sumia com um deles (caso Oliveira/Bradesco 02/10). Duplicata de
        // verdade é o mesmo dia vindo de OUTRO arquivo/exportação: aí o banco
        // já tem N ocorrências, e só entra o que passar disso (arquivo com 2
        // e banco com 1 → entra 1; arquivo com 2 e banco com 2 → entra 0).
        const jaNoBanco = new Map<string, number>();
        for (const e of existentes) {
          const k = chaveSemFitid({ ...e, valor: Number(e.valor).toFixed(2) });
          jaNoBanco.set(k, (jaNoBanco.get(k) ?? 0) + 1);
        }
        const vistosNoArquivo = new Map<string, number>();
        const duplicadas = new Set(
          semFitidConfiavel.filter((l) => {
            const k = chaveSemFitid(l);
            const n = (vistosNoArquivo.get(k) ?? 0) + 1;
            vistosNoArquivo.set(k, n);
            return n <= (jaNoBanco.get(k) ?? 0);
          })
        );
        linhasParaGravar = linhas.filter((l) => (l.fitid !== null && !fitidNaoConfiavel) || !duplicadas.has(l));
      }

      const gravado = await prisma.lancamentoExtrato.createMany({
        data: linhasParaGravar,
        skipDuplicates: true,
      });

      resultados.push({
        arquivo: arq.nome,
        status: "ok",
        gravados: gravado.count,
        duplicados: linhas.length - gravado.count,
        foraDoPeriodo,
        deHoje,
        repetidasNoArquivo,
      });
    } catch (err) {
      resultados.push({
        arquivo: arq.nome,
        status: "erro",
        mensagem: err instanceof Error ? err.message : "Erro desconhecido ao processar o arquivo.",
      });
    }
  }

  return resultados;
}
