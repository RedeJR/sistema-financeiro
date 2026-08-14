"use client";

// Variante de SelecionarTodos escopada a um subconjunto de checkboxes (ver
// data-grupo abaixo) — usado pra marcar/desmarcar de uma vez todos os
// lançamentos escondidos dentro de uma linha de "N repetidos" agrupada
// (ver extratos/grupo-repetido.tsx), sem precisar expandir o grupo pra
// selecioná-los individualmente antes de excluir/reatribuir em massa.
export function SelecionarGrupo({ grupoId }: { grupoId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Selecionar lançamentos desse grupo"
      onChange={(e) => {
        const marcado = e.target.checked;
        document
          .querySelectorAll<HTMLInputElement>(`input[type="checkbox"][data-grupo="${grupoId}"]`)
          .forEach((el) => {
            el.checked = marcado;
          });
      }}
    />
  );
}
