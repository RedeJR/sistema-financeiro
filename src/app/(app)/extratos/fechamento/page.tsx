import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { gerarFechamento, MESES_PT } from "@/lib/extratos/fechamento";
import { BOTAO_SECUNDARIO, CABECALHO_TABELA, CAMPO, CARTAO, TITULO_PAGINA } from "@/lib/estilo";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";
import { OrientacaoImpressao } from "@/components/ui/orientacao-impressao";
import { BotaoImprimir } from "../relatorios/botao-imprimir";
import { guardarSaldoInicial, guardarSaldoConferido } from "../actions";

function formatarNumero(v: number): string {
  if (Math.round(v * 100) === 0) return "";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarMoedaBR(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Valor negativo em vermelho (entrada continua na cor normal) — vale na tela e no papel.
function classeValor(v: number): string {
  return v < 0 ? "text-[#A12727]" : "";
}

function formatarDataBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export const metadata = { title: "Extratos - Fechamento" };

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; bancoId?: string; mes?: string; saldoInicial?: string }>;
}) {
  await exigirPermissao("EXTRATOS", "visualizar");

  const { postoId, bancoId, mes, saldoInicial } = await searchParams;
  const [postos, bancos] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  const hoje = new Date();
  const mesValor = mes ?? `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [anoStr, mesStr] = mesValor.split("-");
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  // Em branco = automático (saldo que o banco mandou no arquivo); digitado = vale o digitado.
  const saldoInformado = saldoInicial?.trim() ? Number(paraDecimalString(saldoInicial) ?? "0") : undefined;

  // Banco é obrigatório igual o posto — sem isso, lançamentos de contas
  // diferentes (ex: Bradesco e PagSeguro do mesmo posto) se misturariam num
  // saldo só, que não corresponde a nenhum extrato de verdade.
  const resultado =
    postoId && bancoId && ano && mesNum
      ? await gerarFechamento({ postoId, bancoId, ano, mes: mesNum, saldoInicial: saldoInformado })
      : null;

  // Data e saldo que o botão "Guardar como conferido" grava: o fim do mês, se ele já passou; senão o último dia com movimento.
  const dataConferencia = (() => {
    if (!resultado) return null;
    const fimMes = new Date(Date.UTC(resultado.ano, resultado.mes, 0));
    const hojeBR = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}T00:00:00.000Z`);
    let dia = resultado.ultimoDia;
    if (hojeBR <= fimMes) {
      while (dia > 1 && Math.round((resultado.linhas[dia - 1].porCategoria.reduce((s, v) => s + Math.abs(v), 0) + Math.abs(resultado.linhas[dia - 1].semCategoria)) * 100) === 0) dia--;
    }
    const data = new Date(Date.UTC(resultado.ano, resultado.mes - 1, dia));
    return { data, iso: data.toISOString().slice(0, 10), saldo: Math.round(resultado.linhas[dia - 1].saldoAcumulado * 100) / 100 };
  })();

  // Já existe um saldo conferido por você exatamente nessa data e com esse valor: o botão vira um aviso.
  const jaConferido =
    !!resultado?.saldoBanco?.conferidoPorVoce &&
    !!dataConferencia &&
    resultado.saldoBanco.data.getTime() === dataConferencia.data.getTime() &&
    Math.abs(resultado.saldoBanco.valor - dataConferencia.saldo) < 0.005;

  const temSemCategoria = !!resultado && resultado.linhas.some((l) => Math.round(l.semCategoria * 100) !== 0);
  const colunasCategoria = resultado ? resultado.categorias.length + (temSemCategoria ? 1 : 0) : 0;

  const qs = new URLSearchParams({
    ...(postoId ? { postoId } : {}),
    ...(bancoId ? { bancoId } : {}),
    mes: mesValor,
    ...(saldoInformado !== undefined ? { saldoInicial: String(saldoInformado) } : {}),
  }).toString();

  return (
    <div className="space-y-6 print:space-y-2">
      <OrientacaoImpressao />
      {resultado && (
        <CabecalhoImpressao
          titulo={`Fechamento do Extrato — ${MESES_PT[resultado.mes]}/${resultado.ano}`}
          detalhes={[
            { rotulo: "Posto", valor: resultado.postoNome },
            { rotulo: "Banco", valor: resultado.bancoNome },
            { rotulo: "Saldo inicial", valor: formatarMoedaBR(resultado.saldoInicial) },
          ]}
        />
      )}
      <div className="flex items-center justify-between print:hidden">
        <h1 className={TITULO_PAGINA}>Fechamento</h1>
        <Link href="/extratos" className="text-sm text-foreground/60 underline">
          ← Voltar pra Conciliação de Extratos
        </Link>
      </div>
      <p className="text-sm text-foreground/60 print:hidden">
        Soma os lançamentos por dia × categoria, num único posto e mês, com saldo acumulado. O saldo inicial vem
        do saldo que o banco mandou no arquivo do extrato; os lançamentos ainda sem categoria entram numa coluna
        própria, pro saldo bater com o do banco.
      </p>

      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm print:hidden`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <select
            id="postoId"
            name="postoId"
            defaultValue={postoId ?? ""}
            required
            className={CAMPO}
          >
            <option value="" disabled>
              Escolha um posto
            </option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bancoId" className="text-foreground/60">
            Banco
          </label>
          <select
            id="bancoId"
            name="bancoId"
            defaultValue={bancoId ?? ""}
            required
            className={CAMPO}
          >
            <option value="" disabled>
              Escolha um banco
            </option>
            {bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="mes" className="text-foreground/60">
            Mês
          </label>
          <input
            id="mes"
            type="month"
            name="mes"
            defaultValue={mesValor}
            required
            className={CAMPO}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="saldoInicial" className="text-foreground/60">
            Saldo inicial <span className="text-foreground/40">(opcional)</span>
          </label>
          <input
            id="saldoInicial"
            type="text"
            inputMode="decimal"
            name="saldoInicial"
            defaultValue={saldoInicial ?? ""}
            placeholder="automático"
            className="w-32 rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Gerar
        </button>
      </form>

      {resultado && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm print:hidden">
            <p className="text-foreground/60">
              {resultado.postoNome} · {resultado.bancoNome} — {MESES_PT[resultado.mes]}/{resultado.ano} · total{" "}
              {resultado.totalGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ·
              saldo final{" "}
              {resultado.saldoFinal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <Link
              href={`/extratos/fechamento/exportar?${qs}`}
              className={`${BOTAO_SECUNDARIO} font-medium`}
            >
              Exportar (Excel)
            </Link>
            <BotaoImprimir />
          </div>

          {resultado.semCategoria > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden dark:bg-amber-950/40 dark:text-amber-400">
              {resultado.semCategoria} lançamento{resultado.semCategoria === 1 ? "" : "s"} sem categoria nesse mês
              ({formatarMoedaBR(resultado.totalSemCategoria)}) — {resultado.semCategoria === 1 ? "aparece" : "aparecem"} na coluna &quot;Sem categoria&quot;.{" "}
              <Link href={`/extratos?postoId=${postoId}&bancoId=${bancoId}&categoria=sem`} className="underline">
                Revisar agora →
              </Link>
            </p>
          )}

          {resultado.saldoInicialOrigem === "INFORMADO" && postoId && bancoId && (
            <form action={guardarSaldoInicial} className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-[#EEF4FF] px-4 py-2.5 text-[13px] text-blue-950 print:hidden">
              <input type="hidden" name="postoId" value={postoId} />
              <input type="hidden" name="bancoId" value={bancoId} />
              <input type="hidden" name="mes" value={mesValor} />
              <input type="hidden" name="saldoInicial" value={String(resultado.saldoInicial).replace(".", ",")} />
              <span>
                Esse saldo inicial ({formatarMoedaBR(resultado.saldoInicial)}) foi digitado por você. Quer deixá-lo guardado como o saldo do fim do mês
                anterior? Nos próximos fechamentos o campo pode ficar em branco.
              </span>
              <button type="submit" className="rounded-lg bg-blue-700 px-3 py-1.5 font-semibold text-white hover:bg-blue-800">
                Guardar como saldo inicial
              </button>
            </form>
          )}

          {postoId && bancoId && dataConferencia && jaConferido && (
            <p className="rounded-xl border border-[#BFE5CB] bg-[#F3FBF5] px-4 py-2.5 text-[13px] font-medium text-[#14693A] print:hidden">
              ✓ Saldo de {formatarDataBR(dataConferencia.data)} ({formatarMoedaBR(dataConferencia.saldo)}) guardado como conferido. Ele já vale como saldo
              inicial do mês seguinte.
            </p>
          )}
          {postoId && bancoId && dataConferencia && !jaConferido && (
            <form
              action={guardarSaldoConferido}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-black/[0.02] px-4 py-2.5 text-[13px] text-foreground/80 print:hidden dark:border-white/15"
            >
              <input type="hidden" name="postoId" value={postoId} />
              <input type="hidden" name="bancoId" value={bancoId} />
              <input type="hidden" name="mes" value={mesValor} />
              <input type="hidden" name="data" value={dataConferencia.iso} />
              <input type="hidden" name="saldo" value={String(dataConferencia.saldo).replace(".", ",")} />
              <span>
                Conferiu com o extrato do banco? O saldo calculado em {formatarDataBR(dataConferencia.data)} é {formatarMoedaBR(dataConferencia.saldo)}. Se
                estiver certo, guarde: ele vira o saldo inicial do mês seguinte e passa a valer na conferência no lugar do saldo que veio no arquivo.
              </span>
              <button type="submit" className="rounded-lg border border-black/15 bg-white px-3 py-1.5 font-semibold hover:bg-black/5 dark:border-white/20 dark:bg-transparent">
                Guardar como conferido
              </button>
            </form>
          )}

          <section aria-label="Resumo do mês" className="fech-resumo flex flex-wrap gap-3">
            <div className={`${CARTAO} min-w-[160px] flex-1 px-4 py-3`}>
              <p className="text-[12px] text-foreground/60">Saldo inicial</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${classeValor(resultado.saldoInicial)}`}>{formatarMoedaBR(resultado.saldoInicial)}</p>
              <p className="mt-1 text-[10.5px] leading-snug text-foreground/50">{resultado.saldoInicialObs}</p>
            </div>
            <div className={`${CARTAO} min-w-[160px] flex-1 px-4 py-3`}>
              <p className="text-[12px] text-foreground/60">Movimento do mês</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${classeValor(resultado.totalGeral + resultado.totalSemCategoria)}`}>
                {formatarMoedaBR(resultado.totalGeral + resultado.totalSemCategoria)}
              </p>
              {resultado.semCategoria > 0 && (
                <p className="mt-1 text-[10.5px] leading-snug text-amber-700">
                  inclui {formatarMoedaBR(resultado.totalSemCategoria)} ainda sem categoria
                </p>
              )}
            </div>
            <div className={`${CARTAO} min-w-[160px] flex-1 px-4 py-3`}>
              <p className="text-[12px] text-foreground/60">Saldo final calculado</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${classeValor(resultado.saldoFinal)}`}>{formatarMoedaBR(resultado.saldoFinal)}</p>
            </div>
            <div
              className={`min-w-[160px] flex-1 rounded-xl border px-4 py-3 ${
                !resultado.saldoBanco
                  ? "border-black/10 bg-white dark:border-white/15 dark:bg-white/[0.03]"
                  : Math.abs(resultado.saldoBanco.diferenca) < 0.005
                    ? "border-[#BFE5CB] bg-[#F3FBF5]"
                    : "border-[#F5C2C2] bg-[#FFF8F8]"
              }`}
            >
              <p className="text-[12px] text-foreground/60">
                Saldo do banco{resultado.saldoBanco ? ` em ${formatarDataBR(resultado.saldoBanco.data)}` : ""}
                {resultado.saldoBanco?.conferidoPorVoce && <span className="ml-1 text-[10.5px] text-foreground/50">(conferido por você)</span>}
              </p>
              {resultado.saldoBanco ? (
                <>
                  <p className="mt-1 text-xl font-bold tabular-nums">{formatarMoedaBR(resultado.saldoBanco.valor)}</p>
                  {Math.abs(resultado.saldoBanco.diferenca) < 0.005 ? (
                    <p className="mt-1 text-[10.5px] font-semibold text-[#14693A]">Confere com o calculado ✓</p>
                  ) : (
                    <p className="mt-1 text-[10.5px] leading-snug font-semibold text-[#A12727]">
                      Diferença de {formatarMoedaBR(resultado.saldoBanco.diferenca)} — o banco tem{" "}
                      {resultado.saldoBanco.diferenca > 0 ? "mais" : "menos"} que o calculado até essa data (falta ou sobra lançamento).
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="mt-1 text-xl font-bold text-foreground/40">—</p>
                  <p className="mt-1 text-[10.5px] leading-snug text-foreground/50">Sem saldo do banco guardado neste mês. Reimporte o último extrato desse banco.</p>
                </>
              )}
            </div>
          </section>

          <div className={`${CARTAO} overflow-x-auto`}>
            {/* Letra menor quanto mais colunas de categoria, pra caber numa página só. */}
            <table
               className={`tabela-compacta fech-dias ${colunasCategoria > 12 ? "cabecalho-vertical" : ""} w-full text-sm`}
              style={
                {
                  "--print-td": colunasCategoria > 16 ? "6px" : colunasCategoria > 11 ? "7px" : "8.5px",
                  "--print-th": colunasCategoria > 16 ? "5px" : colunasCategoria > 11 ? "6px" : "7.5px",
                } as React.CSSProperties
              }
            >
              <thead className={CABECALHO_TABELA}>
                <tr>
                  <th className="px-3 py-2.5 text-left print:static">
                    Dia
                  </th>
                  {resultado.categorias.map((c) => (
                    <th key={c.id} className="px-3 py-2.5 text-right whitespace-nowrap">
                      {c.nome}
                    </th>
                  ))}
                  {temSemCategoria && <th className="px-3 py-2.5 text-right whitespace-nowrap">Sem categoria</th>}
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {resultado.linhas.map((l) => (
                  <tr key={l.dia} className="border-t border-black/10 dark:border-white/10">
                    <td className="bg-background px-3 py-1.5 font-medium">{String(l.dia).padStart(2, "0")}</td>
                    {l.porCategoria.map((v, i) => (
                      <td key={i} className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${classeValor(v)}`}>
                        {formatarNumero(v)}
                      </td>
                    ))}
                    {temSemCategoria && (
                      <td className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${classeValor(l.semCategoria)}`}>{formatarNumero(l.semCategoria)}</td>
                    )}
                    <td className={`px-3 py-1.5 text-right font-semibold whitespace-nowrap tabular-nums ${classeValor(l.saldoAcumulado)}`}>
                      {formatarNumero(l.saldoAcumulado)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-blue-700 bg-[#DCE7FA] font-bold">
                  <td className="px-3 py-2">Total</td>
                  {resultado.totalPorCategoria.map((v, i) => (
                    <td key={i} className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${classeValor(v)}`}>
                      {formatarNumero(v)}
                    </td>
                  ))}
                  {temSemCategoria && (
                    <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${classeValor(resultado.totalSemCategoria)}`}>{formatarNumero(resultado.totalSemCategoria)}</td>
                  )}
                  <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${classeValor(resultado.saldoFinal)}`}>
                    {formatarNumero(resultado.saldoFinal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Detalhamento das categorias que pedem explicação (Outros, Venda a Prazo): de onde veio cada valor.
              No papel, a 1ª página é só o resumo e todos os dias do mês; os detalhamentos começam na 2ª. */}
          {resultado.detalhes
            .filter((d) => d.linhas.length > 0)
            .map((d, i) => (
              <section key={d.categoriaNome} className={`space-y-2 print:break-inside-avoid ${i === 0 ? "print:break-before-page" : ""}`}>
                <h2 className="text-base font-bold tracking-tight">Detalhamento — {d.categoriaNome}</h2>
                <div className={`${CARTAO} overflow-x-auto`}>
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "38%" }} />
                      <col />
                    </colgroup>
                    <thead className={CABECALHO_TABELA}>
                      <tr>
                        <th className="px-3 py-2.5 text-left">Data</th>
                        <th className="px-3 py-2.5 text-right">Valor</th>
                        <th className="px-3 py-2.5 text-left">Observação</th>
                        <th className="px-3 py-2.5 text-left">Descrição do banco</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.linhas.map((l, i) => (
                        <tr key={i} className="border-t border-black/5 dark:border-white/10">
                          <td className="px-3 py-1.5 whitespace-nowrap">{formatarDataBR(l.data)}</td>
                          <td className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${classeValor(l.valor)}`}>{formatarNumero(l.valor)}</td>
                          <td className="px-3 py-1.5 break-words">{l.observacao || "—"}</td>
                          <td className="px-3 py-1.5 break-words text-foreground/70">{l.descricaoBanco}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-blue-700 bg-[#DCE7FA] font-bold">
                        <td className="px-3 py-2">Total</td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${classeValor(d.linhas.reduce((s, l) => s + l.valor, 0))}`}>
                          {formatarNumero(d.linhas.reduce((s, l) => s + l.valor, 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            ))}
        </>
      )}
    </div>
  );
}
