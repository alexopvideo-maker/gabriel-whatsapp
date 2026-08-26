# Gabriel — serviço (WhatsApp + Instagram)

Este é o "escutador" da Opção A do plano: um serviço pequeno que recebe as mensagens no número de WhatsApp que **já está em uso** (o mesmo que manda as escalas pelo app) e no Direct do Instagram (@cafechurchofc, via ManyChat), aciona o Gabriel via Claude, e responde de volta pelo mesmo canal. Ninguém do outro lado percebe que trocou de sistema — pra quem está conversando, é a mesma linha de sempre.

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
server.js              → recebe os webhooks do Twilio (WhatsApp) e do ManyChat (Instagram), monta as respostas
lib/anthropic.js        → chama o Claude com a persona do Gabriel (WhatsApp)
lib/instagramReply.js   → chama o Claude com a persona do Gabriel (Instagram) — réplica enxuta do lib/anthropic.js
lib/chmeetings.js       → Fase 2: agenda da semana, lida direto de um Google Calendar (link iCal)
lib/calendarWrite.js     → Comando do pastor: cria evento na mesma agenda, só pra quem escreve do número da liderança
lib/notionWrite.js       → Comando do pastor: cria tarefa/projeto no Notion, só pra quem escreve do número da liderança
lib/escalas.js           → Fase 4: consulta somente leitura ao banco do app de escalas (cafe-church.vercel.app)
lib/alert.js            → avisa quem está de plantão quando o Gabriel escala (WhatsApp e Instagram)
persona/gabriel-system-prompt.md   → o "cérebro" do Gabriel no WhatsApp — editável sem mexer em código
persona/instagram-system-prompt.md → o "cérebro" do Gabriel no Instagram — editável sem mexer em código
```

Quer ajustar o jeito que o Gabriel fala ou o que ele sabe fazer? É só editar o `persona/gabriel-system-prompt.md` (WhatsApp) ou o `persona/instagram-system-prompt.md` (Instagram) — não precisa tocar em nenhum `.js`.

## Próximos passos (conforme o plano)

- **Fase 2** (já implementada neste código, falta só o link do calendário): `lib/chmeetings.js` lê a agenda da semana direto de um Google Calendar. Ver seção abaixo.
- **Fase 3**: trocar a memória em `Map()` do `server.js` por um banco de verdade, e começar a gravar visitante novo / interesse em grupo de volta no ChMeetings (a API/Zapier do ChMeetings cobre escrita em Pessoa, Família e Nota — dá pra usar isso aqui).
- **Fase 4** (já implementada neste código, feita e testada): `lib/escalas.js` consulta direto o banco do app de escalas (`cafe-church.vercel.app`) pra responder "quando é minha escala?" com o dado real. Ver seção abaixo.
- **Comando do pastor** (já implementado neste código, falta só a credencial): a liderança pode pedir pro Gabriel marcar um evento novo na agenda, criar uma tarefa ou abrir um projeto com checklist, direto pelo WhatsApp. Ver seção abaixo.
- **Instagram (ManyChat)** (já implementado neste código, falta só configurar o lado do ManyChat): o Direct do @cafechurchofc responde com o mesmo Gabriel, via um endpoint que o ManyChat chama. Ver seção abaixo.

## Fase 2 — ligar a agenda da semana (Google Calendar)

O Gabriel já sabe os horários fixos de domingo e quarta (isso nunca muda, está direto na persona). Pra qualquer **outro** evento da semana, ele lê um Google Calendar — sem precisar de chave de API, conta de serviço, nem console do Google Cloud. Só um link que o próprio Google já gera.

1. Crie (ou use um que já exista) um Google Calendar só com os eventos da igreja que você quer que o Gabriel saiba — cultos especiais, reuniões, eventos pontuais.
2. No [Google Calendar](https://calendar.google.com), passe o mouse sobre esse calendário na barra da esquerda → clique nos três pontinhos (⋮) → **Configurações e compartilhamento**.
3. Role até **Integrar agenda** e copie o **Endereço secreto no formato iCal** (termina em `/basic.ics`).
4. Cole esse link na variável `GOOGLE_CALENDAR_ICS_URL`, direto no painel do Render (Environment) — nunca em texto puro em nenhum arquivo, chat ou repositório. Embora seja um link só de leitura, quem tiver esse link enxerga os eventos do calendário, então trate como algo privado.

Enquanto essa variável não estiver preenchida, o Gabriel funciona normalmente com os horários fixos — só não sabe de eventos extras da semana.

**Limitação por enquanto**: eventos que se repetem toda semana (recorrentes) não são expandidos automaticamente — só a primeira ocorrência aparece. Pra um evento pontual isso já resolve; pra algo semanal, cadastre uma ocorrência nova a cada semana até isso evoluir.

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

## Comando do pastor — criar evento, tarefa ou projeto pelo WhatsApp

Só quem escreve do número em `PASTOR_WHATSAPP_NUMBER` pode pedir pro Gabriel marcar um evento novo na mesma agenda do Google Calendar da Fase 2 (ex.: "marca uma reunião de líderes quarta às 19h"). O Gabriel confirma o que entendeu na hora — data e hora por extenso — pra dar chance de corrigir se algo saiu errado. Por enquanto só cria evento novo; editar ou cancelar um já existente ainda não é possível por aqui.

Ler a agenda (Fase 2) usa só um link — mas **criar** evento precisa de permissão de escrita de verdade, então o caminho é diferente: uma conta de serviço do Google Cloud.

1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto (ou use um que já exista).
2. **APIs e serviços → Biblioteca** → ative a **Google Calendar API**.
3. **APIs e serviços → Credenciais → Criar credenciais → Conta de serviço**. Dê um nome (ex.: `gabriel-calendario`), sem permissões extras de projeto.
4. Na conta de serviço criada, aba **Chaves → Adicionar chave → Criar nova chave**, formato **JSON**. Isso baixa um arquivo `.json` pro seu computador — **nunca** suba esse arquivo pro GitHub nem cole o conteúdo em nenhum chat.
5. Copie o **e-mail** da conta de serviço (algo tipo `gabriel-calendario@SEU-PROJETO.iam.gserviceaccount.com`).
6. No Google Calendar, na mesma tela de configurações de onde você pegou o link do iCal (Fase 2 — "Configurações e compartilhamento"), em **Compartilhar com pessoas específicas**, adicione esse e-mail com permissão **Fazer alterações nos eventos**.
7. Copie o conteúdo inteiro do arquivo `.json` e cole na variável `GOOGLE_SERVICE_ACCOUNT_JSON`, direto no painel do Render — nunca em texto puro em nenhum arquivo, chat ou repositório.
8. Copie o **ID da agenda** (mesma tela, mais acima — geralmente termina em `@group.calendar.google.com`, ou é o seu e-mail do Google se for a agenda principal) e cole em `GOOGLE_CALENDAR_ID`.
9. Cole o número de WhatsApp da liderança (o mesmo formato do `TWILIO_WHATSAPP_NUMBER`, ex.: `whatsapp:+15551234567`) em `PASTOR_WHATSAPP_NUMBER`.

Enquanto essas três variáveis não estiverem preenchidas, o comando simplesmente não funciona — o resto do Gabriel continua normal.

**Como funciona por dentro** (se quiser entender ou depurar): o modelo, ao entender um pedido de criar evento vindo do número certo, termina a resposta com uma linha interna `[[EVENTO: título | data/hora | duração opcional | descrição opcional]]`, que o `server.js` remove antes de mandar a resposta e usa pra chamar `lib/calendarWrite.js`. Como o Gabriel responde numa única passada (não confirma com o Google Calendar antes de responder), existe uma janela pequena onde ele pode dizer "marquei" e a criação falhar depois (ex.: credencial errada) — isso fica só no log do Render, não numa segunda mensagem pro pastor. Se isso incomodar no dia a dia, dá pra evoluir depois pra um fluxo que espera a confirmação do Google Calendar antes de responder.

### Tarefas e projetos (Notion)

Além da agenda, a liderança pode pedir pro Gabriel anotar uma tarefa simples (vai pra base **Tarefas Diárias**) ou abrir um projeto com checklist de etapas (vai pra base **PROJETOS**, dentro de "Projetos CAFE CURCH") — ambas no Notion. Igual ao evento, só quem escreve do número em `PASTOR_WHATSAPP_NUMBER` aciona isso.

`PROJETOS` já existia no workspace; `Tarefas Diárias` foi criada nova, porque a home "Minhas Tarefas" do Notion é um recurso interno do produto e não pode ser compartilhado com integrações.

1. No Notion, vá em **app.notion.com/profile/integrations** (ou pelo menu **Configurações → Conexões**) → **Nova conexão**.
2. Método de autenticação: **Token de acesso** (não OAuth). Dê um nome (ex.: `Gabriel WhatsApp`). As permissões padrão (ler, inserir e atualizar conteúdo) já servem.
3. Abra a base **Tarefas Diárias**, menu **"..." → Conexões**, e adicione a conexão que você acabou de criar. Repita na base **PROJETOS**.
4. De volta na página da conexão (aba **Configuração**), clique no ícone de olho pra revelar o **Token de acesso** (começa com `ntn_`), copie e cole na variável `NOTION_API_KEY`, direto no painel do Render — nunca em texto puro em nenhum arquivo, chat ou repositório.

Enquanto `NOTION_API_KEY` não estiver preenchida, os comandos de tarefa e projeto simplesmente não funcionam — o resto do Gabriel continua normal. Se as bases forem recriadas ou renomeadas um dia, os IDs ficam no topo de `lib/notionWrite.js`.

## Instagram (ManyChat) — réplica do Gabriel no Direct

O Direct do @cafechurchofc responde com o mesmo Gabriel — mesmo Claude, tom parecido — só que numa persona mais enxuta (sem escala pessoal nem comando da liderança, que continuam exclusivos do WhatsApp, porque não tem como ligar com segurança um contato do Instagram a um número de telefone cadastrado). O código já está pronto (`lib/instagramReply.js`, `persona/instagram-system-prompt.md`, rota `/webhook/instagram` no `server.js`) — falta só configurar o lado do ManyChat, que é feito direto na conta do ManyChat, não por aqui.

1. Gere um valor aleatório forte (ex.: `openssl rand -hex 32` no terminal, ou peça pra mim gerar um) e cole na variável `MANYCHAT_SHARED_SECRET`, direto no painel do Render — esse valor é o que garante que só o ManyChat consegue chamar esse endpoint. Guarde esse mesmo valor, você vai precisar dele no passo 3.
2. No ManyChat, dentro do fluxo que responde o Direct (ou criando um novo), adicione uma ação **External Request** (fica em "Dev Tools" / "Actions"):
   - **Method**: `POST`
   - **URL**: `https://gabriel-whatsapp.onrender.com/webhook/instagram`
   - **Headers**: `Content-Type: application/json` e `X-ManyChat-Secret: <o valor que você colou no Render>`
   - **Body** (JSON), usando as variáveis do próprio ManyChat:
     ```json
     {
       "contact_id": "{{contact_id}}",
       "message": "{{last input text}}",
       "name": "{{first name}} {{last name}}"
     }
     ```
3. Na seção de **mapeamento da resposta** dessa mesma ação, mapeie `$.reply` (JSON Path) pra um campo customizado de texto — por exemplo, crie um campo chamado `gabriel_reply` — e, se quiser usar depois pra rotear conversas, mapeie `$.escalate` pra um campo booleano tipo `gabriel_escalou`.
4. Logo depois da ação External Request no fluxo, adicione um passo **Send Message** com o texto sendo o campo customizado `{{gabriel_reply}}` — é isso que a pessoa recebe no Direct.
5. Ligue esse fluxo no gatilho que faz sentido pra vocês — o mais simples é como **resposta padrão** (a automação que roda quando nenhuma outra palavra-chave bate), assim ele pega qualquer pergunta solta tipo "onde é a igreja" ou "que horas é o culto".

Sobre a política do Instagram: como o Gabriel só responde a mensagens que a pessoa mandou primeiro (nunca manda mensagem por conta própria), isso está dentro do uso normal permitido pelo Meta — a janela de 24h e o limite de mensagens por hora valem pra broadcast/marketing, não pra resposta automática de uma conversa que a pessoa começou.

Enquanto `MANYCHAT_SHARED_SECRET` não estiver preenchido no Render, o endpoint fica desligado de propósito (responde 503) — não aceita chamadas de ninguém.

## Deploy no Render

Esse projeto já vem com um `render.yaml` (um "blueprint") que descreve o serviço pro Render — isso deixa a criação praticamente automática.

1. Suba esses arquivos pra um repositório no GitHub (pode ser privado). Se você nunca usou Git, o próprio site do GitHub deixa arrastar os arquivos direto pela interface web, em **Add file → Upload files**.
2. No [Dashboard do Render](https://dashboard.render.com), clique em **New → Blueprint**, e conecte o repositório que você acabou de criar.
3. O Render vai ler o `render.yaml` sozinho e mostrar os campos das variáveis de ambiente (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `ANTHROPIC_API_KEY`, `GOOGLE_CALENDAR_ICS_URL`, `PASTOR_WHATSAPP_NUMBER`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID`, `NOTION_API_KEY`, `STAFF_WHATSAPP_NUMBER`, `ESCALAS_DATABASE_URL`, `MANYCHAT_SHARED_SECRET`) — preencha cada um com o valor real (nunca compartilhe essas chaves em texto puro fora daqui). `GOOGLE_CALENDAR_ICS_URL`, `PASTOR_WHATSAPP_NUMBER`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID`, `NOTION_API_KEY`, `ESCALAS_DATABASE_URL` e `MANYCHAT_SHARED_SECRET` podem ficar em branco por enquanto — ver as seções "Fase 2", "Comando do pastor", "Fase 4" e "Instagram (ManyChat)" acima.
4. Clique em **Apply** / **Create**. Em poucos minutos o Render te dá uma URL pública, algo como `https://gabriel-whatsapp.onrender.com`.
5. Essa URL + `/webhook/whatsapp` é o que vai no campo "When a message comes in" do Twilio (ver seção acima).

O `.env` **nunca** vai pro Git (o `.gitignore` já cuida disso) — as chaves ficam só dentro do painel do Render, guardadas por eles como variável de ambiente.

Railway e Fly.io também servem, mas exigem configurar as variáveis de ambiente manualmente (não leem o `render.yaml`).
