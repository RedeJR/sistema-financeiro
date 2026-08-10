"use client";

import { useActionState } from "react";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormKey } from "@/hooks/use-form-key";
import { entrar } from "./actions";
import type { ActionState } from "@/lib/form-state";

export function FormularioLogin() {
  const [state, formAction] = useActionState<ActionState, FormData>(entrar, null);
  const formKey = useFormKey(state);
  const valores = state?.values;

  return (
    <form key={formKey} action={formAction} className="space-y-4">
      <Campo
        label="CPF"
        name="cpf"
        required
        autoFocus
        defaultValue={valores?.cpf}
        placeholder="000.000.000-00"
        inputMode="numeric"
      />
      <Campo label="Senha" name="senha" type="password" required />
      <ErroFormulario mensagem={state?.error} />
      <SubmitButton pendingLabel="Entrando..." className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50">
        Entrar
      </SubmitButton>
    </form>
  );
}
