import Link from "next/link";
import { Fragment } from "react";
import { BotaoVerDescricao, BlocoDescricao } from "@/components/ui/ver-descricao";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { paraLista, emLista, anexarLista } from "@/lib/filtro-multiplo";
import { SeletorBusca } from "@/components/ui/seletor-busca";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import {
  rodarConciliacaoAutomatica,
  statusConciliacaoPorGrupo,
  conferenciaTotalDiario,
  type StatusConciliacaoGrupo,
} from "@/lib/conciliacao";
import { desfazerPagamento } from "./actions";
import { buscarDespesasPagas, type FiltrosDespesasPagas } from "./consulta";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Paginacao } from "@/components/ui/paginacao";
import { lerParamsLista, paginar } from "@/lib/lista";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

type Despesa = Awaited<ReturnType<typeof buscarDespesasPagas>>[number];

type GrupoDespesa = {
  chave: string;
  data: Date;
  postoId: string;
  postoNome: string;
  bancoId: string | null;
  bancoNome: string | null;
  quantidade: number;
  total: number;
  despesas: Despesa[];
};

// Agrupa por dia + posto PAGADOR + banco — o mesmo agrupamento usado em
// /extratos, pra decidir o status de conciliação em bloco (ver
// statusConciliacaoPorGrupo em @/lib/conciliacao pro critério real, que é
// vínculo por despesa, não soma do dia). Despesa sem banco de pagamento
// definido não dá pra comparar com extrato nenhum, então fica num grupo à
// parte sem status.
//
// "Posto pagador" (postoPagamentoId ?? postoId), não o dono da despesa —
// o extrato bancário só existe do lado de quem realmente pagou (ex: OLIVEIRA
// paga uma conta que é da SUL AMERICA — o grupo aparece em OLIVEIRA, é lá
// que o débito realmente está no banco). O dono de cada despesa continua
// visível na lista expandida do grupo (ver "Ver despesas do grupo" abaixo).
function agruparPorDia(despesas: Despesa[]): GrupoDespesa[] {
  const grupos: GrupoDespesa[] = [];
  const porChave = new Map<string, GrupoDespesa>();

  for (const d of despesas) {
    if (!d.dataPagamento) continue;
    const bancoId = d.bancoPagamentoId;
    const postoPagadorId = d.postoPagamentoId ?? d.postoId;
    const chave = `${d.dataPagamento.toISOString()}_${postoPagadorId}_${bancoId ?? "sem-banco"}`;
    let g = porChave.get(chave);
    if (!g) {
      g = {
        chave,
        data: d.dataPagamento,
        postoId: postoPagadorId,
        postoNome: d.postoPagamento?.nome ?? d.posto.nome,
        bancoId,
        bancoNome: d.bancoPagamento?.nome ?? null,
        quantidade: 0,
        total: 0,
        despesas: [],
      };
      porChave.set(chave, g);
      grupos.push(g);
    }
    g.quantidade += 1;
    g.total += Number(d.valor);
    g.despesas.push(d);
  }

  return grupos;
}

const CARTAO = "rounded-xl border border-black/10 bg-white dark:border-white/15 dark:bg-white/[0.03]";
const BOTAO_SECUNDARIO =
  "rounded-lg border border-black/15 bg-white px-3.5 py-2 hover:bg-black/5 dark:border-white/20 dark:bg-transparent dark:hover:bg-white/10";
const CAMPO = "h-10 rounded-lg border border-black/15 bg-white px-3 dark:border-white/20 dark:bg-transparent";

const ROTULO_STATUS: Record<StatusConciliacaoGrupo, string> = {
  CONCILIADO: "Conciliado",
  DIVERGENTE: "Divergente",
  NAO_CONCILIADO: "Não conciliado",
};

const ESTILO_STATUS: Record<StatusConciliacaoGrupo, string> = {
  CONCILIADO: "bg-[#E7F6EC] text-[#14693A] dark:bg-green-900/40 dark:text-green-400",
  DIVERGENTE: "bg-[#FDECEC] text-[#A12727] dark:bg-red-900/40 dark:text-red-400",
  NAO_CONCILIADO: "bg-black/5 text-foreground/60 dark:bg-white/10",
};

function Badge({ status }: { status: StatusConciliacaoGrupo }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${ESTILO_STATUS[status]}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {ROTULO_STATUS[status]}
    </span>
  );
}

export default async function DespesasPagasPage({
  searchParams,
}: {
  searchParams: Promise<FiltrosDespesasPagas & { pagina?: string; porPagina?: string }>;
}) {
  await exigirPermissao("DESPESAS_PAGAS", "visualizar");
  const podeEditarDespesas = await podeEditarModulo("DESPESAS_PAGAS");
  const podeEditarExtratos = await podeEditarModulo("EXTRATOS");
  const podeEditar = podeEditarDespesas;

  const filtros = await searchParams;
  const { postoId, postoDono, fornecedorId, planoContaId, bancoId, de, ate, q } = filtros;
  const postoIds = paraLista(postoId);

  // Roda a sugestão automática de conciliação (idempotente) antes de calcular
  // o status dos grupos — sem isso, um extrato importado agorinha mesmo
  // ainda apareceria como "não conciliado"/"divergente" até alguém visitar
  // /extratos/conciliacao. Exige permissão de editar em Extratos porque é lá
  // que o vínculo realmente mexe nos dados (ver rodarConciliacaoAutomatica).
  // Nota: o filtro "Posto" dessa tela é sobre o DONO da despesa, mas dentro
  // de rodarConciliacaoAutomatica esse mesmo valor filtra pelo posto
  // PAGADOR (só um recorte de performance, não afeta o que já está pago —
  // só atrasa um pouco a sugestão automática pra despesa paga por outro
  // posto enquanto o filtro estiver ativo; sem filtro nenhum, roda tudo).
  if (podeEditarExtratos) {
    await rodarConciliacaoAutomatica(postoIds, bancoId || undefined);
  }

  const [contas, postos, fornecedores, gruposPlanoConta, bancos, conferenciaDiaria] = await Promise.all([
    buscarDespesasPagas(filtros),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.grupoPlanoConta.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { contas: { where: { ativo: true }, orderBy: { nome: "asc" } } },
    }),
    prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    // Pega o que o agrupamento abaixo não consegue pegar: um dia sem despesa
    // NENHUMA lançada não vira grupo nenhum pra mostrar status. Comparando
    // com o total do extrato (mesma lógica de /extratos/conciliacao), um dia
    // com débito categorizado "Despesas Pagas" no extrato mas zero despesa
    // cadastrada aparece aqui mesmo sem ter grupo nenhum na lista abaixo.
    // Sem data escolhida, o aviso começa em 01/09/2026 — pedido da usuária
    // em 08/10/2026 ("tira os avisos da conciliação de despesas do mês 08").
    // Escolhendo "Pago de", dá pra olhar um mês anterior de propósito.
    conferenciaTotalDiario({ postoId: postoIds, de: de || "2026-09-01", ate }),
  ]);
  // Só o que falta lançar (extrato > despesas) — o caso que a usuária pediu
  // pra avisar. O outro sentido (despesa > extrato) já aparece como
  // "Divergente" no badge de cada grupo existente, não precisa duplicar
  // aviso aqui.
  const diasPendentes = conferenciaDiaria.filter((l) => l.diferenca < -0.005);

  const total = contas.reduce((soma, c) => soma + Number(c.valor), 0);
  const temFiltro = Boolean(postoIds.length || fornecedorId || planoContaId || bancoId || de || ate || q);
  const qsParams = new URLSearchParams(
    Object.entries(filtros).filter(([k, v]) => v && k !== "postoId" && k !== "pagina" && k !== "porPagina") as [string, string][]
  );
  anexarLista(qsParams, "postoId", postoIds);
  const qs = qsParams.toString();
  // Pra "+ Despesa avulsa" voltar pro filtro atual depois de salvar, em vez
  // de cair na lista sem filtro nenhum (pedido da usuária).
  const qsVoltarPara = `voltarPara=${encodeURIComponent(`/despesas-pagas${qs ? `?${qs}` : ""}`)}`;

  // Relatório unificado (ver /relatorios) — chega de lá já filtrado só pra
  // Pagas (esse módulo), carregando posto/fornecedor/plano de contas que já
  // estavam aplicados aqui. "de"/"ate" não entra: aqui é data de PAGAMENTO,
  // lá em /relatorios é data de VENCIMENTO — semântica diferente, carregar
  // sem avisar confundiria mais do que ajudaria.
  const qsRelatorio = new URLSearchParams();
  qsRelatorio.set("status", "PAGA");
  qsRelatorio.set("statusEnviado", "1");
  anexarLista(qsRelatorio, "postoId", postoIds);
  if (fornecedorId) qsRelatorio.append("fornecedorId", fornecedorId);
  if (planoContaId) qsRelatorio.append("planoContaId", planoContaId);
  const linkRelatorio = `/relatorios?${qsRelatorio.toString()}`;

  const grupos = agruparPorDia(contas);
  // Paginação por grupo (dia + posto + banco): 10/25/50 grupos por página.
  const estadoPag = lerParamsLista({ pagina: filtros.pagina, porPagina: filtros.porPagina }, { ordem: "x", dir: "asc" }, ["x"]);
  const pagGrupos = paginar(grupos, estadoPag.pagina, estadoPag.porPagina);
  const gruposComBanco = pagGrupos.itens.filter((g): g is GrupoDespesa & { bancoId: string } => g.bancoId !== null);
  const statusPorChave = await statusConciliacaoPorGrupo(
    gruposComBanco.map((g) => ({
      chave: g.chave,
      postoId: g.postoId,
      bancoId: g.bancoId,
      data: g.data,
      despesas: g.despesas.map((d) => ({ id: d.id, valor: Number(d.valor) })),
    }))
  );

  const linkVerMais = (g: GrupoDespesa) => {
    if (!g.bancoId) return null;
    const dia = g.data.toISOString().slice(0, 10);
    const qsExtrato = new URLSearchParams({
      postoId: g.postoId,
      bancoId: g.bancoId,
      de: dia,
      ate: dia,
    }).toString();
    return `/extratos/conciliacao?${qsExtrato}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">Despesas Pagas</h1>
          <p className="mt-1.5 text-sm text-foreground/60">
            Somente o que é considerado despesa, agrupado por dia, posto e banco — com o status da conciliação com o
            extrato.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-medium">
          {podeEditar && (
            <Link href="/despesas-pagas/importar" className={BOTAO_SECUNDARIO}>
              Importar planilha
            </Link>
          )}
          <Link href={`/despesas-pagas/exportar${qs ? `?${qs}` : ""}`} className={BOTAO_SECUNDARIO}>
            Exportar (Excel/CSV)
          </Link>
          <Link href={linkRelatorio} target="_blank" className={BOTAO_SECUNDARIO}>
            Relatório (imprimir / PDF)
          </Link>
        </div>
      </header>

      <section aria-label="Resumo do período" className="flex flex-wrap gap-4">
        <div className={`${CARTAO} min-w-[220px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Despesas no período</p>
          <p className="mt-1.5 text-[28px] font-bold tracking-tight">{contas.length}</p>
        </div>
        <div className={`${CARTAO} min-w-[220px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Total pago</p>
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
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <SeletorDropdown
            nome="postoId"
            rotuloTodos="Todos os postos"
            selecionados={postoIds}
            itens={postos.map((p) => ({ id: p.id, nome: p.nome }))}
          />
          {/* Padrão busca por quem PAGOU, não pelo dono da despesa (mesmo
              critério do resto do sistema) — pedido da usuária: filtrar a
              OLIVEIRA tem que trazer o que ela pagou de outros postos
              também. Esse checkbox inverte pra quando ela quer ver só o que
              é dono mesmo, sem olhar quem pagou. */}
          <label className="flex items-center gap-1.5 text-xs text-foreground/60">
            <input type="checkbox" name="postoDono" value="1" defaultChecked={postoDono === "1"} />
            Buscar pelo posto dono da despesa
          </label>
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
          <select id="planoContaId" name="planoContaId" defaultValue={planoContaId ?? ""} className={CAMPO}>
            <option value="">Todos</option>
            {gruposPlanoConta.map((g) => (
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
        <div className="flex flex-col gap-1">
          <label htmlFor="bancoId" className="text-foreground/60">
            Banco
          </label>
          <select id="bancoId" name="bancoId" defaultValue={bancoId ?? ""} className={CAMPO}>
            <option value="">Todos</option>
            {bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            Pago de
          </label>
          <input id="de" type="date" name="de" defaultValue={de ?? ""} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="text-foreground/60">
            até
          </label>
          <input id="ate" type="date" name="ate" defaultValue={ate ?? ""} className={CAMPO} />
        </div>
        <button type="submit" className="h-10 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800">
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/despesas-pagas" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      {diasPendentes.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
          {diasPendentes.map((l) => (
            <p key={`${l.postoId}|${l.data.toISOString()}`} className="text-sm text-amber-800 dark:text-amber-400">
              ⚠️ Atenção — pendente lançamento(s) do dia {formatarData(l.data)} no Posto {l.postoNome} — o extrato
              mostra {formatarMoeda(l.totalExtratoDespesasPagas)} em &quot;Despesas Pagas&quot; nesse dia, mas só{" "}
              {formatarMoeda(l.totalContasPagas)} está lançado aqui (faltam {formatarMoeda(Math.abs(l.diferenca))}).
            </p>
          ))}
        </div>
      )}

      {/* Barras de grupo e despesas na mesma grade; o cabeçalho das colunas fica dentro de cada grupo, logo acima das despesas. */}
      <div className={`${CARTAO} overflow-x-auto ${grupos.length === 0 ? "hidden" : ""}`}>
       <div className="min-w-[900px]">
        {pagGrupos.itens.map((g) => {
          const status = g.bancoId ? statusPorChave.get(g.chave)?.status : undefined;
          const verMais = linkVerMais(g);
          return (
            <div key={g.chave} className="border-t border-black/10 first:border-t-0 dark:border-white/15">
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_7rem_11rem_9.5rem] items-center gap-x-3 border-l-4 border-l-blue-700 bg-[#DCE7FA] py-4 pr-5 pl-4 dark:bg-blue-950/40">
                <span className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-bold tracking-tight">
                  <span>
                    {formatarData(g.data)} <span className="font-normal text-foreground/40">·</span> {g.postoNome}{" "}
                    <span className="font-normal text-foreground/40">·</span> {g.bancoNome ?? "sem banco definido"}{" "}
                    <span className="font-normal text-foreground/40">·</span>{" "}
                    <span className="font-medium text-foreground/60">
                      {g.quantidade} despesa{g.quantidade === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 font-normal">
                  {status ? <Badge status={status} /> : (
                    <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs text-foreground/50 dark:bg-white/10">
                      sem banco definido
                    </span>
                  )}
                  {verMais && (
                    <Link
                      href={verMais}
                      className="text-[13px] font-medium text-blue-700 hover:underline dark:text-blue-300"
                    >
                      Ver extrato →
                    </Link>
                  )}
                  </span>
                </span>
                <span className="text-right text-base font-bold whitespace-nowrap">{formatarMoeda(g.total)}</span>
                <span className="col-span-2 text-right">
                  {podeEditar && (
                    <Link
                      href={`/despesas-pagas/nova?${new URLSearchParams({ postoId: g.postoId, ...(g.bancoId ? { bancoId: g.bancoId } : {}), dataPagamento: g.data.toISOString().slice(0, 10) }).toString()}&${qsVoltarPara}`}
                      className="rounded-lg bg-blue-700 px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-white hover:bg-blue-800"
                    >
                      + Despesa avulsa
                    </Link>
                  )}
                </span>
              </div>
              {podeEditar && (
                <details className="group">
                  <summary className="cursor-pointer px-5 py-2.5 text-[13px] text-foreground/60 hover:text-foreground">
                    Ver despesas do grupo
                  </summary>
                  <div className="border-t border-black/5 dark:border-white/10">
                    <div>
                      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_7rem_11rem_9.5rem] gap-x-3 bg-black/[0.02] px-5 py-2 text-[11.5px] font-semibold tracking-wide text-foreground/60 uppercase dark:bg-white/[0.03]">
                        <span>Fornecedor</span>
                        <span>Plano de contas</span>
                        <span />
                        <span className="text-right">Valor</span>
                        <span />
                        <span />
                      </div>
                      <div className="divide-y divide-black/5 dark:divide-white/10">
                        {g.despesas.map((c) => (
                          <Fragment key={c.id}>
                          <div
                            className="item-desc grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_7rem_11rem_9.5rem] items-center gap-x-3 px-5 py-3 text-sm"
                          >
                            <span className="font-medium break-words">{c.fornecedor.nome}</span>
                            <span className="break-words text-foreground/60">
                              {c.planoConta.grupo.nome} / {c.planoConta.nome}
                            </span>
                            <span className="flex flex-wrap gap-1">
                              {c.postoPagamentoId && c.postoPagamentoId !== c.postoId && (
                                <span
                                  className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
                                  title="O grupo acima é agrupado pelo posto que pagou; essa despesa em si é de outro posto."
                                >
                                  despesa do posto {c.posto.nome}
                                </span>
                              )}
                              {c.avulsa && (
                                <span className="rounded-full bg-[#EAF1FF] px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                  avulsa
                                </span>
                              )}
                            </span>
                            <span className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(c.valor.toString())}</span>
                            <span className="flex items-center justify-end gap-1">
                              <BotaoVerDescricao id={c.id} descricao={c.descricao} />
                              <Link
                                href={`/despesas-pagas/${c.id}/editar?${qsVoltarPara}`}
                                className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-1 text-center text-[12.5px] font-semibold text-amber-950 hover:bg-amber-200"
                              >
                                Editar
                              </Link>
                            </span>
                            <form action={desfazerPagamento} className="text-right">
                              <input type="hidden" name="id" value={c.id} />
                              <ConfirmSubmitButton
                                confirmMessage="Desfazer esse pagamento? A conta volta pra Contas a Pagar como não paga."
                                className="rounded-lg px-2 py-1 text-[12.5px] text-foreground/60 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                              >
                                Desfazer pagamento
                              </ConfirmSubmitButton>
                            </form>
                          </div>
                          <BlocoDescricao texto={c.descricao} />
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>
              )}
            </div>
          );
        })}
       </div>
      </div>
      <Paginacao
        base="/despesas-pagas"
        qs={qs}
        pagina={pagGrupos.pagina}
        totalPaginas={pagGrupos.totalPaginas}
        total={pagGrupos.total}
        inicio={pagGrupos.inicio}
        mostrados={pagGrupos.itens.length}
        porPagina={estadoPag.porPagina}
        unidade="grupos (dia · posto · banco)"
      />
      {grupos.length === 0 && (
        <p className="rounded-lg border border-black/10 px-4 py-6 text-center text-sm text-foreground/50 dark:border-white/15">
          Nenhuma despesa paga encontrada pra esse filtro.
        </p>
      )}
    </div>
  );
}
