const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { getUpcomingEvents } = require("./chmeetings");
const { getEscalaInfo } = require("./escalas");

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

// Comando do pastor: [[EVENTO: título | AAAA-MM-DDTHH:MM | duração em minutos (opcional) | descrição (opcional)]]
// Ver a seção "Comando do pastor" do prompt de persona e lib/calendarWrite.js.
const EVENT_TAG = /\[\[EVENTO:(.*?)\]\]/s;

// Comando do pastor: [[TAREFA: título | prazo opcional (AAAA-MM-DD ou AAAA-MM-DDTHH:MM) | itens do checklist separados por vírgula (opcional)]]
// [[PROJETO: título | prazo opcional | prioridade opcional (Alta/Média/Baixa) | passos separados por vírgula (opcional)]]
// Ver a seção "Comando do pastor" do prompt de persona e lib/notionWrite.js.
const TASK_TAG = /\[\[TAREFA:(.*?)\]\]/s;
const PROJECT_TAG = /\[\[PROJETO:(.*?)\]\]/s;

async function buildSystemPrompt(from) {
  const raw = fs.readFileSync(PERSONA_PATH, "utf8");
  const eventos = await getUpcomingEvents();
  const escala = await getEscalaInfo(from);
  console.log(`[Gabriel] bloco de escala para ${from}:\n${escala}`);
  const agora = new Date();
  const hoje = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  // .trim() nos dois lados: é comum sobrar um espaço ou quebra de linha
  // quando o número é colado no painel do Render, e isso silenciosamente
  // quebrava a comparação (o Gabriel dizia "sem esse comando disponível"
  // mesmo pro número certo).
  const pastorNumber = (process.env.PASTOR_WHATSAPP_NUMBER || "").trim();
  const isPastor = Boolean(pastorNumber) && from.trim() === pastorNumber;
  console.log(
    `[Gabriel] checagem de pastor — de: "${from}" | configurado: "${pastorNumber}" | é pastor: ${isPastor}`
  );
  const modoPastor = isPastor
    ? "SIM — esta pessoa é a liderança e pode usar o comando de criar evento na agenda."
    : "NÃO — esta pessoa não tem esse comando disponível. Se pedir pra criar, mudar ou cancelar algo na agenda, diga que só a liderança pode fazer isso e escale se insistir.";

  return raw
    .replace("{{PROXIMOS_EVENTOS}}", eventos)
    .replace("{{ESCALA_PESSOA}}", escala)
    .replace("{{MODO_PASTOR}}", modoPastor)
    .replace("{{CONTEXTO_IGREJA}}", `Hoje é ${hoje} (fuso: America/New_York).`);
}

/**
 * @param {Object} params
 * @param {Array<{role: "user"|"assistant", content: string}>} params.history - trocas anteriores dessa conversa (pode vir vazio)
 * @param {string} params.message - a mensagem que a pessoa acabou de mandar
 * @param {string} params.from - o campo `From` que a Twilio manda (ex: "whatsapp:+5511999999999"), usado pra achar a escala da pessoa
 * @returns {Promise<{reply: string, escalate: boolean, reason: string|null, eventCommand: {titulo: string, dataHoraInicio: string, duracaoMinutos: number|undefined, descricao: string|undefined}|null, taskCommand: {titulo: string, prazo: string|undefined, itens: string[]|undefined}|null, projectCommand: {titulo: string, prazo: string|undefined, prioridade: string|undefined, itens: string[]|undefined}|null}>}
 */
async function getGabrielReply({ history, message, from }) {
  const system = await buildSystemPrompt(from);

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

  const eventMatch = rawText.match(EVENT_TAG);
  let eventCommand = null;
  if (eventMatch) {
    const [titulo, dataHoraInicio, duracaoMinutos, descricao] = eventMatch[1].split("|").map((s) => s.trim());
    eventCommand = { titulo, dataHoraInicio, duracaoMinutos: duracaoMinutos ? Number(duracaoMinutos) : undefined, descricao };
  }

  // Itens de checklist vêm separados por vírgula no último campo da tag —
  // ex: "regar as plantas, ligar pro fornecedor, revisar escala".
  const taskMatch = rawText.match(TASK_TAG);
  let taskCommand = null;
  if (taskMatch) {
    const [titulo, prazo, itensBrutos] = taskMatch[1].split("|").map((s) => s.trim());
    const itens = itensBrutos ? itensBrutos.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    taskCommand = { titulo, prazo: prazo || undefined, itens };
  }

  const projectMatch = rawText.match(PROJECT_TAG);
  let projectCommand = null;
  if (projectMatch) {
    const [titulo, prazo, prioridade, itensBrutos] = projectMatch[1].split("|").map((s) => s.trim());
    const itens = itensBrutos ? itensBrutos.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    projectCommand = { titulo, prazo: prazo || undefined, prioridade: prioridade || undefined, itens };
  }

  const reply = rawText
    .replace(ESCALATE_TAG, "")
    .replace(EVENT_TAG, "")
    .replace(TASK_TAG, "")
    .replace(PROJECT_TAG, "")
    .trim();

  return { reply, escalate, reason, eventCommand, taskCommand, projectCommand };
}

module.exports = { getGabrielReply };
