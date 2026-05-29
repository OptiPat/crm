# Sécurité Git — avant de passer le repo en public

## Règle d’or

**Git = code + installateurs.**  
**Jamais** : bases SQLite, `auth.json`, clés privées, exports Excel avec vrais clients.

Les données de production vivent uniquement ici :

```
%APPDATA%\com.patrimoine-crm.app\
├── patrimoine-crm.db
├── auth.json
└── backups\
```

---

## Comment ne pas committer une base

### 1. `.gitignore` (déjà configuré)

Ces motifs sont ignorés :

- `*.db`, `*.db-wal`, `*.db-shm`
- `auth.json`, `*.key`, `.env`

Même si vous faites `git add .`, Git **refuse** d’ajouter une `.db` à la racine du projet.

### 2. Vérifier avant chaque commit

```powershell
cd D:\crm
git status
```

Si vous voyez `patrimoine-crm.db` ou `auth.json` → **ne pas committer**.

Test rapide :

```powershell
git check-ignore -v patrimoine-crm.db
# doit afficher une règle .gitignore
```

### 3. Ne pas copier la base dans le dossier du projet

Évitez :

```
D:\crm\patrimoine-crm.db   ← risque si .gitignore supprimé par erreur
```

La vraie base est dans `%APPDATA%`, pas dans `D:\crm`.

### 4. Si une base a été commitée par accident

```powershell
git rm --cached patrimoine-crm.db
git commit -m "Retire la base de données du dépôt"
```

Si elle était dans l’historique : contacter pour purge d’historique (`git filter-repo`) avant de passer en public.

---

## Checklist avant « Public »

| Vérification | Statut attendu |
|--------------|----------------|
| Aucun `.db` dans `git ls-files` | OK |
| Aucun `auth.json` / `.key` / `.env` trackés | OK |
| Historique git sans `.db` | OK |
| Fichiers Excel avec données réelles | À retirer du repo (voir ci-dessous) |
| Clé privée MAJ (`~\.tauri\patrimoine-crm.key`) | Hors repo |

---

## Fichiers Excel

Tous les `*.xlsx` sont ignorés par git. Modèle filleuls : regénérer avec `.\generate-template-filleuls.ps1`.
