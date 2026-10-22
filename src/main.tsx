import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import "@fontsource-variable/comfortaa";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/plus-jakarta-sans";
import { ensurePdfJsPolyfills } from "@/lib/pdf/pdfjs-polyfills";
import App from "./App";
import "./styles/globals.css";

ensurePdfJsPolyfills();

// Les messages d'erreur restent 10 s (sonner n'a pas de durée par type) ; `duration` explicite prioritaire.
const showErrorToast = toast.error;
toast.error = (message, data) => showErrorToast(message, { duration: 10_000, ...data });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
