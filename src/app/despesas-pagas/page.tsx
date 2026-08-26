import Link from "next/link";
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

const ROTULO_STATUS: Record<StatusConciliacaoGrupo, string> = {
  CONCILIADO: "Conciliado",
  DIVERGENTE: "Divergente",
  NAO_CONCILIADO: "Não conciliado",
};

const ESTILO_STATUS: Record<StatusConciliacaoGrupo, string> = {
  CONCILIADO: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  DIVERGENTE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
  NAO_CONCILIADO: "bg-black/5 text-foreground/60 dark:bg-white/10",
};

function Badge({ status }: { status: StatusConciliacaoGrupo }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${ESTILO_STATUS[status]}`}>
      {ROTULO_STATUS[status]}
    </span>
  );
}

export default async function DespesasPagasPage({
  searchParams,
}: {
  searchParams: Promise<FiltrosDespesasPagas>;
}) {
  await exigirPermissao("DESPESAS_PAGAS", "visualizar");
  const podeEditarDespesas = await podeEditarModulo("DESPESAS_PAGAS");
  const podeEditarExtratos = await podeEditarModulo("EXTRATOS");
  const podeEditar = podeEditarDespesas;

  const filtros = await searchParams;
  const { postoId, fornecedorId, planoContaId, bancoId, de, ate, q } = filtros;

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
    await rodarConciliacaoAutomatica(postoId || undefined, bancoId || undefined);
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
    conferenciaTotalDiario({ postoId: postoId || undefined, de, ate }),
  ]);
  // Só o que falta lançar (extrato > despesas) — o caso que a usuária pediu
  // pra avisar. O outro sentido (despesa > extrato) já aparece como
  // "Divergente" no badge de cada grupo existente, não precisa duplicar
  // aviso aqui.
  const diasPendentes = conferenciaDiaria.filter((l) => l.diferenca < -0.005);

  const total = contas.reduce((soma, c) => soma + Number(c.valor), 0);
  const temFiltro = Boolean(postoId || fornecedorId || planoContaId || bancoId || de || ate || q);
  const qs = new URLSearchParams(
    Object.entries(filtros).filter(([, v]) => v) as [string, string][]
  ).toString();
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
  if (postoId) qsRelatorio.append("postoId", postoId);
  if (fornecedorId) qsRelatorio.append("fornecedorId", fornecedorId);
  if (planoContaId) qsRelatorio.append("planoContaId", planoContaId);
  const linkRelatorio = `/relatorios?${qsRelatorio.toString()}`;

  const grupos = agruparPorDia(contas);
  const gruposComBanco = grupos.filter((g): g is GrupoDespesa & { bancoId: string } => g.bancoId !== null);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Despesas Pagas</h1>
        {podeEditar && (
          <Link
            href={`/despesas-pagas/nova?${qsVoltarPara}`}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            + Despesa avulsa
          </Link>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm">
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
            className="min-w-[14rem] rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <select id="postoId" name="postoId" defaultValue={postoId ?? ""} className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20">
            <option value="">Todos</option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fornecedorId" className="text-foreground/60">
            Fornecedor
          </label>
          <select id="fornecedorId" name="fornecedorId" defaultValue={fornecedorId ?? ""} className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20">
            <option value="">Todos</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="planoContaId" className="text-foreground/60">
            Plano de contas
          </label>
          <select id="planoContaId" name="planoContaId" defaultValue={planoContaId ?? ""} className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20">
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
          <select id="bancoId" name="bancoId" defaultValue={bancoId ?? ""} className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20">
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
          <input id="de" type="date" name="de" defaultValue={de ?? ""} className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="text-foreground/60">
            até
          </label>
          <input id="ate" type="date" name="ate" defaultValue={ate ?? ""} className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20" />
        </div>
        <button type="submit" className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/despesas-pagas" className="text-foreground/60 underline">
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground/60">
          {contas.length} despesa{contas.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
        </p>
        <div className="flex gap-2 text-sm">
          <Link
            href={`/despesas-pagas/exportar${qs ? `?${qs}` : ""}`}
            className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Exportar (Excel/CSV)
          </Link>
          <Link
            href={linkRelatorio}
            target="_blank"
            className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Relatório (imprimir / PDF)
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {grupos.map((g) => {
          const status = g.bancoId ? statusPorChave.get(g.chave)?.status : undefined;
          const verMais = linkVerMais(g);
          return (
            <div key={g.chave} className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-black/[0.03] px-4 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                <span className="text-sm font-semibold text-foreground/80">
                  {formatarData(g.data)} — {g.postoNome} — {g.bancoNome ?? "sem banco definido"} — {g.quantidade}{" "}
                  despesa{g.quantidade === 1 ? "" : "s"} — total {formatarMoeda(g.total)}
                </span>
                <div className="flex items-center gap-2">
                  {status ? <Badge status={status} /> : (
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-foreground/50 dark:bg-white/10">
                      sem banco definido
                    </span>
                  )}
                  {verMais && (
                    <Link
                      href={verMais}
                      className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                    >
                      Ver mais +
                    </Link>
                  )}
                </div>
              </div>
              {podeEditar && (
                <details className="group">
                  <summary className="cursor-pointer px-4 py-1.5 text-xs text-foreground/50 hover:text-foreground/80">
                    Ver despesas do grupo
                  </summary>
                  <div className="divide-y divide-black/5 border-t border-black/5 dark:divide-white/10 dark:border-white/10">
                    {g.despesas.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-sm">
                        <span>
                          {c.fornecedor.nome}
                          <span className="text-foreground/60"> — {c.planoConta.grupo.nome} / {c.planoConta.nome}</span>
                          {c.postoPagamentoId && c.postoPagamentoId !== c.postoId && (
                            <span
                              className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
                              title="O grupo acima é agrupado pelo posto que pagou; essa despesa em si é de outro posto."
                            >
                              despesa do posto {c.posto.nome}
                            </span>
                          )}
                          {c.avulsa && (
                            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">
                              avulsa
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          {formatarMoeda(c.valor.toString())}
                          <form action={desfazerPagamento}>
                            <input type="hidden" name="id" value={c.id} />
                            <ConfirmSubmitButton
                              confirmMessage="Desfazer esse pagamento? A conta volta pra Contas a Pagar como não paga."
                              className="rounded-md px-2 py-1 text-xs text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              Desfazer pagamento
                            </ConfirmSubmitButton>
                          </form>
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
        {grupos.length === 0 && (
          <p className="rounded-lg border border-black/10 px-4 py-6 text-center text-sm text-foreground/50 dark:border-white/15">
            Nenhuma despesa paga encontrada pra esse filtro.
          </p>
        )}
      </div>
    </div>
  );
}
