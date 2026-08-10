"use client";

import { useActionState } from "react";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormKey } from "@/hooks/use-form-key";
import type { ActionState } from "@/lib/form-state";

export function FormularioRedefinirSenha({
  action,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);

  return (
    <form key={formKey} action={formAction} className="space-y-4">
      <Campo label="Nova senha" name="novaSenha" type="password" required autoFocus minLength={8} />
      <Campo label="Confirmar nova senha" name="confirmarSenha" type="password" required minLength={8} />
      <ErroFormulario mensagem={state?.error} />
      <SubmitButton
        pendingLabel="Salvando..."
        className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        Salvar nova senha
      </SubmitButton>
    </form>
  );
}
