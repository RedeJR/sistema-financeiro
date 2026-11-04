"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormKey } from "@/hooks/use-form-key";
import type { ActionState } from "@/lib/form-state";

type Opcao = { id: string; nome: string };

type Valores = {
  postoId: string;
  cliente: string;
  periodoDe: string;
  periodoAte: string;
  valor: string;
  dataPagamento: string;
  observacao: string | null;
};

type Props = {
  postos: Opcao[];
  clientes: string[]; // clientes já lançados, pra sugerir ao digitar
  valoresIniciais?: Valores;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

export function FormularioVendaAPrazo({ postos, clientes, valoresIniciais, action }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const v = (state?.values as Partial<Valores> | undefined) ?? valoresIniciais;

  return (
    <form key={formKey} action={formAction} className="max-w-2xl space-y-4">
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
        <label htmlFor="cliente" className="text-sm font-medium text-foreground/80">
          Cliente
        </label>
        <input id="cliente" name="cliente" list="clientes-lancados" defaultValue={v?.cliente} required autoComplete="off" className={campoSelect} />
        <datalist id="clientes-lancados">
          {clientes.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
        <p className="mb-3 text-sm font-medium text-foreground/80">Período do abastecimento</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="De" name="periodoDe" type="date" defaultValue={v?.periodoDe} required />
          <Campo label="Até" name="periodoAte" type="date" defaultValue={v?.periodoAte} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Valor total (R$)" name="valor" defaultValue={v?.valor} placeholder="0,00" inputMode="decimal" required />
        <Campo label="Data de pagamento" name="dataPagamento" type="date" defaultValue={v?.dataPagamento} required />
      </div>
      <p className="-mt-2 text-xs text-foreground/50">
        O sistema procura no extrato do posto um crédito desse valor perto da data de pagamento (5 dias antes até 15 depois) e liga sozinho
        quando só existe um. Nos outros casos, você liga na mão em &quot;Vincular&quot;.
      </p>

      <Campo label="Observação (opcional)" name="observacao" defaultValue={v?.observacao ?? undefined} />

      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link href="/vendas-a-prazo" className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
