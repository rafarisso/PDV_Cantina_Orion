# Cantina Orion – PDV escolar (React + Supabase + Netlify)

Sistema PWA para PDV de cantina escolar com controle financeiro, regras de saldo negativo unico, cobrancas Pix (PagSeguro) e RLS no Supabase.

## Tecnologias
- React + Vite + TypeScript (PWA, roteamento SPA)
- Supabase (Postgres + Auth + RLS + função `process_purchase`)
- Netlify Functions (`pix-create`, `pix-webhook`, `process-purchase`, `weekly-summary`)
- PagSeguro Pix copia-e-cola (payload gerado via function)

## Como rodar
```bash
npm install
npm run dev
```

Build: `npm run build`  
Type-check: `npm run typecheck`

### Variáveis (.env)
Copie `.env.example` e preencha:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (cliente)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (functions)
- `PAGSEGURO_TOKEN`, `PAGSEGURO_BASE_URL`, `PAGSEGURO_WEBHOOK_SECRET`
- `VITE_DEMO=true` habilita modo demo offline.

## Banco (supabase/schema.sql)
Tabelas principais: `guardians`, `students`, `wallets`, `orders`, `order_items`, `ledger`, `pix_charges`, `alerts`, `terms_acceptance`, `user_roles`, `products`.  
Função `process_purchase` aplica regra:
- Pré-pago: permite 1 compra com saldo negativo, bloqueia depois.
- Fiado: bloqueia ao exceder limite.
- Gera `alerts` em 30/15/0% e registra em `ledger`/`orders`.

`user_roles` controla papéis (admin, operator, guardian). RLS habilitado em todas as tabelas.

## Netlify Functions
- `POST /api/pix/create`: cria cobrança via PagSeguro e registra em `pix_charges`.
- `POST /api/pix/webhook`: confirma pagamento, credita carteira ou reduz débito e desbloqueia.
- `POST /api/process-purchase`: chama `rpc.process_purchase` (usa regra de bloqueio).
- `weekly-summary` (cron sexta 18h BRT): lê `weekly_consumption`, gera outbox e envia resumos.

`netlify.toml` já direciona `/api/*` para functions e ativa SPA fallback.

### Notificações WhatsApp (Z-API)
- Tabela `notification_outbox` guarda pendentes (`pending|sent|failed`).
- Helper SQL `normalize_phone(text)` padroniza para DDI 55.
- Env vars: `ZAPI_BASE_URL`, `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_SECURITY_TOKEN`, `APP_BASE_URL`, `WHATSAPP_FROM_NAME`.

### Fluxo de compra (obrigatório via RPC)
- Operador não pode inserir direto em `orders`/`order_items`/`ledger` (policies de insert removidas).
- Compras devem chamar `rpc.process_purchase` com `{ p_student_id, p_items: [{ product_id, quantity, unit_price }] }`.
- A função aplica regras de saldo negativo único, bloqueio por limite, atualiza `wallets` e cria alertas sem duplicar.

## UI/PWA
- Páginas: Painel (admin), PDV (admin/operador), Cadastro (admin), Cobranças Pix (admin), Login.
- CPF mascarado para operadores; cards de saldo/limite, alertas e bloqueios.
- Manifest + service worker (`public/service-worker.js`) para cache offline e ícones em `/public/icons`.

## LGPD e segurança
- CPF/endereço apenas para admin; operadores não têm acesso na RLS.
- Logs financeiros em `ledger` e `orders`; bloqueios registrados.
- Termos de consentimento em `terms_acceptance`.

## Próximos passos sugeridos
- Conectar Supabase real e ajustar `user_roles` para os logins existentes.
- Configurar webhook PagSeguro com `PAGSEGURO_WEBHOOK_SECRET`.
- Integrar envio de mensagens (WhatsApp/Push) usando dados da tabela `alerts`.
