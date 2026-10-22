import { Fragment } from "react";
import Link from "next/link";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { paraLista, emLista, anexarLista } from "@/lib/filtro-multiplo";
import { SeletorBusca } from "@/components/ui/seletor-busca";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { hojeUTC } from "@/lib/datas";
import { nomeBancoPadraoDoPosto } from "@/lib/banco-padrao-posto";
import { gerarOcorrenciasRecorrentesPendentes } from "@/app/(app)/contas-a-pagar/recorrencia";
import { marcarComoPagas } from "./actions";
import { SelecionarTodos } from "@/components/ui/selecionar-todos";
import { BOTAO_EDITAR, BOTAO_PRIMARIO, CABECALHO_TABELA, CAMPO, CARTAO, ETIQUETA_AZUL, ETIQUETA_VERMELHA, TITULO_PAGINA } from "@/lib/estilo";
import { BotaoVerDescricao, LinhaDescricao } from "@/components/ui/ver-descricao";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { ComentarioHover } from "@/components/ui/comentario-hover";

const FORM_PAGAR = "form-marcar-pagas";

const MENSAGENS_ERRO: Record<string, string> = {
  "nenhuma-selecionada": "Selecione ao menos uma conta antes de marcar como paga.",
  "sem-banco": "Escolha o banco onde foi pago.",
  "sem-banco-previsto":
    "Alguma das contas selecionadas não tem banco previsto — escolha o banco manualmente em \"Pago no banco\".",
  "sem-data": "Informe a data do pagamento.",
};

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function paraDataInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ConferenciaDiariaPage({
  searchParams,
}: {
  searchParams: Promise<{
    postoId?: string | string[];
    fornecedorId?: string;
    planoContaId?: string;
    de?: string;
    ate?: string;
    q?: string;
    erro?: string;
  }>;
}) {
  await exigirPermissao("CONFERENCIA_DIARIA", "visualizar");
  const podeEditar = await podeEditarModulo("CONFERENCIA_DIARIA");

  await gerarOcorrenciasRecorrentesPendentes();

  const { postoId, fornecedorId, planoContaId, de, ate, q, erro } = await searchParams;
  const postoIds = paraLista(postoId);
  const busca = q?.trim();
  const hoje = hojeUTC();

  // "voltarPara" no link Editar: sem isso, editar uma conta daqui (o
  // formulário é compartilhado com Contas a Pagar) voltava pra Contas a
  // Pagar sem filtro nenhum em vez de voltar pra cá, com o filtro que já
  // estava aplicado. Ver contas-a-pagar/actions.ts.
  const qsAtualParams = new URLSearchParams(
    Object.entries({ fornecedorId, planoContaId, de, ate, q: busca }).filter(([, v]) => v) as [string, string][]
  );
  anexarLista(qsAtualParams, "postoId", postoIds);
  const qsAtual = qsAtualParams.toString();
  const urlAtual = `/conferencia-diaria${qsAtual ? `?${qsAtual}` : ""}`;
  const qsVoltarPara = `voltarPara=${encodeURIComponent(urlAtual)}`;
  // Só duas datas: inicial (opcional — sem ela, pega tudo que já venceu até
  // a final) e final (obrigatória na prática, default hoje). Sem "de" e sem
  // mexer em "ate", o resultado é igual ao antigo padrão "hoje + tudo
  // vencido": dataVencimento <= hoje.
  const dataAte = ate ? dataUTC(ate) : hoje;
  const condicaoData = {
    dataVencimento: {
      ...(de ? { gte: dataUTC(de) } : {}),
      lte: dataAte,
    },
  };

  const [contas, postos, fornecedores, grupos, bancos] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: {
        paga: false,
        // Combustível aparece aqui também (pedido da usuária em 29/09/2026):
        // a baixa automática por conciliação com o extrato (ver
        // rodarConciliacaoAutomaticaCombustiveis em conciliacao.ts) continua
        // rodando sozinha por trás, mas ela quer poder marcar como paga na
        // mão junto com o resto, sem depender só do casamento automático.
        ...emLista("postoId", postoIds),
        ...(fornecedorId ? { fornecedorId } : {}),
        ...(planoContaId ? { planoContaId } : {}),
        ...condicaoData,
        // Busca por fornecedor OU descrição — sem risco de colisão de
        // chave aqui, condicaoData não usa "OR" (só "dataVencimento").
        ...(busca
          ? {
              OR: [
                { fornecedor: { nome: { contains: busca, mode: "insensitive" } } },
                { descricao: { contains: busca, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { posto: true, fornecedor: true, bancoPrevisto: true, planoConta: { include: { grupo: true } } },
      orderBy: { dataVencimento: "asc" },
    }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.grupoPlanoConta.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { contas: { where: { ativo: true }, orderBy: { nome: "asc" } } },
    }),
    prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  const total = contas.reduce((soma, c) => soma + Number(c.valor), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className={TITULO_PAGINA}>Conferência Diária</h1>
        <p className="mt-1.5 text-sm text-foreground/60">
          Contas com vencimento até a data final escolhida (inclui tudo que já venceu e ainda não foi pago), a
          partir da data inicial se você preencher.
        </p>
      </header>
      {erro && MENSAGENS_ERRO[erro] && <ErroFormulario mensagem={MENSAGENS_ERRO[erro]} />}

      <section aria-label="Resumo" className="flex flex-wrap gap-4">
        <div className={`${CARTAO} min-w-[220px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Contas pendentes</p>
          <p className="mt-1.5 text-[28px] font-bold tracking-tight">{contas.length}</p>
        </div>
        <div className={`${CARTAO} min-w-[220px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Total a pagar</p>
          <p className="mt-1.5 text-[28px] font-bold tracking-tight">{formatarMoeda(total)}</p>
        </div>
      </section>

      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-foreground/60">
            Buscar
          </label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Fornecedor ou descrição"
            className={`${CAMPO} min-w-[14rem]`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            Data inicial
          </label>
          <input
            id="de"
            type="date"
            name="de"
            defaultValue={de ?? ""}
            className={CAMPO}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="text-foreground/60">
            Data final
          </label>
          <input
            id="ate"
            type="date"
            name="ate"
            defaultValue={ate ?? paraDataInput(hoje)}
            className={CAMPO}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <SeletorDropdown
            nome="postoId"
            rotuloTodos="Todos os postos"
            selecionados={postoIds}
            itens={postos.map((p) => ({ id: p.id, nome: p.nome }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fornecedorId" className="text-foreground/60">
            Fornecedor
          </label>
          <SeletorBusca
            id="fornecedorId"
            nome="fornecedorId"
            itens={fornecedores}
            valorInicial={fornecedorId ?? ""}
            rotuloVazio="Todos os fornecedores"
            placeholder="Digite pra buscar..."
            className="w-64"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="planoContaId" className="text-foreground/60">
            Plano de contas
          </label>
          <select
            id="planoContaId"
            name="planoContaId"
            defaultValue={planoContaId ?? ""}
            className={CAMPO}
          >
            <option value="">Todos</option>
            {grupos.map((g) => (
              <optgroup key={g.id} label={g.nome}>
                {g.contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button type="submit" className={BOTAO_PRIMARIO}>
          Filtrar
        </button>
        {(postoIds.length || fornecedorId || planoContaId || de || ate || busca) && (
          <Link href="/conferencia-diaria" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      {podeEditar && (
        <>
          <form id={FORM_PAGAR} action={marcarComoPagas} className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm`}>
            <div className="flex flex-col gap-1">
              <label htmlFor="bancoId" className="text-foreground/60">
                Pago no banco
              </label>
              <select
                id="bancoId"
                name="bancoId"
                form={FORM_PAGAR}
                defaultValue="previsto"
                className={CAMPO}
                required
              >
                <option value="previsto">Banco previsto de cada conta (padrão do posto)</option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="postoPagamentoId" className="text-foreground/60">
                Pago pelo posto
              </label>
              <select
                id="postoPagamentoId"
                name="postoPagamentoId"
                form={FORM_PAGAR}
                defaultValue=""
                className={CAMPO}
              >
                <option value="">Mesmo posto da conta</option>
                {postos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="dataPagamento" className="text-foreground/60">
                Data do pagamento
              </label>
              <input
                id="dataPagamento"
                type="date"
                name="dataPagamento"
                form={FORM_PAGAR}
                defaultValue={paraDataInput(hoje)}
                required
                className={CAMPO}
              />
            </div>
            <button
              type="submit"
              form={FORM_PAGAR}
              className={BOTAO_PRIMARIO}
            >
              Marcar selecionadas como pagas
            </button>
            <p className="w-full text-xs text-foreground/50">
              &quot;Pago pelo posto&quot; só precisa mudar quando o dinheiro saiu do banco de um posto DIFERENTE do
              dono da conta (ex: OLIVEIRA pagando uma conta que é da SUL AMERICA) — nesse caso a conciliação com o
              extrato bancário é feita contra o posto escolhido aqui, não contra o posto da conta.
            </p>
          </form>
        </>
      )}

      <div className={`${CARTAO} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className={CABECALHO_TABELA}>
            <tr>
              {podeEditar && (
                <th className="px-4 py-2.5 text-left">
                  <SelecionarTodos formId={FORM_PAGAR} />
                </th>
              )}
              <th className="px-4 py-2.5 text-left">Vencimento</th>
              <th className="px-4 py-2.5 text-left">Posto</th>
              <th className="px-4 py-2.5 text-left">Fornecedor</th>
              <th className="px-4 py-2.5 text-left">Plano de contas</th>
              <th className="px-4 py-2.5 text-left">Banco previsto</th>
              <th className="px-4 py-2.5 text-right">Valor</th>
              {podeEditar && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => {
              const vencida = c.dataVencimento < hoje;
              return (
                <Fragment key={c.id}>
                <tr className="item-desc border-t border-black/10 hover:bg-black/[0.015] dark:border-white/10 dark:hover:bg-white/[0.03]">
                  {podeEditar && (
                    <td className="px-4 py-2">
                      <input type="checkbox" name="ids" value={c.id} form={FORM_PAGAR} />
                    </td>
                  )}
                  <td className="px-4 py-2">
                    {formatarData(c.dataVencimento)}
                    {vencida && (
                      <span className={`ml-2 ${ETIQUETA_VERMELHA}`}>
                        vencida
                      </span>
                    )}
                    {c.combustivel && (
                      <span className={`ml-2 ${ETIQUETA_AZUL}`}>
                        combustível
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{c.posto.nome}</td>
                  <td className="px-4 py-2">
                    {c.fornecedor.nome}
                    {c.observacao && (
                      <>
                        {" "}
                        <ComentarioHover texto={c.observacao} />
                      </>
                    )}
                    {c.combustivel && c.descricao && (
                      <p className="text-xs text-foreground/50">{c.descricao}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-foreground/70">
                    {c.planoConta.grupo.nome} / {c.planoConta.nome}
                  </td>
                  <td className="px-4 py-2 text-foreground/70">
                    {c.bancoPrevisto?.nome ?? (
                      <span title="Banco padrão do posto" className="text-foreground/50">
                        {nomeBancoPadraoDoPosto(c.posto.nome)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{formatarMoeda(c.valor.toString())}</td>
                  {podeEditar && (
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <BotaoVerDescricao id={c.id} descricao={c.descricao} />
                      <Link
                        href={`/contas-a-pagar/${c.id}/editar?${qsVoltarPara}`}
                        className={`ml-1 inline-block ${BOTAO_EDITAR}`}
                      >
                        Editar
                      </Link>
                    </td>
                  )}
                </tr>
                <LinhaDescricao colSpan={podeEditar ? 8 : 6} texto={c.descricao} />
                </Fragment>
              );
            })}
            {contas.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 8 : 6} className="px-4 py-6 text-center text-foreground/50">
                  Nada pendente pra esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
