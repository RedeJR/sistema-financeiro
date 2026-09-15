"use client";

import { useState } from "react";

type Posto = { id: string; nome: string };

// Barra única com checkbox por posto + "Todos os postos" — pedido explícito
// da usuária no lugar do <select multiple>. Quando "Todos" está marcado, os
// checkboxes individuais ficam sem `name` (nada é enviado no filtro), que é
// exatamente o mesmo "sem postoId = mostra todos" que a consulta já espera
// — assim a URL continua limpa em vez de mandar um postoId por posto.
export function SeletorPostos({ postos, selecionados }: { postos: Posto[]; selecionados: string[] }) {
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(selecionados.length ? selecionados : postos.map((p) => p.id))
  );

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

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20">
      <label className="flex items-center gap-1.5 font-medium">
        <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} />
        Todos os postos
      </label>
      <span className="h-4 w-px bg-black/15 dark:bg-white/20" />
      {postos.map((p) => (
        <label key={p.id} className="flex items-center gap-1.5">
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
  );
}
