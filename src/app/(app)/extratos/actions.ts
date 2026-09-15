"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/form-state";
import { importarExtratos, type ResultadoArquivo } from "@/lib/extratos/importar";

// Duas telas: /extratos é o resumo (só leitura, agrupado por dia/categoria)
// e /extratos/editar é onde a edição de verdade acontece (lançamento a
// lançamento, seleção em massa). Toda mutação revalida as duas.
const ROTA_RESUMO = "/extratos";
const ROTA_EDITAR = "/extratos/editar";

function revalidarTudo() {
  revalidatePath(ROTA_RESUMO);
  revalidatePath(ROTA_EDITAR);
}

// Volta pra mesma URL filtrada/paginada em que a usuária estava dentro da
// tela de edição (em vez de sempre cair no /extratos/editar genérico) — as
// ações em massa recebem esse campo oculto (ver editar/page.tsx) e usam ele
// no redirect final.
function rotaDeVolta(formData: FormData): string {
  const voltarPara = formData.get("voltarPara");
  return typeof voltarPara === "string" && voltarPara ? voltarPara : ROTA_EDITAR;
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export type ImportarState = { erro?: string; resultados?: ResultadoArquivo[] } | null;

export async function importarExtratosAction(
  _prev: ImportarState,
  formData: FormData
): Promise<ImportarState> {
  const usuario = await exigirPermissao("EXTRATOS", "editar");

  const postoId = formData.get("postoId");
  const bancoId = formData.get("bancoId");
  const deBruto = formData.get("de");
  const ateBruto = formData.get("ate");
  const arquivos = formData
    .getAll("arquivos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (typeof postoId !== "string" || !postoId) return { erro: "Escolha um posto." };
  if (typeof bancoId !== "string" || !bancoId) return { erro: "Escolha um banco." };
  if (arquivos.length === 0) return { erro: "Escolha ao menos um arquivo de extrato." };

  // De/Até são opcionais — servem pra restringir o que é importado quando o
  // arquivo do banco vem com um período diferente do que foi pedido no
  // download (banco decide o que devolve, não a gente). Sem preencher,
  // importa o arquivo inteiro como sempre.
  const de = typeof deBruto === "string" && deBruto ? dataUTC(deBruto) : undefined;
  const ate = typeof ateBruto === "string" && ateBruto ? dataUTC(ateBruto) : undefined;

  const arquivosBuffer = await Promise.all(
    arquivos.map(async (f) => ({ nome: f.name, buffer: Buffer.from(await f.arrayBuffer()) }))
  );

  const resultados = await importarExtratos({
    postoId,
    bancoId,
    arquivos: arquivosBuffer,
    usuarioId: usuario.id,
    de,
    ate,
  });

  revalidarTudo();

  // Se algum arquivo deu erro, mostra o resultado detalhado em vez de já
  // sair da tela — ela precisa ver o que falhou. Sem erro, vai direto pra
  // tela de EDIÇÃO (não o resumo) com os lançamentos recém-importados
  // (filtrados pelo(s) arquivo(s)), pra já categorizar.
  const houveErro = resultados.some((r) => r.status === "erro");
  if (houveErro) return { resultados };

  const gravados = resultados.reduce((s, r) => s + (r.gravados ?? 0), 0);
  const duplicados = resultados.reduce((s, r) => s + (r.duplicados ?? 0), 0);
  const foraDoPeriodo = resultados.reduce((s, r) => s + (r.foraDoPeriodo ?? 0), 0);

  const qs = new URLSearchParams({ postoId, bancoId, gravados: String(gravados), duplicados: String(duplicados) });
  if (foraDoPeriodo > 0) qs.set("foraDoPeriodo", String(foraDoPeriodo));
  for (const a of arquivosBuffer) qs.append("arquivo", a.nome);

  redirect(`${ROTA_EDITAR}?${qs.toString()}`);
}

// Estado devolvido pela edição inline de categoria/observação — a própria
// LinhaEditavel usa esse retorno (via useActionState) pra remontar o <select>
// não-controlado com o valor certo. Importante: NÃO depender do refresh
// automático da página depois da Server Action pra mostrar o valor salvo —
// em teste, esse refresh às vezes reflete um instantâneo anterior ao save
// (o dado no banco fica correto, mas a tela mostrava "sem categoria" de
// novo por alguns segundos). Usar o retorno da própria action é imediato e
// não depende de timing nenhum.
export type EstadoLinha = { categoriaAtual: string; observacaoAtual: string };

// O campo "categoria" do form vem como "" (sem categoria), "<id>" (categoria
// padrão) ou "<id>:DEBITO"/"<id>:CREDITO" (adquirente) — ver linha-editavel.tsx.
export async function atualizarLancamento(
  prev: EstadoLinha,
  formData: FormData
): Promise<EstadoLinha> {
  await exigirPermissao("EXTRATOS", "editar");

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return prev;

  const bruto = formData.get("categoria");
  let categoriaId: string | null = null;
  let tipoAdquirente: "DEBITO" | "CREDITO" | null = null;
  if (typeof bruto === "string" && bruto) {
    const [catId, tipo] = bruto.split(":");
    categoriaId = catId || null;
    if (tipo === "DEBITO" || tipo === "CREDITO") tipoAdquirente = tipo;
  }

  const observacaoBruta = formData.get("observacao");
  const observacao =
    typeof observacaoBruta === "string" && observacaoBruta.trim() ? observacaoBruta.trim() : null;

  await prisma.lancamentoExtrato.update({
    where: { id },
    data: { categoriaId, tipoAdquirente, observacao },
  });

  // Sem revalidatePath aqui de propósito: isso é uma edição rápida linha a
  // linha, feita várias vezes seguidas enquanto ela revisa a lista. Revalidar
  // força a lista inteira (com o filtro atual, ex: "categoria=sem") a buscar
  // de novo — e a linha que acabou de ganhar categoria some da lista na hora,
  // fazendo tudo abaixo subir de lugar no meio da edição. A própria linha já
  // mostra o valor certo sozinha (retorno da action, ver EstadoLinha acima);
  // o resto da tela só precisa atualizar quando ela realmente sair daqui —
  // outro filtro, outra página, ou o botão "Concluir revisão".
  return {
    categoriaAtual: typeof bruto === "string" ? bruto : "",
    observacaoAtual: observacao ?? "",
  };
}

// Exclui em massa — útil quando um extrato foi importado errado (banco
// errado, arquivo duplicado com layout diferente etc.) e é mais simples
// apagar e reimportar do que corrigir linha por linha.
export async function excluirLancamentosEmMassa(formData: FormData) {
  await exigirPermissao("EXTRATOS", "editar");

  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string");
  const voltar = rotaDeVolta(formData);
  if (ids.length === 0) {
    redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=nenhum-selecionado`);
  }

  await prisma.lancamentoExtrato.deleteMany({ where: { id: { in: ids } } });

  revalidarTudo();
  redirect(voltar);
}

// Corrige Posto e/ou Banco de um lote de lançamentos já importados — útil
// quando o extrato inteiro foi importado com o Posto errado selecionado na
// hora do upload. Redireciona de volta (em vez de só revalidar) pra garantir
// que a tela sempre mostre o dado fresco — ver comentário em EstadoLinha.
export async function reatribuirLancamentos(formData: FormData) {
  await exigirPermissao("EXTRATOS", "editar");

  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string");
  const postoBruto = formData.get("novoPostoId");
  const bancoBruto = formData.get("novoBancoId");
  const novoPostoId = typeof postoBruto === "string" && postoBruto ? postoBruto : undefined;
  const novoBancoId = typeof bancoBruto === "string" && bancoBruto ? bancoBruto : undefined;
  const voltar = rotaDeVolta(formData);

  if (ids.length === 0) {
    redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=nenhum-selecionado`);
  }
  if (!novoPostoId && !novoBancoId) {
    redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=nada-pra-mudar`);
  }

  try {
    await prisma.lancamentoExtrato.updateMany({
      where: { id: { in: ids } },
      data: {
        ...(novoPostoId ? { postoId: novoPostoId } : {}),
        ...(novoBancoId ? { bancoId: novoBancoId } : {}),
      },
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=duplicado-apos-mudanca`);
    }
    throw e;
  }

  revalidarTudo();
  redirect(voltar);
}

// Categoriza em massa: aplica UMA categoria a todos os lançamentos
// selecionados de uma vez. Cada bloco de dia tem seu próprio seletor (ver
// page.tsx), mas todos apontam pro mesmo formulário/seleção de checkboxes —
// o campo preenchido é o que valer aqui (só um por vez, na prática).
export async function atualizarCategoriaEmMassa(formData: FormData) {
  await exigirPermissao("EXTRATOS", "editar");

  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string");
  const voltar = rotaDeVolta(formData);

  if (ids.length === 0) {
    redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=nenhum-selecionado`);
  }

  let bruto: string | null = null;
  for (const [chave, valor] of formData.entries()) {
    if (chave.startsWith("categoriaEmMassa_") && typeof valor === "string" && valor) {
      bruto = valor;
      break;
    }
  }
  if (bruto === null) {
    redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=sem-categoria-em-massa`);
  }

  const [catId, tipo] = bruto.split(":");
  const categoriaId = catId || null;
  const tipoAdquirente = tipo === "DEBITO" || tipo === "CREDITO" ? tipo : null;

  await prisma.lancamentoExtrato.updateMany({
    where: { id: { in: ids } },
    data: { categoriaId, tipoAdquirente },
  });

  revalidarTudo();
  redirect(voltar);
}
