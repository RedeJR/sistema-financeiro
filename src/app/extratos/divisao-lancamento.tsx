"use client";

import { useState, useTransition } from "react";
import { formatarMoeda, paraDecimalString } from "@/lib/dinheiro";
import { salvarDivisaoLancamento, removerDivisaoLancamento, type ItemDivisao } from "./divisao-actions";

type CategoriaOpcao = { id: string; nome: string; tipo: "ADQUIRENTE" | "PADRAO" };
type DivisaoAtual = { categoriaId: string | null; tipoAdquirente: "DEBITO" | "CREDITO" | null; valor: number };

const campo =
  "rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

// Codifica categoria+tipoAdquirente no mesmo formato do <select> de
// linha-editavel.tsx: "" sem categoria, "<id>" padrão, "<id>:DEBITO/CREDITO"
// adquirente — assim os dois lugares da tela usam a mesma convenção.
function codificarCategoria(categoriaId: string | null, tipoAdquirente: "DEBITO" | "CREDITO" | null): string {
  if (!categoriaId) return "";
  return tipoAdquirente ? `${categoriaId}:${tipoAdquirente}` : categoriaId;
}

function decodificarCategoria(valor: string): { categoriaId: string | null; tipoAdquirente: "DEBITO" | "CREDITO" | null } {
  if (!valor) return { categoriaId: null, tipoAdquirente: null };
  const [id, tipo] = valor.split(":");
  return { categoriaId: id, tipoAdquirente: tipo === "DEBITO" || tipo === "CREDITO" ? tipo : null };
}

type LinhaForm = { categoriaSel: string; valorTexto: string };

// "1234.56" -> "1234,56" — só troca o separador decimal, sem símbolo de
// moeda nem separador de milhar (formatarMoeda tem os dois, ruim de reeditar
// num campo de texto).
function paraTextoEditavel(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

function linhasIniciais(divisoes: DivisaoAtual[]): LinhaForm[] {
  if (divisoes.length === 0) {
    return [
      { categoriaSel: "", valorTexto: "" },
      { categoriaSel: "", valorTexto: "" },
    ];
  }
  return divisoes.map((d) => ({
    categoriaSel: codificarCategoria(d.categoriaId, d.tipoAdquirente),
    valorTexto: paraTextoEditavel(d.valor),
  }));
}

export function DivisaoLancamento({
  lancamentoId,
  valorTotal,
  divisoesAtuais,
  categorias,
}: {
  lancamentoId: string;
  valorTotal: number;
  divisoesAtuais: DivisaoAtual[];
  categorias: CategoriaOpcao[];
}) {
  const [aberto, setAberto] = useState(false);
  const [linhas, setLinhas] = useState<LinhaForm[]>(() => linhasIniciais(divisoesAtuais));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const jaDividido = divisoesAtuais.length > 0;

  function atualizarLinha(i: number, campoNome: keyof LinhaForm, valor: string) {
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, [campoNome]: valor } : l)));
  }

  function adicionarLinha() {
    setLinhas((atual) => [...atual, { categoriaSel: "", valorTexto: "" }]);
  }

  function removerLinha(i: number) {
    setLinhas((atual) => (atual.length > 2 ? atual.filter((_, idx) => idx !== i) : atual));
  }

  const somaAtual = linhas.reduce((s, l) => {
    const n = Number(paraDecimalString(l.valorTexto) ?? "0");
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const diferenca = Math.round((valorTotal - somaAtual) * 100) / 100;

  function handleSalvar() {
    setErro(null);
    const itens: ItemDivisao[] = linhas.map((l) => {
      const { categoriaId, tipoAdquirente } = decodificarCategoria(l.categoriaSel);
      const n = Number(paraDecimalString(l.valorTexto) ?? "NaN");
      return { categoriaId, tipoAdquirente, valor: n };
    });
    startTransition(async () => {
      const resultado = await salvarDivisaoLancamento(lancamentoId, itens);
      if ("error" in resultado) {
        setErro(resultado.error);
        return;
      }
      setAberto(false);
    });
  }

  function handleRemover() {
    startTransition(async () => {
      await removerDivisaoLancamento(lancamentoId);
      setLinhas(linhasIniciais([]));
      setAberto(false);
    });
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setAberto((s) => !s)}
        className="text-xs text-foreground/60 underline"
      >
        {jaDividido ? "Editar divisão" : "Dividir"}
      </button>

      {aberto && (
        <div className="mt-2 space-y-2 rounded-md border border-black/10 p-3 dark:border-white/15">
          {linhas.map((l, i) => (
            <div key={i} className="flex items-center gap-1">
              <select
                value={l.categoriaSel}
                onChange={(e) => atualizarLinha(i, "categoriaSel", e.target.value)}
                className={`${campo} min-w-[9rem] flex-1`}
              >
                <option value="">sem categoria</option>
                {categorias.map((c) =>
                  c.tipo === "ADQUIRENTE" ? (
                    <optgroup key={c.id} label={c.nome}>
                      <option value={`${c.id}:DEBITO`}>{c.nome} Débito</option>
                      <option value={`${c.id}:CREDITO`}>{c.nome} Crédito</option>
                    </optgroup>
                  ) : (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  )
                )}
              </select>
              <input
                value={l.valorTexto}
                onChange={(e) => atualizarLinha(i, "valorTexto", e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className={`${campo} w-24`}
              />
              {linhas.length > 2 && (
                <button
                  type="button"
                  onClick={() => removerLinha(i)}
                  className="px-1 text-foreground/50 hover:text-foreground"
                  aria-label="Remover parte"
                  title="Remover parte"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between text-xs text-foreground/60">
            <button type="button" onClick={adicionarLinha} className="underline">
              + Adicionar parte
            </button>
            <span className={diferenca !== 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}>
              {diferenca === 0
                ? `Soma bate: ${formatarMoeda(somaAtual)}`
                : `Falta ${formatarMoeda(diferenca)} (total do lançamento: ${formatarMoeda(valorTotal)})`}
            </span>
          </div>

          {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pendente}
              onClick={handleSalvar}
              className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {pendente ? "Salvando..." : "Salvar divisão"}
            </button>
            {jaDividido && (
              <button
                type="button"
                disabled={pendente}
                onClick={handleRemover}
                className="rounded-md px-3 py-1 text-xs text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
              >
                Remover divisão
              </button>
            )}
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded-md px-3 py-1 text-xs text-foreground/60 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
