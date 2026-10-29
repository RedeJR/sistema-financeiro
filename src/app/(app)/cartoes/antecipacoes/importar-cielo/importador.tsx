"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatarMoeda } from "@/lib/dinheiro";
import { CAMPO, BOTAO_PRIMARIO } from "@/lib/estilo";
import { analisarNegociacaoCielo, gravarNegociacaoCielo, type ItemNegociacao } from "./actions";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

type Linha = ItemNegociacao & { importar: boolean };

export function ImportadorNegociacaoCielo({ postos }: { postos: { id: string; nome: string }[] }) {
  const [postoId, setPostoId] = useState("");
  const [adquirente, setAdquirente] = useState<"CIELO" | "STONE">("CIELO");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [lendo, iniciarLeitura] = useTransition();
  const [gravando, iniciarGravacao] = useTransition();

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErro(null);
    setResultado(null);
    iniciarLeitura(async () => {
      const r = await analisarNegociacaoCielo(formData);
      if ("erro" in r) {
        setErro(r.erro);
        setLinhas([]);
        return;
      }
      setArquivo(r.arquivo);
      setLinhas(r.itens.map((i) => ({ ...i, importar: !!i.antecipacaoId })));
    });
  }

  const marcadas = linhas.filter((l) => l.importar);
  const semData = marcadas.some((l) => !l.dataRecebimento);

  function atualizar(id: string, mudancas: Partial<Linha>) {
    setLinhas((atual) => atual.map((x) => (x.id === id ? { ...x, ...mudancas } : x)));
  }

  function confirmar() {
    setErro(null);
    iniciarGravacao(async () => {
      const r = await gravarNegociacaoCielo(
        postoId,
        adquirente,
        marcadas.map((l) => ({
          antecipacaoId: l.antecipacaoId,
          dataRecebimento: l.dataRecebimento ?? "",
          valorFace: l.valorFace,
          valorLiquido: l.valorLiquido,
          periodoDe: l.periodoDe,
          periodoAte: l.periodoAte,
          dias: l.dias,
        }))
      );
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setResultado(`${r.atualizadas} antecipação(ões) corrigida(s) e ${r.criadas} criada(s).`);
      setLinhas([]);
      setArquivo(null);
    });
  }

  return (
    <div className="space-y-4">
      {resultado && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <p className="font-medium">{resultado}</p>
          <Link className="underline" href="/cartoes/antecipacoes">
            Ver em Antecipações
          </Link>
        </div>
      )}

      <form onSubmit={aoEnviar} className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <select id="postoId" name="postoId" required value={postoId} onChange={(e) => setPostoId(e.target.value)} className={CAMPO}>
            <option value="">— escolha —</option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="adquirente" className="text-foreground/60">
            Adquirente
          </label>
          <select
            id="adquirente"
            name="adquirente"
            value={adquirente}
            onChange={(e) => setAdquirente(e.target.value as "CIELO" | "STONE")}
            className={CAMPO}
          >
            <option value="CIELO">Cielo — negociação de recebíveis (detalhe)</option>
            <option value="STONE">Stone — recebíveis (CSV)</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="arquivo" className="text-foreground/60">
            Arquivo (.csv)
          </label>
          <input id="arquivo" name="arquivo" type="file" accept=".csv" required className="rounded-md border border-black/15 px-3 py-1.5 dark:border-white/20" />
        </div>
        <button type="submit" disabled={lendo} className={BOTAO_PRIMARIO}>
          {lendo ? "Lendo..." : "Ler arquivo"}
        </button>
      </form>

      {erro && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {erro}
        </p>
      )}

      {linhas.length > 0 && (
        <>
          <p className="text-sm">
            <span className="font-medium">{arquivo}</span> — {linhas.length} negociação(ões).
          </p>
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full text-xs">
              <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
                <tr>
                  <th className="px-2 py-1.5"></th>
                  <th className="px-2 py-1.5 text-left font-medium">Negociação / recebimento</th>
                  <th className="px-2 py-1.5 text-left font-medium">Recebíveis de</th>
                  <th className="px-2 py-1.5 text-right font-medium">Bruto (Cielo)</th>
                  <th className="px-2 py-1.5 text-right font-medium">Líquido</th>
                  <th className="px-2 py-1.5 text-left font-medium">Caiu em</th>
                  <th className="min-w-56 px-2 py-1.5 text-left font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-t border-black/5 align-top dark:border-white/10">
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={l.importar}
                        onChange={(e) => atualizar(l.id, { importar: e.target.checked })}
                        aria-label={`Importar negociação ${l.id}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{l.id}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {formatarData(l.periodoDe)} a {formatarData(l.periodoAte)} ({l.dias.length} dias)
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.valorFace)}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.valorLiquido)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {l.antecipacaoId ? (
                        formatarData(l.dataRecebimento)
                      ) : (
                        <input
                          type="date"
                          value={l.dataRecebimento ?? ""}
                          onChange={(e) => atualizar(l.id, { dataRecebimento: e.target.value || null })}
                          className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {l.antecipacaoId ? (
                        <p className="text-green-700 dark:text-green-400">
                          Antecipação cadastrada
                          {l.valorFaceCadastrado !== null && Math.abs(l.valorFaceCadastrado - l.valorFace) > 0.05
                            ? ` — o bruto cadastrado (${formatarMoeda(l.valorFaceCadastrado)}) será corrigido`
                            : ""}
                          ; o dia a dia será gravado.
                        </p>
                      ) : (
                        <p className="text-amber-800 dark:text-amber-400">
                          Não achei antecipação cadastrada — marque e informe o dia em que o dinheiro caiu pra criar.
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={confirmar} disabled={gravando || marcadas.length === 0 || semData} className={BOTAO_PRIMARIO}>
            {gravando ? "Gravando..." : `Gravar ${marcadas.length} negociação(ões)`}
          </button>
          {semData && <p className="text-xs text-red-700 dark:text-red-400">Informe o dia em que o dinheiro caiu nas negociações novas.</p>}
        </>
      )}
    </div>
  );
}
