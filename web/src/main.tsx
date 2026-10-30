import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PxlKitSurfaceProvider } from "@pxlkit/ui-kit";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./index.css";

if (import.meta.env.PROD) registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PxlKitSurfaceProvider surface="linear">
      <App />
    </PxlKitSurfaceProvider>
  </StrictMode>,
);
