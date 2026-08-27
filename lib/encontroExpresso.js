// O Encontro Expresso não acontece toda quarta — é quinzenal (a cada 14
// dias), sempre numa quarta-feira. Antes disso ficava fixo no texto do
// Gabriel como se fosse toda semana, o que fazia ele convidar todo mundo até
// nas semanas sem encontro. Pra resolver isso sem precisar mexer no texto
// toda hora, a data da próxima edição é calculada aqui a partir de uma
// edição confirmada (a "âncora").
//
// Se um dia a igreja pular uma edição ou mudar o ciclo, é só atualizar a
// constante ANCORA_ENCONTRO_EXPRESSO abaixo com a data confirmada mais
// recente — o cálculo das próximas datas se ajusta sozinho a partir dela.

const ANCORA_ENCONTRO_EXPRESSO = "2026-08-26"; // última edição confirmada (quarta-feira)
const INTERVALO_DIAS = 14;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

function getProximoEncontroExpresso(agora = new Date()) {
  const ancoraMs = Date.parse(`${ANCORA_ENCONTRO_EXPRESSO}T12:00:00Z`);
  const hojeISO = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}-${String(
    agora.getUTCDate()
  ).padStart(2, "0")}`;
  const hojeMs = Date.parse(`${hojeISO}T12:00:00Z`);

  const diasDesdeAncora = Math.round((hojeMs - ancoraMs) / UM_DIA_MS);
  const ciclosPassados = Math.max(Math.ceil(diasDesdeAncora / INTERVALO_DIAS), 0);

  return new Date(ancoraMs + ciclosPassados * INTERVALO_DIAS * UM_DIA_MS);
}

function getProximoEncontroExpressoTexto(agora = new Date()) {
  const proxima = getProximoEncontroExpresso(agora);
  return proxima.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
}

module.exports = { getProximoEncontroExpresso, getProximoEncontroExpressoTexto };
