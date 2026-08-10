import "server-only";
import { Resend } from "resend";

// Envio de email transacional (só "esqueci minha senha" por enquanto) via
// Resend. RESEND_API_KEY é obrigatória em produção — sem ela, a função
// solicitarRecuperacaoSenha ainda funciona (não quebra a tela), só não
// consegue mandar o email de verdade; loga um aviso no servidor.
//
// EMAIL_REMETENTE é opcional: sem domínio verificado no Resend, o remetente
// padrão de testes deles (onboarding@resend.dev) funciona pra mandar email
// de verdade, só que o rótulo/domínio não é o da empresa. Quando a usuária
// verificar redejr.net no painel do Resend, é só definir essa env var pra
// algo como "Sistema Financeiro <financeiro@redejr.net>".
const REMETENTE_PADRAO = "Sistema Financeiro <onboarding@resend.dev>";

function cliente(): Resend | null {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return null;
  return new Resend(chave);
}

export async function enviarEmailRecuperacaoSenha(params: {
  destinatario: string;
  nomeUsuario: string;
  link: string;
}): Promise<{ ok: boolean }> {
  const resend = cliente();
  if (!resend) {
    console.warn(
      "[email] RESEND_API_KEY não configurada — email de recuperação de senha não foi enviado (link ficou só no log do servidor, não em produção):",
      params.link
    );
    return { ok: false };
  }

  const remetente = process.env.EMAIL_REMETENTE || REMETENTE_PADRAO;

  const { error } = await resend.emails.send({
    from: remetente,
    to: params.destinatario,
    subject: "Redefinir senha — Sistema Financeiro",
    html: `
      <p>Olá, ${params.nomeUsuario}.</p>
      <p>Recebemos um pedido pra redefinir a senha da sua conta no Sistema Financeiro.</p>
      <p><a href="${params.link}">Clique aqui pra escolher uma senha nova</a></p>
      <p>Esse link vale por 1 hora. Se você não pediu essa troca, pode ignorar este email — sua senha continua a mesma.</p>
    `,
  });

  if (error) {
    console.error("[email] Falha ao enviar email de recuperação de senha:", error);
    return { ok: false };
  }
  return { ok: true };
}
