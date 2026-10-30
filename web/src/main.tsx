import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PxlKitSurfaceProvider } from "@pxlkit/ui-kit";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { applyLook, useLook } from "./lib/theme";
import "./index.css";

applyLook();

function Root() {
  const look = useLook();
  return (
    <PxlKitSurfaceProvider surface={look === "pixel" ? "pixel" : "linear"}>
      <App />
    </PxlKitSurfaceProvider>
  );
}

if (import.meta.env.PROD) registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
