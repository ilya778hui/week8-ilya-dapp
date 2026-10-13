// Вся работа с блокчейном: кошелёк Phantom, баланс, перевод, метаданные, история.
import {
  Connection, PublicKey, Transaction, type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, ExtensionType, getMint, getAccount, getExtensionTypes, getTokenMetadata,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction, TokenAccountNotFoundError,
} from "@solana/spl-token";

// ------------------------------------------------------------------ wallet (Phantom)

export interface WalletProvider {
  publicKey: PublicKey | null;
  isConnected?: boolean;
  isPhantom?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction(tx: Transaction): Promise<Transaction>;
  on(event: string, handler: (arg: unknown) => void): void;
  off?(event: string, handler: (arg: unknown) => void): void;
}

export function getProvider(): WalletProvider | null {
  const w = window as unknown as { phantom?: { solana?: WalletProvider }; solana?: WalletProvider };
  return w.phantom?.solana ?? w.solana ?? null;
}

// ------------------------------------------------------------------ token info

export interface TokenInfo {
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  supply: bigint;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  updateAuthority: string | null;
  additional: [string, string][];
  extensions: string[];
}

export async function loadTokenInfo(conn: Connection, mint: PublicKey): Promise<TokenInfo> {
  const m = await getMint(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const md = await getTokenMetadata(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const extensions = getExtensionTypes(m.tlvData).map((t) => ExtensionType[t] ?? `Extension ${t}`);
  return {
    mint,
    name: md?.name ?? "Unknown",
    symbol: md?.symbol ?? "???",
    uri: md?.uri ?? "",
    decimals: m.decimals,
    supply: m.supply,
    mintAuthority: m.mintAuthority?.toBase58() ?? null,
    freezeAuthority: m.freezeAuthority?.toBase58() ?? null,
    updateAuthority: md?.updateAuthority?.toBase58() ?? null,
    additional: (md?.additionalMetadata ?? []) as [string, string][],
    extensions,
  };
}

export const ataOf = (mint: PublicKey, owner: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);

export async function loadBalance(conn: Connection, mint: PublicKey, owner: PublicKey): Promise<bigint> {
  try {
    const acc = await getAccount(conn, ataOf(mint, owner), "confirmed", TOKEN_2022_PROGRAM_ID);
    return acc.amount;
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) return 0n;
    throw e;
  }
}

// ------------------------------------------------------------------ amounts

export function formatAmount(raw: bigint, decimals: number, maxFrac = 2): string {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + wholeStr + (frac ? "." + frac : "");
}

export function parseAmount(input: string, decimals: number): bigint {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Введите число, например 10 или 2.5");
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) throw new Error(`Максимум ${decimals} знаков после точки`);
  const raw = BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (raw <= 0n) throw new Error("Сумма должна быть больше нуля");
  return raw;
}

// ------------------------------------------------------------------ transfer

export async function sendTransfer(
  conn: Connection,
  wallet: WalletProvider,
  info: TokenInfo,
  recipientStr: string,
  amountStr: string
): Promise<string> {
  const owner = wallet.publicKey;
  if (!owner) throw new Error("Сначала подключите кошелёк");
  let recipient: PublicKey;
  try {
    recipient = new PublicKey(recipientStr.trim());
  } catch {
    throw new Error("Некорректный адрес получателя");
  }
  if (recipient.equals(owner)) throw new Error("Нельзя отправить самому себе");
  const amount = parseAmount(amountStr, info.decimals);

  const balance = await loadBalance(conn, info.mint, owner);
  if (amount > balance) throw new Error(`Недостаточно ${info.symbol}: доступно ${formatAmount(balance, info.decimals, info.decimals)}`);

  const fromAta = ataOf(info.mint, owner);
  const toAta = ataOf(info.mint, recipient);

  const tx = new Transaction().add(
    // создаст токен-аккаунт получателя, если его ещё нет
    createAssociatedTokenAccountIdempotentInstruction(owner, toAta, recipient, info.mint, TOKEN_2022_PROGRAM_ID),
    createTransferCheckedInstruction(fromAta, info.mint, toAta, owner, amount, info.decimals, [], TOKEN_2022_PROGRAM_ID)
  );
  tx.feePayer = owner;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

// ------------------------------------------------------------------ activity

export interface Activity {
  signature: string;
  time: number | null;
  slot: number;
  ok: boolean;
  kind: "in" | "out" | "mint" | "burn" | "other";
  delta: bigint; // изменение баланса владельца (raw units)
  balanceAfter: bigint | null;
  counterparty: string | null;
}

function tokenDelta(tx: ParsedTransactionWithMeta, mint: string, owner: string) {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  const amt = (list: typeof pre, who: string) =>
    BigInt(list.find((b) => b.mint === mint && b.owner === who)?.uiTokenAmount.amount ?? "0");
  const owners = new Set([...pre, ...post].filter((b) => b.mint === mint && b.owner).map((b) => b.owner!));
  const others = [...owners].filter((o) => o !== owner);
  const counterparty =
    others.find((o) => amt(post, o) !== amt(pre, o)) ?? null;
  const has = post.some((b) => b.mint === mint && b.owner === owner);
  return { delta: amt(post, owner) - amt(pre, owner), after: has ? amt(post, owner) : null, counterparty };
}

function classify(tx: ParsedTransactionWithMeta): Activity["kind"] | null {
  const ixs = tx.transaction.message.instructions;
  for (const ix of ixs) {
    if ("parsed" in ix && ix.parsed && typeof ix.parsed === "object") {
      const t = (ix.parsed as { type?: string }).type ?? "";
      if (t.startsWith("mintTo")) return "mint";
      if (t.startsWith("burn")) return "burn";
    }
  }
  return null;
}

/** История для адреса (ATA пользователя или сам mint). */
export async function loadActivity(
  conn: Connection,
  address: PublicKey,
  mint: PublicKey,
  owner: PublicKey | null,
  limit = 10
): Promise<Activity[]> {
  const sigs = await conn.getSignaturesForAddress(address, { limit }, "confirmed");
  if (sigs.length === 0) return [];
  // По одной транзакции: публичный Devnet RPC режет пачки запросов (ошибка 429)
  const txs: (ParsedTransactionWithMeta | null)[] = [];
  for (const sig of sigs) {
    txs.push(
      await conn
        .getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
        .catch(() => null)
    );
  }
  return sigs.map((s, i) => {
    const tx = txs[i];
    let delta = 0n;
    let after: bigint | null = null;
    let counterparty: string | null = null;
    let kind: Activity["kind"] = "other";
    if (tx) {
      const forced = classify(tx);
      if (owner) {
        const d = tokenDelta(tx, mint.toBase58(), owner.toBase58());
        delta = d.delta;
        after = d.after;
        counterparty = d.counterparty;
      }
      kind = forced ?? (delta > 0n ? "in" : delta < 0n ? "out" : "other");
    }
    return { signature: s.signature, time: s.blockTime ?? null, slot: s.slot, ok: !s.err, kind, delta, balanceAfter: after, counterparty };
  });
}

export const short = (s: string, n = 4) => (s.length > 2 * n + 3 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
