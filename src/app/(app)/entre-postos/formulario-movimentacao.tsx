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
    data: string;
    postoOrigemId: string;
    postoDestinoId: string;
    valor: string;
    tipo: "EMPRESTIMO" | "DEVOLUCAO";
    statusManual: string | null;
    observacao: string | null;
  };
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

export function FormularioMovimentacao({ postos, valoresIniciais, action }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const v = state?.values ?? valoresIniciais;

  return (
    <form key={formKey} action={formAction} className="max-w-2xl space-y-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground/80">Tipo</span>
        <div className="flex items-center gap-4 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="tipo" value="EMPRESTIMO" defaultChecked={(v?.tipo ?? "EMPRESTIMO") === "EMPRESTIMO"} required />
            Empréstimo
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="tipo" value="DEVOLUCAO" defaultChecked={v?.tipo === "DEVOLUCAO"} />
            Devolução
          </label>
        </div>
        <p className="text-xs text-foreground/50">
          Devolução: quem está pagando de volta é a Origem, e quem recebe (o credor original) é o Destino.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoOrigemId" className="text-sm font-medium text-foreground/80">
            Origem (quem manda o dinheiro)
          </label>
          <select id="postoOrigemId" name="postoOrigemId" defaultValue={v?.postoOrigemId ?? ""} className={campoSelect} required>
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
        <div className="flex flex-col gap-1">
          <label htmlFor="postoDestinoId" className="text-sm font-medium text-foreground/80">
            Destino (quem recebe o dinheiro)
          </label>
          <select id="postoDestinoId" name="postoDestinoId" defaultValue={v?.postoDestinoId ?? ""} className={campoSelect} required>
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

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Data" name="data" type="date" defaultValue={v?.data} required />
        <Campo label="Valor (R$)" name="valor" defaultValue={v?.valor} placeholder="0,00" inputMode="decimal" required />
      </div>

      <Campo
        label="Status (opcional, sua anotação)"
        name="statusManual"
        defaultValue={v?.statusManual ?? undefined}
        placeholder="ex: EM ABERTO, PARCIAL, QUITADO"
      />
      <p className="-mt-2 text-xs text-foreground/50">
        É só pra sua referência — quem decide se está quitado é o saldo calculado, não esse campo.
      </p>

      <Campo label="Observação (opcional)" name="observacao" defaultValue={v?.observacao ?? undefined} />

      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link href="/entre-postos" className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
