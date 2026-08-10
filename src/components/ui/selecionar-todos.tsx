"use client";

// Checkbox de cabeçalho que marca/desmarca todos os checkboxes associados a
// um <form> externo (via atributo form="..."), sem precisar que a tabela
// inteira vire Client Component.
export function SelecionarTodos({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Selecionar todos"
      onChange={(e) => {
        const marcado = e.target.checked;
        document
          .querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${formId}"]`)
          .forEach((el) => {
            el.checked = marcado;
          });
      }}
    />
  );
}
