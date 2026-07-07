import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ensurePdfJsEnvironment } from "@/lib/pdf/pdfjs-setup";
import App from "./App";
import "./styles/globals.css";

ensurePdfJsEnvironment();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
