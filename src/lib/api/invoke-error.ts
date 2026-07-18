/** Message d'erreur renvoyé par `invoke` Tauri (souvent une chaîne, pas une instance Error). */
export function invokeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
