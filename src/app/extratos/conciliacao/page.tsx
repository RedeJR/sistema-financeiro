import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  rodarConciliacaoAutomatica,
  rodarConciliacaoAutomaticaCombustiveis,
  conferenciaTotalDiario,
} from "@/lib/conciliacao";
import { vincularManualmente, desvincular } from "./actions";

const MENSAGENS_ERRO: Record<string, string> = {
  "sem-despesa": "Escolha a despesa antes de vincular.",
  "sem-lancamento": "Escolha um lançamento antes de vincular.",
  "ja-vinculado": "Esse lançamento já foi vinculado a outra despesa nesse meio tempo — atualize a página.",
};

function formatarData(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export default async function ConciliacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; bancoId?: string; de?: string; ate?: string; erro?: string }>;
}) {
  await exigirPermissao("EXTRATOS", "visualizar");
  const podeEditar = await podeEditarModulo("EXTRATOS");

  const { postoId, bancoId, de, ate, erro } = await searchParams;

  // Roda a sugestão automática a cada visita (idempotente — só cria vínculo
  // novo pro que ainda está pendente dos dois lados). Só quem pode editar
  // dispara isso; visualização não deve ter efeito colateral no banco.
  if (podeEditar) {
    await rodarConciliacaoAutomatica(postoId || undefined, bancoId || undefined);
    // Combustíveis a Pagar: baixa automática, não depende de filtro de
    // posto/banco da tela (roda sempre que alguém com permissão de editar
    // visita essa página, igual ao motor normal acima).
    await rodarConciliacaoAutomaticaCombustiveis();
  }

  const [postos, bancos, conferenciaDiaria] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    conferenciaTotalDiario({ postoId: postoId || undefined, de, ate }),
  ]);
  // Só o que não bate (tolerância de 1 centavo) — é o que precisa de ação;
  // dias batendo certinho não ajudam a usuária a achar o que falta lançar.
  const diasDivergentes = conferenciaDiaria.filter((l) => Math.abs(l.diferenca) >= 0.01);

  const periodoDespesa: Prisma.ContaAPagarWhereInput =
    de || ate
      ? { dataPagamento: { ...(de ? { gte: dataUTC(de) } : {}), ...(ate ? { lte: dataUTC(ate) } : {}) } }
      : {};
  const periodoLancamento: Prisma.LancamentoExtratoWhereInput =
    de || ate ? { data: { ...(de ? { gte: dataUTC(de) } : {}), ...(ate ? { lte: dataUTC(ate) } : {}) } } : {};

  const whereDespesaComum: Prisma.ContaAPagarWhereInput = {
    paga: true,
    // Posto aqui é sempre o PAGADOR (ver comentário no topo de
    // src/lib/conciliacao.ts) — essa tela compara contra o extrato bancário
    // de verdade, que é sempre do posto de quem pagou, não do dono da
    // despesa. postoPagamentoId null = pago pelo próprio posto da conta.
    ...(postoId ? { OR: [{ postoPagamentoId: postoId }, { postoPagamentoId: null, postoId }] } : {}),
    ...(bancoId ? { bancoPagamentoId: bancoId } : {}),
    ...periodoDespesa,
  };
  const whereLancamentoComum: Prisma.LancamentoExtratoWhereInput = {
    valor: { lt: 0 },
    ...(postoId ? { postoId } : {}),
    ...(bancoId ? { bancoId } : {}),
    ...periodoLancamento,
  };

  const [despesasSemLancamento, lancamentosSemDespesa, totalConciliados, conciliados] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: { ...whereDespesaComum, lancamentoExtratoConciliado: null },
      include: { posto: true, postoPagamento: true, fornecedor: true, bancoPagamento: true },
      orderBy: { dataPagamento: "desc" },
      take: 200,
    }),
    prisma.lancamentoExtrato.findMany({
      where: { ...whereLancamentoComum, contaAPagarId: null },
      include: { posto: true, banco: true },
      orderBy: { data: "desc" },
      take: 200,
    }),
    prisma.lancamentoExtrato.count({ where: { ...whereLancamentoComum, contaAPagarId: { not: null } } }),
    prisma.lancamentoExtrato.findMany({
      where: { ...whereLancamentoComum, contaAPagarId: { not: null } },
      include: { posto: true, banco: true, contaAPagar: { include: { fornecedor: true } } },
      orderBy: { data: "desc" },
      take: 100,
    }),
  ]);

  const qs = new URLSearchParams(
    Object.entries({ postoId, bancoId, de, ate }).filter(([, v]) => v) as [string, string][]
  ).toString();
  const voltarPara = `/extratos/conciliacao${qs ? `?${qs}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/extratos" className="text-sm text-foreground/60 underline">
            ← Voltar pra Conciliação de Extratos
          </Link>
          <h1 className="text-2xl font-semibold">Conciliação automática</h1>
        </div>
      </div>
      <p className="text-sm text-foreground/60">
        Cruza as despesas marcadas como pagas com os débitos do extrato bancário — mesmo Posto, Banco,
        valor e data. O que bate sozinho (candidato único dos dois lados) já entra vinculado; o resto fica
        pra revisão manual aqui.
      </p>

      {erro && MENSAGENS_ERRO[erro] && <ErroFormulario mensagem={MENSAGENS_ERRO[erro]} />}

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <select
            id="postoId"
            name="postoId"
            defaultValue={postoId ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todos</option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bancoId" className="text-foreground/60">
            Banco
          </label>
          <select
            id="bancoId"
            name="bancoId"
            defaultValue={bancoId ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
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
            De
          </label>
          <input
            id="de"
            type="date"
            name="de"
            defaultValue={de ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="text-foreground/60">
            até
          </label>
          <input
            id="ate"
            type="date"
            name="ate"
            defaultValue={ate ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Filtrar
        </button>
        {(postoId || bancoId || de || ate) && (
          <Link href="/extratos/conciliacao" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-400">
        {totalConciliados} conciliado{totalConciliados === 1 ? "" : "s"} automaticamente ou manualmente.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">
          Conferência por total do dia
          <span className="ml-2 text-sm font-normal text-foreground/50">({diasDivergentes.length} com diferença)</span>
        </h2>
        <p className="text-sm text-foreground/60">
          Compara, por posto e dia, o total das Contas a Pagar marcadas como pagas com o total lançado no
          extrato na categoria &quot;Despesas Pagas&quot;. Pega o que o vínculo linha-a-linha não pega: uma
          despesa que nunca foi lançada em Contas a Pagar não tem par pra comparar, mas aparece aqui como
          diferença no total do dia.
        </p>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Dia</th>
                <th className="px-4 py-2 text-left font-medium">Posto</th>
                <th className="px-4 py-2 text-right font-medium">Total Contas Pagas</th>
                <th className="px-4 py-2 text-right font-medium">Total Extrato (Despesas Pagas)</th>
                <th className="px-4 py-2 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {diasDivergentes.map((l) => (
                <tr key={`${l.postoId}|${l.data.toISOString()}`} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2 whitespace-nowrap">{formatarData(l.data)}</td>
                  <td className="px-4 py-2">{l.postoNome}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{formatarMoeda(l.totalContasPagas)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatarMoeda(l.totalExtratoDespesasPagas)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium whitespace-nowrap text-amber-700 dark:text-amber-500">
                    {formatarMoeda(l.diferenca)}
                  </td>
                </tr>
              ))}
              {diasDivergentes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-foreground/50">
                    Todo dia com dado dos dois lados bate certinho nesse filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">
          Despesas pagas sem lançamento correspondente
          <span className="ml-2 text-sm font-normal text-foreground/50">({despesasSemLancamento.length})</span>
        </h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Pago em</th>
                <th className="px-4 py-2 text-left font-medium">Posto</th>
                <th className="px-4 py-2 text-left font-medium">Fornecedor</th>
                <th className="px-4 py-2 text-left font-medium">Banco</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
                {podeEditar && <th className="px-4 py-2 text-left font-medium">Vincular a um lançamento</th>}
              </tr>
            </thead>
            <tbody>
              {despesasSemLancamento.map((d) => {
                const pagadorNome = d.postoPagamento?.nome ?? d.posto.nome;
                const pagadorId = d.postoPagamentoId ?? d.postoId;
                return (
                <tr key={d.id} className="border-t border-black/10 dark:border-white/10 align-top">
                  <td className="px-4 py-2 whitespace-nowrap">{formatarData(d.dataPagamento)}</td>
                  <td className="px-4 py-2">
                    {pagadorNome}
                    {d.postoPagamentoId && (
                      <span className="block text-xs text-foreground/50">despesa de {d.posto.nome}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{d.fornecedor.nome}</td>
                  <td className="px-4 py-2">{d.bancoPagamento?.nome ?? "—"}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{formatarMoeda(d.valor.toString())}</td>
                  {podeEditar && (
                    <td className="px-4 py-2">
                      <form action={vincularManualmente} className="flex items-center gap-2">
                        <input type="hidden" name="despesaId" value={d.id} />
                        <input type="hidden" name="voltarPara" value={voltarPara} />
                        <select
                          name="lancamentoId"
                          defaultValue=""
                          required
                          className="min-w-[16rem] rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
                        >
                          <option value="" disabled>
                            Escolher lançamento…
                          </option>
                          {lancamentosSemDespesa
                            .filter((l) => l.postoId === pagadorId)
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {formatarData(l.data)} · {l.banco.nome} · {formatarMoeda(Math.abs(Number(l.valor)))} ·{" "}
                                {l.descricao.slice(0, 40)}
                              </option>
                            ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                        >
                          Vincular
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
                );
              })}
              {despesasSemLancamento.length === 0 && (
                <tr>
                  <td colSpan={podeEditar ? 6 : 5} className="px-4 py-6 text-center text-foreground/50">
                    Nenhuma despesa paga pendente de conciliação nesse filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">
          Lançamentos do extrato sem despesa correspondente
          <span className="ml-2 text-sm font-normal text-foreground/50">({lancamentosSemDespesa.length})</span>
        </h2>
        <p className="text-sm text-foreground/60">
          Nem todo débito do extrato é uma despesa cadastrada (tarifas, investimento, cartão de crédito
          etc.) — essa lista é só pra conferência, não precisa vincular tudo.
        </p>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Data</th>
                <th className="px-4 py-2 text-left font-medium">Posto</th>
                <th className="px-4 py-2 text-left font-medium">Banco</th>
                <th className="px-4 py-2 text-left font-medium">Descrição</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {lancamentosSemDespesa.map((l) => (
                <tr key={l.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2 whitespace-nowrap">{formatarData(l.data)}</td>
                  <td className="px-4 py-2">{l.posto.nome}</td>
                  <td className="px-4 py-2">{l.banco.nome}</td>
                  <td className="px-4 py-2 text-foreground/70">{l.descricao}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-red-700 dark:text-red-400">
                    {formatarMoeda(l.valor.toString())}
                  </td>
                </tr>
              ))}
              {lancamentosSemDespesa.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-foreground/50">
                    Nenhum lançamento pendente nesse filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">
          Conciliados <span className="ml-2 text-sm font-normal text-foreground/50">({conciliados.length})</span>
        </h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Data</th>
                <th className="px-4 py-2 text-left font-medium">Posto</th>
                <th className="px-4 py-2 text-left font-medium">Fornecedor</th>
                <th className="px-4 py-2 text-left font-medium">Banco</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
                {podeEditar && <th className="px-4 py-2 text-right font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {conciliados.map((l) => (
                <tr key={l.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2 whitespace-nowrap">{formatarData(l.data)}</td>
                  <td className="px-4 py-2">{l.posto.nome}</td>
                  <td className="px-4 py-2">{l.contaAPagar?.fornecedor.nome ?? "—"}</td>
                  <td className="px-4 py-2">{l.banco.nome}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{formatarMoeda(l.valor.toString())}</td>
                  {podeEditar && (
                    <td className="px-4 py-2 text-right">
                      <form action={desvincular} className="inline">
                        <input type="hidden" name="lancamentoId" value={l.id} />
                        <ConfirmSubmitButton
                          confirmMessage="Desfazer esse vínculo? A despesa e o lançamento voltam a aparecer como pendentes."
                          className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          Desvincular
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {conciliados.length === 0 && (
                <tr>
                  <td colSpan={podeEditar ? 6 : 5} className="px-4 py-6 text-center text-foreground/50">
                    Nada conciliado ainda nesse filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
