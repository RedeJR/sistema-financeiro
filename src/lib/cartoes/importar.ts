import "server-only";
import { prisma } from "@/lib/prisma";
import { PARSERS, detectarAdquirente } from "./parsers";
import { encontrarPostoPorCnpj, encontrarPostoPorFragmento } from "./postos";
import type { ArquivoEntrada } from "./tipos";
import { calcularAjusteAntecipacao } from "./antecipacao";
import { MAQUININHAS_COM_VOUCHER, postoQueJaTemAsMesmasVendas, removerVouchersDuplicadosDasMaquininhas } from "./vouchersDuplicados";

export type ResultadoArquivoCartao = {
  arquivo: string;
  status: "ok" | "erro";
  adquirente?: string;
  gravados?: number;
  duplicados?: number;
  atualizados?: number; // vendas já gravadas que só tinham o valor líquido em branco
  mensagem?: string;
  // Só quando a importação foi pedida por partes (limite): posição da próxima
  // parte, ou null quando o arquivo terminou.
  proximoDeslocamento?: number | null;
};

type DadoTransacao = {
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
};

const TAMANHO_LOTE = 5000;

// Postos que não entram no sistema de cartões — as vendas deles vêm nos
// arquivos de vários postos (ex: Sem Parar) e são descartadas na importação.
const POSTOS_IGNORADOS = ["PHILIPS", "ABU-DHABI", "LISBOA"];

const ADQUIRENTES_LIQUIDO_PELA_TAXA = new Set(["PLUXEE", "VR"]);
const ADQUIRENTES_DE_VOUCHER_DUPLICADO = new Set([...MAQUININHAS_COM_VOUCHER, "VR", "ALELO", "PLUXEE"]);

// Venda que a adquirente mandou ANTES de liquidar (ex: Getnet exportado no
// próprio dia, sem líquido nem taxa) fica gravada com valorLiquido em branco —
// e reimportar o arquivo completo depois não a atualizava, porque a dedupe
// por identificador pula quem já existe. Aqui, pra cada venda com líquido no
// arquivo cuja cópia no banco está sem, preenche líquido/taxa/data de
// pagamento.
async function preencherLiquidoAusente(linhas: DadoTransacao[]): Promise<number> {
  const candidatas = linhas.filter((d) => d.identificadorExterno !== null && d.valorLiquido !== null);
  let atualizados = 0;
  for (let i = 0; i < candidatas.length; i += 2000) {
    const bloco = candidatas.slice(i, i + 2000);
    const existentes = await prisma.transacaoCartao.findMany({
      where: {
        valorLiquido: null,
        adquirenteId: bloco[0].adquirenteId,
        postoId: { in: [...new Set(bloco.map((d) => d.postoId))] },
        identificadorExterno: { in: bloco.map((d) => d.identificadorExterno!) },
      },
      select: { id: true, postoId: true, identificadorExterno: true },
    });
    if (existentes.length === 0) continue;
    const porChave = new Map(bloco.map((d) => [`${d.postoId}|${d.identificadorExterno}`, d]));
    const ids: string[] = [];
    const liquidos: string[] = [];
    const taxas: (string | null)[] = [];
    const pagamentos: (string | null)[] = [];
    for (const e of existentes) {
      const d = porChave.get(`${e.postoId}|${e.identificadorExterno}`);
      if (!d) continue;
      ids.push(e.id);
      liquidos.push(d.valorLiquido!);
      taxas.push(d.taxaRs);
      pagamentos.push(d.dataPagamento ? d.dataPagamento.toISOString().slice(0, 10) : null);
    }
    if (ids.length === 0) continue;
    await prisma.$executeRaw`
      UPDATE transacoes_cartao t
      SET "valorLiquido" = v.liq::numeric,
          "taxaRs" = COALESCE(v.taxa::numeric, t."taxaRs"),
          "dataPagamento" = COALESCE(v.pg::date, t."dataPagamento")
      FROM (
        SELECT unnest(${ids}::text[]) AS id, unnest(${liquidos}::text[]) AS liq,
               unnest(${taxas}::text[]) AS taxa, unnest(${pagamentos}::text[]) AS pg
      ) v
      WHERE t.id = v.id`;
    atualizados += ids.length;
  }
  return atualizados;
}

// `limite` (com `deslocamento`): grava só uma fatia das vendas do arquivo por
// chamada — a tela de upload chama de novo com o proximoDeslocamento devolvido
// até acabar. Arquivo multi-posto grande (Stone, ~35 mil linhas) leva ~30s pra
// gravar, perto demais do limite de 60s da função; em fatias cada chamada fica
// curta e falha de uma não perde o que as anteriores já gravaram.
export async function importarTransacoesCartao(params: {
  postoId: string;
  arquivos: ArquivoEntrada[];
  deslocamento?: number;
  limite?: number;
}): Promise<ResultadoArquivoCartao[]> {
  const { postoId, arquivos, deslocamento = 0, limite } = params;

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
      let postosIgnoradosLinhas = 0;
      const idsPostosIgnorados = new Set(todosPostos.filter((p) => POSTOS_IGNORADOS.includes(p.nome.toUpperCase())).map((p) => p.id));
      const todosDados: DadoTransacao[] = [];

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
        if (definicao.multiPosto !== false && idsPostosIgnorados.has(postoIdLinha)) {
          postosIgnoradosLinhas++;
          continue;
        }
        todosDados.push({
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

      if (definicao.multiPosto === false && deslocamento === 0) {
        const outroPosto = await postoQueJaTemAsMesmasVendas({
          postoId,
          adquirenteId: adquirente.id,
          identificadores: todosDados.map((d) => d.identificadorExterno).filter((i): i is string => i !== null),
        });
        if (outroPosto) {
          resultados.push({
            arquivo: arq.nome,
            status: "erro",
            adquirente: definicao.nomeExibicao,
            mensagem: `Essas vendas já estão importadas no posto ${outroPosto} — parece arquivo de outro posto. Nada foi gravado; confira o posto escolhido na tela.`,
          });
          continue;
        }
      }

      const dados = limite ? todosDados.slice(deslocamento, deslocamento + limite) : todosDados;

      // Relatório de vendas sem líquido (Pluxee, VR): o parser deixa
      // líquido = bruto; aqui aplica a taxa cadastrada pro posto em Taxas de
      // Cartão (campo Débito, único usado por adquirente voucher).
      if (ADQUIRENTES_LIQUIDO_PELA_TAXA.has(definicao.nomeExibicao)) {
        const cadastrosTaxa = await prisma.taxaCartao.findMany({
          where: { adquirenteId: adquirente.id, postoId: { in: [...new Set(dados.map((d) => d.postoId))] } },
          select: { postoId: true, taxaDebito: true },
        });
        const pctPorPosto = new Map(cadastrosTaxa.filter((c) => c.taxaDebito !== null).map((c) => [c.postoId, Number(c.taxaDebito)]));
        for (const d of dados) {
          const pct = pctPorPosto.get(d.postoId);
          if (pct === undefined) continue;
          const taxa = Math.round(Number(d.valorBruto) * pct) / 100;
          d.taxaRs = taxa.toFixed(2);
          d.valorLiquido = (Number(d.valorBruto) - taxa).toFixed(2);
        }
      }

      // Crédito com antecipação automática cadastrada: vale a taxa e o prazo
      // do cadastro, não os do arquivo (ver antecipacao.ts).
      const cadastros = await prisma.taxaCartao.findMany({
        where: { adquirenteId: adquirente.id, antecipacaoAutomatica: true, postoId: { in: [...new Set(dados.map((d) => d.postoId))] } },
      });
      if (cadastros.length > 0) {
        const porPosto = new Map(
          cadastros.map((c) => [
            c.postoId,
            {
              taxaCreditoVista: c.taxaCreditoVista === null ? null : Number(c.taxaCreditoVista),
              prazoCreditoVistaDias: c.prazoCreditoVistaDias,
              taxaCreditoParcelado: c.taxaCreditoParcelado === null ? null : Number(c.taxaCreditoParcelado),
              prazoCreditoParceladoDias: c.prazoCreditoParceladoDias,
              taxaCreditoPrePago: c.taxaCreditoPrePago === null ? null : Number(c.taxaCreditoPrePago),
              prazoCreditoPrePagoDias: c.prazoCreditoPrePagoDias,
            },
          ])
        );
        for (const d of dados) {
          const cadastro = porPosto.get(d.postoId);
          const ajuste = cadastro && calcularAjusteAntecipacao(d, definicao.nomeExibicao, cadastro);
          if (ajuste) Object.assign(d, ajuste);
        }
      }
      const proximoDeslocamento = limite ? (deslocamento + limite < todosDados.length ? deslocamento + limite : null) : undefined;

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

      const atualizados = await preencherLiquidoAusente(dadosParaGravar);

      let gravadosTotal = 0;
      for (let i = 0; i < dadosParaGravar.length; i += TAMANHO_LOTE) {
        const r = await prisma.transacaoCartao.createMany({
          data: dadosParaGravar.slice(i, i + TAMANHO_LOTE),
          skipDuplicates: true,
        });
        gravadosTotal += r.count;
      }
      const gravado = { count: gravadosTotal };

      const partes: string[] = [];
      if (ADQUIRENTES_DE_VOUCHER_DUPLICADO.has(definicao.nomeExibicao)) {
        const removidas = await removerVouchersDuplicadosDasMaquininhas([...new Set(dados.map((d) => d.postoId))]);
        if (removidas > 0) partes.push(`${removidas} venda(s) de voucher da maquininha removida(s) por já constarem no relatório do voucher`);
      }
      if (postosIgnoradosLinhas > 0 && deslocamento === 0) partes.push(`${postosIgnoradosLinhas} linha(s) de posto ignorado (Philips, Abu Dhabi, Lisboa), descartadas`);
      if (semPostoReconhecido > 0 && deslocamento === 0) partes.push(`${semPostoReconhecido} linha(s) de posto não reconhecido, ignoradas`);

      resultados.push({
        arquivo: arq.nome,
        status: "ok",
        adquirente: definicao.nomeExibicao,
        gravados: gravado.count,
        duplicados: dados.length - gravado.count,
        atualizados,
        mensagem: partes.length > 0 ? partes.join(" · ") : undefined,
        proximoDeslocamento,
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
