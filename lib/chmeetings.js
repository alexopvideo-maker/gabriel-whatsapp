// Fase 2: trocar esse stub pela chamada real à API do ChMeetings.
// Doc oficial:            https://help.chmeetings.com/hc/en-us/articles/4407466673937-Developer-API-Guide
// Servidor MCP (p/ IA):   https://mcp.chmeetings.com/resources
//
// A chave fica em CHMEETINGS_API_KEY no .env — enquanto ela não existir,
// o Gabriel simplesmente avisa no prompt que não tem a agenda ao vivo ainda
// e responde com o que souber, sem travar a conversa.

async function getUpcomingEvents() {
  if (!process.env.CHMEETINGS_API_KEY) {
    return "(agenda ainda não conectada ao ChMeetings — responda com o que você já sabe sobre horários fixos e ofereça confirmar depois)";
  }

  // Exemplo de como isso deve ficar quando a chave estiver configurada:
  //
  // const res = await fetch("https://api.chmeetings.com/v1/events?upcoming=true", {
  //   headers: { Authorization: `Bearer ${process.env.CHMEETINGS_API_KEY}` },
  // });
  // const data = await res.json();
  // return data.events
  //   .map((e) => `- ${e.name}, ${e.date} às ${e.time}`)
  //   .join("\n");

  return "(TODO: implementar a chamada real à API do ChMeetings aqui)";
}

module.exports = { getUpcomingEvents };
