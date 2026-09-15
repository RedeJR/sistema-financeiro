"use client";

import { useEffect, useRef, useState } from "react";

type Posto = { id: string; nome: string };

// Dropdown fechado (mostra "Todos os postos" ou "N selecionados") que abre
// numa lista com checkbox por posto + "Todos os postos" no topo — pedido
// explícito da usuária no lugar da barra de checkboxes sempre aberta.
// Quando "Todos" está marcado, os checkboxes individuais ficam sem `name`
// (nada é enviado no filtro), o mesmo "sem postoId = mostra todos" que a
// consulta já espera — a URL continua limpa em vez de mandar um postoId por
// posto.
export function SeletorPostos({ postos, selecionados }: { postos: Posto[]; selecionados: string[] }) {
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(selecionados.length ? selecionados : postos.map((p) => p.id))
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

  const todosMarcados = marcados.size === postos.length;

  function alternarTodos() {
    setMarcados(todosMarcados ? new Set() : new Set(postos.map((p) => p.id)));
  }

  function alternarPosto(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const rotulo = todosMarcados
    ? "Todos os postos"
    : marcados.size === 0
      ? "Nenhum posto"
      : marcados.size === 1
        ? (postos.find((p) => marcados.has(p.id))?.nome ?? "1 selecionado")
        : `${marcados.size} postos selecionados`;

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

      {/* Fica sempre montado (só escondido via CSS) em vez de `{aberto && ...}`
          — o mousedown que fecha ao clicar fora dispara ANTES do click do
          botão "Filtrar" (que fica fora do container). Se os checkboxes
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
          Todos os postos
        </label>
        {postos.map((p) => (
          <label
            key={p.id}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            <input
              type="checkbox"
              name={todosMarcados ? undefined : "postoId"}
              value={p.id}
              checked={marcados.has(p.id)}
              onChange={() => alternarPosto(p.id)}
            />
            {p.nome}
          </label>
        ))}
      </div>
    </div>
  );
}
