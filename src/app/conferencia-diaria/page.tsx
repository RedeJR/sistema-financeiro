import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { hojeUTC } from "@/lib/datas";
import { gerarOcorrenciasRecorrentesPendentes } from "@/app/contas-a-pagar/recorrencia";
import { marcarComoPagas } from "./actions";
import { SelecionarTodos } from "@/components/ui/selecionar-todos";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { ComentarioHover } from "@/components/ui/comentario-hover";

const FORM_PAGAR = "form-marcar-pagas";

const MENSAGENS_ERRO: Record<string, string> = {
  "nenhuma-selecionada": "Selecione ao menos uma conta antes de marcar como paga.",
  "sem-banco": "Escolha o banco onde foi pago.",
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
    postoId?: string;
    fornecedorId?: string;
    planoContaId?: string;
    dia?: string;
    q?: string;
    erro?: string;
  }>;
}) {
  await exigirPermissao("CONFERENCIA_DIARIA", "visualizar");
  const podeEditar = await podeEditarModulo("CONFERENCIA_DIARIA");

  await gerarOcorrenciasRecorrentesPendentes();

  const { postoId, fornecedorId, planoContaId, dia, q, erro } = await searchParams;
  const busca = q?.trim();
  const hoje = hojeUTC();
  const diaFiltro = dia ? dataUTC(dia) : hoje;

  const [contas, postos, fornecedores, grupos, bancos] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: {
        paga: false,
        // Combustível não se marca como pago aqui — a baixa é sempre
        // automática pela conciliação com o extrato (ver
        // rodarConciliacaoAutomaticaCombustiveis em conciliacao.ts).
        combustivel: false,
        ...(postoId ? { postoId } : {}),
        ...(fornecedorId ? { fornecedorId } : {}),
        ...(planoContaId ? { planoContaId } : {}),
        OR: [{ dataVencimento: diaFiltro }, { dataVencimento: { lt: hoje } }],
        // Busca por fornecedor OU descrição — combinada com o OR de data
        // acima via AND implícito (Prisma soma todas as chaves do objeto
        // where com AND; o "OR" de data fica isolado nessa chave, esse
        // filtro de busca é outra condição por fora).
        ...(busca
          ? {
              AND: [
                {
                  OR: [
                    { fornecedor: { nome: { contains: busca, mode: "insensitive" } } },
                    { descricao: { contains: busca, mode: "insensitive" } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: { posto: true, fornecedor: true, planoConta: { include: { grupo: true } } },
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
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Conferência Diária</h1>
      {erro && MENSAGENS_ERRO[erro] && <ErroFormulario mensagem={MENSAGENS_ERRO[erro]} />}
      <p className="text-sm text-foreground/60">
        Contas que vencem no dia escolhido, mais tudo que já venceu e ainda
        não foi pago.
      </p>

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
          <label htmlFor="dia" className="text-foreground/60">
            Dia
          </label>
          <input
            id="dia"
            type="date"
            name="dia"
            defaultValue={dia ?? paraDataInput(hoje)}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
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
          <label htmlFor="fornecedorId" className="text-foreground/60">
            Fornecedor
          </label>
          <select
            id="fornecedorId"
            name="fornecedorId"
            defaultValue={fornecedorId ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
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
          <select
            id="planoContaId"
            name="planoContaId"
            defaultValue={planoContaId ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
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
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Filtrar
        </button>
        {(postoId || fornecedorId || planoContaId || dia || busca) && (
          <Link href="/conferencia-diaria" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <p className="text-sm text-foreground/60">
        {contas.length} conta{contas.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
      </p>

      {podeEditar && (
        <>
          <form id={FORM_PAGAR} action={marcarComoPagas} className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
            <div className="flex flex-col gap-1">
              <label htmlFor="bancoId" className="text-foreground/60">
                Pago no banco
              </label>
              <select
                id="bancoId"
                name="bancoId"
                form={FORM_PAGAR}
                defaultValue=""
                className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
                required
              >
                <option value="" disabled>
                  Escolha o banco
                </option>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
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
                className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
              />
            </div>
            <button
              type="submit"
              form={FORM_PAGAR}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Marcar selecionadas como pagas
            </button>
          </form>
        </>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              {podeEditar && (
                <th className="px-4 py-2 text-left font-medium">
                  <SelecionarTodos formId={FORM_PAGAR} />
                </th>
              )}
              <th className="px-4 py-2 text-left font-medium">Vencimento</th>
              <th className="px-4 py-2 text-left font-medium">Posto</th>
              <th className="px-4 py-2 text-left font-medium">Fornecedor</th>
              <th className="px-4 py-2 text-left font-medium">Plano de contas</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              {podeEditar && <th className="px-4 py-2 text-right font-medium">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => {
              const vencida = c.dataVencimento < hoje;
              return (
                <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                  {podeEditar && (
                    <td className="px-4 py-2">
                      <input type="checkbox" name="ids" value={c.id} form={FORM_PAGAR} />
                    </td>
                  )}
                  <td className="px-4 py-2">
                    {formatarData(c.dataVencimento)}
                    {vencida && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-400">
                        vencida
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
                  </td>
                  <td className="px-4 py-2 text-foreground/70">
                    {c.planoConta.grupo.nome} / {c.planoConta.nome}
                  </td>
                  <td className="px-4 py-2 text-right">{formatarMoeda(c.valor.toString())}</td>
                  {podeEditar && (
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/contas-a-pagar/${c.id}/editar`}
                        className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        Editar
                      </Link>
                    </td>
                  )}
                </tr>
              );
            })}
            {contas.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 7 : 5} className="px-4 py-6 text-center text-foreground/50">
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
