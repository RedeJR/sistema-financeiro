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
    de?: string;
    ate?: string;
    q?: string;
    erro?: string;
  }>;
}) {
  await exigirPermissao("CONFERENCIA_DIARIA", "visualizar");
  const podeEditar = await podeEditarModulo("CONFERENCIA_DIARIA");

  await gerarOcorrenciasRecorrentesPendentes();

  const { postoId, fornecedorId, planoContaId, de, ate, q, erro } = await searchParams;
  const busca = q?.trim();
  const hoje = hojeUTC();

  // "voltarPara" no link Editar: sem isso, editar uma conta daqui (o
  // formulário é compartilhado com Contas a Pagar) voltava pra Contas a
  // Pagar sem filtro nenhum em vez de voltar pra cá, com o filtro que já
  // estava aplicado. Ver contas-a-pagar/actions.ts.
  const qsAtual = new URLSearchParams(
    Object.entries({ postoId, fornecedorId, planoContaId, de, ate, q: busca }).filter(([, v]) => v) as [
      string,
      string
    ][]
  ).toString();
  const urlAtual = `/conferencia-diaria${qsAtual ? `?${qsAtual}` : ""}`;
  const qsVoltarPara = `voltarPara=${encodeURIComponent(urlAtual)}`;
  // Só duas datas: inicial (opcional — sem ela, pega tudo que já venceu até
  // a final) e final (obrigatória na prática, default hoje). Sem "de" e sem
  // mexer em "ate", o resultado é igual ao antigo padrão "hoje + tudo
  // vencido": dataVencimento <= hoje.
  const dataAte = ate ? dataUTC(ate) : hoje;
  const condicaoData = {
    dataVencimento: {
      ...(de ? { gte: dataUTC(de) } : {}),
      lte: dataAte,
    },
  };

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
        ...condicaoData,
        // Busca por fornecedor OU descrição — sem risco de colisão de
        // chave aqui, condicaoData não usa "OR" (só "dataVencimento").
        ...(busca
          ? {
              OR: [
                { fornecedor: { nome: { contains: busca, mode: "insensitive" } } },
                { descricao: { contains: busca, mode: "insensitive" } },
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
        Contas com vencimento até a data final escolhida (inclui tudo que já venceu e ainda não foi pago), a
        partir da data inicial se você preencher.
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
          <label htmlFor="de" className="text-foreground/60">
            Data inicial
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
            Data final
          </label>
          <input
            id="ate"
            type="date"
            name="ate"
            defaultValue={ate ?? paraDataInput(hoje)}
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
        {(postoId || fornecedorId || planoContaId || de || ate || busca) && (
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
              <label htmlFor="postoPagamentoId" className="text-foreground/60">
                Pago pelo posto
              </label>
              <select
                id="postoPagamentoId"
                name="postoPagamentoId"
                form={FORM_PAGAR}
                defaultValue=""
                className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
              >
                <option value="">Mesmo posto da conta</option>
                {postos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
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
            <p className="w-full text-xs text-foreground/50">
              &quot;Pago pelo posto&quot; só precisa mudar quando o dinheiro saiu do banco de um posto DIFERENTE do
              dono da conta (ex: OLIVEIRA pagando uma conta que é da SUL AMERICA) — nesse caso a conciliação com o
              extrato bancário é feita contra o posto escolhido aqui, não contra o posto da conta.
            </p>
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
                        href={`/contas-a-pagar/${c.id}/editar?${qsVoltarPara}`}
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
