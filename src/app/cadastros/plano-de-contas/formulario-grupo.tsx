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
  valoresIniciais?: { nome: string; ordem: number };
};

export function FormularioGrupo({ action, valoresIniciais }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);

  const nome = state?.values?.nome ?? valoresIniciais?.nome;
  const ordem = state?.values?.ordem ?? valoresIniciais?.ordem ?? 0;

  return (
    <form key={formKey} action={formAction} className="max-w-md space-y-4">
      <Campo
        label="Nome do grupo"
        name="nome"
        required
        defaultValue={nome}
        placeholder="Ex: Tributos, Colaboradores"
      />
      <Campo label="Ordem de exibição" name="ordem" type="number" defaultValue={ordem} />
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
