# Gabriel no WhatsApp — serviço (Fase 1 → 2)

Este é o "escutador" da Opção A do plano: um serviço pequeno que recebe as respostas no número de WhatsApp que **já está em uso** (o mesmo que manda as escalas pelo app), aciona o Gabriel via Claude, e responde de volta pelo mesmo número. Ninguém do outro lado percebe que trocou de sistema — pra quem está conversando, é a mesma linha de sempre.

## Antes de começar

Você precisa de:
- O número de WhatsApp já configurado no Twilio (o que vocês já usam).
- Uma chave de API da Anthropic (console.anthropic.com) — cobrada por uso, separada de qualquer assinatura do Claude.ai.
- Node.js 18 ou mais recente instalado.

## Rodando local

```bash
npm install
cp .env.example .env
# preencha o .env com as chaves do Twilio e da Anthropic
npm run dev
```

O serviço sobe em `http://localhost:3000`. O Twilio precisa conseguir alcançar essa URL de fora — pra testar local, use algo como [ngrok](https://ngrok.com):

```bash
ngrok http 3000
```

## Conectando ao número existente no Twilio

1. No [Console do Twilio](https://console.twilio.com), vá em **Messaging → Try it out → Send a WhatsApp message** (ou, se o número já é de produção, **Messaging → Senders → WhatsApp senders**) e abra o número que vocês já usam.
2. No campo **"When a message comes in"**, cole a URL pública do serviço terminando em `/webhook/whatsapp` — por exemplo, `https://SEU-NGROK.ngrok-free.app/webhook/whatsapp` (local) ou a URL do seu deploy (produção).
3. Método: **POST**.
4. Salve. Pronto — a partir daí, toda resposta que chegar nesse número passa pelo Gabriel.

**Isso não muda nada no envio de escalas.** O envio continua saindo do jeito que já sai hoje pelo app — esse serviço só cuida do que chega, não do que sai.

## Testando

Mande uma mensagem de teste pro número (o próprio Twilio tem um número de sandbox pra testar sem afetar produção — vale usar esse primeiro). Peça pro Gabriel:
- "oi"
- "que horas é o culto?"
- "queria pedir oração" → deve vir uma resposta acolhedora e, nos logs do serviço, uma linha `[Gabriel] ESCALAR — motivo: ...`

## Estrutura

```
server.js              → recebe o webhook do Twilio, monta a resposta em TwiML
lib/anthropic.js        → chama o Claude com a persona do Gabriel
lib/chmeetings.js       → hoje é um placeholder; Fase 2 pluga a API real do ChMeetings
lib/escalas.js           → Fase 4: consulta somente leitura ao banco do app de escalas (cafe-church.vercel.app)
lib/alert.js            → avisa quem está de plantão quando o Gabriel escala
persona/gabriel-system-prompt.md → o "cérebro" do Gabriel — editável sem mexer em código
```

Quer ajustar o jeito que o Gabriel fala ou o que ele sabe fazer? É só editar o `persona/gabriel-system-prompt.md` — não precisa tocar em nenhum `.js`.

## Próximos passos (conforme o plano)

- **Fase 2**: preencher `lib/chmeetings.js` com a chamada real à API do ChMeetings (`CHMEETINGS_API_KEY` no `.env`), pra agenda da semana vir sempre atualizada.
- **Fase 3**: trocar a memória em `Map()` do `server.js` por um banco de verdade, e começar a gravar visitante novo / interesse em grupo de volta no ChMeetings.
- **Fase 4** (já implementada neste código, falta só a credencial): `lib/escalas.js` consulta direto o banco do app de escalas (`cafe-church.vercel.app`) pra responder "quando é minha escala?" com o dado real. Ver seção abaixo.

## Fase 4 — ligar a consulta de escala (banco do cafe-church.vercel.app)

O app de escalas (`cafe-church.vercel.app`) guarda tudo num banco Postgres. Em vez de duplicar essa informação, o Gabriel consulta esse banco direto — mas com uma credencial **própria, criada só pra isso, e só com permissão de leitura (SELECT)**. Ele nunca usa a credencial de escrita que o app de escalas usa pra gravar.

**Isso é trabalho de quem tem acesso ao banco do app de escalas** — normalmente quem criou o `cafe-church.vercel.app`. Os passos:

1. Conecte no banco Postgres do app de escalas (pelo painel do provedor que hospeda ele, ou por qualquer cliente SQL) com um usuário que tenha permissão de administrador.
2. Rode o SQL abaixo pra criar um usuário novo, só de leitura, nas tabelas que o Gabriel precisa (troque `uma-senha-forte-aqui` por uma senha gerada, não uma frase fácil de adivinhar):

   ```sql
   CREATE USER gabriel_readonly WITH PASSWORD 'uma-senha-forte-aqui';
   GRANT CONNECT ON DATABASE postgres TO gabriel_readonly;
   GRANT USAGE ON SCHEMA public TO gabriel_readonly;
   GRANT SELECT ON "Member", "Couple", "SundayAssignment", "DiscipleshipAssignment" TO gabriel_readonly;
   ```

   (O nome do banco depois de `DATABASE` pode não ser `postgres` — confirme com o provedor que hospeda o banco do app de escalas. As demais linhas não mudam.)

3. Monte a connection string com esse novo usuário, no formato:

   ```
   postgresql://gabriel_readonly:uma-senha-forte-aqui@HOST:5432/NOME_DO_BANCO?sslmode=require
   ```

4. Cole esse valor na variável `ESCALAS_DATABASE_URL`, direto no painel do Render (Environment) — nunca em texto puro em nenhum arquivo, chat ou repositório. Você mesmo faz essa parte; ninguém mais precisa ver essa senha.

Enquanto essa variável não estiver preenchida, o Gabriel funciona normalmente — só que, se alguém perguntar sobre a escala dela, ele diz que vai confirmar com a equipe em vez de consultar o banco.

**Teste**: depois de preencher, mande pro número do Gabriel, de um telefone que esteja cadastrado como `Member.phone` no app de escalas, algo como "quando é minha escala?" — a resposta deve vir com a data real.

## Deploy no Render

Esse projeto já vem com um `render.yaml` (um "blueprint") que descreve o serviço pro Render — isso deixa a criação praticamente automática.

1. Suba esses arquivos pra um repositório no GitHub (pode ser privado). Se você nunca usou Git, o próprio site do GitHub deixa arrastar os arquivos direto pela interface web, em **Add file → Upload files**.
2. No [Dashboard do Render](https://dashboard.render.com), clique em **New → Blueprint**, e conecte o repositório que você acabou de criar.
3. O Render vai ler o `render.yaml` sozinho e mostrar os campos das variáveis de ambiente (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `ANTHROPIC_API_KEY`, `CHMEETINGS_API_KEY`, `STAFF_WHATSAPP_NUMBER`, `ESCALAS_DATABASE_URL`) — preencha cada um com o valor real (nunca compartilhe essas chaves em texto puro fora daqui). O `ESCALAS_DATABASE_URL` pode ficar em branco por enquanto — ver a seção "Fase 4" acima.
4. Clique em **Apply** / **Create**. Em poucos minutos o Render te dá uma URL pública, algo como `https://gabriel-whatsapp.onrender.com`.
5. Essa URL + `/webhook/whatsapp` é o que vai no campo "When a message comes in" do Twilio (ver seção acima).

O `.env` **nunca** vai pro Git (o `.gitignore` já cuida disso) — as chaves ficam só dentro do painel do Render, guardadas por eles como variável de ambiente.

Railway e Fly.io também servem, mas exigem configurar as variáveis de ambiente manualmente (não leem o `render.yaml`).
