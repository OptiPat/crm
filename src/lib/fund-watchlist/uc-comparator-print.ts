import type { CompareResponse } from "@/lib/api/tauri-uc-comparator";

export type UcComparatorPrintDocument = {
  response: CompareResponse;
  generatedAt: number;
};
