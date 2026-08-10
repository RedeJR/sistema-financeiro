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
  fornecedores: Opcao[];
  valoresIniciais?: {
    postoId: string;
    fornecedorId: string;
    dataDescarga: string;
    dataVencimento: string;
    valor: string;
    observacao: string | null;
  };
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

function paraTextoEditavel(valor: string): string {
  return Number(valor).toFixed(2).replace(".", ",");
}

export function FormularioCombustivel({ postos, fornecedores, valoresIniciais, action }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const v = state?.values ?? valoresIniciais;

  return (
    <form key={formKey} action={formAction} className="max-w-2xl space-y-4">
      <p className="rounded-md bg-black/5 px-3 py-2 text-sm text-foreground/70 dark:bg-white/5">
        O plano de contas dessa despesa é sempre <strong>COMBUSTIVEIS</strong> — não precisa escolher. A
        baixa também é automática: assim que o débito correspondente aparecer conciliado no extrato
        bancário (mesmo posto, mesmo valor, categoria &quot;Combustíveis&quot;), essa conta sai da lista de
        pendentes sozinha.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="flex flex-col gap-1">
          <label htmlFor="fornecedorId" className="text-sm font-medium text-foreground/80">
            Fornecedor
          </label>
          <select
            id="fornecedorId"
            name="fornecedorId"
            defaultValue={v?.fornecedorId ?? ""}
            className={campoSelect}
            required
          >
            <option value="" disabled>
              Escolha um fornecedor
            </option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          label="Data de descarga"
          name="dataDescarga"
          type="date"
          required
          defaultValue={v?.dataDescarga}
        />
        <Campo
          label="Data de vencimento"
          name="dataVencimento"
          type="date"
          required
          defaultValue={v?.dataVencimento}
        />
      </div>

      <Campo
        label="Valor"
        name="valor"
        required
        defaultValue={v?.valor ? paraTextoEditavel(v.valor) : undefined}
        placeholder="0,00"
        inputMode="decimal"
      />

      <Campo label="Observação (opcional)" name="observacao" defaultValue={v?.observacao ?? undefined} />

      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link
          href="/combustiveis-a-pagar"
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
