const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { getUpcomingEvents } = require("./chmeetings");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Confira o identificador do modelo mais recente em
// https://docs.claude.com/en/docs/about-claude/models antes de ir pra produção.
// Padrão em Haiku 4.5 (mais barato) — troque a variável ANTHROPIC_MODEL no
// .env pra "claude-sonnet-5" se quiser um Gabriel mais "esperto", por ~2x o custo.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const PERSONA_PATH = path.join(__dirname, "..", "persona", "gabriel-system-prompt.md");

// O modelo termina a resposta com [[ESCALAR: motivo]] quando precisa chamar
// um humano — ver a seção "Como escalar" do prompt de persona.
const ESCALATE_TAG = /\[\[ESCALAR:(.*?)\]\]/s;

async function buildSystemPrompt() {
  const raw = fs.readFileSync(PERSONA_PATH, "utf8");
  const eventos = await getUpcomingEvents();
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return raw
    .replace("{{PROXIMOS_EVENTOS}}", eventos)
    .replace("{{CONTEXTO_IGREJA}}", `Hoje é ${hoje}.`);
}

/**
 * @param {Object} params
 * @param {Array<{role: "user"|"assistant", content: string}>} params.history - trocas anteriores dessa conversa (pode vir vazio)
 * @param {string} params.message - a mensagem que a pessoa acabou de mandar
 * @returns {Promise<{reply: string, escalate: boolean, reason: string|null}>}
 */
async function getGabrielReply({ history, message }) {
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

module.exports = { getGabrielReply };
