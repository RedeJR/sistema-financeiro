import Link from "next/link";
import { Suspense } from "react";
import { usuarioAtual } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { ProximosDias } from "@/components/painel/proximos-dias";
import { carregarInicioComSnapshot, type InicioPronto } from "@/lib/painel/snapshot";
import {
  carregarRapido,
  hojeNoBrasil,
  horaNoBrasil,
  type PermissoesInicio,
  type RapidoInicio,
} from "@/lib/painel/inicio";
import { BOTAO_SECUNDARIO, CABECALHO_TABELA, CARTAO, TITULO_PAGINA } from "@/lib/estilo";
import type { Modulo } from "@/generated/prisma/client";

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function formatarDataExibicao(iso: string): string {
  return dataUTC(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function dataExtensa(d: Date): string {
  const s = d.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function saudacao(): string {
  const h = horaNoBrasil();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

// Idade do dado em dias (data já vem em ISO) -> cor: em dia / atrasando / velho.
function ChipDado({ iso, hoje, banco }: { iso: string | null; hoje: Date; banco?: string | null }) {
  if (!iso) return <span className="text-foreground/40">—</span>;
  const dias = Math.round((hoje.getTime() - dataUTC(iso).getTime()) / 86400000);
  const cor =
    dias <= 1
      ? "bg-[#E7F6EC] text-[#14693A] dark:bg-green-900/40 dark:text-green-400"
      : dias <= 4
        ? "bg-[#FFF3D6] text-[#7A4B00] dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-[#FDECEC] text-[#A12727] dark:bg-red-900/40 dark:text-red-400";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`} title={`${dias} dia${dias === 1 ? "" : "s"} atrás`}>
        {formatarDataExibicao(iso).slice(0, 5)}
      </span>
      {banco && <span className="text-[13px] text-foreground/70">{banco}</span>}
    </span>
  );
}

const COR_CELULA: Record<string, string> = {
  conciliado: "#1F9D55",
  divergente: "#D14343",
  "falta-extrato": "#E0A100",
  "falta-despesa": "#EC835A",
  "sem-atividade": "#CBD1DA",
};
const ROTULO_CELULA: Record<string, string> = {
  conciliado: "Conciliado",
  divergente: "Divergente",
  "falta-extrato": "Falta extrato",
  "falta-despesa": "Falta despesa",
  "sem-atividade": "Sem movimento",
};
// O cálculo pesado pode levar vários segundos no primeiro acesso do dia.
export const maxDuration = 60;

const COR_ALERTA = { ruim: "bg-[#D14343]", atencao: "bg-[#E0A100]", ok: "bg-[#1F9D55]" } as const;

// Esqueleto enquanto um bloco lento carrega (a previsão de recebimento, os extratos e as vendas
// demoram mais que as contas a pagar — a tela aparece logo e esses blocos chegam depois).
function Esqueleto({ altura = "h-40", className = "" }: { altura?: string; className?: string }) {
  return (
    <div className={`${CARTAO} ${altura} animate-pulse p-5 ${className}`} aria-busy="true">
      <div className="h-4 w-40 rounded bg-black/10 dark:bg-white/10" />
      <div className="mt-4 h-3 w-3/4 rounded bg-black/5 dark:bg-white/5" />
      <div className="mt-2 h-3 w-1/2 rounded bg-black/5 dark:bg-white/5" />
    </div>
  );
}

// ---------------- blocos lentos (cada um espera sua parte dos dados) ----------------

async function KpisRecebimento({ lento, rapido, rotuloDia }: { lento: Promise<InicioPronto>; rapido: RapidoInicio; rotuloDia: string }) {
  const { dados } = await lento;
  const receber = dados.receber;
  if (!receber) return null;
  const resultado = rapido.pagarNoDia ? receber.total - rapido.pagarNoDia.total : null;
  return (
    <>
      <div className={`${CARTAO} min-w-[230px] flex-1 px-5 py-4`}>
        <p className="text-[13px] text-foreground/60">
          A receber {receber.diaISO === dados.dataRef ? rotuloDia : formatarDataExibicao(receber.diaISO)} (previsto)
        </p>
        <p className="mt-1.5 text-[28px] font-bold tracking-tight text-[#14693A] tabular-nums dark:text-green-400">{formatarMoeda(receber.total)}</p>
        <p className="mt-1.5 text-[12.5px] text-foreground/60">
          Débito/Pix <strong className="font-semibold text-foreground">{formatarMoeda(receber.debitoPix)}</strong> · Crédito/Voucher{" "}
          <strong className="font-semibold text-foreground">{formatarMoeda(receber.creditoVoucher)}</strong>
        </p>
      </div>
      {resultado !== null && (
        <div className={`${CARTAO} min-w-[230px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Resultado previsto do dia</p>
          <p
            className={`mt-1.5 text-[28px] font-bold tracking-tight tabular-nums ${
              resultado < 0 ? "text-[#A12727] dark:text-red-400" : "text-[#14693A] dark:text-green-400"
            }`}
          >
            {resultado < 0 ? "− " : ""}
            {formatarMoeda(Math.abs(resultado))}
          </p>
          <p className="mt-1.5 text-[12.5px] text-foreground/60">A receber menos a pagar. O saldo em conta não entra (é manual no Fluxo).</p>
        </div>
      )}
    </>
  );
}

async function CartaoProximosDias({ lento, perm }: { lento: Promise<InicioPronto>; perm: PermissoesInicio }) {
  const { dados } = await lento;
  return (
    <section className={`${CARTAO} min-w-0 flex-[999_1_560px] space-y-4 p-5`}>
      <h2 className="text-[17px] font-bold tracking-tight">Próximos dias úteis{perm.contas && perm.fluxo ? " — a pagar x a receber" : ""}</h2>
      <ProximosDias dias={dados.proximosDias} />
      <p className="text-[13px] text-foreground/60">
        Passe o mouse em cada dia para ver os valores.
        {perm.fluxo && " A previsão de recebimento usa as vendas importadas + a média por dia da semana (mesma regra do Fluxo de Caixa)."}{" "}
        {perm.fluxo && (
          <Link href="/fluxo-de-caixa" className="font-semibold text-blue-700 dark:text-blue-300">
            Abrir Fluxo de Caixa →
          </Link>
        )}
      </p>
    </section>
  );
}

async function CartaoAtencao({ lento }: { lento: Promise<InicioPronto> }) {
  const { dados, atualizadoEm } = await lento;
  return (
    <section className={`${CARTAO} min-w-0 flex-[1_1_340px] p-5`}>
      <h2 className="mb-1 text-[17px] font-bold tracking-tight">Precisa da sua atenção</h2>
      <div>
        {dados.alertas.map((a, i) => (
          <div key={i} className="flex items-start gap-3 border-t border-black/5 px-1 py-3 text-sm first:border-t-0 dark:border-white/10">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${COR_ALERTA[a.nivel]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{a.titulo}</p>
              <p className="mt-0.5 text-[13px] text-foreground/60">{a.detalhe}</p>
            </div>
            {a.href && (
              <Link href={a.href} className="shrink-0 text-[13px] font-semibold text-blue-700 dark:text-blue-300">
                {a.acao ?? "Ver"}
              </Link>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-black/5 pt-3 text-xs text-foreground/50 dark:border-white/10">
        Atualizado às {new Date(atualizadoEm).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })} ·{" "}
        <Link href="/?atualizar=1" className="font-semibold text-blue-700 dark:text-blue-300">
          atualizar agora
        </Link>
      </p>
    </section>
  );
}

async function CartaoSituacao({
  lento,
  perm,
  hoje,
  rotuloDia,
  podeVerConciliacao,
}: {
  lento: Promise<InicioPronto>;
  perm: PermissoesInicio;
  hoje: Date;
  rotuloDia: string;
  podeVerConciliacao: boolean;
}) {
  const { dados } = await lento;
  if (dados.situacao.length === 0) return null;
  return (
    <section className={`${CARTAO} space-y-3 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold tracking-tight">Situação por posto</h2>
        <p className="text-[13px] text-foreground/60">Até quando temos dados de cada coisa e o que está pendente</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[860px] text-sm">
          <thead className={CABECALHO_TABELA}>
            <tr>
              <th className="px-3.5 py-2.5 text-left">Posto</th>
              {perm.extratos && <th className="px-3.5 py-2.5 text-left">Último extrato (banco mais atrasado)</th>}
              {perm.cartoes && <th className="px-3.5 py-2.5 text-left">Última venda de cartão</th>}
              {perm.contas && <th className="px-3.5 py-2.5 text-right">A pagar {rotuloDia}</th>}
              {perm.contas && <th className="px-3.5 py-2.5 text-right">Vencidas</th>}
              {podeVerConciliacao && <th className="px-3.5 py-2.5 text-left">Conciliação (7 dias)</th>}
            </tr>
          </thead>
          <tbody>
            {dados.situacao.map((s) => (
              <tr key={s.postoId} className="border-t border-black/5 dark:border-white/10">
                <td className="px-3.5 py-2.5 font-semibold whitespace-nowrap">{s.posto}</td>
                {perm.extratos && (
                  <td className="px-3.5 py-2.5">
                    <ChipDado iso={s.extratoAte} hoje={hoje} banco={s.extratoBanco} />
                  </td>
                )}
                {perm.cartoes && (
                  <td className="px-3.5 py-2.5">
                    <ChipDado iso={s.vendasAte} hoje={hoje} />
                  </td>
                )}
                {perm.contas && (
                  <td className="px-3.5 py-2.5 text-right tabular-nums">
                    {s.pagarNoDia > 0 ? formatarMoeda(s.pagarNoDia) : <span className="text-foreground/40">—</span>}
                  </td>
                )}
                {perm.contas && (
                  <td className={`px-3.5 py-2.5 text-right tabular-nums ${s.vencidas > 0 ? "font-semibold text-[#A12727] dark:text-red-400" : ""}`}>
                    {s.vencidas > 0 ? formatarMoeda(s.vencidas) : <span className="text-foreground/40">—</span>}
                  </td>
                )}
                {podeVerConciliacao && (
                  <td className="px-3.5 py-2.5">
                    {s.celulas.length > 0 ? (
                      <span className="inline-flex gap-[3px]">
                        {s.celulas.map((c) => (
                          <span
                            key={c.data}
                            className="size-4 rounded"
                            style={{ background: COR_CELULA[c.status] }}
                            title={`${formatarDataExibicao(c.data)} — ${ROTULO_CELULA[c.status]}`}
                          />
                        ))}
                      </span>
                    ) : (
                      <span className="text-foreground/40">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground/60">
        Datas: verde = em dia (até 1 dia), amarelo = 2 a 4 dias de atraso, vermelho = mais de 4 dias. Quadradinhos de conciliação: verde = conciliado,
        vermelho = divergente, amarelo = falta extrato, laranja = falta despesa, cinza = sem movimento.
      </p>
    </section>
  );
}

export const metadata = { title: "Início" };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; atualizar?: string }>;
}) {
  const { data, atualizar } = await searchParams;
  const hoje = hojeNoBrasil();
  const dataValida = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
  const dataRef = dataValida ? dataUTC(dataValida) : hoje;

  const usuario = await usuarioAtual();
  const pode = (m: Modulo) => !!usuario?.permissoes.find((p) => p.modulo === m && (p.podeVisualizar || p.podeEditar));
  const podeEditarM = (m: Modulo) => !!usuario?.permissoes.find((p) => p.modulo === m && p.podeEditar);

  const perm: PermissoesInicio = {
    contas: pode("CONTAS_A_PAGAR"),
    combustiveis: pode("COMBUSTIVEIS_A_PAGAR"),
    fluxo: pode("FLUXO_DE_CAIXA"),
    extratos: pode("EXTRATOS"),
    cartoes: pode("CARTOES"),
    despesasPagas: pode("DESPESAS_PAGAS"),
    entrePostos: pode("ENTRE_POSTOS"),
  };
  const podeVerConciliacao = perm.despesasPagas && perm.extratos;

  // A parte rápida (contas a pagar) aparece na hora; a parte lenta (previsão, extratos, vendas) já
  // começa a carregar agora e chega por blocos, sem travar a tela.
  const rapido = await carregarRapido({ dataRef, perm });
  // Só depois de a parte rápida estar pronta é que a lenta começa: assim as duas não disputam as conexões do banco.
  const lento = carregarInicioComSnapshot({ dataRef, hoje, perm, forcar: atualizar === "1" });
  lento.catch(() => {}); // erro é tratado onde o bloco é aguardado

  const ehHoje = rapido.dataRef === hoje.toISOString().slice(0, 10);
  const rotuloDia = ehHoje ? "hoje" : formatarDataExibicao(rapido.dataRef);
  const primeiroNome = usuario?.nome?.split(" ")[0] ?? "";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={TITULO_PAGINA}>
            {saudacao()}
            {primeiroNome ? `, ${primeiroNome}` : ""}
          </h1>
          <p className="mt-1.5 text-sm text-foreground/60">
            {dataExtensa(dataRef)}
            {!ehHoje && " (dia escolhido)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-medium">
          {podeEditarM("EXTRATOS") && (
            <Link href="/extratos/importar" className={BOTAO_SECUNDARIO}>
              Importar extrato
            </Link>
          )}
          {podeEditarM("DESPESAS_PAGAS") && (
            <Link href="/despesas-pagas/nova" className={BOTAO_SECUNDARIO}>
              + Despesa avulsa
            </Link>
          )}
          {podeEditarM("CONTAS_A_PAGAR") && (
            <Link href="/contas-a-pagar/novo" className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
              + Nova conta
            </Link>
          )}
          {!usuario?.permissoes.length && (
            <Link href="/cadastros" className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
              Ir para Cadastros →
            </Link>
          )}
        </div>
      </header>

      {(rapido.pagarNoDia || rapido.vencidas || perm.fluxo) && (
        <section aria-label="Indicadores do dia" className="flex flex-wrap gap-4">
          {rapido.pagarNoDia && (
            <div className={`${CARTAO} min-w-[230px] flex-1 px-5 py-4`}>
              <p className="text-[13px] text-foreground/60">A pagar {rotuloDia}</p>
              <p className="mt-1.5 text-[28px] font-bold tracking-tight tabular-nums">{formatarMoeda(rapido.pagarNoDia.total)}</p>
              <p className="mt-1.5 text-[12.5px] text-foreground/60">
                {rapido.pagarNoDia.qtd} conta{rapido.pagarNoDia.qtd === 1 ? "" : "s"} em aberto
                {perm.combustiveis && (
                  <>
                    {" "}
                    · combustíveis <strong className="font-semibold text-foreground">{formatarMoeda(rapido.pagarNoDia.combustiveis)}</strong>
                  </>
                )}{" "}
                · despesas <strong className="font-semibold text-foreground">{formatarMoeda(rapido.pagarNoDia.despesas)}</strong>
              </p>
            </div>
          )}
          {rapido.vencidas && (
            <div
              className={`min-w-[230px] flex-1 rounded-xl border px-5 py-4 ${
                rapido.vencidas.qtd > 0
                  ? "border-[#F5C2C2] bg-[#FFF8F8] dark:border-red-900 dark:bg-red-950/20"
                  : "border-black/10 bg-white dark:border-white/15 dark:bg-white/[0.03]"
              }`}
            >
              <p className={`text-[13px] ${rapido.vencidas.qtd > 0 ? "text-[#A12727] dark:text-red-400" : "text-foreground/60"}`}>Vencidas em aberto</p>
              <p
                className={`mt-1.5 text-[28px] font-bold tracking-tight tabular-nums ${
                  rapido.vencidas.qtd > 0 ? "text-[#A12727] dark:text-red-400" : ""
                }`}
              >
                {formatarMoeda(rapido.vencidas.total)}
              </p>
              <p className="mt-1.5 text-[12.5px] text-foreground/60">
                {rapido.vencidas.qtd === 0 ? (
                  "Nenhuma conta vencida sem pagar"
                ) : (
                  <>
                    {rapido.vencidas.qtd} conta{rapido.vencidas.qtd === 1 ? "" : "s"} antes de {formatarDataExibicao(rapido.dataRef)} ·{" "}
                    <Link href={`/conferencia-diaria?ate=${rapido.vencidas.ateISO}`} className="font-semibold text-blue-700 dark:text-blue-300">
                      Ver vencidas →
                    </Link>
                  </>
                )}
              </p>
            </div>
          )}
          {perm.fluxo && (
            <Suspense
              fallback={
                <>
                  <Esqueleto altura="h-[116px]" className="min-w-[230px] flex-1" />
                  <Esqueleto altura="h-[116px]" className="min-w-[230px] flex-1" />
                </>
              }
            >
              <KpisRecebimento lento={lento} rapido={rapido} rotuloDia={rotuloDia} />
            </Suspense>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-stretch gap-4">
        {(perm.contas || perm.fluxo) && (
          <Suspense fallback={<Esqueleto altura="h-72" className="min-w-0 flex-[999_1_560px]" />}>
            <CartaoProximosDias lento={lento} perm={perm} />
          </Suspense>
        )}
        <Suspense fallback={<Esqueleto altura="h-72" className="min-w-0 flex-[1_1_340px]" />}>
          <CartaoAtencao lento={lento} />
        </Suspense>
      </div>

      <Suspense fallback={<Esqueleto altura="h-64" />}>
        <CartaoSituacao lento={lento} perm={perm} hoje={hoje} rotuloDia={rotuloDia} podeVerConciliacao={podeVerConciliacao} />
      </Suspense>
    </div>
  );
}
