const twilio = require("twilio");

const client =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

/**
 * Avisa quem está de plantão quando o Gabriel pede apoio humano.
 * Se STAFF_WHATSAPP_NUMBER não estiver configurado, só loga —
 * assim o serviço já funciona no dia 1, mesmo antes de decidir
 * quem recebe o alerta.
 */
async function alertStaff({ from, message, reason }) {
  console.log(`[Gabriel] ESCALAR — motivo: "${reason}" | de: ${from} | mensagem: "${message}"`);

  if (!client || !process.env.STAFF_WHATSAPP_NUMBER || !process.env.TWILIO_WHATSAPP_NUMBER) {
    console.log("[Gabriel] STAFF_WHATSAPP_NUMBER não configurado ainda — alerta ficou só no log por enquanto.");
    return;
  }

  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER, // o mesmo número do Gabriel
    to: process.env.STAFF_WHATSAPP_NUMBER, // número de quem está de plantão
    body: `🔔 Gabriel pediu apoio.\nMotivo: ${reason}\nContato: ${from}\nÚltima mensagem: "${message}"`,
  });
}

module.exports = { alertStaff };
