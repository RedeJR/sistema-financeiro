import Link from "next/link";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { BOTAO_EDITAR, BOTAO_PRIMARIO, CABECALHO_TABELA, CAMPO, CARTAO, TITULO_PAGINA } from "@/lib/estilo";
import { padraoDeDatas } from "@/lib/datas-padrao";
import { AvisoPadraoDia } from "@/components/ui/aviso-padrao-dia";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";
import { BotaoImprimir } from "@/app/(app)/relatorios/botao-imprimir";

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

export const metadata = { title: "Combustíveis Pagos" };

export default async function CombustiveisPagosPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; fornecedorId?: string | string[]; de?: string; ate?: string }>;
}) {
  await exigirPermissao("COMBUSTIVEIS_PAGOS", "visualizar");

  const filtros = await searchParams;
  const postoIds = paraArray(filtros.postoId);
  const fornecedorIds = paraArray(filtros.fornecedorId);
  const { de, ate, padrao } = padraoDeDatas(filtros.de, filtros.ate, "ontem");

  const podeEditar = await podeEditarModulo("COMBUSTIVEIS_A_PAGAR");
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
      include: { posto: true, fornecedor: true, acertosEntrePostos: { include: { postoOrigem: true } } },
      orderBy: [{ posto: { nome: "asc" } }, { dataPagamento: "asc" }, { dataDescarga: "asc" }],
    }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  const liquido = (c: (typeof contas)[number]) => Number(c.valor) - Number(c.desconto);
  // Agrupado por posto, cada um com a sua soma (mesma regra do relatório de Combustíveis a Pagar).
  const porPosto = [...new Set(contas.map((c) => c.posto.nome))].map((nome) => {
    const doPosto = contas.filter((c) => c.posto.nome === nome);
    return { nome, contas: doPosto, total: doPosto.reduce((s, c) => s + liquido(c), 0) };
  });
  const total = porPosto.reduce((s, p) => s + p.total, 0);
  const temFiltro = Boolean(postoIds.length || fornecedorIds.length || de || ate);
  const nomesPostos = postoIds.length ? postos.filter((p) => postoIds.includes(p.id)).map((p) => p.nome).join(", ") : null;
  const nomesFornecedores = fornecedorIds.length ? fornecedores.filter((f) => fornecedorIds.includes(f.id)).map((f) => f.nome).join(", ") : null;
  const dataBR = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className={TITULO_PAGINA}>Combustíveis Pagos</h1>
        <BotaoImprimir />
      </div>
      <CabecalhoImpressao
        titulo="Combustíveis Pagos"
        detalhes={[
          { rotulo: "Posto", valor: nomesPostos },
          { rotulo: "Fornecedor", valor: nomesFornecedores },
          { rotulo: "Pago em", valor: de || ate ? `${dataBR(de) ?? "início"} a ${dataBR(ate) ?? "sem limite"}` : null },
        ]}
      />

      <p className="text-sm text-foreground/60 print:hidden">
        Combustíveis já baixados pela conciliação automática — ver{" "}
        <Link href="/combustiveis-a-pagar" className="underline">
          Combustíveis a Pagar
        </Link>{" "}
        pro que ainda está em aberto.
      </p>

      {padrao && <AvisoPadraoDia modo="ontem" dia={de!} />}
      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm print:hidden`}>
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
          <SeletorDropdown
            nome="fornecedorId"
            rotuloTodos="Todos os fornecedores"
            selecionados={fornecedorIds}
            itens={fornecedores.map((f) => ({ id: f.id, nome: f.nome, documento: f.documento }))}
          />
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
            className={CAMPO}
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
            className={CAMPO}
          />
        </div>
        <button
          type="submit"
          className={BOTAO_PRIMARIO}
        >
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/combustiveis-pagos" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>


      <p className="text-sm text-foreground/60">
        {contas.length} conta{contas.length === 1 ? "" : "s"} em {porPosto.length} posto{porPosto.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
      </p>

      {porPosto.length > 1 && (
        <div className={`${CARTAO} overflow-hidden [break-inside:avoid]`}>
          <table className="w-full text-sm">
            <thead className={CABECALHO_TABELA}>
              <tr>
                <th className="px-4 py-2.5 text-left">Resumo por posto</th>
                <th className="px-4 py-2.5 text-right">Contas</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {porPosto.map((p) => (
                <tr key={p.nome} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2">{p.nome}</td>
                  <td className="px-4 py-2 text-right">{p.contas.length}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{formatarMoeda(p.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/20 font-semibold dark:border-white/20">
                <td className="px-4 py-2.5">Total geral</td>
                <td className="px-4 py-2.5 text-right">{contas.length}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatarMoeda(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {porPosto.map((p) => (
        <div key={p.nome} className={`${CARTAO} overflow-x-auto [break-inside:avoid]`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#DCE7FA] dark:bg-blue-950/40">
                <th colSpan={podeEditar ? 6 : 5} className="px-4 py-2.5 text-left text-[13px] font-semibold uppercase">
                  {p.nome}
                </th>
              </tr>
              <tr className={CABECALHO_TABELA}>
                <th className="px-4 py-2.5 text-left">Data de descarga</th>
                <th className="px-4 py-2.5 text-left">Data de pagamento</th>
                <th className="px-4 py-2.5 text-left">Fornecedor</th>
                <th className="px-4 py-2.5 text-left">Descrição</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                {podeEditar && <th className="px-4 py-2.5 text-right print:hidden">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {p.contas.map((c) => (
                <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2 whitespace-nowrap">{formatarData(c.dataDescarga)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatarData(c.dataPagamento)}</td>
                  <td className="px-4 py-3">{c.fornecedor.nome}</td>
                  <td className="px-4 py-2 text-foreground/70">
                    {c.descricao ?? "—"}
                    {c.acertosEntrePostos.map((m) => (
                      <span key={m.id} className="block text-xs text-foreground/50">
                        Acerto entre postos: {m.postoOrigem.nome} quitou {formatarMoeda(Number(m.valor))}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatarMoeda(c.valor.toString())}
                    {Number(c.desconto) > 0 && (
                      <span className="block text-xs text-foreground/50">
                        desc. {formatarMoeda(c.desconto.toString())} → {formatarMoeda(liquido(c).toString())}
                      </span>
                    )}
                  </td>
                  {podeEditar && (
                    <td className="px-4 py-2 text-right print:hidden">
                      <Link href={`/combustiveis-pagos/${c.id}/editar`} className={BOTAO_EDITAR}>
                        Editar
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/20 font-semibold dark:border-white/20">
                <td colSpan={4} className="px-4 py-2.5 text-right">
                  Total {p.nome}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatarMoeda(p.total)}</td>
                {podeEditar && <td className="print:hidden" />}
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {porPosto.length === 0 && (
        <p className={`${CARTAO} px-4 py-6 text-center text-sm text-foreground/50`}>Nenhum combustível pago encontrado pra esse filtro.</p>
      )}
    </div>
  );
}
