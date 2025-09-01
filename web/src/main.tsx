import React from "react";

  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./index.css";

  const el = document.getElementById("root");
  if (!el) throw new Error("Root element #root not found");
  createRoot(el).render(<App />);
  