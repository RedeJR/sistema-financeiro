"use client";

import { useEffect, useRef, useState } from "react";

type Item = { id: string; nome: string };
type Grupo = { id: string; nome: string; itens: Item[] };

type Props = {
  nome: string;
  rotuloTodos: string;
  selecionados: string[];
} & ({ itens: Item[]; grupos?: undefined } | { grupos: Grupo[]; itens?: undefined });

// Dropdown fechado (mostra "Todos os X" ou "N selecionados") que abre numa
// lista com checkbox por item + "Todos" no topo — mesmo padrão criado pra
// Fluxo de Caixa, generalizado aqui pra dar pra usar em qualquer filtro de
// múltipla escolha (posto, fornecedor, plano de contas...), inclusive
// agrupado (ex: plano de contas por grupo — passe `grupos` em vez de
// `itens`). Quando "Todos" está marcado, os checkboxes individuais ficam
// sem `name` (nada é enviado no filtro) — mesma semântica de "sem filtro =
// mostra todos" que as consultas já esperam, URL fica limpa.
export function SeletorDropdown(props: Props) {
  const { nome, rotuloTodos, selecionados } = props;
  const grupos: Grupo[] = props.grupos ?? [{ id: "_", nome: "", itens: props.itens }];
  const todosItens = grupos.flatMap((g) => g.itens);
  const temGrupos = !!props.grupos;

  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(selecionados.length ? selecionados : todosItens.map((i) => i.id))
  );
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const todosMarcados = marcados.size === todosItens.length;

  function alternarTodos() {
    setMarcados(todosMarcados ? new Set() : new Set(todosItens.map((i) => i.id)));
  }

  function alternarItem(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const rotulo = todosMarcados
    ? rotuloTodos
    : marcados.size === 0
      ? "Nenhum selecionado"
      : marcados.size === 1
        ? (todosItens.find((i) => marcados.has(i.id))?.nome ?? "1 selecionado")
        : `${marcados.size} selecionados`;

  return (
    <div ref={containerRef} className="relative w-56">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-black/15 bg-transparent px-3 py-1.5 text-left text-sm dark:border-white/20"
      >
        <span className="truncate">{rotulo}</span>
        <span className={`text-foreground/50 transition-transform ${aberto ? "rotate-180" : ""}`}>▾</span>
      </button>

      {/* Fica sempre montado (só escondido via CSS) em vez de `{aberto &&
          ...}` — o mousedown que fecha ao clicar fora dispara ANTES do
          click de um botão "Filtrar" fora do container. Se os checkboxes
          desmontassem nesse mousedown, o clique em "Filtrar" chegaria a
          tempo de submeter o form, mas sem nenhum checkbox no DOM pra
          carregar o valor — perdia a seleção silenciosamente. */}
      <div
        className={`absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-black/15 bg-background shadow-lg dark:border-white/20 ${
          aberto ? "block" : "hidden"
        }`}
      >
        <label className="flex items-center gap-2 border-b border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
          <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} />
          {rotuloTodos}
        </label>
        {grupos.map((g) => (
          <div key={g.id}>
            {temGrupos && g.nome && (
              <div className="bg-black/[0.03] px-3 py-1 text-xs font-medium text-foreground/50 dark:bg-white/[0.03]">
                {g.nome}
              </div>
            )}
            {g.itens.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                <input
                  type="checkbox"
                  name={todosMarcados ? undefined : nome}
                  value={item.id}
                  checked={marcados.has(item.id)}
                  onChange={() => alternarItem(item.id)}
                />
                {item.nome}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
