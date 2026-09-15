"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormKey } from "@/hooks/use-form-key";
import type { ActionState } from "@/lib/form-state";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  grupos: { id: string; nome: string }[];
  valoresIniciais?: { nome: string; grupoId: string; codigo?: string | null };
};

export function FormularioConta({ action, grupos, valoresIniciais }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);

  const nome = state?.values?.nome ?? valoresIniciais?.nome;
  const grupoId = state?.values?.grupoId ?? valoresIniciais?.grupoId ?? grupos[0]?.id;
  const codigo = state?.values?.codigo ?? valoresIniciais?.codigo ?? undefined;

  return (
    <form key={formKey} action={formAction} className="max-w-md space-y-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="grupoId" className="text-sm font-medium text-foreground/80">
          Grupo
        </label>
        <select
          id="grupoId"
          name="grupoId"
          defaultValue={grupoId}
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20"
        >
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
      </div>
      <Campo
        label="Nome da conta"
        name="nome"
        required
        defaultValue={nome}
        placeholder="Ex: ICMS, Salários, Combustíveis"
      />
      <Campo
        label="Código (opcional)"
        name="codigo"
        defaultValue={codigo}
        placeholder="Ex: 105"
      />
      <p className="-mt-3 text-xs text-foreground/50">
        Pra achar essa conta digitando o código na hora de lançar uma despesa, sem precisar navegar
        pelo grupo. Deixe em branco se não usa código.
      </p>
      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link
          href="/cadastros/plano-de-contas"
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
