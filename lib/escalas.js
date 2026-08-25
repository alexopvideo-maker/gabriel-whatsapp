// Fase 4: consulta (somente leitura) ao banco de dados do app de escalas da
// Café Church (cafe-church.vercel.app) — pra responder "quando é minha
// escala?" no WhatsApp com o dado real, sem depender de ninguém sincronizar
// nada manualmente.
//
// IMPORTANTE: essa conexão deve usar uma credencial PRÓPRIA e SOMENTE
// LEITURA (um usuário Postgres com permissão SELECT apenas nas tabelas
// Member, Couple, SundayAssignment e DiscipleshipAssignment) — nunca a
// mesma credencial de escrita que o app de escalas usa. Ver README.md para
// o SQL de criação desse usuário.
//
// Enquanto ESCALAS_DATABASE_URL não estiver configurada, essa função avisa
// no prompt que a consulta não está disponível ainda, sem travar a conversa.

const { Pool } = require("pg");

let pool = null;
function getPool() {
  if (!process.env.ESCALAS_DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.ESCALAS_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

// Normaliza "whatsapp:+5511999999999" (formato do campo From da Twilio) pro
// mesmo formato E.164 sem símbolos que o app de escalas usa no banco:
// "5511999999999".
function normalizePhone(twilioFrom) {
  return (twilioFrom || "").replace(/^whatsapp:/, "").replace(/\D/g, "");
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

/**
 * @param {string} twilioFrom - o campo `From` que a Twilio manda, ex: "whatsapp:+5511999999999"
 * @returns {Promise<string>} um bloco de texto pronto pra entrar no prompt do Gabriel
 */
async function getEscalaInfo(twilioFrom) {
  const db = getPool();
  if (!db) {
    return "(consulta de escala ainda não conectada — se a pessoa perguntar sobre a escala dela, diga que vai confirmar com a equipe e escale)";
  }

  const phone = normalizePhone(twilioFrom);
  if (!phone) {
    return "(não deu pra identificar o número de quem escreveu — se perguntar sobre escala, escale pra equipe confirmar)";
  }

  try {
    const memberRes = await db.query(
      `SELECT id, "firstName", "lastName" FROM "Member" WHERE phone = $1 AND active = true LIMIT 1`,
      [phone]
    );

    if (memberRes.rows.length === 0) {
      return "(esse número não foi encontrado no cadastro de membros/voluntários do app de escalas — se a pessoa perguntar sobre a escala dela, diga que não achou o cadastro com esse número e ofereça confirmar com a equipe)";
    }

    const member = memberRes.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lines = [`Cadastro encontrado: ${member.firstName} ${member.lastName}.`];

    const sundayRes = await db.query(
      `SELECT sa."serviceDate", sa.ministry,
              c."memberAId", c."memberBId",
              ma."firstName" AS a_first, ma."lastName" AS a_last,
              mb."firstName" AS b_first, mb."lastName" AS b_last
       FROM "SundayAssignment" sa
       LEFT JOIN "Couple" c ON sa."coupleId" = c.id
       LEFT JOIN "Member" ma ON c."memberAId" = ma.id
       LEFT JOIN "Member" mb ON c."memberBId" = mb.id
       WHERE sa."memberId" = $1 OR c."memberAId" = $1 OR c."memberBId" = $1
       ORDER BY sa."serviceDate" ASC`,
      [member.id]
    );

    const upcomingSunday = sundayRes.rows.filter((r) => new Date(r.serviceDate) >= today);

    if (upcomingSunday.length === 0) {
      lines.push("Sem escala de domingo (diaconia/voluntariado) futura registrada pra essa pessoa.");
    } else {
      for (const r of upcomingSunday.slice(0, 3)) {
        let partner = "";
        if (r.memberAId) {
          const isA = r.memberAId === member.id;
          const pFirst = isA ? r.b_first : r.a_first;
          const pLast = isA ? r.b_last : r.a_last;
          if (pFirst) partner = ` (em dupla com ${pFirst} ${pLast})`;
        }
        lines.push(`- Domingo ${formatDate(r.serviceDate)}: ${r.ministry}${partner}.`);
      }
    }

    const discRes = await db.query(
      `SELECT da.date, da."callerId", da."contactId",
              mc."firstName" AS caller_first, mc."lastName" AS caller_last,
              mt."firstName" AS contact_first, mt."lastName" AS contact_last
       FROM "DiscipleshipAssignment" da
       JOIN "Member" mc ON da."callerId" = mc.id
       JOIN "Member" mt ON da."contactId" = mt.id
       WHERE da."callerId" = $1 OR da."contactId" = $1
       ORDER BY da.date ASC`,
      [member.id]
    );

    const upcomingDisc = discRes.rows.filter((r) => new Date(r.date) >= today);

    if (upcomingDisc.length > 0) {
      for (const r of upcomingDisc.slice(0, 3)) {
        const isCaller = r.callerId === member.id;
        const otherName = isCaller
          ? `${r.contact_first} ${r.contact_last}`
          : `${r.caller_first} ${r.caller_last}`;
        lines.push(
          `- Discipulado ${formatDate(r.date)}: ${
            isCaller ? `você liga pra ${otherName}` : `${otherName} liga pra você`
          }.`
        );
      }
    }

    return lines.join("\n");
  } catch (err) {
    console.error("[Gabriel] erro ao consultar escala:", err);
    return "(erro ao consultar a escala agora — se a pessoa perguntar, diga que vai confirmar com a equipe e escale)";
  }
}

module.exports = { getEscalaInfo };
