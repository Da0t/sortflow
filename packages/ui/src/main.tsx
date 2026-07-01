import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { api } from "./bridge";
import { useFlowStore } from "./store";

async function boot() {
  const pipeline = await api.getPipeline();
  useFlowStore.getState().loadPipeline(pipeline);
  const root = document.getElementById("root");
  if (root)
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
}

void boot();
