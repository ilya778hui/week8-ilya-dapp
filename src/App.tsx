import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { NETWORKS, DEFAULT_NETWORK, type NetworkId } from "./config";
import {
  getProvider, loadTokenInfo, loadBalance, loadActivity, ataOf, short, formatAmount,
  type TokenInfo, type Activity, type WalletProvider,
} from "./solana";
import { Mark } from "./components";
import { IconWallet, IconLogout, IconChevronDown } from "./icons";
import { Overview, SendPage, TokenPage, ActivityPage, type Page } from "./pages";

export interface AppState {
  network: (typeof NETWORKS)[NetworkId];
  conn: Connection;
  wallet: WalletProvider | null;
  owner: PublicKey | null;
  info: TokenInfo | null;
  infoError: string | null;
  balance: bigint | null;
  activity: Activity[] | null;
  mintActivity: Activity[] | null;
  loading: boolean;
  go: (p: Page) => void;
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  notify: (text: string, kind?: "ok" | "err") => void;
}

const NAV: { id: Page; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "send", label: "Send" },
  { id: "token", label: "Token" },
  { id: "activity", label: "Activity" },
];

export default function App() {
  const [networkId, setNetworkId] = useState<NetworkId>(DEFAULT_NETWORK);
  const network = NETWORKS[networkId];
  const conn = useMemo(() => new Connection(network.rpc, "confirmed"), [network.rpc]);

  const [page, setPage] = useState<Page>("overview");
  const [owner, setOwner] = useState<PublicKey | null>(null);
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [mintActivity, setMintActivity] = useState<Activity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const [netOpen, setNetOpen] = useState(false);
  const toastTimer = useRef<number>();
  const wallet = getProvider();

  const notify = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    setToast({ text, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  // токен — при смене сети
  useEffect(() => {
    let alive = true;
    setInfo(null);
    setInfoError(null);
    setBalance(null);
    setActivity(null);
    setMintActivity(null);
    if (!network.mint) {
      setInfoError(`Токен для ${network.label} ещё не создан. Запусти: npm run create-token -- --url ${network.id}`);
      return;
    }
    loadTokenInfo(conn, new PublicKey(network.mint))
      .then((i) => alive && setInfo(i))
      .catch((e) =>
        alive &&
        setInfoError(
          network.id === "localnet"
            ? `Нет связи с локальным валидатором — он запущен? (${e.message ?? e})`
            : `Не удалось загрузить токен: ${e.message ?? e}`
        )
      );
    return () => {
      alive = false;
    };
  }, [conn, network]);

  const refresh = useCallback(async () => {
    if (!info) return;
    setLoading(true);
    try {
      const [mintAct] = await Promise.all([
        loadActivity(conn, info.mint, info.mint, owner, 8),
        owner
          ? Promise.all([loadBalance(conn, info.mint, owner), loadActivity(conn, ataOf(info.mint, owner), info.mint, owner, 8)]).then(
              ([b, a]) => {
                setBalance(b);
                setActivity(a);
              }
            )
          : Promise.resolve(),
      ]);
      setMintActivity(mintAct);
    } catch (e) {
      notify(`Ошибка загрузки: ${(e as Error).message}`, "err");
    } finally {
      setLoading(false);
    }
  }, [conn, info, owner, notify]);

  useEffect(() => {
    if (!owner) {
      setBalance(null);
      setActivity(null);
    }
    refresh();
  }, [refresh, owner]);

  const connect = useCallback(async () => {
    if (!wallet) {
      window.open("https://phantom.com/download", "_blank");
      notify("Установите Phantom и обновите страницу", "err");
      return;
    }
    try {
      const res = await wallet.connect();
      setOwner(new PublicKey(res.publicKey.toString()));
      notify("Кошелёк подключён");
    } catch (e) {
      const err = e as { message?: string; code?: number };
      console.error("Phantom connect error:", e);
      notify(`Phantom: ${err?.message ?? String(e)}${err?.code ? ` (код ${err.code})` : ""}`, "err");
    }
  }, [wallet, notify]);

  const disconnect = async () => {
    await wallet?.disconnect();
    setOwner(null);
  };

  useEffect(() => {
    if (!wallet) return;
    const onAcc = (pk: unknown) => setOwner(pk ? new PublicKey(String(pk)) : null);
    const onDisc = () => setOwner(null);
    wallet.on("accountChanged", onAcc);
    wallet.on("disconnect", onDisc);
    return () => {
      wallet.off?.("accountChanged", onAcc);
      wallet.off?.("disconnect", onDisc);
    };
  }, [wallet]);

  const state: AppState = {
    network, conn, wallet, owner, info, infoError, balance, activity, mintActivity, loading,
    go: setPage, connect, refresh, notify,
  };

  // бегущая строка с живыми данными токена
  const ticker = info
    ? [
        `${info.symbol} / ${info.name}`,
        `SUPPLY ${formatAmount(info.supply, info.decimals, 0)}`,
        `DECIMALS ${info.decimals}`,
        `MINT ${short(info.mint.toBase58(), 5)}`,
        `PROGRAM TOKEN-2022`,
        `NETWORK ${network.id.toUpperCase()}`,
        ...(owner && balance !== null ? [`YOUR BALANCE ${formatAmount(balance, info.decimals)}`] : []),
      ]
    : [`ILYA TOKEN`, `TOKEN-2022`, `NETWORK ${network.id.toUpperCase()}`, infoError ? "TOKEN NOT FOUND" : "LOADING…"];

  return (
    <div className="app">
      <header className="top">
        <button className="logo" onClick={() => setPage("overview")}>
          <Mark size={34} />
          <span>ILYA</span>
          <em>Token-2022</em>
        </button>

        <nav className="seg">
          {NAV.map((n) => (
            <button key={n.id} className={page === n.id ? "on" : ""} onClick={() => setPage(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="top-right">
          <div className="net">
            <button className="net-btn" onClick={() => setNetOpen((v) => !v)}>
              <span className={"led" + (info ? " live" : infoError ? " off" : "")} />
              {network.id === "devnet" ? "Devnet" : "Localnet"}
              <IconChevronDown size={14} />
            </button>
            {netOpen && (
              <div className="net-menu" onMouseLeave={() => setNetOpen(false)}>
                {Object.values(NETWORKS).map((n) => (
                  <button
                    key={n.id}
                    className={n.id === networkId ? "on" : ""}
                    onClick={() => {
                      setNetworkId(n.id);
                      setNetOpen(false);
                    }}
                  >
                    <b>{n.label}</b>
                    <small>{n.mint ? short(n.mint, 5) : "токен не создан"}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          {owner ? (
            <button className="wallet on" onClick={disconnect} title="Отключить">
              <span className="avatar" />
              <span className="mono">{short(owner.toBase58())}</span>
              <IconLogout size={15} />
            </button>
          ) : (
            <button className="wallet" onClick={connect}>
              <IconWallet size={16} /> Connect
            </button>
          )}
        </div>
      </header>

      <div className="ticker" aria-hidden>
        <div className="ticker-track">
          {[0, 1].map((k) => (
            <span key={k}>
              {ticker.map((t, i) => (
                <span key={i} className="tick">
                  {t}
                  <i>✦</i>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <main className="main">
        {infoError && <div className="alert">{infoError}</div>}
        {page === "overview" && <Overview s={state} />}
        {page === "send" && <SendPage s={state} />}
        {page === "token" && <TokenPage s={state} />}
        {page === "activity" && <ActivityPage s={state} />}
      </main>

      <footer className="foot">
        <span><Mark size={18} /> ILYA — personal token on Solana</span>
        <span className="mono">{network.rpc}</span>
      </footer>

      {toast && <div className={"toast " + toast.kind}>{toast.text}</div>}
    </div>
  );
}
