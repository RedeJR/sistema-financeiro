"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormKey } from "@/hooks/use-form-key";
import { formatarDocumento } from "@/lib/documento";
import type { ActionState } from "@/lib/form-state";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  valoresIniciais?: { nome: string; documento: string | null };
};

export function FormularioFornecedor({ action, valoresIniciais }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const valores = state?.values ?? valoresIniciais ?? undefined;

  return (
    <form key={formKey} action={formAction} className="max-w-md space-y-4">
      <Campo
        label="Nome do fornecedor"
        name="nome"
        required
        defaultValue={valores?.nome}
        placeholder="Ex: Distribuidora XYZ Ltda"
      />
      <Campo
        label="CNPJ ou CPF (opcional)"
        name="documento"
        defaultValue={valores?.documento ?? undefined}
        placeholder="00.000.000/0000-00"
        onChange={(e) => {
          e.target.value = formatarDocumento(e.target.value);
        }}
      />
      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link
          href="/cadastros/fornecedores"
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
