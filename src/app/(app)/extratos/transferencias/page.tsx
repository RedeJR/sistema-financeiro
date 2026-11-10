import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { paraLista } from "@/lib/filtro-multiplo";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { SelecionarTodos } from "@/components/ui/selecionar-todos";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";
import { BotaoImprimir } from "../relatorios/botao-imprimir";
import { LinhaEditavel } from "../linha-editavel";
import { MESES_PT } from "@/lib/extratos/fechamento";
import { mesAtualISOBrasil } from "@/lib/datas-padrao";
import { analisarTransferencias, type LinhaTransferencia } from "@/lib/extratos/transferencias";
import { BOTAO_PRIMARIO, CABECALHO_TABELA, CAMPO, CARTAO, TITULO_PAGINA } from "@/lib/estilo";
import { marcarComoAntecipacaoDaycoval, desmarcarAntecipacaoDaycoval } from "./actions";

export const metadata = { title: "Extratos - Transferências entre contas" };

const FORM_MARCAR = "form-marcar-antecipacao";
const FORM_DESFAZER = "form-desfazer-antecipacao";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default async function TransferenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; postoId?: string | string[]; erro?: string }>;
}) {
  await exigirPermissao("EXTRATOS", "visualizar");
  const podeEditar = await podeEditarModulo("EXTRATOS");
  const { mes: mesUrl, postoId, erro } = await searchParams;
  const postoIds = paraLista(postoId);

  const mesAtual = mesAtualISOBrasil().de.slice(0, 7);
  const mes = mesUrl && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesUrl) ? mesUrl : mesAtual;
  const [ano, mesNum] = mes.split("-").map(Number);

  const [resumo, postos, categorias] = await Promise.all([
    analisarTransferencias({ ano, mes: mesNum, postoIds: postoIds }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.categoriaExtrato.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true, tipo: true } }),
  ]);

  const soma = (f: (p: (typeof resumo)[number]) => number) => Math.round(resumo.reduce((s, p) => s + f(p), 0) * 100) / 100;
  const entradasSemPar = soma((p) => p.somaEntradasSemPar);
  const saidasSemPar = soma((p) => p.somaSaidasSemPar);
  const antecipacoes = soma((p) => p.somaAntecipacoes);
  const qtdAntecipacoes = resumo.reduce((s, p) => s + p.antecipacoes.length, 0);
  const qtdPares = resumo.reduce((s, p) => s + p.pares.length, 0);
  const valorPares = soma((p) => p.valorPareado);
  const qtdSemPar = resumo.reduce((s, p) => s + p.entradasSemPar.length + p.saidasSemPar.length, 0);

  const qs = new URLSearchParams({ mes });
  for (const id of postoIds) qs.append("postoId", id);
  const urlAtual = `/extratos/transferencias?${qs.toString()}`;
  const nomesPostos = postoIds.length ? postos.filter((p) => postoIds.includes(p.id)).map((p) => p.nome).join(", ") : null;

  const linhaTabela = (l: LinhaTransferencia, opcoes: { checkbox?: string; grupo?: boolean }) => (
    <tr key={l.id} className="border-t border-black/5 align-top dark:border-white/10">
      {podeEditar && (
        <td className="px-4 py-2 print:hidden">{opcoes.checkbox && <input type="checkbox" name="ids" value={l.id} form={opcoes.checkbox} />}</td>
      )}
      <td className="px-4 py-2 whitespace-nowrap">{formatarData(l.data)}</td>
      <td className="px-4 py-2">
        {opcoes.grupo ? `${l.postoNome} · ` : ""}
        {l.bancoNome}
      </td>
      <td className="px-4 py-2 break-words">{l.descricao}</td>
      <td className={`px-4 py-2 text-right whitespace-nowrap ${l.valor < 0 ? "text-[#A12727]" : ""}`}>{formatarMoeda(l.valor)}</td>
      {podeEditar && (
        <td className="px-4 py-2 print:hidden">
          <LinhaEditavel id={l.id} categoriaAtual="" observacaoAtual={l.observacao ?? ""} categorias={categorias} />
        </td>
      )}
    </tr>
  );

  const cabecalhoTabela = (checkbox?: string) => (
    <thead className={CABECALHO_TABELA}>
      <tr>
        {podeEditar && <th className="px-4 py-2 text-left print:hidden">{checkbox ? <SelecionarTodos formId={checkbox} /> : null}</th>}
        <th className="px-4 py-2 text-left">Data</th>
        <th className="px-4 py-2 text-left">Banco</th>
        <th className="px-4 py-2 text-left">Descrição</th>
        <th className="px-4 py-2 text-right">Valor</th>
        {podeEditar && <th className="px-4 py-2 text-left print:hidden">Categoria / Observação</th>}
      </tr>
    </thead>
  );

  return (
    <div className="space-y-6">
      <CabecalhoImpressao titulo={`Transferências entre Contas — ${MESES_PT[mesNum]}/${ano}`} detalhes={[{ rotulo: "Posto", valor: nomesPostos }]} />
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className={TITULO_PAGINA}>Transferências entre Contas</h1>
        <div className="flex items-center gap-4">
          <BotaoImprimir />
          <Link href="/extratos" className="text-sm text-foreground/60 underline">
            ← Voltar pra Conciliação de Extratos
          </Link>
        </div>
      </div>

      <p className="max-w-4xl text-sm text-foreground/60 print:hidden">
        Toda saída de uma conta deve ter a entrada correspondente em outra conta do mesmo posto (mesmo valor, até 3 dias de diferença). O sistema casa
        sozinho; o que sobra <strong>sem par</strong> é dinheiro que entrou ou saiu por uma conta que o sistema não conhece (por exemplo o
        Daycoval) e precisa de explicação — senão o saldo fica na conta e o crédito continua como &quot;a receber&quot;.
      </p>
      {erro === "nenhuma-selecionada" && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Marque ao menos uma entrada antes de continuar.
        </p>
      )}

      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm print:hidden`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="mes" className="text-foreground/60">
            Mês
          </label>
          <input id="mes" type="month" name="mes" defaultValue={mes} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-foreground/60">Posto</label>
          <SeletorDropdown nome="postoId" rotuloTodos="Todos os postos" selecionados={postoIds} itens={postos.map((p) => ({ id: p.id, nome: p.nome }))} />
        </div>
        <button type="submit" className={BOTAO_PRIMARIO}>
          Filtrar
        </button>
      </form>

      <section aria-label="Resumo" className="flex flex-wrap gap-4">
        <div className={`${CARTAO} min-w-[200px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Entradas sem saída correspondente</p>
          <p className="mt-1.5 text-[24px] font-bold tracking-tight text-[#A12727]">{formatarMoeda(entradasSemPar)}</p>
        </div>
        <div className={`${CARTAO} min-w-[200px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Saídas sem entrada correspondente</p>
          <p className="mt-1.5 text-[24px] font-bold tracking-tight">{formatarMoeda(saidasSemPar)}</p>
        </div>
        <div className={`${CARTAO} min-w-[200px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Antecipação Daycoval marcada ({qtdAntecipacoes})</p>
          <p className="mt-1.5 text-[24px] font-bold tracking-tight">{formatarMoeda(antecipacoes)}</p>
        </div>
        <div className={`${CARTAO} min-w-[200px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Transferências casadas ({qtdPares})</p>
          <p className="mt-1.5 text-[24px] font-bold tracking-tight text-[#14693A]">{formatarMoeda(valorPares)}</p>
        </div>
      </section>

      {podeEditar && (
        <div className={`${CARTAO} flex flex-wrap items-center gap-3 px-5 py-3 text-sm print:hidden`}>
          <form id={FORM_MARCAR} action={marcarComoAntecipacaoDaycoval} className="contents">
            <input type="hidden" name="voltarPara" value={urlAtual} />
            <ConfirmSubmitButton
              form={FORM_MARCAR}
              confirmMessage="Marcar as entradas selecionadas como antecipação Daycoval? Elas deixam de ser transferência entre contas."
              className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
            >
              Marcar selecionadas como antecipação Daycoval
            </ConfirmSubmitButton>
          </form>
          <span className="text-foreground/60">Marque as entradas sem par abaixo que vieram da operação do Daycoval.</span>
        </div>
      )}

      {resumo.length === 0 && <p className="py-10 text-center text-sm text-foreground/50">Nenhuma transferência entre contas nesse mês.</p>}

      {resumo.map((p) => {
        const semPar = p.entradasSemPar.length + p.saidasSemPar.length;
        return (
          <section key={p.postoId} className={`${CARTAO} overflow-hidden [break-inside:avoid-page]`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-[#DCE7FA] px-5 py-3 dark:border-white/10 dark:bg-blue-950/40">
              <h2 className="text-base font-bold tracking-tight">{p.postoNome}</h2>
              <p className="text-sm">
                <span className="text-[#14693A]">{p.pares.length} casada{p.pares.length === 1 ? "" : "s"} ({formatarMoeda(p.valorPareado)})</span>
                {" · "}
                {semPar > 0 ? (
                  <span className="font-semibold text-[#A12727]">
                    sem par: {formatarMoeda(p.somaEntradasSemPar)} de entrada · {formatarMoeda(p.somaSaidasSemPar)} de saída
                  </span>
                ) : (
                  <span className="text-foreground/60">tudo com par</span>
                )}
                {p.antecipacoes.length > 0 && <> · antecipação Daycoval {formatarMoeda(p.somaAntecipacoes)}</>}
              </p>
            </div>

            {p.entradasSemPar.length > 0 && (
              <div className="overflow-x-auto">
                <p className="px-5 pt-3 text-[13px] font-semibold text-foreground/70">Entradas sem saída correspondente</p>
                <table className="w-full text-sm">
                  {cabecalhoTabela(FORM_MARCAR)}
                  <tbody>{p.entradasSemPar.map((l) => linhaTabela(l, { checkbox: FORM_MARCAR, grupo: p.postoNome.includes("+") }))}</tbody>
                </table>
              </div>
            )}

            {p.saidasSemPar.length > 0 && (
              <div className="overflow-x-auto">
                <p className="px-5 pt-3 text-[13px] font-semibold text-foreground/70">Saídas sem entrada correspondente</p>
                <table className="w-full text-sm">
                  {cabecalhoTabela()}
                  <tbody>{p.saidasSemPar.map((l) => linhaTabela(l, { grupo: p.postoNome.includes("+") }))}</tbody>
                </table>
              </div>
            )}

            {p.antecipacoes.length > 0 && (
              <div className="overflow-x-auto">
                <p className="px-5 pt-3 text-[13px] font-semibold text-foreground/70">Marcadas como antecipação Daycoval</p>
                <table className="w-full text-sm">
                  {cabecalhoTabela(FORM_DESFAZER)}
                  <tbody>{p.antecipacoes.map((l) => linhaTabela(l, { checkbox: FORM_DESFAZER, grupo: p.postoNome.includes("+") }))}</tbody>
                </table>
                {podeEditar && (
                  <form id={FORM_DESFAZER} action={desmarcarAntecipacaoDaycoval} className="px-5 py-2 print:hidden">
                    <input type="hidden" name="voltarPara" value={urlAtual} />
                    <ConfirmSubmitButton form={FORM_DESFAZER} confirmMessage="Desfazer a marcação das selecionadas? Elas voltam a ser transferência entre contas.">
                      Desfazer marcação das selecionadas
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            )}

            {p.pares.length > 0 && (
              <details className="border-t border-black/5 px-5 py-3 text-sm dark:border-white/10 print:hidden">
                <summary className="cursor-pointer text-foreground/60 hover:text-foreground">Ver as {p.pares.length} transferências casadas</summary>
                <div className="mt-2 space-y-1">
                  {p.pares.map((par, i) => (
                    <p key={i} className="text-foreground/70">
                      {par.saidas.map((s) => `${formatarData(s.data)} ${p.postoNome.includes("+") ? s.postoNome + " · " : ""}${s.bancoNome} ${formatarMoeda(s.valor)}`).join(" + ")}
                      {"  →  "}
                      {par.entradas.map((e) => `${formatarData(e.data)} ${p.postoNome.includes("+") ? e.postoNome + " · " : ""}${e.bancoNome} ${formatarMoeda(e.valor)}`).join(" + ")}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </section>
        );
      })}

      {resumo.length > 0 && qtdSemPar === 0 && <p className="text-sm text-[#14693A]">Todas as transferências do mês têm par.</p>}
    </div>
  );
}
