"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatarMoeda } from "@/lib/dinheiro";
import type { LinhaPreviewVenda, LinhaParaImportarVenda } from "@/lib/vendasAPrazo/importacao";
import { analisarPlanilhaVendas, importarVendasAPrazo } from "./actions";

type Opcao = { id: string; nome: string };
type Linha = LinhaPreviewVenda & { importar: boolean; viuSugestao: boolean };

const campo = "w-full rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground/40 dark:border-white/20";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function incompleta(l: Linha): boolean {
  return l.erros.length > 0 || !l.postoId;
}

export function ImportadorVendasAPrazo({ postos }: { postos: Opcao[] }) {
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ criadas: number; vinculadas: number } | null>(null);
  const [lendo, iniciarLeitura] = useTransition();
  const [gravando, iniciarGravacao] = useTransition();

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErro(null);
    setResultado(null);
    iniciarLeitura(async () => {
      const r = await analisarPlanilhaVendas(formData);
      if ("erro" in r) {
        setErro(r.erro);
        setLinhas([]);
        return;
      }
      setArquivo(r.arquivo);
      setLinhas(r.linhas.map((l) => ({ ...l, importar: l.erros.length === 0 && Boolean(l.postoId) && !l.duplicada, viuSugestao: false })));
    });
  }

  function atualizar(linha: number, mudancas: Partial<Linha>) {
    setLinhas((atual) =>
      atual.map((l) => {
        if (l.linha !== linha) return l;
        const nova = { ...l, ...mudancas };
        if (incompleta(nova)) nova.importar = false; // linha incompleta nunca fica marcada
        return nova;
      })
    );
  }

  const marcadas = linhas.filter((l) => l.importar);
  const totalMarcado = marcadas.reduce((s, l) => s + (l.valor ?? 0), 0);
  const jaLancadas = linhas.filter((l) => l.duplicada?.onde === "sistema").length;
  const repetidas = linhas.filter((l) => l.duplicada?.onde === "arquivo").length;
  const incompletas = linhas.filter(incompleta).length;
  const aConfirmar = linhas.filter((l) => !incompleta(l) && !l.viuSugestao && l.postoOrigem === "sugerido").length;

  function confirmar() {
    const payload: LinhaParaImportarVenda[] = marcadas.map((l) => ({
      linha: l.linha,
      postoTexto: l.postoTexto,
      postoId: l.postoId!,
      cliente: l.cliente,
      periodoDe: l.periodoDe!,
      periodoAte: l.periodoAte!,
      valor: l.valor!,
      dataPagamento: l.dataPagamento!,
      observacao: l.observacao,
    }));
    setErro(null);
    iniciarGravacao(async () => {
      const r = await importarVendasAPrazo(payload);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setResultado(r);
      setLinhas([]);
      setArquivo(null);
    });
  }

  return (
    <div className="space-y-4">
      {resultado && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <p className="font-medium">
            {resultado.criadas} venda(s) a prazo lançada(s)
            {resultado.vinculadas > 0 ? `; ${resultado.vinculadas} já ligada(s) ao extrato.` : "."}
          </p>
          <Link className="underline" href="/vendas-a-prazo">
            Ver em Vendas a Prazo
          </Link>
        </div>
      )}

      <form onSubmit={aoEnviar} className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="arquivo" className="text-foreground/60">
            Planilha (.xlsx)
          </label>
          <input id="arquivo" name="arquivo" type="file" accept=".xlsx,.xls" required className="rounded-md border border-black/15 px-3 py-1.5 dark:border-white/20" />
        </div>
        <button type="submit" disabled={lendo} className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
          {lendo ? "Lendo..." : "Ler planilha"}
        </button>
      </form>

      {erro && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {erro}
        </p>
      )}

      {linhas.length > 0 && (
        <>
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium">{arquivo}</span> — {linhas.length} linha(s).{" "}
              {jaLancadas > 0 && <span className="text-amber-700 dark:text-amber-400">{jaLancadas} já lançada(s) no sistema. </span>}
              {repetidas > 0 && <span className="text-amber-700 dark:text-amber-400">{repetidas} repetida(s) no próprio arquivo. </span>}
              {incompletas > 0 && <span className="text-red-700 dark:text-red-400">{incompletas} com algo a escolher/corrigir. </span>}
              {aConfirmar > 0 && <span className="text-foreground/60">{aConfirmar} com posto sugerido — confira.</span>}
            </p>
            <p className="text-xs text-foreground/50">
              Linha já lançada ou repetida vem desmarcada: pode ser duplicidade de verdade ou uma venda real igual — marque se quiser lançar mesmo
              assim. O posto que você escolher aqui o sistema lembra nas próximas planilhas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={confirmar}
              disabled={gravando || marcadas.length === 0}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {gravando ? "Lançando..." : `Lançar ${marcadas.length} selecionada(s) — ${formatarMoeda(totalMarcado)}`}
            </button>
            <button
              type="button"
              onClick={() => setLinhas((atual) => atual.map((l) => ({ ...l, importar: !incompleta(l) && !l.duplicada })))}
              className="text-sm text-foreground/60 underline"
            >
              Marcar só as sem aviso
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full text-xs">
              <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium"></th>
                  <th className="px-2 py-1.5 text-left font-medium">Linha</th>
                  <th className="min-w-40 px-2 py-1.5 text-left font-medium">Posto</th>
                  <th className="min-w-56 px-2 py-1.5 text-left font-medium">Cliente</th>
                  <th className="px-2 py-1.5 text-left font-medium">Período do abastecimento</th>
                  <th className="px-2 py-1.5 text-right font-medium">Valor total</th>
                  <th className="px-2 py-1.5 text-left font-medium">Pagamento</th>
                  <th className="min-w-48 px-2 py-1.5 text-left font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const bloqueada = incompleta(l);
                  const fundo = bloqueada ? "bg-red-50/60 dark:bg-red-950/20" : l.duplicada ? "bg-amber-50/70 dark:bg-amber-950/20" : "";
                  const sugerido = !l.viuSugestao && l.postoOrigem === "sugerido";
                  return (
                    <tr key={l.linha} className={`border-t border-black/5 align-top dark:border-white/10 ${fundo}`}>
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={l.importar}
                          disabled={bloqueada}
                          onChange={(e) => atualizar(l.linha, { importar: e.target.checked })}
                          aria-label={`Lançar linha ${l.linha}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-foreground/60">{l.linha}</td>
                      <td className="px-2 py-1.5">
                        <select
                          value={l.postoId ?? ""}
                          onChange={(e) => atualizar(l.linha, { postoId: e.target.value || null, postoOrigem: "exato", viuSugestao: true })}
                          className={campo}
                        >
                          <option value="">— escolha —</option>
                          {postos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                        <span className="mt-0.5 block text-[10px] text-foreground/40">planilha: {l.postoTexto || "—"}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="text" value={l.cliente} onChange={(e) => atualizar(l.linha, { cliente: e.target.value })} className={campo} />
                        {l.observacao && <span className="mt-0.5 block text-[10px] text-foreground/40">{l.observacao}</span>}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {formatarData(l.periodoDe)} a {formatarData(l.periodoAte)}
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{l.valor === null ? "—" : formatarMoeda(l.valor)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{formatarData(l.dataPagamento)}</td>
                      <td className="px-2 py-1.5">
                        {l.erros.map((e) => (
                          <p key={e} className="text-red-700 dark:text-red-400">
                            {e}
                          </p>
                        ))}
                        {!l.erros.length && !l.postoId && <p className="text-red-700 dark:text-red-400">Escolha o posto.</p>}
                        {l.duplicada && (
                          <p className="text-amber-800 dark:text-amber-400">
                            {l.duplicada.onde === "sistema" ? "Possível duplicidade. " : "Repetida no arquivo. "}
                            {l.duplicada.detalhe}
                          </p>
                        )}
                        {!bloqueada && sugerido && <p className="text-foreground/60">Posto sugerido — confira.</p>}
                        {!bloqueada && !l.duplicada && !sugerido && <p className="text-green-700 dark:text-green-400">Ok</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
