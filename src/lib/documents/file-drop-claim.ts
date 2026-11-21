/**
 * Dépôt de fichiers (drag & drop Tauri) : une fenêtre d'import ouverte « réserve » le dépôt
 * pour que la page en arrière-plan (ex. Documents) ne le traite pas en double.
 */
let claims = 0;

export function claimFileDrop(): () => void {
  claims += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims = Math.max(0, claims - 1);
  };
}

export function isFileDropClaimed(): boolean {
  return claims > 0;
}
