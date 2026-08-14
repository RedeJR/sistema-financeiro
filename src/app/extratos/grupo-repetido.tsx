"use client";

import { useState } from "react";
import { formatarMoeda } from "@/lib/dinheiro";
import { LinhaEditavel } from "./linha-editavel";
import { DivisaoLancamento } from "./divisao-lancamento";
import { atualizarCategoriaEmMassa } from "./actions";
import { SelecionarGrupo } from "@/components/ui/selecionar-grupo";

type CategoriaOpcao = { id: string; nome: string; tipo: "ADQUIRENTE" | "PADRAO" };

export type ItemRepetido = {
  id: string;
  postoNome: string;
  bancoNome: string;
  valor: string;
  observacaoAtual: string;
};

// Um extrato como o do PagSeguro não agrupa vendas — uma linha OFX por
// venda, então um único dia vira centenas de lançamentos com a mesma
// descrição/categoria (ex: "Vendas - Disponivel CREDITO VISA" repetido 80x
// no mesmo dia). Mostrar isso linha a linha deixa a tela de revisão pesada
// e difícil de ler. Esse componente resume esse tipo de repetição numa
// única linha (descrição + quantidade + soma), com um botão pra expandir e
// ver/editar cada lançamento individualmente quando precisar (ex: pra achar
// um valor específico ou adicionar uma observação só numa venda).
export function GrupoRepetido({
  grupoId,
  descricao,
  categoriaAtual,
  categoriaLabel,
  itens,
  categorias,
  podeEditar,
  formIdReatribuir,
  voltarPara,
}: {
  grupoId: string;
  descricao: string;
  categoriaAtual: string;
  categoriaLabel: string;
  itens: ItemRepetido[];
  categorias: CategoriaOpcao[];
  podeEditar: boolean;
  formIdReatribuir: string;
  voltarPara: string;
}) {
  const [expandido, setExpandido] = useState(false);
  const soma = itens.reduce((s, i) => s + Number(i.valor), 0);
  const campoCategoriaEmMassa = `categoriaEmMassa_${grupoId}`;

  return (
    <>
      <tr className="border-t border-black/10 dark:border-white/10 align-top">
        {podeEditar && (
          <td className="px-4 py-2">
            <SelecionarGrupo grupoId={grupoId} />
            {itens.map((i) => (
              <input
                key={i.id}
                type="checkbox"
                name="ids"
                value={i.id}
                form={formIdReatribuir}
                data-grupo={grupoId}
                className="hidden"
              />
            ))}
          </td>
        )}
        <td className="px-4 py-2">{itens[0]?.postoNome}</td>
        <td className="px-4 py-2">{itens[0]?.bancoNome}</td>
        <td className="px-4 py-2 text-foreground/70">
          {descricao}
          <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10">
            {itens.length} lançamentos
          </span>
        </td>
        <td className={`px-4 py-2 text-right whitespace-nowrap ${soma < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
          {formatarMoeda(soma)}
        </td>
        <td className="px-4 py-2">
          {podeEditar ? (
            <form action={atualizarCategoriaEmMassa} className="flex flex-col gap-1 sm:flex-row sm:items-center">
              {itens.map((i) => (
                <input key={i.id} type="hidden" name="ids" value={i.id} />
              ))}
              <input type="hidden" name="voltarPara" value={voltarPara} />
              <select
                name={campoCategoriaEmMassa}
                defaultValue={categoriaAtual}
                className="min-w-[11rem] rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/40 dark:border-white/20"
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
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
            </form>
          ) : (
            <span className="text-foreground/70">{categoriaLabel}</span>
          )}
          <button
            type="button"
            onClick={() => setExpandido((e) => !e)}
            className="mt-1 block text-xs text-foreground/60 underline"
          >
            {expandido ? "Ocultar lançamentos individuais" : `Ver os ${itens.length} individualmente`}
          </button>
        </td>
      </tr>
      {expandido &&
        itens.map((i) => (
          <tr
            key={i.id}
            className="border-t border-dashed border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]"
          >
            {podeEditar && (
              <td className="px-4 py-2">
                <input type="checkbox" name="ids" value={i.id} form={formIdReatribuir} />
              </td>
            )}
            <td className="px-4 py-2 text-xs text-foreground/50">{i.postoNome}</td>
            <td className="px-4 py-2 text-xs text-foreground/50">{i.bancoNome}</td>
            <td className="px-4 py-2 text-xs text-foreground/50">{descricao}</td>
            <td
              className={`px-4 py-2 text-right whitespace-nowrap text-xs ${
                Number(i.valor) < 0 ? "text-red-700 dark:text-red-400" : "text-foreground/60"
              }`}
            >
              {formatarMoeda(i.valor)}
            </td>
            <td className="px-4 py-2">
              {podeEditar ? (
                <>
                  <LinhaEditavel
                    id={i.id}
                    categoriaAtual={categoriaAtual}
                    observacaoAtual={i.observacaoAtual}
                    categorias={categorias}
                  />
                  {/* Item que veio de um grupo de repetidos nunca chega
                      dividido (agruparRepetidos, no editar/page.tsx, tira
                      lançamento dividido do agrupamento) — mas dividir UM
                      específico depois de expandir o grupo continua
                      disponível, igual na linha normal. */}
                  <DivisaoLancamento lancamentoId={i.id} valorTotal={Number(i.valor)} divisoesAtuais={[]} categorias={categorias} />
                </>
              ) : (
                <span className="text-xs text-foreground/60">
                  {categoriaLabel}
                  {i.observacaoAtual && ` — ${i.observacaoAtual}`}
                </span>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}
