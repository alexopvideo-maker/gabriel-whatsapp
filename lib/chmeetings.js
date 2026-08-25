// Fase 2 (revisada): agenda da semana vinda direto do Google Calendar, via o
// link "secreto" em formato iCal que o próprio Google já disponibiliza pra
// qualquer calendário — sem precisar de chave de API, OAuth, ou console do
// Google Cloud. É a forma mais simples de ligar isso agora; se um dia
// precisar de mais (criar evento, RSVP, etc.), aí sim vale migrar pra API
// real do Google Calendar com uma conta de serviço.
//
// Como pegar o link:
//   1. No Google Calendar (calendar.google.com), na barra da esquerda, passe
//      o mouse sobre o calendário da igreja → menu "⋮" → "Configurações e
//      compartilhamento".
//   2. Role até "Integrar agenda" ("Integrate calendar").
//   3. Copie o "Endereço secreto no formato iCal" ("Secret address in iCal
//      format") — termina em "/basic.ics".
//   4. Cole esse link na variável GOOGLE_CALENDAR_ICS_URL, direto no painel
//      do Render — nunca em texto puro em nenhum arquivo, chat ou
//      repositório (é um link só de leitura, mas ainda assim é "secreto":
//      quem tiver esse link enxerga os eventos do calendário).
//
// Limitação conhecida por enquanto: eventos recorrentes (que se repetem toda
// semana) não são expandidos — só a primeira ocorrência aparece. Pra eventos
// pontuais da semana isso já resolve; pra algo que se repete, cadastre uma
// ocorrência nova a cada semana até a gente evoluir isso.

const ical = require("node-ical");

async function getUpcomingEvents() {
  const url = process.env.GOOGLE_CALENDAR_ICS_URL;
  if (!url) {
    return "(agenda do Google Calendar ainda não conectada — responda com o que você já sabe sobre horários fixos e ofereça confirmar depois)";
  }

  try {
    const data = await ical.async.fromURL(url);
    const now = new Date();

    const allItems = Object.values(data);
    const vevents = allItems.filter((e) => e && e.type === "VEVENT" && e.start);

    const events = vevents
      .map((e) => ({ summary: e.summary, start: new Date(e.start) }))
      .filter((e) => e.start >= now)
      .sort((a, b) => a.start - b.start)
      .slice(0, 5);

    console.log(
      `[Gabriel] agenda Google Calendar: ${allItems.length} itens no feed, ${vevents.length} VEVENT, ${events.length} futuros. Amostra: ${vevents
        .slice(0, 5)
        .map((e) => `${e.summary} @ ${e.start}`)
        .join(" | ")}`
    );

    if (events.length === 0) {
      return "(nenhum evento futuro encontrado na agenda do Google Calendar — responda com o que você já sabe sobre horários fixos e ofereça confirmar depois)";
    }

    return events
      .map((e) => {
        const dataFmt = e.start.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
        const hora = e.start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return `- ${e.summary}, ${dataFmt} às ${hora}`;
      })
      .join("\n");
  } catch (err) {
    console.error("[Gabriel] erro ao consultar a agenda do Google Calendar:", err);
    return "(erro ao consultar a agenda agora — responda com o que você já sabe sobre horários fixos e ofereça confirmar depois)";
  }
}

module.exports = { getUpcomingEvents };
