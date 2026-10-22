import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { gerarFechamento, MESES_PT } from "@/lib/extratos/fechamento";
import { BOTAO_SECUNDARIO, CABECALHO_TABELA, CAMPO, CARTAO, TITULO_PAGINA } from "@/lib/estilo";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";
import { OrientacaoImpressao } from "@/components/ui/orientacao-impressao";
import { BotaoImprimir } from "../relatorios/botao-imprimir";

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
  const saldoInicialNum = Number(paraDecimalString(saldoInicial ?? "0") ?? "0");

  // Banco é obrigatório igual o posto — sem isso, lançamentos de contas
  // diferentes (ex: Bradesco e PagSeguro do mesmo posto) se misturariam num
  // saldo só, que não corresponde a nenhum extrato de verdade.
  const resultado =
    postoId && bancoId && ano && mesNum
      ? await gerarFechamento({ postoId, bancoId, ano, mes: mesNum, saldoInicial: saldoInicialNum })
      : null;

  const qs = new URLSearchParams({
    ...(postoId ? { postoId } : {}),
    ...(bancoId ? { bancoId } : {}),
    mes: mesValor,
    saldoInicial: String(saldoInicialNum),
  }).toString();

  return (
    <div className="space-y-6">
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
        Soma os lançamentos já categorizados por dia × categoria, num único posto e mês, com saldo
        acumulado. Lançamentos sem categoria ficam de fora da soma.
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
            Saldo inicial
          </label>
          <input
            id="saldoInicial"
            type="text"
            inputMode="decimal"
            name="saldoInicial"
            defaultValue={saldoInicial ?? "0"}
            placeholder="0,00"
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
              {resultado.semCategoria} lançamento{resultado.semCategoria === 1 ? "" : "s"} sem categoria
              nesse mês não {resultado.semCategoria === 1 ? "entrou" : "entraram"} na soma abaixo.{" "}
              <Link href={`/extratos?postoId=${postoId}&bancoId=${bancoId}&categoria=sem`} className="underline">
                Revisar agora →
              </Link>
            </p>
          )}

          <section aria-label="Resumo do mês" className="flex flex-wrap gap-3">
            <div className={`${CARTAO} min-w-[160px] flex-1 px-4 py-3`}>
              <p className="text-[12px] text-foreground/60">Saldo inicial</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${classeValor(resultado.saldoInicial)}`}>{formatarMoedaBR(resultado.saldoInicial)}</p>
            </div>
            <div className={`${CARTAO} min-w-[160px] flex-1 px-4 py-3`}>
              <p className="text-[12px] text-foreground/60">Movimento do mês (categorizado)</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${classeValor(resultado.totalGeral)}`}>{formatarMoedaBR(resultado.totalGeral)}</p>
            </div>
            <div className={`${CARTAO} min-w-[160px] flex-1 px-4 py-3`}>
              <p className="text-[12px] text-foreground/60">Saldo final</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${classeValor(resultado.saldoFinal)}`}>{formatarMoedaBR(resultado.saldoFinal)}</p>
            </div>
            {resultado.semCategoria > 0 && (
              <div className="hidden min-w-[160px] flex-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 print:block">
                <p className="text-[12px]">Atenção</p>
                <p className="mt-1 text-[12px] font-semibold">
                  {resultado.semCategoria} lançamento{resultado.semCategoria === 1 ? "" : "s"} sem categoria fora da soma
                </p>
              </div>
            )}
          </section>

          <div className={`${CARTAO} overflow-x-auto`}>
            {/* Letra menor quanto mais colunas de categoria, pra caber numa página só. */}
            <table
               className={`tabela-compacta ${resultado.categorias.length > 12 ? "cabecalho-vertical" : ""} w-full text-sm`}
              style={
                {
                  "--print-td": resultado.categorias.length > 16 ? "6px" : resultado.categorias.length > 11 ? "7px" : "8.5px",
                  "--print-th": resultado.categorias.length > 16 ? "5px" : resultado.categorias.length > 11 ? "6px" : "7.5px",
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
                  <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${classeValor(resultado.saldoFinal)}`}>
                    {formatarNumero(resultado.saldoFinal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Detalhamento das categorias que pedem explicação (Outros, Venda a Prazo): de onde veio cada valor. */}
          {resultado.detalhes
            .filter((d) => d.linhas.length > 0)
            .map((d) => (
              <section key={d.categoriaNome} className="space-y-2 print:break-inside-avoid">
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
