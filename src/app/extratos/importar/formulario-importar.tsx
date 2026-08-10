"use client";

import { useActionState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/ui/submit-button";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { useFormKey } from "@/hooks/use-form-key";
import { importarExtratosAction, type ImportarState } from "../actions";

type Opcao = { id: string; nome: string };

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

const ROTULO_STATUS: Record<string, { texto: string; classe: string }> = {
  ok: { texto: "importado", classe: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400" },
  erro: { texto: "erro", classe: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400" },
};

export function FormularioImportar({ postos, bancos }: { postos: Opcao[]; bancos: Opcao[] }) {
  const [state, formAction] = useActionState<ImportarState, FormData>(importarExtratosAction, null);
  const formKey = useFormKey(state);

  return (
    <div className="max-w-2xl space-y-6">
      <form key={formKey} action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="postoId" className="text-sm font-medium text-foreground/80">
              Posto
            </label>
            <select id="postoId" name="postoId" defaultValue="" className={campoSelect} required>
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
            <label htmlFor="bancoId" className="text-sm font-medium text-foreground/80">
              Banco
            </label>
            <select id="bancoId" name="bancoId" defaultValue="" className={campoSelect} required>
              <option value="" disabled>
                Escolha o banco
              </option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="de" className="text-sm font-medium text-foreground/80">
              De <span className="font-normal text-foreground/50">(opcional)</span>
            </label>
            <input id="de" name="de" type="date" className={campoSelect} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="ate" className="text-sm font-medium text-foreground/80">
              Até <span className="font-normal text-foreground/50">(opcional)</span>
            </label>
            <input id="ate" name="ate" type="date" className={campoSelect} />
          </div>
        </div>
        <p className="text-xs text-foreground/50">
          Preencha só se quiser restringir a um período específico — útil quando o banco devolve mais dias
          do que você pediu no download. O que ficar fora do período não é importado (dá pra importar depois).
        </p>

        <div className="flex flex-col gap-1">
          <label htmlFor="arquivos" className="text-sm font-medium text-foreground/80">
            Arquivo(s) do extrato
          </label>
          <input
            id="arquivos"
            name="arquivos"
            type="file"
            accept=".ofx,.qfx"
            multiple
            required
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-background dark:border-white/20"
          />
          <p className="text-xs text-foreground/50">
            Formato OFX (extensão .ofx ou .qfx) — é a opção de exportação que praticamente todo banco
            oferece. Todos os arquivos escolhidos precisam ser do mesmo banco; pra outro banco, importe
            em uma segunda vez.
          </p>
        </div>

        <ErroFormulario mensagem={state?.erro} />
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Importando...">Importar</SubmitButton>
          <Link
            href="/extratos"
            className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
          >
            Voltar
          </Link>
        </div>
      </form>

      {state?.resultados && (
        <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
          <h2 className="text-sm font-medium">Resultado da importação</h2>
          <ul className="space-y-2 text-sm">
            {state.resultados.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${ROTULO_STATUS[r.status].classe}`}>
                  {ROTULO_STATUS[r.status].texto}
                </span>
                <span className="font-medium">{r.arquivo}</span>
                {r.status === "ok" && (
                  <span className="text-foreground/60">
                    {r.gravados} lançamento{r.gravados === 1 ? "" : "s"} gravado
                    {r.gravados === 1 ? "" : "s"}
                    {r.duplicados ? ` · ${r.duplicados} já existia${r.duplicados === 1 ? "" : "m"}` : ""}
                    {r.foraDoPeriodo
                      ? ` · ${r.foraDoPeriodo} fora do período selecionado`
                      : ""}
                  </span>
                )}
                {r.mensagem && <span className="text-foreground/60">{r.mensagem}</span>}
              </li>
            ))}
          </ul>
          <Link href="/extratos" className="inline-block text-sm text-foreground underline">
            Ver lançamentos importados →
          </Link>
        </div>
      )}
    </div>
  );
}
