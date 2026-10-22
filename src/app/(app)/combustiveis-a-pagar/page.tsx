import Link from "next/link";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { paraLista, emLista, anexarLista } from "@/lib/filtro-multiplo";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { hojeUTC } from "@/lib/datas";
import { rodarConciliacaoAutomaticaCombustiveis, combustiveisNoExtratoSemConta } from "@/lib/conciliacao";
import { excluirCombustivelAPagar } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { BOTAO_EDITAR, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CABECALHO_TABELA, CAMPO, CARTAO, ETIQUETA_VERMELHA, TITULO_PAGINA } from "@/lib/estilo";
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
    VENCIDA: "rounded-full bg-[#FDECEC] px-2.5 py-0.5 text-xs font-semibold text-[#A12727] dark:bg-red-900/40 dark:text-red-400",
    A_VENCER: "rounded-full bg-[#EEF0F3] px-2.5 py-0.5 text-xs font-semibold text-[#374151] dark:bg-white/10 dark:text-foreground/70",
  };
  const rotulos: Record<StatusConta, string> = {
    VENCIDA: "Vencida",
    A_VENCER: "A vencer",
  };
  return <span className={estilos[status]}>{rotulos[status]}</span>;
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
    postoId?: string | string[];
    status?: string;
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

  const { postoId, status, de, ate, q, erro } = await searchParams;
  const postoIds = paraLista(postoId);
  const busca = q?.trim();

  // Essa tela só mostra o que está em aberto — o que já foi pago tem tela
  // própria agora (Combustíveis Pagos, ver /combustiveis-pagos), pedido da
  // usuária pra não ficar tudo misturado com filtro na mesma tela.
  const [contas, postos] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: {
        combustivel: true,
        paga: false,
        ...emLista("postoId", postoIds),
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
      include: { posto: true, fornecedor: true },
      orderBy: { dataVencimento: "asc" },
    }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  const hoje = hojeUTC();
  const contasComStatus = contas
    .map((c) => ({ ...c, status: statusDaConta(c.dataVencimento, hoje) }))
    .filter((c) => !status || c.status === status);

  const total = contasComStatus.reduce((soma, c) => soma + Number(c.valor), 0);
  const qsExportar = new URLSearchParams(Object.entries({ de, ate }).filter(([, v]) => v) as [string, string][]);
  anexarLista(qsExportar, "postoId", postoIds);
  const temFiltro = Boolean(postoIds.length || status || de || ate || busca);

  return (
    <div className="space-y-6">
      {erro && MENSAGENS_ERRO[erro] && <ErroFormulario mensagem={MENSAGENS_ERRO[erro]} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={TITULO_PAGINA}>Combustíveis a Pagar</h1>
          <p className="mt-1.5 text-sm text-foreground/60">Boletos de combustível por vencimento e descarga.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/combustiveis-a-pagar/relatorio"
            className={`${BOTAO_SECUNDARIO} text-sm font-medium`}
          >
            Relatório (PDF)
          </Link>
          <a
            href={`/combustiveis-a-pagar/exportar?${qsExportar.toString()}`}
            className={`${BOTAO_SECUNDARIO} text-sm font-medium`}
          >
            Exportar (Excel)
          </a>
          {podeEditar && (
            <Link
              href="/combustiveis-a-pagar/novo"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              + Novo combustível
            </Link>
          )}
        </div>
      </div>

      <p className="rounded-xl border border-blue-200 bg-[#EEF4FF] px-5 py-3 text-sm leading-relaxed text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
        Baixa automática: assim que o débito correspondente aparecer conciliado no extrato bancário
        (mesmo posto, mesmo valor, categoria &quot;Combustíveis&quot;), a conta sai dessa lista sozinha e
        vai pra{" "}
        <Link href="/combustiveis-pagos" className="underline">
          Combustíveis Pagos
        </Link>
        . Ambíguo (mais de uma conta com o mesmo valor no mesmo posto) fica pendente pra conferência
        manual em Conciliação de Extratos.
      </p>

      {semConta.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 dark:border-amber-900 dark:bg-amber-950/40">
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
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-foreground/60">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className={CAMPO}
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
        <button type="submit" className={BOTAO_PRIMARIO}>
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/combustiveis-a-pagar" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <section aria-label="Resumo" className="flex flex-wrap gap-4">
        <div className={`${CARTAO} min-w-[220px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Contas no filtro</p>
          <p className="mt-1.5 text-[28px] font-bold tracking-tight">{contasComStatus.length}</p>
        </div>
        <div className={`${CARTAO} min-w-[220px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Total</p>
          <p className="mt-1.5 text-[28px] font-bold tracking-tight">{formatarMoeda(total)}</p>
        </div>
      </section>

      <div className={`${CARTAO} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className={CABECALHO_TABELA}>
            <tr>
              <th className="px-4 py-2.5 text-left">Vencimento</th>
              <th className="px-4 py-2.5 text-left">Descarga</th>
              <th className="px-4 py-2.5 text-left">Posto</th>
              <th className="px-4 py-2.5 text-left">Fornecedor</th>
              <th className="px-4 py-2.5 text-left">Descrição</th>
              <th className="px-4 py-2.5 text-right">Valor</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              {podeEditar && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {contasComStatus.map((c) => (
              <tr key={c.id} className="border-t border-black/10 hover:bg-black/[0.015] dark:border-white/10 dark:hover:bg-white/[0.03]">
                <td className="px-4 py-3 whitespace-nowrap">{formatarData(c.dataVencimento)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {c.dataDescarga ? formatarData(c.dataDescarga) : "—"}
                </td>
                <td className="px-4 py-3">{c.posto.nome}</td>
                <td className="px-4 py-3">{c.fornecedor.nome}</td>
                <td className="px-4 py-3 text-foreground/70">{c.descricao ?? "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(c.valor.toString())}</td>
                <td className="px-4 py-3">
                  <BadgeStatus status={c.status} />
                </td>
                {podeEditar && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/combustiveis-a-pagar/${c.id}/vincular`}
                        className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                        title="Vincular manualmente a um ou mais lançamentos do extrato — útil quando o pagamento foi feito picado"
                      >
                        Vincular
                      </Link>
                      <Link
                        href={`/combustiveis-a-pagar/${c.id}/editar`}
                        className={BOTAO_EDITAR}
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
