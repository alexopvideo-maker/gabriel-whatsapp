// Comando do pastor (tarefas e projetos): grava na base de dados do Notion,
// a partir de uma mensagem do pastor pelo WhatsApp. Só tem efeito pra quem
// escreve do número em PASTOR_WHATSAPP_NUMBER — mesma regra do comando de
// evento (ver server.js e lib/calendarWrite.js).
//
// Tarefa simples (rotina do dia, afazer avulso) → base "Tarefas Diárias".
// Projeto com várias etapas/checklist → base "PROJETOS" (dentro de
// "Projetos CAFE CURCH"), com os passos como checklist no corpo da página.
//
// Setup (uma vez só, no Notion — app.notion.com/profile/integrations):
//   1. "Nova conexão" → método de autenticação "Token de acesso" (não
//      OAuth). Dê um nome (ex: "Gabriel WhatsApp").
//   2. Nas bases "Tarefas Diárias" e "PROJETOS", abra o menu "..." no canto
//      superior direito → "Conexões" → adicione essa conexão.
//   3. Na página da conexão, aba "Configuração", revele o "Token de acesso"
//      (começa com "ntn_"), copie e cole na variável NOTION_API_KEY no
//      painel do Render. NUNCA cole esse token em chat ou suba pro GitHub.
//
// Enquanto NOTION_API_KEY não estiver preenchida, os comandos de tarefa e
// projeto simplesmente não funcionam (ver getNotionHeaders abaixo) — o
// resto do Gabriel continua normal.

const { DateTime } = require("luxon");

const NOTION_API_VERSION = "2022-06-28";
const IGREJA_TIMEZONE = "America/New_York";

// IDs fixos das duas bases (não são segredo — só endereços de dados dentro
// do workspace da Café Church). Se algum dia essas bases forem recriadas,
// atualize os IDs aqui.
const NOTION_TAREFAS_DATABASE_ID = "7c7a369a820b433895c469f5de01a87d";
const NOTION_PROJETOS_DATABASE_ID = "2a469a6c6a7e8072a137e75bdd7a1756";

function getNotionHeaders() {
  if (!process.env.NOTION_API_KEY) return null;
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": "application/json",
  };
}

// Aceita prazo em "AAAA-MM-DD" (dia inteiro) ou "AAAA-MM-DDTHH:MM" (com
// hora) — mesmo formato usado no comando de evento (lib/calendarWrite.js).
function parseDatePrazo(prazo) {
  if (!prazo) return null;
  const comHora = prazo.includes("T");
  const dt = comHora
    ? DateTime.fromFormat(prazo, "yyyy-MM-dd'T'HH:mm", { zone: IGREJA_TIMEZONE })
    : DateTime.fromFormat(prazo, "yyyy-MM-dd", { zone: IGREJA_TIMEZONE });
  if (!dt.isValid) return null;
  return comHora ? { start: dt.toISO() } : { start: dt.toISODate() };
}

function checklistParaBlocos(itens) {
  return (itens || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({
      object: "block",
      type: "to_do",
      to_do: { rich_text: [{ type: "text", text: { content: item } }], checked: false },
    }));
}

async function criarPaginaNotion({ databaseId, properties, children }) {
  const headers = getNotionHeaders();
  if (!headers) {
    return { ok: false, mensagem: "comando ainda não configurado (falta credencial no Render)" };
  }

  const resp = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
      ...(children && children.length ? { children } : {}),
    }),
  });

  if (!resp.ok) {
    const corpo = await resp.text().catch(() => "");
    throw new Error(`Notion respondeu ${resp.status}: ${corpo}`);
  }
}

/**
 * Cria uma tarefa simples na base "Tarefas Diárias".
 * @param {Object} params
 * @param {string} params.titulo
 * @param {string} [params.prazo] - "AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM"
 * @param {string[]} [params.itens] - checklist / sub-ações da tarefa
 * @returns {Promise<{ok: boolean, mensagem: string}>}
 */
async function criarTarefa({ titulo, prazo, itens }) {
  if (!getNotionHeaders()) {
    return { ok: false, mensagem: "comando de tarefa ainda não configurado (falta credencial no Render)" };
  }

  try {
    const properties = {
      "Nome da tarefa": { title: [{ text: { content: titulo } }] },
      Status: { status: { name: "Não iniciada" } },
      Fonte: { select: { name: "Gabriel (WhatsApp)" } },
    };
    const dataPrazo = parseDatePrazo(prazo);
    if (dataPrazo) properties["Prazo"] = { date: dataPrazo };

    await criarPaginaNotion({
      databaseId: NOTION_TAREFAS_DATABASE_ID,
      properties,
      children: checklistParaBlocos(itens),
    });

    return { ok: true, mensagem: `tarefa "${titulo}" criada com sucesso em Tarefas Diárias` };
  } catch (err) {
    console.error("[Gabriel] erro ao criar tarefa no Notion:", err);
    return { ok: false, mensagem: "erro ao criar a tarefa no Notion" };
  }
}

/**
 * Cria um projeto (com checklist de etapas) na base "PROJETOS".
 * @param {Object} params
 * @param {string} params.titulo
 * @param {string} [params.prazo] - "AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM"
 * @param {string} [params.prioridade] - "Alta", "Média" ou "Baixa"
 * @param {string[]} [params.itens] - etapas / checklist do projeto
 * @returns {Promise<{ok: boolean, mensagem: string}>}
 */
async function criarProjeto({ titulo, prazo, prioridade, itens }) {
  if (!getNotionHeaders()) {
    return { ok: false, mensagem: "comando de projeto ainda não configurado (falta credencial no Render)" };
  }

  try {
    const properties = {
      "Nome do projeto": { title: [{ text: { content: titulo } }] },
      Status: { status: { name: "Não iniciado" } },
    };
    const dataPrazo = parseDatePrazo(prazo);
    if (dataPrazo) properties["Prazo"] = { date: dataPrazo };
    if (prioridade && ["Alta", "Média", "Baixa"].includes(prioridade)) {
      properties["Prioridade"] = { select: { name: prioridade } };
    }

    await criarPaginaNotion({
      databaseId: NOTION_PROJETOS_DATABASE_ID,
      properties,
      children: checklistParaBlocos(itens),
    });

    return { ok: true, mensagem: `projeto "${titulo}" criado com sucesso em PROJETOS` };
  } catch (err) {
    console.error("[Gabriel] erro ao criar projeto no Notion:", err);
    return { ok: false, mensagem: "erro ao criar o projeto no Notion" };
  }
}

module.exports = { criarTarefa, criarProjeto };
