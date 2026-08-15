import { useCallback, useRef, useState } from "react";
import {
  buildSynthesePatrimonialePdfBytes,
  downloadSynthesePatrimonialePdf,
  shareOrDownloadPdf,
  synthesePdfDownloadFilename,
} from "@/lib/espace-client/synthese-patrimoniale-pdf-export";
import type { SynthesePdfModel } from "@/lib/espace-client/synthese-patrimoniale-pdf";

export function useSynthesePrintExport() {
  const [previewModel, setPreviewModel] = useState<SynthesePdfModel | null>(null);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const busyRef = useRef(false);
  const previewGen = useRef(0);

  const printSynthese = useCallback(
    async (doc: SynthesePdfModel, options?: { preview?: boolean }) => {
      if (options?.preview) {
        const gen = ++previewGen.current;
        setPreviewModel(doc);
        setPreviewBytes(null);
        void buildSynthesePatrimonialePdfBytes(doc)
          .then((bytes) => {
            if (previewGen.current === gen) setPreviewBytes(bytes);
          })
          .catch(() => {
            /* le bouton Partager restera inactif */
          });
        return;
      }
      if (busyRef.current) return;
      busyRef.current = true;
      setIsPrinting(true);
      try {
        await downloadSynthesePatrimonialePdf(doc);
      } finally {
        busyRef.current = false;
        setIsPrinting(false);
      }
    },
    []
  );

  const closePreview = useCallback(() => {
    previewGen.current += 1;
    setPreviewModel(null);
    setPreviewBytes(null);
  }, []);

  const sharePreview = useCallback(async () => {
    if (!previewModel || busyRef.current) return;
    busyRef.current = true;
    setIsPrinting(true);
    try {
      const bytes =
        previewBytes ?? (await buildSynthesePatrimonialePdfBytes(previewModel));
      await shareOrDownloadPdf(bytes, synthesePdfDownloadFilename(previewModel));
    } finally {
      busyRef.current = false;
      setIsPrinting(false);
    }
  }, [previewModel, previewBytes]);

  return {
    printSynthese,
    previewModel,
    previewReady: previewBytes != null,
    closePreview,
    sharePreview,
    isPrinting,
  };
}
