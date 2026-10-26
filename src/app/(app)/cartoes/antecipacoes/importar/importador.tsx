"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatarMoeda } from "@/lib/dinheiro";
import type { LinhaAntecipacaoPreview, LinhaAntecipacaoParaImportar } from "@/lib/cartoes/importarAntecipacoes";
import { analisarPlanilhaAntecipacoes, importarAntecipacoes } from "./actions";

type Opcao = { id: string; nome: string };

type Linha = LinhaAntecipacaoPreview & { importar: boolean };

const campo =
  "w-full rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground/40 dark:border-white/20";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function incompleta(l: Linha): boolean {
  return l.erros.length > 0 || !l.postoId || !l.adquirenteId;
}

export function ImportadorAntecipacoes({ postos, adquirentes }: { postos: Opcao[]; adquirentes: Opcao[] }) {
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [criadas, setCriadas] = useState<number | null>(null);
  const [lendo, iniciarLeitura] = useTransition();
  const [gravando, iniciarGravacao] = useTransition();

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErro(null);
    setCriadas(null);
    iniciarLeitura(async () => {
      const r = await analisarPlanilhaAntecipacoes(formData);
      if ("erro" in r) {
        setErro(r.erro);
        setLinhas([]);
        return;
      }
      setArquivo(r.arquivo);
      setLinhas(r.linhas.map((l) => ({ ...l, importar: l.erros.length === 0 && !!l.postoId && !!l.adquirenteId && !l.duplicada })));
    });
  }

  function atualizar(linha: number, mudancas: Partial<Linha>) {
    setLinhas((atual) =>
      atual.map((l) => {
        if (l.linha !== linha) return l;
        const nova = { ...l, ...mudancas };
        if (incompleta(nova)) nova.importar = false;
        return nova;
      })
    );
  }

  const marcadas = linhas.filter((l) => l.importar);
  const totalMarcado = marcadas.reduce((s, l) => s + (l.valorLiquido ?? 0), 0);
  const jaCadastradas = linhas.filter((l) => l.duplicada?.onde === "sistema").length;
  const repetidas = linhas.filter((l) => l.duplicada?.onde === "arquivo").length;
  const incompletas = linhas.filter(incompleta).length;

  function confirmar() {
    const payload: LinhaAntecipacaoParaImportar[] = marcadas.map((l) => ({
      linha: l.linha,
      postoId: l.postoId!,
      adquirenteId: l.adquirenteId!,
      dataRecebimento: l.dataRecebimento!,
      periodoDe: l.periodoDe!,
      periodoAte: l.periodoAte!,
      valorFace: l.valorFace!,
      valorLiquido: l.valorLiquido!,
      observacao: l.observacao,
    }));
    setErro(null);
    iniciarGravacao(async () => {
      const r = await importarAntecipacoes(payload);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setCriadas(r.criadas);
      setLinhas([]);
      setArquivo(null);
    });
  }

  return (
    <div className="space-y-4">
      {criadas !== null && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <p className="font-medium">{criadas} antecipação(ões) cadastrada(s).</p>
          <Link className="underline" href="/cartoes/antecipacoes">
            Ver em Antecipações
          </Link>
        </div>
      )}

      <form onSubmit={aoEnviar} className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="arquivo" className="text-foreground/60">
            Planilha (.xlsx)
          </label>
          <input
            id="arquivo"
            name="arquivo"
            type="file"
            accept=".xlsx,.xls"
            required
            className="rounded-md border border-black/15 px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <button
          type="submit"
          disabled={lendo}
          className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
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
              {jaCadastradas > 0 && <span className="text-amber-700 dark:text-amber-400">{jaCadastradas} já cadastrada(s). </span>}
              {repetidas > 0 && <span className="text-amber-700 dark:text-amber-400">{repetidas} repetida(s) no próprio arquivo. </span>}
              {incompletas > 0 && <span className="text-red-700 dark:text-red-400">{incompletas} com algo a escolher/corrigir.</span>}
            </p>
            <p className="text-xs text-foreground/50">
              Linha já cadastrada ou repetida vem desmarcada: marque só se quiser lançar mesmo assim. Linha com erro na planilha
              precisa ser corrigida no arquivo e lida de novo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={confirmar}
              disabled={gravando || marcadas.length === 0}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {gravando ? "Gravando..." : `Cadastrar ${marcadas.length} selecionada(s) — líquido ${formatarMoeda(totalMarcado)}`}
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
                  <th className="min-w-36 px-2 py-1.5 text-left font-medium">Adquirente</th>
                  <th className="px-2 py-1.5 text-left font-medium">Caiu em</th>
                  <th className="px-2 py-1.5 text-left font-medium">Recebíveis de</th>
                  <th className="px-2 py-1.5 text-right font-medium">Bruto</th>
                  <th className="px-2 py-1.5 text-right font-medium">Desconto</th>
                  <th className="px-2 py-1.5 text-right font-medium">Líquido</th>
                  <th className="min-w-48 px-2 py-1.5 text-left font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const bloqueada = incompleta(l);
                  const fundo = bloqueada ? "bg-red-50/60 dark:bg-red-950/20" : l.duplicada ? "bg-amber-50/70 dark:bg-amber-950/20" : "";
                  const desconto = l.valorFace !== null && l.valorLiquido !== null ? l.valorFace - l.valorLiquido : null;
                  return (
                    <tr key={l.linha} className={`border-t border-black/5 align-top dark:border-white/10 ${fundo}`}>
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={l.importar}
                          disabled={bloqueada}
                          onChange={(e) => atualizar(l.linha, { importar: e.target.checked })}
                          aria-label={`Cadastrar linha ${l.linha}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-foreground/60">{l.linha}</td>
                      <td className="px-2 py-1.5">
                        <select value={l.postoId ?? ""} onChange={(e) => atualizar(l.linha, { postoId: e.target.value || null })} className={campo}>
                          <option value="">— escolha —</option>
                          {postos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                        <span className="mt-0.5 block text-[10px] text-foreground/40">planilha: {l.posto || "—"}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={l.adquirenteId ?? ""}
                          onChange={(e) => atualizar(l.linha, { adquirenteId: e.target.value || null })}
                          className={campo}
                        >
                          <option value="">— escolha —</option>
                          {adquirentes.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.nome}
                            </option>
                          ))}
                        </select>
                        <span className="mt-0.5 block text-[10px] text-foreground/40">planilha: {l.adquirente || "—"}</span>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{formatarData(l.dataRecebimento)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {formatarData(l.periodoDe)} a {formatarData(l.periodoAte)}
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{l.valorFace === null ? "—" : formatarMoeda(l.valorFace)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{desconto === null ? "—" : formatarMoeda(desconto)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{l.valorLiquido === null ? "—" : formatarMoeda(l.valorLiquido)}</td>
                      <td className="px-2 py-1.5">
                        {l.erros.map((e) => (
                          <p key={e} className="text-red-700 dark:text-red-400">
                            {e}
                          </p>
                        ))}
                        {!l.erros.length && bloqueada && <p className="text-red-700 dark:text-red-400">Escolha o posto e a adquirente.</p>}
                        {l.duplicada && (
                          <p className="text-amber-800 dark:text-amber-400">
                            {l.duplicada.onde === "sistema" ? "Possível duplicidade. " : "Repetida no arquivo. "}
                            {l.duplicada.detalhe}
                          </p>
                        )}
                        {!bloqueada && !l.duplicada && <p className="text-green-700 dark:text-green-400">Ok</p>}
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
