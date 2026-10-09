# 🚀 Guia de Hospedagem Gratuita (Vercel + Banco de Dados)

Como você não conseguiu acessar localmente, a melhor forma de visualizar e usar o app é hospedando-o na nuvem. A combinação **Vercel** (para o site) e **Neon ou Supabase** (para o banco de dados) é excelente e possui planos gratuitos robustos.

Siga este passo a passo:

## 1. Preparar o Código (GitHub)

Para usar a Vercel, seu código precisa estar no GitHub.

1.  Crie uma conta no [GitHub](https://github.com) se não tiver.
2.  Crie um **novo repositório** (público ou privado).
3.  No seu computador (onde estão os arquivos), abra o terminal e execute:
    ```bash
    git init
    git add .
    git commit -m "Upload inicial do Gestão Zen"
    git branch -M main
    git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
    git push -u origin main
    ```
    *(Substitua a URL pelo link do seu repositório criado)*

## 2. Criar o Banco de Dados Gratuito (Neon Tech)

Recomendo o **Neon.tech** por ser nativo para Postgres e muito fácil de usar com Prisma.

1.  Acesse [neon.tech](https://neon.tech) e crie uma conta.
2.  Crie um novo projeto.
3.  Copie a **Connection String** (que começa com `postgres://...`).
    *   **Importante:** Selecione a opção "Pooled connection" ou "Transaction pooler" se disponível, pois é melhor para serverless.

## 3. Configurar o Projeto na Vercel

1.  Acesse [vercel.com](https://vercel.com) e faça login com seu GitHub.
2.  Clique em **"Add New..."** -> **"Project"**.
3.  Importe o repositório do GitHub que você acabou de criar.
4.  Na tela de configuração, vá em **"Environment Variables"** (Variáveis de Ambiente) e adicione:
    *   **Name:** `DATABASE_URL`
    *   **Value:** *(Cole a Connection String do Neon que você copiou no passo 2)*
    *   **Name:** `NEXTAUTH_SECRET`
    *   **Value:** *(Invente uma senha longa e segura, ex: `minha-senha-super-secreta-123`)*
    *   **Name:** `NEXTAUTH_URL`
    *   **Value:** *(Deixe em branco por enquanto, a Vercel preenche automaticamente, ou coloque a URL final se souber)*
5.  Clique em **"Deploy"**.

## 4. Finalizando a Configuração do Banco de Dados

Assim que o deploy começar, ele pode falhar na primeira vez se o banco de dados não estiver sincronizado (sem as tabelas).

1.  No painel da Vercel, vá para a aba **"Settings"** -> **"Build & Development settings"**.
2.  No campo **"Build Command"**, mude de `next build` para:
    ```bash
    npx prisma generate && npx prisma db push && next build
    ```
    *Isso garante que o banco de dados seja atualizado toda vez que você fizer deploy.*
3.  Vá na aba **"Deployments"**, clique nos três pontinhos do último deploy falho e selecione **"Redeploy"**.

## 5. Acessando seu App

1.  Quando o deploy ficar verde (**Ready**), clique no domínio que a Vercel criou (ex: `gestao-zen.vercel.app`).
2.  **Primeiro Acesso:**
    Como o banco está vazio, você precisará criar o primeiro usuário via código ou rodar o seed.
    
    **Opção A (Mais fácil - Deploy do Seed):**
    Adicione o comando de seed ao build command temporariamente:
    `npx prisma generate && npx prisma db push && npm run seed && next build`
    
    **Opção B (Manual):**
    Acesse a rota de cadastro `/signup` do seu site publicado (ex: `...vercel.app/signup`) e crie uma conta.

---

### 💡 Resumo das Variáveis de Ambiente necessárias na Vercel:

- `DATABASE_URL`: `postgres://...` (Do Neon/Supabase)
- `NEXTAUTH_SECRET`: `qualquer-coisa-secreta`
- `NEXTAUTH_URL`: `https://seu-projeto.vercel.app` (Opcional, mas recomendado)
