// A conferência "Woman Evolution" é um evento pontual (não recorrente, ao
// contrário do Encontro Expresso) — sábado, 17 de outubro de 2026. Pra nunca
// divulgar um evento que já passou, esse bloco só entra no prompt de
// persona enquanto a data de hoje (calculada no fuso da igreja,
// America/New_York — mesmo cuidado do lib/encontroExpresso.js) ainda não
// passou da data do evento. Depois disso, o placeholder vira uma string
// vazia e o Gabriel simplesmente não tem mais essa informação — a própria
// instrução no prompt de persona cobre esse caso (nunca inventa nada no
// lugar).
//
// Se a igreja confirmar uma nova edição, outra data, ou trocar o link/preço,
// é só atualizar as constantes e o texto do bloco abaixo.
const { DateTime } = require("luxon");

const IGREJA_TIMEZONE = "America/New_York";
const DATA_EVENTO = "2026-10-17"; // sábado

const BLOCO_WOMAN_EVOLUTION = `- **Woman Evolution** — conferência de mulheres.
  - Data: sábado, 17 de outubro de 2026, das 14h às 21h.
  - Local: Plataforma Global.
  - Ingresso: General Admission, $65.
  - Link pra comprar: https://tickets.womanevolutionconference.com/checkout/view-event/id/8544657/chk/0374d64943f74fe50f48779588fdc68b/?modal_widget=true&widget=true`;

function getWomanEvolutionBloco(agora = new Date()) {
  const dataEvento = DateTime.fromISO(DATA_EVENTO, { zone: IGREJA_TIMEZONE }).startOf("day");
  const hoje = DateTime.fromJSDate(agora, { zone: IGREJA_TIMEZONE }).startOf("day");

  if (hoje > dataEvento) {
    return ""; // evento já passou — nunca mais divulgar
  }

  return BLOCO_WOMAN_EVOLUTION;
}

module.exports = { getWomanEvolutionBloco };
