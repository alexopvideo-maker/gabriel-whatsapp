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
//
// IMPORTANTE sobre fuso horário: o servidor no Render roda em UTC, mas a
// igreja fica no horário do leste dos EUA (America/New_York). Se a gente
// calculasse "hoje" em UTC puro, o dia viraria cedo demais aqui — por
// volta das 19h-20h no horário local (mais cedo ainda no horário de
// verão), o UTC já teria virado o dia seguinte, e o Gabriel podia dizer
// que o Encontro Expresso é "daqui a duas semanas" numa mensagem mandada
// na própria noite do encontro. Por isso "hoje" é sempre calculado no
// fuso America/New_York (via luxon, que já lida com horário de
// verão/inverno automaticamente), nunca em UTC.
const { DateTime } = require("luxon");

const IGREJA_TIMEZONE = "America/New_York";
const ANCORA_ENCONTRO_EXPRESSO = "2026-08-26"; // última edição confirmada (quarta-feira)
const INTERVALO_DIAS = 14;

function getProximoEncontroExpresso(agora = new Date()) {
  const ancora = DateTime.fromISO(ANCORA_ENCONTRO_EXPRESSO, { zone: IGREJA_TIMEZONE }).startOf("day");
  const hoje = DateTime.fromJSDate(agora, { zone: IGREJA_TIMEZONE }).startOf("day");

  const diasDesdeAncora = Math.round(hoje.diff(ancora, "days").days);
  const ciclosPassados = Math.max(Math.ceil(diasDesdeAncora / INTERVALO_DIAS), 0);

  return ancora.plus({ days: ciclosPassados * INTERVALO_DIAS });
}

function getProximoEncontroExpressoTexto(agora = new Date()) {
  const proxima = getProximoEncontroExpresso(agora);
  return proxima.setLocale("pt-BR").toFormat("cccc, dd 'de' MMMM");
}

module.exports = { getProximoEncontroExpresso, getProximoEncontroExpressoTexto };
