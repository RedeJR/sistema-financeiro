import "server-only";
import { prisma } from "@/lib/prisma";
import { PARSERS, detectarAdquirente } from "./parsers";
import { encontrarPostoPorCnpj, encontrarPostoPorFragmento } from "./postos";
import type { ArquivoEntrada } from "./tipos";

export type ResultadoArquivoCartao = {
  arquivo: string;
  status: "ok" | "erro";
  adquirente?: string;
  gravados?: number;
  duplicados?: number;
  mensagem?: string;
};

export async function importarTransacoesCartao(params: {
  postoId: string;
  arquivos: ArquivoEntrada[];
}): Promise<ResultadoArquivoCartao[]> {
  const { postoId, arquivos } = params;

  const posto = await prisma.posto.findUnique({ where: { id: postoId } });
  if (!posto) {
    return arquivos.map((a) => ({ arquivo: a.nome, status: "erro" as const, mensagem: "Posto não encontrado." }));
  }

  const todosPostos = await prisma.posto.findMany({ select: { id: true, nome: true, cnpj: true } });

  const resultados: ResultadoArquivoCartao[] = [];

  for (const arq of arquivos) {
    const chave = await detectarAdquirente(arq);
    if (!chave) {
      resultados.push({
        arquivo: arq.nome,
        status: "erro",
        mensagem:
          "Não reconheci a adquirente — nem pelo nome do arquivo, nem pelas colunas dele. Renomeie incluindo o nome da adquirente (ex: BARRAMARES_CIELO.csv).",
      });
      continue;
    }
    const definicao = PARSERS[chave];

    try {
      const linhas = await definicao.parse(arq);

      if (linhas.length === 0) {
        resultados.push({
          arquivo: arq.nome,
          status: "ok",
          adquirente: definicao.nomeExibicao,
          gravados: 0,
          duplicados: 0,
          mensagem: "Nenhuma venda aprovada encontrada no arquivo.",
        });
        continue;
      }

      const adquirente = await prisma.adquirenteCartao.upsert({
        where: { nome: definicao.nomeExibicao },
        update: {},
        create: { nome: definicao.nomeExibicao },
      });

      let semPostoReconhecido = 0;
      const dados: {
        postoId: string;
        adquirenteId: string;
        dataVenda: Date;
        horaVenda: string;
        tipoVenda: string;
        valorBruto: string;
        taxaRs: string | null;
        valorLiquido: string | null;
        dataPagamento: Date | null;
        identificadorExterno: string | null;
        arquivoOrigem: string;
      }[] = [];

      for (const l of linhas) {
        let postoIdLinha = postoId;
        if (definicao.multiPosto === "cnpj") {
          const encontrado = l.postoCnpjSugerido ? encontrarPostoPorCnpj(todosPostos, l.postoCnpjSugerido) : null;
          if (!encontrado) {
            semPostoReconhecido++;
            continue;
          }
          postoIdLinha = encontrado.id;
        } else if (definicao.multiPosto === "nome") {
          const encontrado = l.postoTextoLivreSugerido
            ? encontrarPostoPorFragmento(todosPostos, l.postoTextoLivreSugerido)
            : null;
          if (!encontrado) {
            semPostoReconhecido++;
            continue;
          }
          postoIdLinha = encontrado.id;
        }
        dados.push({
          postoId: postoIdLinha,
          adquirenteId: adquirente.id,
          dataVenda: l.dataVenda,
          horaVenda: l.horaVenda,
          tipoVenda: l.tipoVenda,
          valorBruto: l.valorBruto,
          taxaRs: l.taxaRs,
          valorLiquido: l.valorLiquido,
          dataPagamento: l.dataPagamento,
          identificadorExterno: l.identificadorExterno,
          arquivoOrigem: arq.nome,
        });
      }

      // Linhas COM identificador: a constraint (posto,adquirente,identificador)
      // no banco cuida da dedupe sozinha (skipDuplicates abaixo) — é o dado
      // confiável que a própria adquirente manda, então duas linhas com
      // identificadores diferentes são sempre vendas diferentes, mesmo com
      // data/hora/valor/tipo iguais (duas vendas de R$50 no mesmo minuto).
      //
      // Linhas SEM identificador (nenhum parser atual deixa isso acontecer,
      // mas o campo é opcional pra adquirente futura sem um): sem dado
      // confiável, o fallback é comparar (posto,adquirente,data,hora,valor,
      // tipo) — só entre ELAS MESMAS, contra o que já existe no banco E
      // dentro do próprio lote sendo importado. Não pode virar uma segunda
      // constraint única no banco: bloquearia duas vendas DIFERENTES (com
      // identificador único cada) que coincidissem nesses quatro campos —
      // já aconteceu de verdade num teste com um arquivo real.
      const semIdentificador = dados.filter((d) => d.identificadorExterno === null);
      const chaveSemIdentificador = (d: {
        postoId: string;
        adquirenteId: string;
        dataVenda: Date;
        horaVenda: string;
        valorBruto: string;
        tipoVenda: string;
      }) => `${d.postoId}|${d.adquirenteId}|${d.dataVenda.toISOString()}|${d.horaVenda}|${d.valorBruto}|${d.tipoVenda}`;

      let dadosParaGravar = dados;
      if (semIdentificador.length > 0) {
        const existentes = await prisma.transacaoCartao.findMany({
          where: {
            identificadorExterno: null,
            OR: semIdentificador.map((d) => ({
              postoId: d.postoId,
              adquirenteId: d.adquirenteId,
              dataVenda: d.dataVenda,
              horaVenda: d.horaVenda,
              valorBruto: d.valorBruto,
              tipoVenda: d.tipoVenda,
            })),
          },
          select: { postoId: true, adquirenteId: true, dataVenda: true, horaVenda: true, valorBruto: true, tipoVenda: true },
        });
        const jaExistem = new Set(existentes.map((e) => chaveSemIdentificador({ ...e, valorBruto: e.valorBruto.toString() })));
        const vistosNoLote = new Set<string>();
        const semIdentificadorDuplicado = new Set(
          semIdentificador.filter((d) => {
            const k = chaveSemIdentificador(d);
            if (jaExistem.has(k) || vistosNoLote.has(k)) return true;
            vistosNoLote.add(k);
            return false;
          })
        );
        dadosParaGravar = dados.filter((d) => d.identificadorExterno !== null || !semIdentificadorDuplicado.has(d));
      }

      const gravado =
        dadosParaGravar.length > 0
          ? await prisma.transacaoCartao.createMany({ data: dadosParaGravar, skipDuplicates: true })
          : { count: 0 };

      const partes: string[] = [];
      if (semPostoReconhecido > 0) partes.push(`${semPostoReconhecido} linha(s) de posto não reconhecido, ignoradas`);

      resultados.push({
        arquivo: arq.nome,
        status: "ok",
        adquirente: definicao.nomeExibicao,
        gravados: gravado.count,
        duplicados: dados.length - gravado.count,
        mensagem: partes.length > 0 ? partes.join(" · ") : undefined,
      });
    } catch (err) {
      resultados.push({
        arquivo: arq.nome,
        status: "erro",
        adquirente: definicao.nomeExibicao,
        mensagem: err instanceof Error ? err.message : "Erro desconhecido ao processar o arquivo.",
      });
    }
  }

  return resultados;
}
