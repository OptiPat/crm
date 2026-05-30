# Instructions pour les agents (Cursor)

## Vérification — tu l'exécutes, pas l'utilisateur

Après des changements de code, lance **automatiquement** (Shell, sans demander à l'humain) :

```powershell
cd D:\crm
npm run verify
```

- Modifications **uniquement frontend** : `npm run verify:quick`
- Gros changement build : `npm run verify:full`

Scripts : `verify.ps1` (Windows), `scripts/verify.sh` (Unix).

Règles Cursor : `.cursor/rules/shell-commands.mdc` (commandes), `delegation.mdc` (shell vs subagent), `architecture.mdc` (structure + lints), `verification-automatique.mdc` (verify obligatoire).

Pas de `git commit` / `git push` sauf demande explicite.

## Dev local (humain)

L'utilisateur lance l'app avec `.\dev.ps1` — ce n'est pas une étape agent.
