// Создаёт токен ILYA (Token-2022 + метаданные) и прописывает его адрес в .env.local.
//
//   npm run create-token -- --url localnet                     создать токен на локальном валидаторе
//   npm run create-token -- --url devnet                       создать на Devnet (нужно ~0.01 SOL)
//   npm run create-token -- --url localnet --fund <адрес>      + дать кошельку Phantom SOL и 10 000 ILYA
//   npm run create-token -- --url localnet --fund <адрес> --only-fund   только пополнить, токен уже есть
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, ExtensionType, TYPE_SIZE, LENGTH_SIZE, getMintLen,
  createInitializeMetadataPointerInstruction, createInitializeMintInstruction,
  getOrCreateAssociatedTokenAccount, mintTo,
} from "@solana/spl-token";
import { createInitializeInstruction, createUpdateFieldInstruction, pack } from "@solana/spl-token-metadata";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const NET = arg("--url") ?? "localnet";
const RPC = { localnet: "http://127.0.0.1:8899", devnet: "https://api.devnet.solana.com" }[NET];
if (!RPC) throw new Error("--url должен быть localnet или devnet");
const FUND = arg("--fund");
const ONLY_FUND = args.includes("--only-fund");

const DECIMALS = 6;
const SUPPLY = 1_000_000n;          // выпускаем себе
const GIFT = 10_000n;               // отправляем на Phantom
const TOKEN = {
  name: "ILYA Token",
  symbol: "ILYA",
  uri: "https://raw.githubusercontent.com/solana-developers/opos-asset/main/assets/DeveloperPortal/metadata.json",
  extra: [
    ["slogan", "Own your keys. Own your value."],
    ["author", "Ilya Korobov"],
    ["edition", "Genesis"],
  ],
};

const ENV_FILE = ".env.local";
const envKey = `VITE_ILYA_MINT_${NET.toUpperCase()}`;

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    fs.readFileSync(ENV_FILE, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
  );
}
function writeEnv(env) {
  fs.writeFileSync(ENV_FILE, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}

const conn = new Connection(RPC, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8")))
);
const units = (n) => n * 10n ** BigInt(DECIMALS);

async function createToken() {
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const metadata = {
    mint, name: TOKEN.name, symbol: TOKEN.symbol, uri: TOKEN.uri,
    additionalMetadata: TOKEN.extra, updateAuthority: payer.publicKey,
  };
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await conn.getMinimumBalanceForRentExemption(mintLen + metadataLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey, newAccountPubkey: mint, space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(mint, payer.publicKey, mint, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint, DECIMALS, payer.publicKey, payer.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID, metadata: mint, updateAuthority: payer.publicKey,
      mint, mintAuthority: payer.publicKey, name: TOKEN.name, symbol: TOKEN.symbol, uri: TOKEN.uri,
    }),
    ...TOKEN.extra.map(([field, value]) =>
      createUpdateFieldInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint, updateAuthority: payer.publicKey, field, value })
    )
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [payer, mintKp]);
  console.log(`✅ ILYA создан: ${mint.toBase58()}\n   tx: ${sig}`);

  const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);
  await mintTo(conn, payer, mint, ata.address, payer, units(SUPPLY), [], undefined, TOKEN_2022_PROGRAM_ID);
  console.log(`✅ Выпущено ${SUPPLY.toLocaleString()} ILYA на ваш CLI-кошелёк ${payer.publicKey.toBase58()}`);

  const env = { VITE_DEFAULT_NETWORK: NET, ...readEnv(), [envKey]: mint.toBase58() };
  env.VITE_DEFAULT_NETWORK = NET;
  writeEnv(env);
  console.log(`✅ ${ENV_FILE}: ${envKey}=${mint.toBase58()}`);
  return mint;
}

async function fund(mint, to) {
  const owner = new PublicKey(to);
  if (NET === "localnet") {
    const s = await conn.requestAirdrop(owner, 5 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(s, "confirmed");
    console.log(`✅ ${to}: +5 SOL на комиссии (localnet)`);
  }
  const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, owner, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);
  await mintTo(conn, payer, mint, ata.address, payer, units(GIFT), [], undefined, TOKEN_2022_PROGRAM_ID);
  console.log(`✅ ${to}: +${GIFT.toLocaleString()} ILYA`);
}

try {
  console.log(`Сеть: ${NET} (${RPC})   плательщик: ${payer.publicKey.toBase58()}`);
  let mint;
  if (ONLY_FUND) {
    const saved = readEnv()[envKey];
    if (!saved) throw new Error(`В ${ENV_FILE} нет ${envKey} — сначала создайте токен`);
    mint = new PublicKey(saved);
  } else {
    mint = await createToken();
  }
  if (FUND) await fund(mint, FUND);
  console.log("\nГотово. Перезапустите `npm run dev`, чтобы приложение подхватило адрес токена.");
} catch (e) {
  console.error("❌", e.message ?? e);
  if (e.logs) console.error(e.logs.join("\n"));
  process.exit(1);
}
