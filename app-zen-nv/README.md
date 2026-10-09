# GESTÃO ZEN

Sistema profissional de gestão de tráfego pago e CRM, com análise de ROI, funil de
conversão, integração com Meta Ads e relatórios em PDF.

Construído com **Next.js 14**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**,
**Prisma** e **PostgreSQL**.

## Requisitos

- Node.js 18+ (recomendado 20)
- PostgreSQL 14+
- npm

## Configuração

1. Instale as dependências:

```bash
npm install
```

2. Crie o arquivo de variáveis de ambiente a partir do exemplo:

```bash
cp .env.example .env
```

Edite o `.env` e ajuste, no mínimo:

- `DATABASE_URL` – string de conexão do PostgreSQL
- `NEXTAUTH_SECRET` – chave secreta (ex.: `openssl rand -base64 32`)
- `NEXTAUTH_URL` – URL base da aplicação (ex.: `http://localhost:3000`)

As variáveis de `SMTP_*`, `AWS_*` e `NEXT_PUBLIC_GA_MEASUREMENT_ID` são opcionais.

3. Crie o banco de dados (exemplo com PostgreSQL local):

```bash
createdb gestao_zen
```

4. Gere o Prisma Client e sincronize o schema:

```bash
npm run db:push
```

5. Popule o banco com dados de demonstração:

```bash
npm run seed
```

O seed cria o usuário gerente `john@doe.com` (senha `johndoe123`), gestores,
atendentes, 240 registros de métricas e 40 leads de exemplo.

> Se existir a planilha `Gestao_Trafego_Profissional.xlsx`, o seed importa os dados
> reais dela. Caso contrário, gera dados de exemplo automaticamente. O caminho do
> arquivo pode ser definido pela variável `SEED_EXCEL_PATH`.

## Executando

Ambiente de desenvolvimento:

```bash
npm run dev
```

Build de produção:

```bash
npm run build
npm start
```

Acesse em `http://localhost:3000`.

## Acesso inicial

- **E-mail:** `john@doe.com`
- **Senha:** `johndoe123`
- **Perfil:** Gerente (acesso total)

## Funcionalidades

- **Dashboard:** KPIs, evolução de investimento e faturamento, funil de conversão,
  comparativo de campanhas, mix de origem e heatmap de performance.
- **CRM:** gestão de leads em visão Kanban e tabela, com histórico de interações.
- **Métricas:** filtros por atendente/gestor e período, análise semanal e geográfica.
- **Importar Planilha:** importação de métricas via planilha XLSX/CSV.
- **Meta Ads:** integração com a Graph API (campanhas, conjuntos, insights,
  recomendações e histórico de alterações).
- **Relatórios:** geração de PDF sob demanda, envio por e-mail e link público.
- **Usuários:** cadastro de gerentes, gestores e atendentes com controle de acesso.
- **PWA:** aplicativo instalável (manifest + service worker).

## Deploy

Consulte o `DEPLOY_GUIDE.md` para instruções de hospedagem na Vercel com um banco
PostgreSQL gerenciado (Neon/Supabase).
