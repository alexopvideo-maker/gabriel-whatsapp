const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { getUpcomingEvents } = require("./chmeetings");
const { getProximoEncontroExpressoTexto } = require("./encontroExpresso");
const { getWomanEvolutionBloco } = require("./womanEvolution");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Mesmo modelo do Gabriel no WhatsApp por padrão — mesma chave, billing junto.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const PERSONA_PATH = path.join(__dirname, "..", "persona", "instagram-system-prompt.md");

// Mesmo sinal interno de escalar que o Gabriel usa no WhatsApp — ver a seção
// "Como escalar" do prompt de persona do Instagram.
const ESCALATE_TAG = /\[\[ESCALAR:(.*?)\]\]/s;

// Ao contrário do WhatsApp, o Instagram não tem "Modo pastor" nem consulta de
// escala pessoal — não existe um jeito confiável de ligar um contato do
// Instagram a um número de telefone cadastrado, e o comando da liderança
// continua exclusivo do WhatsApp (PASTOR_WHATSAPP_NUMBER). Por isso esse
// módulo é mais enxuto que o lib/anthropic.js: só agenda ao vivo + escalar.
async function buildSystemPrompt() {
  const raw = fs.readFileSync(PERSONA_PATH, "utf8");
  const eventos = await getUpcomingEvents();
  const agora = new Date();
  // timeZone explícito: sem isso, toLocaleDateString usa o fuso do
  // servidor (UTC no Render), não o da igreja — perto da virada do dia
  // (à noite, horário local) isso fazia o Gabriel achar que já era o dia
  // seguinte enquanto ainda era "hoje" pra quem estava escrevendo.
  const hoje = agora.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/New_York",
  });

  return raw
    .replace("{{PROXIMOS_EVENTOS}}", eventos)
    .replace("{{PROXIMO_ENCONTRO_EXPRESSO}}", getProximoEncontroExpressoTexto(agora))
    .replace("{{WOMAN_EVOLUTION}}", getWomanEvolutionBloco(agora) || "(nenhum evento especial confirmado no momento)")
    .replace("{{CONTEXTO_IGREJA}}", `Hoje é ${hoje} (fuso: America/New_York).`);
}

/**
 * @param {Object} params
 * @param {Array<{role: "user"|"assistant", content: string}>} params.history - trocas anteriores dessa conversa (pode vir vazio)
 * @param {string} params.message - a mensagem que a pessoa acabou de mandar no Direct
 * @returns {Promise<{reply: string, escalate: boolean, reason: string|null}>}
 */
async function getInstagramReply({ history, message }) {
  const system = await buildSystemPrompt();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system,
    messages: [...history, { role: "user", content: message }],
  });

  const rawText = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const match = rawText.match(ESCALATE_TAG);
  const escalate = Boolean(match);
  const reason = match ? match[1].trim() : null;

  const reply = rawText.replace(ESCALATE_TAG, "").trim();

  return { reply, escalate, reason };
}

module.exports = { getInstagramReply };
