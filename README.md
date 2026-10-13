# ILYA — персональный токен на Solana

dApp для собственного токена **ILYA** (Token-2022 + on-chain метаданные): подключение Phantom,
баланс с графиком, перевод, метаданные токена и история транзакций. Работает с локальным
валидатором и Devnet, без серверной части.

## Страницы

| Страница | Что делает |
|---|---|
| **Overview** | баланс и график его истории, карточка токена, статистика (доля в supply, net flow), последние транзакции |
| **Send** | перевод ILYA: `createAssociatedTokenAccountIdempotent` + `transferChecked`, подпись в Phantom |
| **Token** | метаданные из mint-аккаунта: name, symbol, URI, supply, authorities, расширения Token-2022, доп. поля |
| **Activity** | транзакции кошелька или всего токена со ссылками на Solana Explorer |

Сверху — бегущая строка с живыми данными токена и переключатель сети Localnet / Devnet.

## Стек

React 18 + TypeScript + Vite · `@solana/web3.js` · `@solana/spl-token` (Token-2022) ·
`@solana/spl-token-metadata` · Phantom (`window.phantom.solana`) · шрифты Space Grotesk / JetBrains Mono.

## Структура

```text
src/
  App.tsx          состояние (сеть, кошелёк, токен, баланс, история), шапка, бегущая строка
  pages.tsx        Overview / Send / Token / Activity
  solana.ts        блокчейн: баланс, перевод, метаданные, история транзакций
  components.tsx   панели, логотип, ступенчатый график
  config.ts        сети и адрес токена (из .env.local)
scripts/
  create-ilya.mjs  создаёт токен ILYA и пишет его адрес в .env.local
```

## Запуск

```bash
solana-test-validator --reset                                     # отдельный терминал
npm install
npm run create-token -- --url localnet --fund <адрес_Phantom>     # токен + 5 SOL и 10 000 ILYA на Phantom
npm run dev                                                       # http://localhost:5173
```

В Phantom: Настройки → Настройки разработчика → Testnet Mode → **Solana Localnet**.

Devnet: `npm run create-token -- --url devnet --fund <адрес_Phantom>` (нужно немного devnet SOL).
