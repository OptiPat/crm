import { createWorker, type Worker } from "tesseract.js";

let sharedWorker: Worker | null = null;

export async function getOcrWorker(): Promise<Worker> {
  if (!sharedWorker) {
    sharedWorker = await createWorker("fra", 1, {
      logger: () => {},
    });
  }
  return sharedWorker;
}

export async function terminateOcrWorker(): Promise<void> {
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
  }
}
