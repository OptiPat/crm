# Instructions pour les agents (Cursor)

## Vérification — tu l'exécutes, pas l'utilisateur

Après des changements de code, lance **automatiquement** (Shell, sans demander à l'humain) **une** vérification selon les fichiers modifiés :

```powershell
cd D:\crm
npm run verify:quick   # défaut : modifs src/** seulement (pas Cargo)
npm run verify         # si src-tauri/** ou Cargo modifié
npm run verify:full    # release / build Vite
```

Arbre complet et règles : `.cursor/rules/verification-automatique.mdc`.

Scripts : `verify.ps1` (Windows), `scripts/verify.sh` (Unix).

Règles Cursor : `shell-commands.mdc` (commandes), `delegation.mdc` (shell vs subagent), `architecture.mdc` (structure + lints).

Pas de `git commit` / `git push` sauf demande explicite.

## Dev local (humain)

L'utilisateur lance l'app avec `.\dev.ps1` — ce n'est pas une étape agent.
