// Comando do pastor: cria eventos no mesmo Google Calendar que o Gabriel já
// lê (lib/chmeetings.js), a partir de uma mensagem do pastor pelo WhatsApp.
// Só tem efeito pra quem escreve do número em PASTOR_WHATSAPP_NUMBER —
// qualquer outra pessoa que tentar não aciona nada (ver a checagem em
// server.js antes de chamar criarEvento).
//
// Setup (uma vez só, no Google Cloud Console — console.cloud.google.com):
//   1. Crie um projeto (ou use um que já exista).
//   2. "APIs e serviços" → "Biblioteca" → ative a "Google Calendar API".
//   3. "APIs e serviços" → "Credenciais" → "Criar credenciais" → "Conta de
//      serviço". Dê um nome (ex: "gabriel-calendario"), sem permissões
//      extras de projeto.
//   4. Na conta de serviço criada, aba "Chaves" → "Adicionar chave" →
//      "Criar nova chave" → formato JSON. Isso baixa um arquivo .json —
//      NUNCA suba esse arquivo pro GitHub nem cole o conteúdo em chat.
//   5. Copie o "e-mail" da conta de serviço (algo tipo
//      gabriel-calendario@SEU-PROJETO.iam.gserviceaccount.com).
//   6. No Google Calendar, nas mesmas configurações de onde você pegou o
//      link do iCal (Fase 2 — "Configurações e compartilhamento"), em
//      "Compartilhar com pessoas específicas", adicione esse e-mail com
//      permissão "Fazer alterações nos eventos".
//   7. Copie o conteúdo INTEIRO do arquivo .json e cole na variável
//      GOOGLE_SERVICE_ACCOUNT_JSON no painel do Render.
//   8. Copie o "ID da agenda" (mesma tela, mais acima — geralmente termina
//      em @group.calendar.google.com, ou é o seu e-mail do Google se for a
//      agenda principal) e cole em GOOGLE_CALENDAR_ID.
//
// Enquanto essas variáveis não estiverem preenchidas, o comando do pastor
// simplesmente não funciona (ver getCalendarClient abaixo) — o resto do
// Gabriel continua normal.

const { google } = require("googleapis");
const { DateTime } = require("luxon");

const IGREJA_TIMEZONE = "America/New_York";

let calendarClient = null;
function getCalendarClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_CALENDAR_ID) return null;
  if (!calendarClient) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    calendarClient = google.calendar({ version: "v3", auth });
  }
  return calendarClient;
}

/**
 * Cria um evento novo no calendário da igreja.
 * @param {Object} params
 * @param {string} params.titulo
 * @param {string} params.dataHoraInicio - formato "AAAA-MM-DDTHH:MM" (hora local da igreja, sem fuso — ver IGREJA_TIMEZONE acima)
 * @param {number} [params.duracaoMinutos] - padrão 60
 * @param {string} [params.descricao]
 * @returns {Promise<{ok: boolean, mensagem: string}>}
 */
async function criarEvento({ titulo, dataHoraInicio, duracaoMinutos, descricao }) {
  const calendar = getCalendarClient();
  if (!calendar) {
    return { ok: false, mensagem: "comando de calendário ainda não configurado (falta credencial no Render)" };
  }

  try {
    const inicio = DateTime.fromFormat(dataHoraInicio, "yyyy-MM-dd'T'HH:mm", { zone: IGREJA_TIMEZONE });
    if (!inicio.isValid) {
      return { ok: false, mensagem: `data/hora inválida: "${dataHoraInicio}" (${inicio.invalidReason})` };
    }
    const fim = inicio.plus({ minutes: duracaoMinutos || 60 });

    await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary: titulo,
        description: descricao || "",
        start: { dateTime: inicio.toISO(), timeZone: IGREJA_TIMEZONE },
        end: { dateTime: fim.toISO(), timeZone: IGREJA_TIMEZONE },
      },
    });

    return { ok: true, mensagem: `evento "${titulo}" criado com sucesso pra ${inicio.toFormat("dd/MM 'às' HH:mm")}` };
  } catch (err) {
    console.error("[Gabriel] erro ao criar evento no Google Calendar:", err);
    return { ok: false, mensagem: "erro ao criar o evento no calendário" };
  }
}

module.exports = { criarEvento };
