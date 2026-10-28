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
  valoresIniciais?: {
    bandeira: string;
    postoId: string;
    periodoDe: string;
    periodoAte: string;
    valor: string;
    observacao: string | null;
  };
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

export function FormularioBonificacao({ postos, valoresIniciais, action }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const v = state?.values ?? valoresIniciais;

  return (
    <form key={formKey} action={formAction} className="max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="bandeira" className="text-sm font-medium text-foreground/80">
            Fornecedor
          </label>
          <select id="bandeira" name="bandeira" defaultValue={v?.bandeira ?? ""} className={campoSelect} required>
            <option value="" disabled>
              Escolha o fornecedor
            </option>
            <option value="IPIRANGA">Ipiranga</option>
            <option value="VIBRA">Vibra</option>
            <option value="SHELL">Shell</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-sm font-medium text-foreground/80">
            Posto
          </label>
          <select id="postoId" name="postoId" defaultValue={v?.postoId ?? ""} className={campoSelect} required>
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
      </div>

      <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
        <p className="mb-3 text-sm font-medium text-foreground/80">
          Período da bonificação <span className="font-normal text-foreground/50">(não precisa ser mês fechado)</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="De" name="periodoDe" type="date" defaultValue={v?.periodoDe} required />
          <Campo label="Até" name="periodoAte" type="date" defaultValue={v?.periodoAte} required />
        </div>
      </div>

      <Campo label="Valor a receber (R$)" name="valor" defaultValue={v?.valor} placeholder="0,00" inputMode="decimal" required />
      <p className="-mt-2 text-xs text-foreground/50">
        Ipiranga: o sistema soma o Desconto lançado nos boletos de combustível do posto com vencimento no período. Vibra: soma os
        créditos da categoria &quot;BONIFICAÇÃO VIBRA&quot; do extrato do posto no período. Shell: por enquanto é só acompanhamento manual.
      </p>

      <Campo label="Observação (opcional)" name="observacao" defaultValue={v?.observacao ?? undefined} />

      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link href="/bonificacao-postecipada" className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
