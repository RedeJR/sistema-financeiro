"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormKey } from "@/hooks/use-form-key";
import type { ActionState } from "@/lib/form-state";

type Opcao = { id: string; nome: string };

type Props = {
  postos: Opcao[];
  restante: string; // "26.770,60"
  hoje: string; // YYYY-MM-DD
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

export function FormularioAcerto({ postos, restante, hoje, action }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const v = state?.values;

  return (
    <form key={formKey} action={formAction} className="max-w-xl space-y-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="devedorId" className="text-sm font-medium text-foreground/80">
          Posto que quitou o boleto <span className="font-normal text-foreground/50">(o que deve ao dono da conta)</span>
        </label>
        <select id="devedorId" name="devedorId" defaultValue={v?.devedorId ?? ""} className={campoSelect} required>
          <option value="" disabled>
            Escolha um posto
          </option>
          {postos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Data do acerto" name="data" type="date" required defaultValue={v?.data ?? hoje} />
        <Campo label="Valor do acerto (R$)" name="valor" required defaultValue={v?.valor ?? restante} placeholder="0,00" inputMode="decimal" />
      </div>
      <Campo label="Observação (opcional)" name="observacao" defaultValue={v?.observacao} />
      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Registrar acerto</SubmitButton>
        <Link href="/combustiveis-a-pagar" className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
