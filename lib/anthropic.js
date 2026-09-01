const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { getUpcomingEvents } = require("./chmeetings");
const { getEscalaInfo } = require("./escalas");
const { getProximoEncontroExpressoTexto } = require("./encontroExpresso");
const { getWomanEvolutionBloco } = require("./womanEvolution");

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
// Só a PRIMEIRA tag de uma mensagem é processada (uso: um evento único,
// pontual). Pra algo que se repete em mais de uma data, ver EVENT_RECURRING_TAG
// abaixo — nunca é o modelo que deveria gerar várias tags EVENTO pra simular
// recorrência (além de arriscar errar datas, o limite de tokens da resposta
// não comporta enumerar muitas datas).
const EVENT_TAG = /\[\[EVENTO:(.*?)\]\]/s;
// Variante "global" só pra remoção da tag do texto da resposta — cobre o caso
// (não deveria acontecer, mas por segurança) do modelo gerar mais de uma tag
// [[EVENTO: ...]]: mesmo que só a primeira seja executada acima, nenhuma
// sobra como texto bruto vazando pra dentro da mensagem que a pessoa recebe.
const EVENT_TAG_G = /\[\[EVENTO:(.*?)\]\]/gs;

// Comando do pastor: evento RECORRENTE (repete semanalmente em um ou mais
// dias da semana, dentro de um período) — ex: "toda terça e quinta de
// setembro a dezembro". O modelo só identifica título, dias da semana,
// horário e período; TODO o cálculo de datas acontece em código
// (lib/calendarWrite.js), nunca no texto gerado pelo modelo — mesmo
// princípio já usado no Encontro Expresso e no Woman Evolution.
// [[EVENTO_RECORRENTE: título | dias da semana separados por vírgula (ex: terca,quinta) | horário HH:MM | data início AAAA-MM-DD | data fim AAAA-MM-DD (inclusive) | duração em minutos (opcional) | descrição (opcional)]]
const EVENT_RECURRING_TAG = /\[\[EVENTO_RECORRENTE:(.*?)\]\]/s;
const EVENT_RECURRING_TAG_G = /\[\[EVENTO_RECORRENTE:(.*?)\]\]/gs;

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
    ? "SIM — esta pessoa é a liderança e pode usar o comando de criar evento na agenda (único ou recorrente)."
    : "NÃO — esta pessoa não tem esse comando disponível. Se pedir pra criar, mudar ou cancelar algo na agenda, diga que só a liderança pode fazer isso e escale se insistir.";

  return raw
    .replace("{{PROXIMOS_EVENTOS}}", eventos)
    .replace("{{ESCALA_PESSOA}}", escala)
    .replace("{{MODO_PASTOR}}", modoPastor)
    .replace("{{PROXIMO_ENCONTRO_EXPRESSO}}", getProximoEncontroExpressoTexto(agora))
    .replace("{{WOMAN_EVOLUTION}}", getWomanEvolutionBloco(agora) || "(nenhum evento especial confirmado no momento)")
    .replace("{{CONTEXTO_IGREJA}}", `Hoje é ${hoje} (fuso: America/New_York).`);
}

/**
 * @param {Object} params
 * @param {Array<{role: "user"|"assistant", content: string}>} params.history - trocas anteriores dessa conversa (pode vir vazio)
 * @param {string} params.message - a mensagem que a pessoa acabou de mandar
 * @param {string} params.from - o campo `From` que a Twilio manda (ex: "whatsapp:+5511999999999"), usado pra achar a escala da pessoa
 * @returns {Promise<{reply: string, escalate: boolean, reason: string|null, eventCommand: {titulo: string, dataHoraInicio: string, duracaoMinutos: number|undefined, descricao: string|undefined}|null, recurringEventCommand: {titulo: string, diasSemana: string, horario: string, dataInicio: string, dataFim: string, duracaoMinutos: number|undefined, descricao: string|undefined}|null, taskCommand: {titulo: string, prazo: string|undefined, itens: string[]|undefined}|null, projectCommand: {titulo: string, prazo: string|undefined, prioridade: string|undefined, itens: string[]|undefined}|null}>}
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

  const recurringEventMatch = rawText.match(EVENT_RECURRING_TAG);
  let recurringEventCommand = null;
  if (recurringEventMatch) {
    const [titulo, diasSemana, horario, dataInicio, dataFim, duracaoMinutos, descricao] = recurringEventMatch[1]
      .split("|")
      .map((s) => s.trim());
    recurringEventCommand = {
      titulo,
      diasSemana,
      horario,
      dataInicio,
      dataFim,
      duracaoMinutos: duracaoMinutos ? Number(duracaoMinutos) : undefined,
      descricao,
    };
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
    .replace(EVENT_TAG_G, "")
    .replace(EVENT_RECURRING_TAG_G, "")
    .replace(TASK_TAG, "")
    .replace(PROJECT_TAG, "")
    .trim();

  return { reply, escalate, reason, eventCommand, recurringEventCommand, taskCommand, projectCommand };
}

module.exports = { getGabrielReply };
