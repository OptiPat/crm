import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/comfortaa";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/plus-jakarta-sans";
import { ensurePdfJsPolyfills } from "@/lib/pdf/pdfjs-polyfills";
import App from "./App";
import "./styles/globals.css";

ensurePdfJsPolyfills();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
