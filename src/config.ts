export type NetworkId = "localnet" | "devnet";

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  rpc: string;
  mint: string | undefined;
  explorerSuffix: string;
}

const env = import.meta.env;

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  localnet: {
    id: "localnet",
    label: "Solana Localnet",
    rpc: "http://127.0.0.1:8899",
    mint: env.VITE_ILYA_MINT_LOCALNET || undefined,
    explorerSuffix: "?cluster=custom&customUrl=" + encodeURIComponent("http://127.0.0.1:8899"),
  },
  devnet: {
    id: "devnet",
    label: "Solana Devnet",
    rpc: "https://api.devnet.solana.com",
    mint: env.VITE_ILYA_MINT_DEVNET || undefined,
    explorerSuffix: "?cluster=devnet",
  },
};

export const DEFAULT_NETWORK: NetworkId =
  (env.VITE_DEFAULT_NETWORK as NetworkId) in NETWORKS ? (env.VITE_DEFAULT_NETWORK as NetworkId) : "localnet";

export const explorerTx = (net: NetworkConfig, sig: string) =>
  `https://explorer.solana.com/tx/${sig}${net.explorerSuffix}`;
export const explorerAddress = (net: NetworkConfig, addr: string) =>
  `https://explorer.solana.com/address/${addr}${net.explorerSuffix}`;
