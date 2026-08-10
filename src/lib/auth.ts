import "server-only";

import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Modulo } from "@/generated/prisma/client";

const NOME_COOKIE = "sessao";
const DURACAO_SESSAO_DIAS = 7;

// ---------------------------------------------------------------------------
// Senha
// ---------------------------------------------------------------------------

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}

export async function senhaConfere(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------
// O cookie guarda um token aleatório; só o hash (SHA-256) dele fica salvo no
// banco como id da sessão — assim, mesmo um vazamento do banco não dá um
// cookie válido pra ninguém.

function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function criarSessao(usuarioId: string) {
  const token = gerarToken();
  const expiresAt = new Date(Date.now() + DURACAO_SESSAO_DIAS * 24 * 60 * 60 * 1000);

  await prisma.sessao.create({
    data: { id: hashToken(token), usuarioId, expiresAt },
  });

  const store = await cookies();
  store.set(NOME_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function encerrarSessaoAtual() {
  const store = await cookies();
  const token = store.get(NOME_COOKIE)?.value;
  if (token) {
    await prisma.sessao.deleteMany({ where: { id: hashToken(token) } });
  }
  store.delete(NOME_COOKIE);
}

type UsuarioComPermissoes = {
  id: string;
  nome: string;
  cpf: string;
  ativo: boolean;
  permissoes: { modulo: Modulo; podeVisualizar: boolean; podeEditar: boolean }[];
};

// Lê a sessão do cookie e devolve o usuário (com permissões), ou null se não
// tiver sessão válida. Sempre bate no banco — sem cache, sem JWT — pra
// desativar um usuário derrubar o acesso dele na hora.
export async function usuarioAtual(): Promise<UsuarioComPermissoes | null> {
  const store = await cookies();
  const token = store.get(NOME_COOKIE)?.value;
  if (!token) return null;

  const sessao = await prisma.sessao.findUnique({
    where: { id: hashToken(token) },
    include: {
      usuario: { include: { permissoes: true } },
    },
  });

  if (!sessao || sessao.expiresAt < new Date() || !sessao.usuario.ativo) {
    return null;
  }

  return sessao.usuario;
}

// Redireciona pro login se não tiver usuário logado. Use no topo de toda
// página/layout que exige autenticação.
export async function exigirUsuario(): Promise<UsuarioComPermissoes> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");
  return usuario;
}

// Redireciona pro login (sem sessão) ou pra tela de acesso negado (sessão
// válida, mas sem a permissão certa nesse módulo). Chame no topo de toda
// página protegida E no início de toda Server Action de escrita — checar só
// no front-end (esconder botão) não basta.
export async function exigirPermissao(
  modulo: Modulo,
  nivel: "visualizar" | "editar"
): Promise<UsuarioComPermissoes> {
  const usuario = await exigirUsuario();
  const permissao = usuario.permissoes.find((p) => p.modulo === modulo);
  const autorizado =
    nivel === "visualizar"
      ? !!permissao?.podeVisualizar || !!permissao?.podeEditar
      : !!permissao?.podeEditar;

  if (!autorizado) redirect("/sem-permissao");
  return usuario;
}

// Só consulta, não redireciona — use pra decidir o que mostrar na tela (ex:
// esconder botão de editar/excluir de quem só pode visualizar). A checagem
// que vale de verdade continua sendo exigirPermissao() nas Server Actions.
export async function podeEditarModulo(modulo: Modulo): Promise<boolean> {
  const usuario = await usuarioAtual();
  if (!usuario) return false;
  return !!usuario.permissoes.find((p) => p.modulo === modulo)?.podeEditar;
}
