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
  valoresIniciais?: { nome: string; codigoArquivo: string | null };
};

export function FormularioBanco({ action, valoresIniciais }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const valores = state?.values ?? valoresIniciais ?? undefined;

  return (
    <form key={formKey} action={formAction} className="max-w-md space-y-4">
      <Campo
        label="Nome do banco"
        name="nome"
        required
        defaultValue={valores?.nome}
        placeholder="Ex: Banco do Brasil"
      />
      <Campo
        label="Código no nome do arquivo"
        name="codigoArquivo"
        required
        defaultValue={valores?.codigoArquivo ?? undefined}
        placeholder="Ex: BancoDoBrasil"
      />
      <p className="text-xs text-foreground/50 -mt-2">
        É o texto usado no nome do arquivo do extrato, no padrão Posto_Banco
        (ex: Cantareira_BancoDoBrasil.xlsx). Sem espaço ou acento.
      </p>
      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link
          href="/cadastros/bancos"
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
