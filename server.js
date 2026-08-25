require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const { getGabrielReply } = require("./lib/anthropic");
const { alertStaff } = require("./lib/alert");
const { criarEvento } = require("./lib/calendarWrite");
const { criarTarefa, criarProjeto } = require("./lib/notionWrite");

const app = express();
app.use(express.urlencoded({ extended: false }));

// Memória de curto prazo por número — só pra manter o fio da conversa
// dentro da mesma sessão de mensagens. Fase 3: trocar por um banco de
// verdade (e aí sim guardar histórico entre visitas, não só na hora).
const conversationHistory = new Map();
const MAX_TURNS = 6;

app.post("/webhook/whatsapp", async (req, res) => {
  const from = req.body.From; // ex: "whatsapp:+15551234567"
  const body = (req.body.Body || "").trim();

  console.log(`[Gabriel] mensagem de ${from}: ${body}`);

  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const history = conversationHistory.get(from) || [];
    const { reply, escalate, reason, eventCommand, taskCommand, projectCommand } = await getGabrielReply({ history, message: body, from });

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

app.get("/health", (_req, res) => res.send("Gabriel está de pé."));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Gabriel escutando na porta ${port}`));
