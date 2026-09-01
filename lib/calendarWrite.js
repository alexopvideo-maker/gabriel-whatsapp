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

// Mapeamento de dia da semana (em português, com ou sem acento/"-feira") pro
// código de duas letras que o RRULE do Google Calendar espera.
const DIA_SEMANA_RRULE = {
  domingo: "SU",
  segunda: "MO",
  terca: "TU",
  quarta: "WE",
  quinta: "TH",
  sexta: "FR",
  sabado: "SA",
};

function normalizarDiaSemana(dia) {
  const limpo = (dia || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (ex: "terça" -> "terca")
    .toLowerCase()
    .replace(/-?feira$/, "")
    .trim();
  return DIA_SEMANA_RRULE[limpo] || null;
}

/**
 * Cria um evento RECORRENTE (semanal, em um ou mais dias da semana) no
 * calendário da igreja — um único evento em série no Google Calendar (via
 * RRULE), não vários eventos soltos.
 *
 * IMPORTANTE: assim como o `lib/encontroExpresso.js` e o
 * `lib/womanEvolution.js`, essa função existe justamente pra NUNCA deixar o
 * modelo (Claude) enumerar datas individuais por conta própria — isso é
 * lento, caro em tokens, e sujeito a erro de conta. O modelo só precisa
 * identificar os dias da semana e o período (início/fim); todo o cálculo de
 * datas e a criação da recorrência acontecem aqui, em código.
 *
 * @param {Object} params
 * @param {string} params.titulo
 * @param {string} params.horario - formato "HH:MM" (hora local da igreja)
 * @param {number} [params.duracaoMinutos] - padrão 60
 * @param {string} params.diasSemana - dias da semana separados por vírgula, em português (ex: "terca,quinta" ou "terça-feira, quinta-feira")
 * @param {string} params.dataInicio - formato "AAAA-MM-DD" — primeiro dia do período (a primeira ocorrência real pode cair um pouco depois, no primeiro dia da semana pedido que bater)
 * @param {string} params.dataFim - formato "AAAA-MM-DD" — último dia do período (inclusive; a última ocorrência é o último dia da semana pedido que caia nesse intervalo)
 * @param {string} [params.descricao]
 * @returns {Promise<{ok: boolean, mensagem: string}>}
 */
async function criarEventoRecorrente({ titulo, horario, duracaoMinutos, diasSemana, dataInicio, dataFim, descricao }) {
  const calendar = getCalendarClient();
  if (!calendar) {
    return { ok: false, mensagem: "comando de calendário ainda não configurado (falta credencial no Render)" };
  }

  try {
    const byday = (diasSemana || "")
      .split(",")
      .map((d) => normalizarDiaSemana(d))
      .filter(Boolean);
    if (byday.length === 0) {
      return { ok: false, mensagem: `dias da semana inválidos ou vazios: "${diasSemana}"` };
    }
    // Sem duplicar (ex: se por engano vier "terca,terca").
    const bydayUnico = [...new Set(byday)];

    if (!/^\d{1,2}:\d{2}$/.test((horario || "").trim())) {
      return { ok: false, mensagem: `horário inválido: "${horario}" (esperado "HH:MM")` };
    }

    const inicioPeriodo = DateTime.fromISO(dataInicio, { zone: IGREJA_TIMEZONE }).startOf("day");
    const fimPeriodo = DateTime.fromISO(dataFim, { zone: IGREJA_TIMEZONE }).startOf("day");
    if (!inicioPeriodo.isValid) {
      return { ok: false, mensagem: `data de início inválida: "${dataInicio}" (${inicioPeriodo.invalidReason})` };
    }
    if (!fimPeriodo.isValid) {
      return { ok: false, mensagem: `data de fim inválida: "${dataFim}" (${fimPeriodo.invalidReason})` };
    }
    if (fimPeriodo < inicioPeriodo) {
      return { ok: false, mensagem: `data de fim (${dataFim}) é antes da data de início (${dataInicio})` };
    }

    // luxon: weekday 1 = segunda ... 7 = domingo. RRULE usa MO..SU — mesma
    // ordem, então dá pra comparar direto num mapa auxiliar.
    const WEEKDAY_TO_RRULE = { 1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA", 7: "SU" };

    // A primeira ocorrência real é o primeiro dia, a partir de dataInicio
    // (inclusive), cujo dia da semana está na lista pedida — o DTSTART do
    // evento tem que cair num dos dias do BYDAY, senão o Google Calendar
    // pode se comportar de forma inesperada.
    let primeiraOcorrencia = null;
    for (let i = 0; i < 7; i++) {
      const candidata = inicioPeriodo.plus({ days: i });
      if (bydayUnico.includes(WEEKDAY_TO_RRULE[candidata.weekday])) {
        primeiraOcorrencia = candidata;
        break;
      }
    }
    if (!primeiraOcorrencia) {
      // Não deveria acontecer (sempre há um dia da semana pedido dentro de
      // qualquer janela de 7 dias), mas por segurança:
      return { ok: false, mensagem: "não consegui achar a primeira ocorrência dentro do período pedido" };
    }

    const [hora, minuto] = horario.trim().split(":").map(Number);
    const inicio = primeiraOcorrencia.set({ hour: hora, minute: minuto, second: 0, millisecond: 0 });
    const fim = inicio.plus({ minutes: duracaoMinutos || 60 });

    // UNTIL do RRULE precisa estar em UTC. Usamos o fim do último dia do
    // período (23:59:59 no fuso da igreja) — assim qualquer ocorrência que
    // caia em dataFim é incluída, sem precisar calcular a data exata da
    // última ocorrência.
    const untilUTC = fimPeriodo.endOf("day").toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");

    const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${bydayUnico.join(",")};UNTIL=${untilUTC}`;

    await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary: titulo,
        description: descricao || "",
        start: { dateTime: inicio.toISO(), timeZone: IGREJA_TIMEZONE },
        end: { dateTime: fim.toISO(), timeZone: IGREJA_TIMEZONE },
        recurrence: [rrule],
      },
    });

    const diasTexto = bydayUnico
      .map((codigo) => Object.keys(DIA_SEMANA_RRULE).find((k) => DIA_SEMANA_RRULE[k] === codigo))
      .join(" e ");
    return {
      ok: true,
      mensagem: `evento recorrente "${titulo}" criado com sucesso — toda ${diasTexto}, às ${horario}, de ${inicio.toFormat("dd/MM")} até ${fimPeriodo.toFormat("dd/MM")}`,
    };
  } catch (err) {
    console.error("[Gabriel] erro ao criar evento recorrente no Google Calendar:", err);
    return { ok: false, mensagem: "erro ao criar o evento recorrente no calendário" };
  }
}

module.exports = { criarEvento, criarEventoRecorrente };
