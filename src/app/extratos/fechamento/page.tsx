import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { gerarFechamento, MESES_PT } from "@/lib/extratos/fechamento";

function formatarNumero(v: number): string {
  if (Math.round(v * 100) === 0) return "";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; mes?: string; saldoInicial?: string }>;
}) {
  await exigirPermissao("EXTRATOS", "visualizar");

  const { postoId, mes, saldoInicial } = await searchParams;
  const postos = await prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } });

  const hoje = new Date();
  const mesValor = mes ?? `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [anoStr, mesStr] = mesValor.split("-");
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  const saldoInicialNum = Number(paraDecimalString(saldoInicial ?? "0") ?? "0");

  const resultado =
    postoId && ano && mesNum
      ? await gerarFechamento({ postoId, ano, mes: mesNum, saldoInicial: saldoInicialNum })
      : null;

  const qs = new URLSearchParams({
    ...(postoId ? { postoId } : {}),
    mes: mesValor,
    saldoInicial: String(saldoInicialNum),
  }).toString();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Fechamento</h1>
        <Link href="/extratos" className="text-sm text-foreground/60 underline">
          ← Voltar pra Conciliação de Extratos
        </Link>
      </div>
      <p className="text-sm text-foreground/60">
        Soma os lançamentos já categorizados por dia × categoria, num único posto e mês, com saldo
        acumulado. Lançamentos sem categoria ficam de fora da soma.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <select
            id="postoId"
            name="postoId"
            defaultValue={postoId ?? ""}
            required
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
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
          <label htmlFor="mes" className="text-foreground/60">
            Mês
          </label>
          <input
            id="mes"
            type="month"
            name="mes"
            defaultValue={mesValor}
            required
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
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
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Gerar
        </button>
      </form>

      {resultado && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-foreground/60">
              {resultado.postoNome} — {MESES_PT[resultado.mes]}/{resultado.ano} · total{" "}
              {resultado.totalGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ·
              saldo final{" "}
              {resultado.saldoFinal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <Link
              href={`/extratos/fechamento/exportar?${qs}`}
              className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Exportar (Excel)
            </Link>
          </div>

          {resultado.semCategoria > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
              {resultado.semCategoria} lançamento{resultado.semCategoria === 1 ? "" : "s"} sem categoria
              nesse mês não {resultado.semCategoria === 1 ? "entrou" : "entraram"} na soma abaixo.{" "}
              <Link href={`/extratos?postoId=${postoId}&categoria=sem`} className="underline">
                Revisar agora →
              </Link>
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full text-sm">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="sticky left-0 bg-black/5 px-3 py-2 text-left font-medium dark:bg-white/5">
                    Dia
                  </th>
                  {resultado.categorias.map((c) => (
                    <th key={c.id} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {c.nome}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {resultado.linhas.map((l) => (
                  <tr key={l.dia} className="border-t border-black/10 dark:border-white/10">
                    <td className="sticky left-0 bg-background px-3 py-1.5">{l.dia}</td>
                    {l.porCategoria.map((v, i) => (
                      <td key={i} className="px-3 py-1.5 text-right whitespace-nowrap">
                        {formatarNumero(v)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap">
                      {formatarNumero(l.saldoAcumulado)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black/30 font-medium">
                  <td className="sticky left-0 bg-background px-3 py-2">Total</td>
                  {resultado.totalPorCategoria.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right whitespace-nowrap">
                      {formatarNumero(v)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatarNumero(resultado.saldoFinal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
