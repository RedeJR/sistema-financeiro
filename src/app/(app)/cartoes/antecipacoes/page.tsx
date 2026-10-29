import Link from "next/link";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { paraLista, emLista } from "@/lib/filtro-multiplo";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { excluirAntecipacao } from "./actions";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CABECALHO_TABELA, CAMPO, CARTAO } from "@/lib/estilo";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export const metadata = { title: "Cartões - Antecipações" };

export default async function AntecipacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; adquirenteId?: string }>;
}) {
  const { postoId, adquirenteId } = await searchParams;
  const postoIds = paraLista(postoId);

  const [postos, adquirentes, antecipacoes, podeEditar] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.antecipacaoCartao.findMany({
      where: { ...emLista("postoId", postoIds), ...(adquirenteId ? { adquirenteId } : {}) },
      include: { posto: true, adquirente: true },
      orderBy: [{ dataRecebimento: "desc" }, { createdAt: "desc" }],
    }),
    podeEditarModulo("CARTOES"),
  ]);

  const totais = antecipacoes.reduce(
    (acc, a) => ({ face: acc.face + Number(a.valorFace), liquido: acc.liquido + Number(a.valorLiquido) }),
    { face: 0, liquido: 0 }
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-foreground/60">
        Antecipações de recebíveis feitas nas adquirentes. Em Recebimentos (por data de pagamento) e no Resumo
        mensal, o líquido entra como esperado no dia em que caiu e o valor antecipado sai dos dias do período —
        proporcionalmente ao crédito esperado de cada dia, já que a adquirente não diz quais vendas foram
        antecipadas.
      </p>

      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm`}>
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
          <label htmlFor="adquirenteId" className="text-foreground/60">
            Adquirente
          </label>
          <select
            id="adquirenteId"
            name="adquirenteId"
            defaultValue={adquirenteId ?? ""}
            className={CAMPO}
          >
            <option value="">Todas</option>
            {adquirentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className={BOTAO_PRIMARIO}
        >
          Filtrar
        </button>
        {(postoIds.length || adquirenteId) && (
          <Link href="/cartoes/antecipacoes" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {podeEditar && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <a href="/cartoes/antecipacoes/importar/modelo" className={`${BOTAO_SECUNDARIO} text-sm font-medium`}>
              Baixar modelo
            </a>
            <Link href="/cartoes/antecipacoes/importar" className={`${BOTAO_SECUNDARIO} text-sm font-medium`}>
              Importar planilha
            </Link>
            <Link href="/cartoes/antecipacoes/importar-cielo" className={`${BOTAO_SECUNDARIO} text-sm font-medium`}>
              Importar negociação Cielo
            </Link>
            <Link
              href="/cartoes/antecipacoes/novo"
              className="rounded-md bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800"
            >
              + Nova antecipação
            </Link>
          </div>
        )}
      </form>

      {antecipacoes.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhuma antecipação cadastrada.</p>
      ) : (
        <div className={`${CARTAO} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className={CABECALHO_TABELA}>
              <tr>
                <th className="px-4 py-2.5 text-left">Caiu em</th>
                <th className="px-4 py-2.5 text-left">Posto</th>
                <th className="px-4 py-2.5 text-left">Adquirente</th>
                <th className="px-4 py-2.5 text-left">Recebíveis de</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                <th className="px-4 py-2.5 text-right">Desconto</th>
                <th className="px-4 py-2.5 text-right">%</th>
                <th className="px-4 py-2.5 text-right">Líquido recebido</th>
                <th className="px-4 py-2.5 text-left">Obs.</th>
                {podeEditar && <th className="px-4 py-2.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {antecipacoes.map((a) => {
                const face = Number(a.valorFace);
                const liquido = Number(a.valorLiquido);
                const desconto = face - liquido;
                return (
                  <tr key={a.id} className="border-t border-black/5 dark:border-white/10">
                    <td className="px-4 py-3 whitespace-nowrap">{formatarData(a.dataRecebimento)}</td>
                    <td className="px-4 py-3">{a.posto.nome}</td>
                    <td className="px-4 py-3">{a.adquirente.nome}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatarData(a.periodoDe)} a {formatarData(a.periodoAte)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(face)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(desconto)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {face > 0 ? `${((desconto / face) * 100).toFixed(2).replace(".", ",")}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(liquido)}</td>
                    <td className="px-4 py-3 text-foreground/70">{a.observacao ?? "—"}</td>
                    {podeEditar && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/cartoes/antecipacoes/${a.id}/editar`}
                            className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            Editar
                          </Link>
                          <form action={excluirAntecipacao}>
                            <input type="hidden" name="id" value={a.id} />
                            <ConfirmSubmitButton
                              confirmMessage={`Excluir a antecipação de ${a.adquirente.nome} em ${a.posto.nome} (${formatarData(a.dataRecebimento)})? Essa ação não pode ser desfeita.`}
                            >
                              Excluir
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 bg-[#DCE7FA] font-bold dark:border-white/10 dark:bg-blue-950/40">
                <td className="px-4 py-3" colSpan={4}>
                  Total
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totais.face)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totais.face - totais.liquido)}</td>
                <td></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totais.liquido)}</td>
                <td colSpan={podeEditar ? 2 : 1}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
