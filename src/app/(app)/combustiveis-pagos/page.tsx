import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";

function formatarData(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function paraArray(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function CombustiveisPagosPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; fornecedorId?: string | string[]; de?: string; ate?: string }>;
}) {
  await exigirPermissao("COMBUSTIVEIS_PAGOS", "visualizar");

  const filtros = await searchParams;
  const postoIds = paraArray(filtros.postoId);
  const fornecedorIds = paraArray(filtros.fornecedorId);
  const { de, ate } = filtros;

  const [contas, postos, fornecedores] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: {
        combustivel: true,
        paga: true,
        ...(postoIds.length ? { postoId: { in: postoIds } } : {}),
        ...(fornecedorIds.length ? { fornecedorId: { in: fornecedorIds } } : {}),
        ...(de || ate
          ? {
              dataPagamento: {
                ...(de ? { gte: dataUTC(de) } : {}),
                ...(ate ? { lte: dataUTC(ate) } : {}),
              },
            }
          : {}),
      },
      include: { posto: true, fornecedor: true },
      orderBy: { dataPagamento: "desc" },
    }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  const total = contas.reduce((soma, c) => soma + Number(c.valor), 0);
  const temFiltro = Boolean(postoIds.length || fornecedorIds.length || de || ate);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Combustíveis Pagos</h1>

      <p className="text-sm text-foreground/60">
        Combustíveis já baixados pela conciliação automática — ver{" "}
        <Link href="/combustiveis-a-pagar" className="underline">
          Combustíveis a Pagar
        </Link>{" "}
        pro que ainda está em aberto.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto <span className="text-xs">(Ctrl/Cmd+clique pra mais de um)</span>
          </label>
          <select
            id="postoId"
            name="postoId"
            multiple
            size={5}
            defaultValue={postoIds}
            className="min-w-[11rem] rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
          >
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
            multiple
            size={5}
            defaultValue={fornecedorIds}
            className="min-w-[13rem] rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
          >
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            Pago de
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
          <Link href="/combustiveis-pagos" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <p className="text-sm text-foreground/60">
        {contas.length} conta{contas.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
      </p>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Posto</th>
              <th className="px-4 py-2 text-left font-medium">Data de descarga</th>
              <th className="px-4 py-2 text-left font-medium">Data de pagamento</th>
              <th className="px-4 py-2 text-left font-medium">Fornecedor</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 text-left font-medium">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-4 py-2">{c.posto.nome}</td>
                <td className="px-4 py-2 whitespace-nowrap">{formatarData(c.dataDescarga)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{formatarData(c.dataPagamento)}</td>
                <td className="px-4 py-2">{c.fornecedor.nome}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{formatarMoeda(c.valor.toString())}</td>
                <td className="px-4 py-2 text-foreground/70">{c.descricao ?? "—"}</td>
              </tr>
            ))}
            {contas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-foreground/50">
                  Nenhum combustível pago encontrado pra esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
