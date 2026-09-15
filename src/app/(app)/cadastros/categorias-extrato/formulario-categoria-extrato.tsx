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
  valoresIniciais?: { nome: string; tipo: "ADQUIRENTE" | "PADRAO"; ordem: number };
};

export function FormularioCategoriaExtrato({ action, valoresIniciais }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);

  const nome = state?.values?.nome ?? valoresIniciais?.nome;
  const tipo = state?.values?.tipo ?? valoresIniciais?.tipo ?? "PADRAO";
  const ordem = state?.values?.ordem ?? valoresIniciais?.ordem ?? 0;

  return (
    <form key={formKey} action={formAction} className="max-w-md space-y-4">
      <Campo
        label="Nome da categoria"
        name="nome"
        required
        defaultValue={nome}
        placeholder="Ex: Cielo, PIX, Tarifas C/C"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="tipo" className="text-sm font-medium text-foreground/80">
          Tipo
        </label>
        <select
          id="tipo"
          name="tipo"
          defaultValue={tipo}
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20"
        >
          <option value="PADRAO">Padrão</option>
          <option value="ADQUIRENTE">Adquirente</option>
        </select>
        <p className="text-xs text-foreground/50">
          Adquirente aparece com Débito/Crédito separado na revisão dos
          extratos, e soma numa coluna só no fechamento (ex: Cielo, Rede,
          Stone).
        </p>
      </div>

      <Campo
        label="Ordem de exibição no fechamento"
        name="ordem"
        type="number"
        defaultValue={ordem}
      />

      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link
          href="/cadastros/categorias-extrato"
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
