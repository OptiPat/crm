import { PSM } from "tesseract.js";
import { getOcrWorker } from "@/lib/documents/extraction/ocr/worker";

export type OcrMode = "visual" | "mrz";

const MRZ_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

export async function recognizeDataUrl(dataUrl: string, mode: OcrMode): Promise<string> {
  const worker = await getOcrWorker();

  if (mode === "mrz") {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: MRZ_WHITELIST,
    });
  } else {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      tessedit_char_whitelist: "",
    });
  }

  const { data } = await worker.recognize(dataUrl, {}, { text: true });
  return data.text ?? "";
}
