import { USDC_MINT } from "./xstocks";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

/**
 * Reads a wallet's USDC balance with a plain RPC call. Public information,
 * so no key material is needed; the engine uses this for the pre-trade
 * balance check and equity snapshots without decrypting the wallet.
 */
export async function fetchUsdcBalance(pubkey: string, rpcUrl?: string): Promise<number | null> {
  try {
    const res = await fetch(rpcUrl ?? DEFAULT_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [pubkey, { mint: USDC_MINT }, { encoding: "jsonParsed" }],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      result?: {
        value?: {
          account?: {
            data?: { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } };
          };
        }[];
      };
    };
    const accounts = body.result?.value ?? [];
    let total = 0;
    for (const a of accounts) {
      total += a.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    }
    return total;
  } catch {
    return null;
  }
}
