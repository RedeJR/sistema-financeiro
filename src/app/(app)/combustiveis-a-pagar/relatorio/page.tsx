import { exigirPermissao } from "@/lib/auth";
import { paraLista, emLista } from "@/lib/filtro-multiplo";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { BotaoImprimir } from "./botao-imprimir";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";
import { filtroDatasCombustivel } from "../filtro-datas";

function formatarData(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

function formatarIso(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function periodo(de?: string, ate?: string): string | undefined {
  if (!de && !ate) return undefined;
  return `${de ? formatarIso(de) : "…"} a ${ate ? formatarIso(ate) : "…"}`;
}

export const metadata = { title: "Combustíveis a Pagar - Relatório" };

export default async function RelatorioCombustiveisAPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; de?: string; ate?: string; descDe?: string; descAte?: string }>;
}) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "visualizar");

  const { postoId, de, ate, descDe, descAte } = await searchParams;

  const contas = await prisma.contaAPagar.findMany({
    where: {
      combustivel: true,
      paga: false,
      ...emLista("postoId", paraLista(postoId)),
      ...filtroDatasCombustivel({ de, ate, descDe, descAte }),
    },
    include: { posto: true, fornecedor: true },
    orderBy: [{ posto: { nome: "asc" } }, { dataVencimento: "asc" }],
  });

  const liquido = (c: (typeof contas)[number]) => Number(c.valor) - Number(c.desconto);
  const postos = [...new Set(contas.map((c) => c.posto.nome))].map((nome) => {
    const doPosto = contas.filter((c) => c.posto.nome === nome);
    return { nome, contas: doPosto, total: doPosto.reduce((s, c) => s + liquido(c), 0) };
  });
  const total = postos.reduce((s, p) => s + p.total, 0);
  const periodoVenc = periodo(de, ate);
  const periodoDescarga = periodo(descDe, descAte);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Relatório de Combustíveis a Pagar</h1>
        <BotaoImprimir />
      </div>

      <CabecalhoImpressao
        titulo="Relatório de Combustíveis a Pagar"
        detalhes={[
          { rotulo: "Vencimento", valor: periodoVenc },
          { rotulo: "Descarga", valor: periodoDescarga },
        ]}
      />

      <p className="text-sm text-foreground/60">
        {contas.length} conta{contas.length === 1 ? "" : "s"} em {postos.length} posto{postos.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
        {periodoVenc && <> · vencimento {periodoVenc}</>}
        {periodoDescarga && <> · descarga {periodoDescarga}</>}
      </p>

      {postos.length > 0 && (
        <table className="w-full border-collapse text-sm [break-inside:avoid]">
          <thead>
            <tr className="bg-black/[0.06]">
              <th className="px-2 py-1.5 text-left text-[13px] font-semibold uppercase">Resumo por posto</th>
              <th className="px-2 py-1.5 text-right font-medium">Contas</th>
              <th className="px-2 py-1.5 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {postos.map((p) => (
              <tr key={p.nome} className="border-b border-black/10">
                <td className="px-2 py-1.5">{p.nome}</td>
                <td className="px-2 py-1.5 text-right">{p.contas.length}</td>
                <td className="px-2 py-1.5 text-right">{formatarMoeda(p.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black/30 font-semibold">
              <td className="px-2 py-2">Total geral</td>
              <td className="px-2 py-2 text-right">{contas.length}</td>
              <td className="px-2 py-2 text-right">{formatarMoeda(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      {postos.map((p) => (
        <table key={p.nome} className="w-full border-collapse text-sm [break-inside:avoid]">
          <thead>
            <tr className="bg-black/[0.06]">
              <th colSpan={5} className="px-2 py-1.5 text-left text-[13px] font-semibold uppercase">
                {p.nome}
              </th>
            </tr>
            <tr className="border-b border-black/20">
              <th className="px-2 py-1.5 text-left font-medium">Vencimento</th>
              <th className="px-2 py-1.5 text-left font-medium">Descarga</th>
              <th className="px-2 py-1.5 text-left font-medium">Fornecedor</th>
              <th className="px-2 py-1.5 text-left font-medium">Descrição</th>
              <th className="px-2 py-1.5 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {p.contas.map((c) => (
              <tr key={c.id} className="border-b border-black/10">
                <td className="px-2 py-1.5">{formatarData(c.dataVencimento)}</td>
                <td className="px-2 py-1.5">{formatarData(c.dataDescarga)}</td>
                <td className="px-2 py-1.5">{c.fornecedor.nome}</td>
                <td className="px-2 py-1.5">{c.descricao ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  {formatarMoeda(c.valor.toString())}
                  {Number(c.desconto) > 0 && (
                    <span className="block text-[8px] text-gray-500">
                      desc. {formatarMoeda(c.desconto.toString())} → {formatarMoeda(liquido(c).toString())}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black/30 font-semibold">
              <td colSpan={4} className="px-2 py-2 text-right">
                Total {p.nome}
              </td>
              <td className="px-2 py-2 text-right">{formatarMoeda(p.total)}</td>
            </tr>
          </tfoot>
        </table>
      ))}

      {postos.length === 0 && <p className="py-10 text-center text-sm text-foreground/50">Nenhum combustível a pagar nesse filtro.</p>}
    </div>
  );
}
