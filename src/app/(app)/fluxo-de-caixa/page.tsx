import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { buscarFluxoCaixa } from "./consulta";
import { salvarFluxoCaixa } from "./actions";
import { BotaoImprimir } from "./botao-imprimir";
import { TabelaFluxoCaixa } from "./tabela-fluxo-caixa";
import { BOTAO_PRIMARIO, CAMPO, CARTAO, TITULO_PAGINA } from "@/lib/estilo";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Vendas importadas até antes disso contam como "importação atrasada".
function limiteAtrasoISO(): string {
  return new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
}

function paraArray(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; de?: string; ate?: string }>;
}) {
  await exigirPermissao("FLUXO_DE_CAIXA", "visualizar");
  const podeEditar = await podeEditarModulo("FLUXO_DE_CAIXA");

  const filtros = await searchParams;
  const postoIds = paraArray(filtros.postoId);
  const de = filtros.de || hojeISO();
  const ate = filtros.ate || hojeISO();

  const [postosTodos, dias] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    buscarFluxoCaixa({ postoIds, de, ate }),
  ]);

  const temFiltro = Boolean(postoIds.length || filtros.de || filtros.ate);

  // Aviso: a média só usa vendas importadas — posto com importação atrasada
  // (ou sem venda) calcula com o que tem, e a usuária precisa saber disso.
  const limiteAtraso = limiteAtrasoISO();
  const postosDefasados = (dias[0]?.linhas ?? []).filter((l) => !l.recebBaseAte || l.recebBaseAte < limiteAtraso);

  const qsAtual = new URLSearchParams();
  postoIds.forEach((id) => qsAtual.append("postoId", id));
  qsAtual.set("de", de);
  qsAtual.set("ate", ate);
  const voltarPara = `/fluxo-de-caixa?${qsAtual.toString()}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={TITULO_PAGINA}>Fluxo de Caixa</h1>
          <p className="mt-1.5 text-sm text-foreground/60 print:hidden">
            Recebimentos reais e previstos, combustíveis e despesas dia a dia, por posto.
          </p>
        </div>
        <BotaoImprimir />
      </header>
      <details className={`${CARTAO} px-5 py-3 text-sm print:hidden`}>
        <summary className="cursor-pointer font-medium text-foreground/80">Como os valores são calculados</summary>
        <p className="mt-3 max-w-4xl leading-relaxed text-foreground/60">
        Débito/Pix e Crédito/Voucher são calculados sozinhos, em três camadas: dia que já passou e tem extrato
        importado mostra o que realmente entrou (real); o resto é previsto = o que as vendas já importadas agendam
        (com as antecipações cadastradas) + uma estimativa só do que ainda não foi importado (média por dia da
        semana das últimas 4 semanas, no mesmo prazo em dias úteis) — passe o mouse no valor pra ver a composição.
        Saldo Inicial, Outros recebimentos (Sem Parar,
        Abastece Aí, Premmia, SAQPAY, antecipações...) e Despesas Extras são preenchidos manual. Combustíveis vem de{" "}
        <Link href="/combustiveis-a-pagar" className="underline">
          Combustíveis a Pagar
        </Link>{" "}
        e Despesas vem de{" "}
        <Link href="/contas-a-pagar" className="underline">
          Contas a Pagar
        </Link>{" "}
        — os dois somados pela data de vencimento. Só dias úteis: o que vence em sábado, domingo ou feriado
        entra no próximo dia útil. Saldo Final = Saldo Inicial + Débito/Pix + Crédito/Voucher + Outros recebimentos −
        Combustíveis − Despesas − Despesas Extras.
        </p>
      </details>

      {postosDefasados.length > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900 print:hidden dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Atenção — a previsão de recebimento usa só vendas importadas:{postosDefasados.map((l) => `${l.posto} (${l.recebBaseAte ? `até ${l.recebBaseAte.split("-").reverse().join("/")}` : "sem vendas"})`).join(", ")}.
        </p>
      )}

      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm print:hidden`}>
        <div className="flex flex-col gap-1">
          <label className="text-foreground/60">Postos</label>
          <SeletorDropdown
            nome="postoId"
            rotuloTodos="Todos os postos"
            selecionados={postoIds}
            itens={postosTodos.map((p) => ({ id: p.id, nome: p.nome }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            De
          </label>
          <input
            id="de"
            type="date"
            name="de"
            defaultValue={de}
            className={CAMPO}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="text-foreground/60">
            até
          </label>
          <input
            id="ate"
            type="date"
            name="ate"
            defaultValue={ate}
            className={CAMPO}
          />
        </div>
        <button type="submit" className={BOTAO_PRIMARIO}>
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/fluxo-de-caixa" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      {podeEditar ? (
        <form action={salvarFluxoCaixa} className="space-y-4">
          <input type="hidden" name="voltarPara" value={voltarPara} />
          <TabelaFluxoCaixa dias={dias} podeEditar={podeEditar} />
          {dias.length > 0 && (
            <div className="flex justify-end print:hidden">
              <button type="submit" className={BOTAO_PRIMARIO}>
                Salvar
              </button>
            </div>
          )}
        </form>
      ) : (
        <TabelaFluxoCaixa dias={dias} podeEditar={podeEditar} />
      )}

      {dias.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhum dia útil no período escolhido.</p>
      )}
    </div>
  );
}
