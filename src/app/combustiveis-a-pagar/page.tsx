import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { hojeUTC } from "@/lib/datas";
import { rodarConciliacaoAutomaticaCombustiveis, combustiveisNoExtratoSemConta } from "@/lib/conciliacao";
import { excluirCombustivelAPagar } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ErroFormulario } from "@/components/ui/erro-formulario";

const MENSAGENS_ERRO: Record<string, string> = {
  "ja-paga": "Esse combustível já foi baixado pela conciliação — não dá mais pra excluir por aqui.",
};

// Mesma regra da aba Contas a Pagar (decisão da usuária): o que já foi pago
// não aparece mais aqui. Como a baixa é automática, o que sobra sempre é
// só o que ainda está esperando o extrato bater.
type StatusConta = "VENCIDA" | "A_VENCER";

function statusDaConta(dataVencimento: Date, hoje: Date): StatusConta {
  return dataVencimento < hoje ? "VENCIDA" : "A_VENCER";
}

function BadgeStatus({ status }: { status: StatusConta }) {
  const estilos: Record<StatusConta, string> = {
    VENCIDA: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
    A_VENCER: "bg-black/10 text-foreground/60 dark:bg-white/10",
  };
  const rotulos: Record<StatusConta, string> = {
    VENCIDA: "Vencida",
    A_VENCER: "A vencer",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${estilos[status]}`}>{rotulos[status]}</span>;
}

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export default async function CombustiveisAPagarPage({
  searchParams,
}: {
  searchParams: Promise<{
    postoId?: string;
    status?: string;
    pagamento?: string;
    de?: string;
    ate?: string;
    q?: string;
    erro?: string;
  }>;
}) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "visualizar");
  const podeEditar = await podeEditarModulo("COMBUSTIVEIS_A_PAGAR");

  // Roda a cada visita, idempotente — se algum débito já apareceu
  // conciliado no extrato pra alguma dessas contas, dá baixa sozinho antes
  // de montar a lista.
  if (podeEditar) {
    await rodarConciliacaoAutomaticaCombustiveis();
  }

  // Lembrete: dinheiro que já saiu do banco como Combustíveis mas não tem
  // Combustível a Pagar vinculada — sinal de que alguém esqueceu de lançar
  // (ou é um caso ambíguo esperando revisão manual). Ver comentário da
  // função em conciliacao.ts.
  const semConta = await combustiveisNoExtratoSemConta();

  const { postoId, status, pagamento, de, ate, q, erro } = await searchParams;
  const busca = q?.trim();

  // Padrão (sem filtro nenhum) continua só o que está em aberto — igual
  // sempre foi. "pago"/"todos" existem só pra achar o que já foi baixado
  // pela conciliação automática, que some daqui e não aparece em nenhum
  // outro lugar do sistema (Despesas Pagas e Relatórios excluem combustível
  // de propósito, por ter fluxo próprio) — pedido da usuária depois de
  // notar que sumia da tela sem explicação.
  const filtroPago = pagamento === "pago" ? true : pagamento === "todos" ? undefined : false;

  const [contas, postos] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: {
        combustivel: true,
        ...(filtroPago !== undefined ? { paga: filtroPago } : {}),
        ...(postoId ? { postoId } : {}),
        ...(de || ate
          ? {
              dataVencimento: {
                ...(de ? { gte: dataUTC(de) } : {}),
                ...(ate ? { lte: dataUTC(ate) } : {}),
              },
            }
          : {}),
        // Campo "Descrição" aqui é o que noutros módulos chamamos assim —
        // não confundir com o campo Observação (esse não existe em
        // Combustíveis a Pagar, pedido da usuária).
        ...(busca
          ? {
              OR: [
                { fornecedor: { nome: { contains: busca, mode: "insensitive" } } },
                { descricao: { contains: busca, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { posto: true, fornecedor: true, bancoPagamento: true },
      orderBy: { dataVencimento: "asc" },
    }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  const hoje = hojeUTC();
  // Vencida/A vencer só faz sentido pra quem ainda está em aberto — uma
  // conta já paga não filtra por isso (sempre aparece, se "status" estiver
  // marcado ou não).
  const contasComStatus = contas
    .map((c) => ({ ...c, status: c.paga ? null : statusDaConta(c.dataVencimento, hoje) }))
    .filter((c) => !status || c.paga || c.status === status);

  const total = contasComStatus.reduce((soma, c) => soma + Number(c.valor), 0);
  const temFiltro = Boolean(postoId || status || pagamento || de || ate || busca);

  return (
    <div className="space-y-4">
      {erro && MENSAGENS_ERRO[erro] && <ErroFormulario mensagem={MENSAGENS_ERRO[erro]} />}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Combustíveis a Pagar</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/combustiveis-a-pagar/relatorio"
            className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Relatório (PDF)
          </Link>
          <a
            href={`/combustiveis-a-pagar/exportar?${new URLSearchParams(
              Object.entries({ postoId, de, ate }).filter(([, v]) => v) as [string, string][]
            ).toString()}`}
            className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Exportar (Excel)
          </a>
          {podeEditar && (
            <Link
              href="/combustiveis-a-pagar/novo"
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              + Novo combustível
            </Link>
          )}
        </div>
      </div>

      <p className="text-sm text-foreground/60">
        Baixa automática: assim que o débito correspondente aparecer conciliado no extrato bancário
        (mesmo posto, mesmo valor, categoria &quot;Combustíveis&quot;), a conta sai dessa lista sozinha.
        Ambíguo (mais de uma conta com o mesmo valor no mesmo posto) fica pendente pra conferência manual
        em Conciliação de Extratos. O que já foi baixado não some — use o filtro &quot;Situação de
        pagamento&quot; abaixo pra ver o que já foi pago.
      </p>

      {semConta.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
          {semConta.map((l) => (
            <p key={l.id} className="text-sm text-amber-800 dark:text-amber-400">
              ⚠️ {formatarData(l.data)} — saiu {formatarMoeda(Math.abs(l.valor).toString())} do{" "}
              {l.bancoNome} do posto {l.postoNome} como Combustíveis, mas não tem nenhuma Combustível a
              Pagar vinculada.{" "}
              <Link
                href={`/extratos/conciliacao?${new URLSearchParams({
                  postoId: l.postoId,
                  bancoId: l.bancoId,
                  de: l.data.toISOString().slice(0, 10),
                  ate: l.data.toISOString().slice(0, 10),
                }).toString()}`}
                className="underline"
              >
                Ver no extrato
              </Link>
            </p>
          ))}
        </div>
      )}

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
          <label htmlFor="pagamento" className="text-foreground/60">
            Situação de pagamento
          </label>
          <select
            id="pagamento"
            name="pagamento"
            defaultValue={pagamento ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">A pagar</option>
            <option value="pago">Pagas</option>
            <option value="todos">Todas</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-foreground/60">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todos</option>
            <option value="A_VENCER">A vencer</option>
            <option value="VENCIDA">Vencida</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            Vencimento de
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
        {temFiltro && (
          <Link href="/combustiveis-a-pagar" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <p className="text-sm text-foreground/60">
        {contasComStatus.length} conta{contasComStatus.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
      </p>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Vencimento</th>
              <th className="px-4 py-2 text-left font-medium">Descarga</th>
              <th className="px-4 py-2 text-left font-medium">Posto</th>
              <th className="px-4 py-2 text-left font-medium">Fornecedor</th>
              <th className="px-4 py-2 text-left font-medium">Descrição</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              {podeEditar && <th className="px-4 py-2 text-right font-medium">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {contasComStatus.map((c) => (
              <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-4 py-2 whitespace-nowrap">{formatarData(c.dataVencimento)}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {c.dataDescarga ? formatarData(c.dataDescarga) : "—"}
                </td>
                <td className="px-4 py-2">{c.posto.nome}</td>
                <td className="px-4 py-2">{c.fornecedor.nome}</td>
                <td className="px-4 py-2 text-foreground/70">{c.descricao ?? "—"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{formatarMoeda(c.valor.toString())}</td>
                <td className="px-4 py-2">
                  {c.paga ? (
                    <span
                      className="rounded-full bg-green-100 px-2 py-0.5 text-xs whitespace-nowrap text-green-800 dark:bg-green-900/40 dark:text-green-400"
                      title={c.bancoPagamento ? `Baixado no ${c.bancoPagamento.nome}` : undefined}
                    >
                      Paga{c.dataPagamento ? ` em ${formatarData(c.dataPagamento)}` : ""}
                    </span>
                  ) : (
                    <BadgeStatus status={c.status!} />
                  )}
                </td>
                {podeEditar && (
                  <td className="px-4 py-2">
                    {!c.paga && (
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/combustiveis-a-pagar/${c.id}/editar`}
                          className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          Editar
                        </Link>
                        <form action={excluirCombustivelAPagar}>
                          <input type="hidden" name="id" value={c.id} />
                          <ConfirmSubmitButton
                            confirmMessage={`Excluir esse combustível a pagar (${c.fornecedor.nome}, ${formatarMoeda(c.valor.toString())})? Essa ação não pode ser desfeita.`}
                          >
                            Excluir
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {contasComStatus.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 8 : 7} className="px-4 py-6 text-center text-foreground/50">
                  Nenhum combustível encontrado pra esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
