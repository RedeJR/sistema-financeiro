"use client";

import { useActionState, useRef } from "react";
import { atualizarLancamento, type EstadoLinha } from "./actions";
import { useFormKey } from "@/hooks/use-form-key";

type CategoriaOpcao = { id: string; nome: string; tipo: "ADQUIRENTE" | "PADRAO" };

const campo =
  "rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

// Um <form> por linha, sem botão: categoria salva sozinha ao trocar (como o
// dropdown do Excel do protótipo), observação salva ao sair do campo.
//
// Usa useActionState (em vez de chamar a Server Action direto) porque o
// <select> é não-controlado — sem isso, o refresh automático da página
// depois da action às vezes reconciliava o formulário com um instantâneo
// anterior ao save (o dado salvava certo no banco, mas a tela voltava a
// mostrar "sem categoria" por alguns segundos). Remontando o form com a key
// de useFormKey toda vez que a PRÓPRIA action devolve um novo estado, o
// valor mostrado vem sempre do que acabou de ser salvo, sem depender do
// timing do refresh da página.
export function LinhaEditavel({
  id,
  categoriaAtual,
  observacaoAtual,
  categorias,
}: {
  id: string;
  categoriaAtual: string;
  observacaoAtual: string;
  categorias: CategoriaOpcao[];
}) {
  const [state, formAction] = useActionState<EstadoLinha, FormData>(atualizarLancamento, {
    categoriaAtual,
    observacaoAtual,
  });
  const formKey = useFormKey(state);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      key={formKey}
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-1 sm:flex-row sm:items-center"
    >
      <input type="hidden" name="id" value={id} />
      <select
        name="categoria"
        defaultValue={state.categoriaAtual}
        onChange={() => formRef.current?.requestSubmit()}
        className={`${campo} min-w-[11rem]`}
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
        name="observacao"
        defaultValue={state.observacaoAtual}
        placeholder="Observação"
        onBlur={(e) => {
          if (e.target.value !== state.observacaoAtual) formRef.current?.requestSubmit();
        }}
        className={`${campo} min-w-[10rem] flex-1`}
      />
    </form>
  );
}
