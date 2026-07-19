import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/comfortaa";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/plus-jakarta-sans";
import { ensurePdfJsEnvironment } from "@/lib/pdf/pdfjs-setup";
import App from "./App";
import "./styles/globals.css";

ensurePdfJsEnvironment();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
