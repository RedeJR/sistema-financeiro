"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormKey } from "@/hooks/use-form-key";
import type { ActionState } from "@/lib/form-state";

type Props = {
  valorInicial: string;
  descontoInicial: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

export function FormularioDesconto({ valorInicial, descontoInicial, action }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const v = state?.values;

  return (
    <form key={formKey} action={formAction} className="max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Valor do boleto (cheio)" name="valor" required defaultValue={v?.valor ?? valorInicial} placeholder="0,00" inputMode="decimal" />
        <Campo label="Desconto" name="desconto" defaultValue={v?.desconto ?? descontoInicial} placeholder="0,00" inputMode="decimal" />
      </div>
      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link href="/combustiveis-pagos" className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
