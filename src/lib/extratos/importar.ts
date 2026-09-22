import "server-only";
import { prisma } from "@/lib/prisma";
import { parseOfx } from "./parsers/ofx";
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
  mensagem?: string;
};

export async function importarExtratos(params: {
  postoId: string;
  bancoId: string;
  arquivos: { nome: string; buffer: Buffer }[];
  usuarioId: string;
  // Opcional: alguns bancos devolvem um período diferente do que foi pedido
  // na hora de baixar o extrato (ex: filtrar por um dia e vir vários) — em
  // vez de importar tudo que veio no arquivo, restringe só ao período que a
  // usuária realmente quer conciliar agora. O resto do arquivo fica de fora
  // (não é gravado nem contado como erro), pra importar depois se precisar.
  de?: Date;
  ate?: Date;
}): Promise<ResultadoArquivo[]> {
  const { postoId, bancoId, arquivos, usuarioId, de, ate } = params;

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
      const semLinhaControle = lancamentos.filter((l) => !l.linhaControle);

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
      const validos = semLinhaControle.filter((l) => dentroDoPeriodo(l.data));
      const foraDoPeriodo = semLinhaControle.length - validos.length;

      if (validos.length === 0) {
        resultados.push({
          arquivo: arq.nome,
          status: "ok",
          gravados: 0,
          duplicados: 0,
          foraDoPeriodo,
          mensagem: "Nenhum lançamento do arquivo cai no período selecionado.",
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
      // Linhas sem FITID confiável: o fallback é comparar
      // (posto,banco,data,descrição,valor) — só entre ELAS MESMAS, contra o
      // que já existe no banco E dentro do próprio lote sendo importado.
      const fitidNaoConfiavel = codigo === "SANTANDER";
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
        const jaExistem = new Set(existentes.map((e) => chaveSemFitid({ ...e, valor: e.valor.toString() })));
        const vistosNoLote = new Set<string>();
        const duplicadas = new Set(
          semFitidConfiavel.filter((l) => {
            const k = chaveSemFitid(l);
            if (jaExistem.has(k) || vistosNoLote.has(k)) return true;
            vistosNoLote.add(k);
            return false;
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
