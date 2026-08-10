import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { hojeUTC } from "@/lib/datas";
import { gerarOcorrenciasRecorrentesPendentes } from "./recorrencia";
import { excluirContaAPagar, excluirContasEmMassa } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { SelecionarTodos } from "@/components/ui/selecionar-todos";
import { ErroFormulario } from "@/components/ui/erro-formulario";

const MENSAGENS_ERRO: Record<string, string> = {
  "ja-paga": "Essa conta já foi paga — não dá mais pra excluir por aqui. Desfaça o pagamento em Despesas Pagas primeiro.",
};

// Contas pagas não aparecem mais aqui (decisão da usuária) — quem quiser ver
// o que já foi pago vai em Despesas Pagas. Aqui só sobra o que ainda precisa
// de atenção: vencida ou a vencer.
type StatusConta = "VENCIDA" | "A_VENCER";
const FORM_MASSA = "form-excluir-em-massa";

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
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${estilos[status]}`}>{rotulos[status]}</span>
  );
}

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export default async function ContasAPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; status?: string; de?: string; ate?: string; erro?: string }>;
}) {
  await exigirPermissao("CONTAS_A_PAGAR", "visualizar");
  const podeEditar = await podeEditarModulo("CONTAS_A_PAGAR");

  await gerarOcorrenciasRecorrentesPendentes();

  const { postoId, status, de, ate, erro } = await searchParams;

  const [contas, postos] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: {
        paga: false,
        // Combustível é aba própria (Combustíveis a Pagar) — não aparece
        // misturado aqui.
        combustivel: false,
        ...(postoId ? { postoId } : {}),
        ...(de || ate
          ? {
              dataVencimento: {
                ...(de ? { gte: dataUTC(de) } : {}),
                ...(ate ? { lte: dataUTC(ate) } : {}),
              },
            }
          : {}),
      },
      include: { posto: true, fornecedor: true, planoConta: { include: { grupo: true } } },
      orderBy: { dataVencimento: "asc" },
    }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  const hoje = hojeUTC();
  const contasComStatus = contas
    .map((c) => ({ ...c, status: statusDaConta(c.dataVencimento, hoje) }))
    .filter((c) => !status || c.status === status);

  const total = contasComStatus.reduce((soma, c) => soma + Number(c.valor), 0);
  const temFiltro = Boolean(postoId || status || de || ate);

  return (
    <div className="space-y-4">
      {erro && MENSAGENS_ERRO[erro] && <ErroFormulario mensagem={MENSAGENS_ERRO[erro]} />}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contas a Pagar</h1>
        {podeEditar && (
          <Link
            href="/contas-a-pagar/novo"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            + Nova conta
          </Link>
        )}
      </div>

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
          <Link href="/contas-a-pagar" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">
          {contasComStatus.length} conta{contasComStatus.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
        </p>
        {podeEditar && (
          <ConfirmSubmitButton
            form={FORM_MASSA}
            confirmMessage="Excluir todas as contas selecionadas? Essa ação não pode ser desfeita."
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Excluir selecionadas
          </ConfirmSubmitButton>
        )}
      </div>
      {podeEditar && <form id={FORM_MASSA} action={excluirContasEmMassa} />}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              {podeEditar && (
                <th className="px-4 py-2 text-left font-medium">
                  <SelecionarTodos formId={FORM_MASSA} />
                </th>
              )}
              <th className="px-4 py-2 text-left font-medium">Vencimento</th>
              <th className="px-4 py-2 text-left font-medium">Posto</th>
              <th className="px-4 py-2 text-left font-medium">Fornecedor</th>
              <th className="px-4 py-2 text-left font-medium">Observações</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              {podeEditar && <th className="px-4 py-2 text-right font-medium">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {contasComStatus.map((c) => (
              <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                {podeEditar && (
                  <td className="px-4 py-2">
                    <input type="checkbox" name="ids" value={c.id} form={FORM_MASSA} />
                  </td>
                )}
                <td className="px-4 py-2">
                  {formatarData(c.dataVencimento)}
                  {c.totalParcelas ? (
                    <span className="block text-xs text-foreground/40">
                      parcela {c.numeroParcela}/{c.totalParcelas}
                    </span>
                  ) : null}
                  {c.recorrente ? <span className="block text-xs text-foreground/40">recorrente</span> : null}
                </td>
                <td className="px-4 py-2">{c.posto.nome}</td>
                <td className="px-4 py-2">{c.fornecedor.nome}</td>
                <td className="px-4 py-2 text-foreground/70">{c.descricao ?? "—"}</td>
                <td className="px-4 py-2 text-right">{formatarMoeda(c.valor.toString())}</td>
                <td className="px-4 py-2">
                  <BadgeStatus status={c.status} />
                </td>
                {podeEditar && (
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/contas-a-pagar/${c.id}/editar`}
                        className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        Editar
                      </Link>
                      <form action={excluirContaAPagar}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Excluir essa conta a pagar (${c.fornecedor.nome}, ${formatarMoeda(c.valor.toString())})? Essa ação não pode ser desfeita.`}
                        >
                          Excluir
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {contasComStatus.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 8 : 6} className="px-4 py-6 text-center text-foreground/50">
                  Nenhuma conta a pagar encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
