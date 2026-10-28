"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormKey } from "@/hooks/use-form-key";
import type { ActionState } from "@/lib/form-state";

type Opcao = { id: string; nome: string };

type Valores = {
  bandeira: string;
  postoId: string;
  periodoDe: string;
  periodoAte: string;
  retornoPorLitro: string;
  litros: string;
  valor: string;
  observacao: string | null;
};

type Props = {
  postos: Opcao[];
  valoresIniciais?: Valores;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";
const campoTexto = campoSelect;

// "1.234,56" -> 1234.56 (mesmo formato dos outros formulários do sistema)
function paraNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isNaN(n) ? null : n;
}

function calcular(retorno: string, litros: string): string {
  const r = paraNumero(retorno);
  const l = paraNumero(litros);
  if (r === null || l === null) return "";
  return (Math.round(r * l * 100) / 100).toFixed(2).replace(".", ",");
}

export function FormularioBonificacao({ postos, valoresIniciais, action }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const v = (state?.values as Partial<Valores> | undefined) ?? valoresIniciais;

  return (
    <form key={formKey} action={formAction} className="max-w-2xl space-y-4">
      <CorpoFormulario v={v} postos={postos} erro={state?.error} />
    </form>
  );
}

// Separado pra o estado de cálculo (retorno × litros) reiniciar junto com o formulário.
function CorpoFormulario({ v, postos, erro }: { v: Partial<Valores> | undefined; postos: Opcao[]; erro?: string }) {
  const [retorno, setRetorno] = useState(v?.retornoPorLitro ?? "");
  const [litros, setLitros] = useState(v?.litros ?? "");
  const [valor, setValor] = useState(v?.valor ?? "");
  // Se o valor foi digitado à mão (ajuste de centavos), o cálculo automático deixa de sobrescrever.
  const [valorManual, setValorManual] = useState(() => {
    if (!v?.valor) return false;
    return v.valor !== calcular(v.retornoPorLitro ?? "", v.litros ?? "");
  });

  function aoMudar(novoRetorno: string, novosLitros: string) {
    if (!valorManual) setValor(calcular(novoRetorno, novosLitros));
  }

  const centavos = paraNumero(retorno);

  return (
    <>
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
          <div className="flex flex-col gap-1">
            <label htmlFor="periodoDe" className="text-sm font-medium text-foreground/80">
              De
            </label>
            <input id="periodoDe" name="periodoDe" type="date" defaultValue={v?.periodoDe} required className={campoTexto} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="periodoAte" className="text-sm font-medium text-foreground/80">
              Até
            </label>
            <input id="periodoAte" name="periodoAte" type="date" defaultValue={v?.periodoAte} required className={campoTexto} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="retornoPorLitro" className="text-sm font-medium text-foreground/80">
            Retorno por litro (R$)
          </label>
          <input
            id="retornoPorLitro"
            name="retornoPorLitro"
            inputMode="decimal"
            placeholder="0,0450"
            required
            value={retorno}
            onChange={(e) => {
              setRetorno(e.target.value);
              aoMudar(e.target.value, litros);
            }}
            className={campoTexto}
          />
          <span className="text-xs text-foreground/50">
            {centavos !== null && centavos > 0 ? `= ${(centavos * 100).toFixed(2).replace(".", ",")} centavos por litro` : "Use vírgula. Ex: 0,0450 = 4,5 centavos"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="litros" className="text-sm font-medium text-foreground/80">
            Litragem comprada
          </label>
          <input
            id="litros"
            name="litros"
            inputMode="decimal"
            placeholder="0,00"
            required
            value={litros}
            onChange={(e) => {
              setLitros(e.target.value);
              aoMudar(retorno, e.target.value);
            }}
            className={campoTexto}
          />
          <span className="text-xs text-foreground/50">Total de litros no período</span>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="valor" className="text-sm font-medium text-foreground/80">
            Valor a receber (R$)
          </label>
          <input
            id="valor"
            name="valor"
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setValorManual(e.target.value.trim() !== "");
            }}
            className={campoTexto}
          />
          <span className="text-xs text-foreground/50">Retorno × litragem. Pode ajustar os centavos.</span>
        </div>
      </div>

      <p className="-mt-2 text-xs text-foreground/50">
        Ipiranga: o sistema soma o Desconto lançado nos boletos de combustível do posto com vencimento no período. Vibra: soma os
        créditos da categoria &quot;BONIFICAÇÃO VIBRA&quot; do extrato do posto no período. Shell: por enquanto é só acompanhamento manual.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="observacao" className="text-sm font-medium text-foreground/80">
          Observação (opcional)
        </label>
        <input id="observacao" name="observacao" defaultValue={v?.observacao ?? ""} className={campoTexto} />
      </div>

      <ErroFormulario mensagem={erro} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link href="/bonificacao-postecipada" className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10">
          Cancelar
        </Link>
      </div>
    </>
  );
}
