require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const { getGabrielReply } = require("./lib/anthropic");
const { getInstagramReply } = require("./lib/instagramReply");
const { alertStaff } = require("./lib/alert");
const { criarEvento, criarEventoRecorrente } = require("./lib/calendarWrite");
const { criarTarefa, criarProjeto } = require("./lib/notionWrite");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Memória de curto prazo por número — só pra manter o fio da conversa
// dentro da mesma sessão de mensagens. Fase 3: trocar por um banco de
// verdade (e aí sim guardar histórico entre visitas, não só na hora).
const conversationHistory = new Map();
const MAX_TURNS = 6;

// Memória de curto prazo do Instagram, separada da do WhatsApp — chave é o
// contact_id que o ManyChat manda (identifica o contato do Direct).
const instagramHistory = new Map();

app.post("/webhook/whatsapp", async (req, res) => {
  const from = req.body.From; // ex: "whatsapp:+15551234567"
  const body = (req.body.Body || "").trim();

  console.log(`[Gabriel] mensagem de ${from}: ${body}`);

  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const history = conversationHistory.get(from) || [];
    const { reply, escalate, reason, eventCommand, recurringEventCommand, taskCommand, projectCommand } = await getGabrielReply({ history, message: body, from });

    history.push({ role: "user", content: body });
    history.push({ role: "assistant", content: reply });
    conversationHistory.set(from, history.slice(-MAX_TURNS * 2));

    twiml.message(reply);
    res.type("text/xml").send(twiml.toString());

    // Manda o alerta pra equipe só DEPOIS de despachar a resposta pra quem
    // escreveu — assim a pessoa sempre recebe a resposta do Gabriel primeiro,
    // e quem está de plantão recebe o aviso em seguida (evita a resposta e o
    // alerta chegando fora de ordem quando os dois caem no mesmo WhatsApp).
    if (escalate) {
      alertStaff({ from, message: body, reason }).catch((err) =>
        console.error("[Gabriel] falha ao avisar a equipe:", err)
      );
    }

    // Comando do pastor: só tem efeito se a mensagem realmente veio do
    // número configurado em PASTOR_WHATSAPP_NUMBER — mesmo que o modelo, por
    // algum motivo, gere a tag pra outra pessoa, essa checagem no código
    // (não só no prompt) garante que nada é criado sem ser essa pessoa.
    const pastorNumber = (process.env.PASTOR_WHATSAPP_NUMBER || "").trim();
    if (eventCommand && pastorNumber && from.trim() === pastorNumber) {
      criarEvento(eventCommand)
        .then((resultado) => console.log(`[Gabriel] comando de evento — ${resultado.ok ? "OK" : "FALHOU"}: ${resultado.mensagem}`))
        .catch((err) => console.error("[Gabriel] falha ao criar evento no calendário:", err));
    } else if (eventCommand) {
      console.warn(`[Gabriel] tag [[EVENTO]] recebida de número que não é o pastor (${from}) — ignorada.`);
    }

    // Comando do pastor: evento RECORRENTE (repete em um ou mais dias da
    // semana, dentro de um período) — mesma checagem de número de cima.
    if (recurringEventCommand && pastorNumber && from.trim() === pastorNumber) {
      criarEventoRecorrente(recurringEventCommand)
        .then((resultado) => console.log(`[Gabriel] comando de evento recorrente — ${resultado.ok ? "OK" : "FALHOU"}: ${resultado.mensagem}`))
        .catch((err) => console.error("[Gabriel] falha ao criar evento recorrente no calendário:", err));
    } else if (recurringEventCommand) {
      console.warn(`[Gabriel] tag [[EVENTO_RECORRENTE]] recebida de número que não é o pastor (${from}) — ignorada.`);
    }

    // Comando do pastor: tarefa simples → base "Tarefas Diárias" no Notion.
    // Mesma checagem de número de cima — só o pastor aciona.
    if (taskCommand && pastorNumber && from.trim() === pastorNumber) {
      criarTarefa(taskCommand)
        .then((resultado) => console.log(`[Gabriel] comando de tarefa — ${resultado.ok ? "OK" : "FALHOU"}: ${resultado.mensagem}`))
        .catch((err) => console.error("[Gabriel] falha ao criar tarefa no Notion:", err));
    } else if (taskCommand) {
      console.warn(`[Gabriel] tag [[TAREFA]] recebida de número que não é o pastor (${from}) — ignorada.`);
    }

    // Comando do pastor: projeto com checklist de etapas → base "PROJETOS" no Notion.
    if (projectCommand && pastorNumber && from.trim() === pastorNumber) {
      criarProjeto(projectCommand)
        .then((resultado) => console.log(`[Gabriel] comando de projeto — ${resultado.ok ? "OK" : "FALHOU"}: ${resultado.mensagem}`))
        .catch((err) => console.error("[Gabriel] falha ao criar projeto no Notion:", err));
    } else if (projectCommand) {
      console.warn(`[Gabriel] tag [[PROJETO]] recebida de número que não é o pastor (${from}) — ignorada.`);
    }

    return;
  } catch (err) {
    console.error("[Gabriel] erro ao gerar resposta:", err);
    twiml.message("Oi! Tive um probleminha aqui agora — já já alguém da equipe te responde, tá bom? 🙏");
  }

  res.type("text/xml").send(twiml.toString());
});

// Endpoint chamado pelo ManyChat (External Request) a cada Direct que chega
// no Instagram da igreja. Réplica do Gabriel do WhatsApp — mesmo Claude, tom
// parecido, mas persona mais enxuta (sem escala pessoal nem comando do
// pastor, que continuam exclusivos do WhatsApp). Ver README.md, seção
// "Instagram (ManyChat)" pra como configurar o lado do ManyChat.
app.post("/webhook/instagram", async (req, res) => {
  // Segredo compartilhado — só o ManyChat deveria conseguir chamar esse
  // endpoint. Sem MANYCHAT_SHARED_SECRET configurado, o endpoint fica
  // desligado (responde 503) em vez de aceitar qualquer chamador.
  const expectedSecret = (process.env.MANYCHAT_SHARED_SECRET || "").trim();
  if (!expectedSecret) {
    console.warn("[Gabriel/Instagram] MANYCHAT_SHARED_SECRET não configurado — endpoint desligado.");
    return res.status(503).json({ error: "instagram webhook not configured" });
  }
  const receivedSecret = (req.get("X-ManyChat-Secret") || "").trim();
  if (receivedSecret !== expectedSecret) {
    console.warn("[Gabriel/Instagram] segredo inválido recebido — chamada rejeitada.");
    return res.status(401).json({ error: "unauthorized" });
  }

  const contactId = String(req.body.contact_id || "").trim();
  const message = String(req.body.message || "").trim();
  const name = String(req.body.name || "").trim();

  if (!contactId || !message) {
    return res.status(400).json({ error: "contact_id e message são obrigatórios" });
  }

  console.log(`[Gabriel/Instagram] mensagem de ${contactId} (${name || "sem nome"}): ${message}`);

  try {
    const history = instagramHistory.get(contactId) || [];
    const { reply, escalate, reason } = await getInstagramReply({ history, message });

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });
    instagramHistory.set(contactId, history.slice(-MAX_TURNS * 2));

    res.json({ reply, escalate });

    // Mesmo padrão do WhatsApp: alerta a equipe só depois de já ter
    // respondido pra pessoa. Reaproveita o alertStaff (manda pelo WhatsApp
    // pra STAFF_WHATSAPP_NUMBER), só deixando claro que veio do Instagram.
    if (escalate) {
      alertStaff({
        from: `Instagram — ${name || "sem nome"} (contact_id: ${contactId})`,
        message,
        reason,
      }).catch((err) => console.error("[Gabriel/Instagram] falha ao avisar a equipe:", err));
    }
  } catch (err) {
    console.error("[Gabriel/Instagram] erro ao gerar resposta:", err);
    res.status(200).json({
      reply: "Oi! Tive um probleminha aqui agora — já já alguém da equipe te responde, tá bom? 🙏",
      escalate: false,
    });
  }
});

app.get("/health", (_req, res) => res.send("Gabriel está de pé."));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Gabriel escutando na porta ${port}`));
