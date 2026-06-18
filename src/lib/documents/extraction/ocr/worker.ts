import { createWorker, type Worker } from "tesseract.js";

let sharedWorker: Worker | null = null;

export async function getOcrWorker(): Promise<Worker> {
  if (!sharedWorker) {
    try {
      sharedWorker = await createWorker("fra", 1, {
        logger: () => {},
      });
    } catch (error) {
      const detail =
        error instanceof Error && error.message
          ? error.message
          : "initialisation OCR impossible (worker Tesseract bloqué par la politique de sécurité)";
      throw new Error(detail);
    }
  }
  return sharedWorker;
}

export async function terminateOcrWorker(): Promise<void> {
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
  }
}
