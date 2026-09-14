/**
 * Backed Finance xStocks on Solana mainnet.
 * Mint addresses are the source of truth for swaps; tickers are the UX.
 */
export interface XStock {
  ticker: string;
  symbol: string;
  name: string;
  mint: string;
}

export const XSTOCKS: XStock[] = [
  { ticker: "AAPL", symbol: "AAPLx", name: "Apple", mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp" },
  { ticker: "TSLA", symbol: "TSLAx", name: "Tesla", mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB" },
  { ticker: "NVDA", symbol: "NVDAx", name: "NVIDIA", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh" },
  { ticker: "SPY", symbol: "SPYx", name: "SPDR S&P 500", mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W" },
  { ticker: "META", symbol: "METAx", name: "Meta Platforms", mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu" },
  { ticker: "GOOGL", symbol: "GOOGLx", name: "Alphabet", mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN" },
  { ticker: "MSFT", symbol: "MSFTx", name: "Microsoft", mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX" },
  { ticker: "AMZN", symbol: "AMZNx", name: "Amazon", mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg" },
  { ticker: "QQQ", symbol: "QQQx", name: "Invesco QQQ", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ" },
  { ticker: "CRCL", symbol: "CRCLx", name: "Circle", mint: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1" },
];

/** Accepts "AAPL" or "AAPLx" (any case). */
export function xstockByTicker(ticker: string): XStock | undefined {
  const t = ticker.toUpperCase();
  return XSTOCKS.find((s) => s.ticker === t || s.symbol.toUpperCase() === t);
}

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
