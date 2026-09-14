import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import "./index.css";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID ?? "cmriuk72e00100dkym2vzsn5d";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email"],
        appearance: {
          theme: "light",
          accentColor: "#059669",
        },
        embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>
);
