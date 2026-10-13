import { Fragment, useState } from "react";
import type { AppState } from "./App";
import { Empty, Mark, Panel, Stat, StepChart } from "./components";
import { IconArrowUpRight, IconCopy, IconRefresh, IconSend } from "./icons";
import { formatAmount, sendTransfer, short, type Activity } from "./solana";
import { explorerAddress, explorerTx } from "./config";

export type Page = "overview" | "send" | "token" | "activity";

const amt = (s: AppState, raw: bigint | null, frac = 2) =>
  raw === null || !s.info ? "—" : formatAmount(raw, s.info.decimals, frac);

const ago = (t: number | null) => {
  if (!t) return "—";
  const d = Math.floor(Date.now() / 1000 - t);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return new Date(t * 1000).toLocaleDateString();
};

const KIND: Record<Activity["kind"], string> = {
  in: "IN", out: "OUT", mint: "MINT", burn: "BURN", other: "TX",
};

function Copy({ s, value }: { s: AppState; value: string }) {
  return (
    <button className="icon" title="Копировать" onClick={() => navigator.clipboard.writeText(value).then(() => s.notify("Скопировано"))}>
      <IconCopy size={13} />
    </button>
  );
}

// ---------------------------------------------------------------- таблица транзакций

function TxTable({ s, items, limit }: { s: AppState; items: Activity[]; limit?: number }) {
  const rows = limit ? items.slice(0, limit) : items;
  return (
    <div className="txs">
      <div className="tx-row head">
        <span>Type</span>
        <span>Amount</span>
        <span>Signature</span>
        <span>Age</span>
      </div>
      {rows.map((a) => (
        <div className="tx-row" key={a.signature}>
          <span><i className={"pill k-" + a.kind}>{KIND[a.kind]}</i></span>
          <span className={"mono " + (a.delta > 0n ? "pos" : a.delta < 0n ? "neg" : "dim")}>
            {a.delta === 0n || !s.info ? "·" : (a.delta > 0n ? "+" : "") + formatAmount(a.delta, s.info.decimals)}
          </span>
          <a className="mono" href={explorerTx(s.network, a.signature)} target="_blank" rel="noreferrer">
            {short(a.signature, 6)} <IconArrowUpRight size={11} />
          </a>
          <span className="mono dim">{a.ok ? ago(a.time) : "fail"}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- карточка токена

function TokenCard({ s }: { s: AppState }) {
  const i = s.info;
  return (
    <div className="token-card">
      <div className="tc-top">
        <Mark size={44} />
        <span className="tc-chip">TOKEN-2022</span>
      </div>
      <div className="tc-symbol">${i?.symbol ?? "ILYA"}</div>
      <div className="tc-name">{i?.name ?? "ILYA Token"}</div>
      <div className="tc-grid">
        <div><span>MINT</span><b className="mono">{i ? short(i.mint.toBase58(), 5) : "—"}</b></div>
        <div><span>SUPPLY</span><b className="mono">{i ? formatAmount(i.supply, i.decimals, 0) : "—"}</b></div>
        <div><span>DECIMALS</span><b className="mono">{i?.decimals ?? "—"}</b></div>
      </div>
      <div className="tc-lines" aria-hidden />
    </div>
  );
}

// ================================================================ Overview

export function Overview({ s }: { s: AppState }) {
  const history = (s.activity ?? [])
    .filter((a) => a.balanceAfter !== null)
    .reverse()
    .map((a) => Number(a.balanceAfter));
  if (history.length && s.balance !== null) history.push(Number(s.balance));
  const share =
    s.info && s.balance !== null && s.info.supply > 0n
      ? ((Number(s.balance) / Number(s.info.supply)) * 100).toFixed(2) + "%"
      : "—";
  const net = s.activity?.reduce((acc, a) => acc + a.delta, 0n) ?? null;

  return (
    <div className="bento">
      <Panel className="b-portfolio" kicker="PORTFOLIO" title="Your ILYA" right={
        s.owner && (
          <button className="ghost sm" onClick={() => s.refresh().then(() => s.notify("Обновлено"))} disabled={s.loading}>
            <IconRefresh size={14} className={s.loading ? "spin" : ""} /> Refresh
          </button>
        )
      }>
        {s.owner ? (
          <>
            <div className="big-balance">
              <span className="mono">{amt(s, s.balance)}</span>
              <small>{s.info?.symbol ?? "ILYA"}</small>
            </div>
            <div className="addr-line">
              <span className="mono dim">{s.owner.toBase58()}</span>
              <Copy s={s} value={s.owner.toBase58()} />
            </div>
            <StepChart points={history} />
            <div className="row-actions">
              <button className="primary" onClick={() => s.go("send")}><IconSend size={16} /> Send</button>
              <button className="ghost" onClick={() => s.go("activity")}>History</button>
            </div>
          </>
        ) : (
          <div className="connect-cta">
            <h2>Подключи кошелёк,<br />чтобы увидеть баланс</h2>
            <p>Phantom · {s.network.id === "devnet" ? "Devnet" : "Localnet"}</p>
            <button className="primary lg" onClick={s.connect}>Connect Phantom</button>
          </div>
        )}
      </Panel>

      <div className="b-card"><TokenCard s={s} /></div>

      <Panel className="b-stats" kicker="NUMBERS" title="Stats">
        <div className="stats">
          <Stat label="Your share of supply" value={share} />
          <Stat label="Net flow (last 20 tx)" value={net === null || !s.info ? "—" : (net > 0n ? "+" : "") + formatAmount(net, s.info.decimals)} />
          <Stat label="Transactions loaded" value={s.activity?.length ?? "—"} />
          <Stat label="Token extensions" value={s.info?.extensions.length ?? "—"} />
        </div>
      </Panel>

      <Panel className="b-activity" kicker="LEDGER" title="Recent transactions" right={
        <button className="link" onClick={() => s.go("activity")}>All <IconArrowUpRight size={12} /></button>
      }>
        {s.owner && s.activity && s.activity.length ? (
          <TxTable s={s} items={s.activity} limit={5} />
        ) : (
          <Empty
            title={s.owner ? (s.loading ? "Загрузка…" : "Пока пусто") : "Нет данных"}
            text={s.owner ? "Здесь появятся переводы ILYA." : "Подключи кошелёк, чтобы увидеть свои транзакции."}
          />
        )}
      </Panel>
    </div>
  );
}

// ================================================================ Send

export function SendPage({ s }: { s: AppState }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s.wallet || !s.info) return;
    setBusy(true);
    setError(null);
    setLastSig(null);
    try {
      const sig = await sendTransfer(s.conn, s.wallet, s.info, to, amount);
      setLastSig(sig);
      s.notify(`Отправлено ${amount} ${s.info.symbol}`);
      setAmount("");
      await s.refresh();
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      setError(msg.includes("User rejected") ? "Транзакция отклонена в кошельке" : msg);
    } finally {
      setBusy(false);
    }
  };
  const max = () => s.info && s.balance !== null && setAmount(formatAmount(s.balance, s.info.decimals, s.info.decimals).replace(/,/g, ""));

  return (
    <div className="split">
      <Panel kicker="TRANSFER" title="Send ILYA" className="send-panel">
        {!s.owner ? (
          <Empty title="Кошелёк не подключён" text="Подключи Phantom, чтобы отправлять токены." action={<button className="primary" onClick={s.connect}>Connect</button>} />
        ) : (
          <form onSubmit={submit} className="send-form">
            <div className="amount-box">
              <div className="ab-top">
                <span>You send</span>
                <button type="button" className="link" onClick={max}>Balance: {amt(s, s.balance)} · MAX</button>
              </div>
              <div className="ab-input">
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" inputMode="decimal" required />
                <span className="ab-token"><Mark size={22} /> {s.info?.symbol ?? "ILYA"}</span>
              </div>
            </div>
            <label className="field">
              <span>To</span>
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Адрес получателя (Solana)" spellCheck={false} required />
            </label>
            <div className="summary">
              <div><span>Network</span><b>{s.network.label}</b></div>
              <div><span>Instruction</span><b className="mono">transferChecked</b></div>
              <div><span>Recipient account</span><b>создастся, если нет</b></div>
            </div>
            {error && <div className="alert">{error}</div>}
            {lastSig && (
              <div className="alert ok">
                Отправлено ·{" "}
                <a className="mono" href={explorerTx(s.network, lastSig)} target="_blank" rel="noreferrer">
                  {short(lastSig, 8)} <IconArrowUpRight size={11} />
                </a>
              </div>
            )}
            <button className="primary lg block" disabled={busy || !s.info}>
              {busy ? "Подтверди в Phantom…" : "Send"}
            </button>
          </form>
        )}
      </Panel>

      <Panel kicker="LEDGER" title="Your last transfers">
        {s.activity && s.activity.length ? <TxTable s={s} items={s.activity} limit={8} /> : <Empty title="Пусто" text="Переводов пока не было." />}
      </Panel>
    </div>
  );
}

// ================================================================ Token

export function TokenPage({ s }: { s: AppState }) {
  const i = s.info;
  if (!i) return <Panel kicker="TOKEN" title="ILYA Token"><Empty title="Токен не загружен" text="Проверь сеть и что токен создан." /></Panel>;
  const Addr = ({ v }: { v: string | null }) =>
    v ? (
      <span className="addr">
        <a className="mono" href={explorerAddress(s.network, v)} target="_blank" rel="noreferrer">{short(v, 6)}</a>
        <Copy s={s} value={v} />
      </span>
    ) : (
      <span className="dim">none</span>
    );
  return (
    <div className="split">
      <div className="stack">
        <TokenCard s={s} />
        <Panel kicker="EXTENSIONS" title="Token-2022">
          <div className="tags">{i.extensions.map((x) => <span key={x} className="tag">{x}</span>)}</div>
        </Panel>
      </div>
      <Panel kicker="ON-CHAIN METADATA" title={i.name}>
        <dl className="spec">
          <dt>Symbol</dt><dd>{i.symbol}</dd>
          <dt>Mint</dt><dd><Addr v={i.mint.toBase58()} /></dd>
          <dt>Supply</dt><dd className="mono">{formatAmount(i.supply, i.decimals, i.decimals)}</dd>
          <dt>Decimals</dt><dd className="mono">{i.decimals}</dd>
          <dt>Mint authority</dt><dd><Addr v={i.mintAuthority} /></dd>
          <dt>Freeze authority</dt><dd><Addr v={i.freezeAuthority} /></dd>
          <dt>Update authority</dt><dd><Addr v={i.updateAuthority} /></dd>
          <dt>URI</dt><dd className="wrap"><a href={i.uri} target="_blank" rel="noreferrer">{i.uri || "—"}</a></dd>
          {i.additional.map(([k, v]) => (
            <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
          ))}
        </dl>
      </Panel>
    </div>
  );
}

// ================================================================ Activity

export function ActivityPage({ s }: { s: AppState }) {
  const [mode, setMode] = useState<"me" | "all">(s.owner ? "me" : "all");
  const list = mode === "me" ? s.activity : s.mintActivity;
  return (
    <Panel kicker="LEDGER" title="Activity" right={
      <div className="seg small">
        <button className={mode === "me" ? "on" : ""} onClick={() => setMode("me")}>My wallet</button>
        <button className={mode === "all" ? "on" : ""} onClick={() => setMode("all")}>Whole token</button>
        <button onClick={() => s.refresh()} title="Обновить"><IconRefresh size={13} className={s.loading ? "spin" : ""} /></button>
      </div>
    }>
      {mode === "me" && !s.owner ? (
        <Empty title="Кошелёк не подключён" text="Подключи Phantom, чтобы увидеть свои транзакции." action={<button className="primary" onClick={s.connect}>Connect</button>} />
      ) : list && list.length ? (
        <TxTable s={s} items={list} />
      ) : (
        <Empty title={s.loading ? "Загрузка…" : "Нет транзакций"} text="Они появятся после первого перевода." />
      )}
      {s.info && (
        <a className="ghost sm explorer" href={explorerAddress(s.network, s.info.mint.toBase58())} target="_blank" rel="noreferrer">
          Open in Solana Explorer <IconArrowUpRight size={12} />
        </a>
      )}
    </Panel>
  );
}
