/// <reference types="vite/client" />

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const src: string;
  export default src;
}

declare module "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url" {
  const src: string;
  export default src;
}

declare module "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
declare module "pdfjs-dist/legacy/build/pdf.mjs";

interface PromiseConstructor {
  withResolvers<T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
}
