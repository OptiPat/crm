import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Archive,
  FolderOutput,
  HardDrive,
  HelpCircle,
  RotateCcw,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { cleanupOrphanedData, getAllContacts, deleteContact, type Contact } from "@/lib/api/tauri-contacts";
import {
  createManualDbBackup,
  exportFullArchive,
  restoreDbBackup,
  listDbBackups,
  type DbBackupEntry,
} from "@/lib/api/tauri-system";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

type ParametresDatabaseSectionProps = {
  dbPath: string;
  backups: DbBackupEntry[];
  onBackupsChanged?: (backups: DbBackupEntry[]) => void;
};

function Explainer({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground leading-relaxed flex gap-2">
      <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
      <span>{children}</span>
    </p>
  );
}

export function ParametresDatabaseSection({
  dbPath,
  backups,
  onBackupsChanged,
}: ParametresDatabaseSectionProps) {
  const [cleaningUp, setCleaningUp] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [exportingArchive, setExportingArchive] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<DbBackupEntry | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState(false);

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const result = await restoreDbBackup(restoreTarget.name);
      toast.success("Base restaurée", {
        description: result.safety_backup
          ? `Sauvegarde de sécurité : ${result.safety_backup}. Redémarrage…`
          : "Redémarrage de l'application…",
        duration: 8000,
      });
      setRestoreTarget(null);
      await relaunch();
    } catch (error) {
      console.error("Erreur restauration:", error);
      toast.error(
        typeof error === "string"
          ? error
          : "Restauration impossible. Fermez le CRM et réessayez."
      );
    } finally {
      setRestoring(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const path = await createManualDbBackup();
      const updated = await listDbBackups();
      onBackupsChanged?.(updated);
      toast.success("Copie de secours créée", {
        description: path.split(/[\\/]/).pop() ?? path,
      });
    } catch (error) {
      console.error("Erreur backup:", error);
      toast.error("Impossible de créer la copie de secours");
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleExportArchive = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choisir le dossier de destination (clé USB, OneDrive, etc.)",
    });
    if (!selected || typeof selected !== "string") return;

    setExportingArchive(true);
    try {
      const result = await exportFullArchive(selected);
      const fileName = result.zip_path.split(/[\\/]/).pop() ?? result.zip_path;
      toast.success("Archive complète exportée", {
        description: `${fileName} — ${formatBackupSize(result.zip_size)} · ${result.files_included} fichier(s). Votre base actuelle n'a pas été modifiée.`,
        duration: 10000,
      });
    } catch (error) {
      console.error("Erreur export archive:", error);
      toast.error(
        typeof error === "string"
          ? error
          : "Impossible de créer l'archive. Réessayez ou choisissez un autre dossier."
      );
    } finally {
      setExportingArchive(false);
    }
  };

  const handleSearchContacts = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const allContacts = await getAllContacts();
      const query = searchQuery.toLowerCase();
      setSearchResults(
        allContacts.filter(
          (c) =>
            c.nom.toLowerCase().includes(query) || c.prenom.toLowerCase().includes(query)
        )
      );
    } catch (error) {
      console.error("Erreur recherche:", error);
      toast.error("Impossible de rechercher les contacts");
    } finally {
      setSearching(false);
    }
  };

  const handleCleanupOrphaned = async () => {
    setCleaningUp(true);
    try {
      const [foyersDeleted, investmentsDeleted] = await cleanupOrphanedData();
      toast.success("Nettoyage terminé", {
        description: `${foyersDeleted} foyer(s) et ${investmentsDeleted} investissement(s) fantômes supprimé(s).`,
      });
    } catch (error) {
      console.error("Erreur nettoyage:", error);
      toast.error("Erreur lors du nettoyage");
    } finally {
      setCleaningUp(false);
      setCleanupDialogOpen(false);
    }
  };

  const handleConfirmDeleteContact = async () => {
    if (!contactToDelete) return;
    setDeletingContact(true);
    try {
      await deleteContact(contactToDelete.id);
      setSearchResults((prev) => prev.filter((c) => c.id !== contactToDelete.id));
      toast.success(`${contactToDelete.prenom} ${contactToDelete.nom} supprimé`);
      setContactToDelete(null);
    } catch (error) {
      console.error("Erreur suppression:", error);
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeletingContact(false);
    }
  };

  const formatBackupSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  };

  return (
    <>
      <div className="space-y-6">
      <SettingsPanel
        title="Où sont stockées vos données ?"
        description="Tout le CRM vit sur ce PC — rien n'est envoyé sur Internet (sauf vos emails OAuth)."
        action={
          backups.length > 0 ? (
            <Badge variant="secondary" className="font-normal gap-1">
              <Archive className="h-3 w-3" />
              {backups.length} copie{backups.length > 1 ? "s" : ""} de secours
            </Badge>
          ) : null
        }
      >
        <div className="space-y-4">
          <Explainer>
            Le fichier ci-dessous contient tous vos contacts, foyers, investissements et réglages. Les PDF
            sont dans le sous-dossier <code className="text-xs bg-muted px-1 rounded">documents/</code> au
            même emplacement. Chaque copie de secours inclut aussi la connexion Gmail, la config newsletter,
            le verrou mot de passe et le logo (<code className="text-xs bg-muted px-1 rounded">backups/</code>
            ). Vous pouvez aussi exporter tout le dossier applicatif (CRM fermé).
          </Explainer>

          <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <HardDrive className="h-4 w-4 text-primary" />
                Fichier principal
              </div>
              <p className="text-xs font-mono text-muted-foreground break-all leading-relaxed">
                {dbPath || "Chargement…"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={creatingBackup || exportingArchive || !dbPath}
              onClick={() => void handleCreateBackup()}
            >
              <Archive className="h-4 w-4" />
              {creatingBackup ? "Copie en cours…" : "Créer une copie de secours maintenant"}
            </Button>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                <FolderOutput className="h-4 w-4 text-primary" />
                Exporter une archive complète (hors PC)
              </div>
              <Explainer>
                Copie <strong>tout</strong> le dossier applicatif : base, documents PDF, logo,
                mot de passe, connexion email OAuth, newsletter… sur une clé USB, OneDrive, etc.{" "}
                <strong>Votre base actuelle n&apos;est jamais modifiée</strong> — lecture seule via
                une copie cohérente SQLite. Seules les copies locales redondantes (dossier{" "}
                <code className="text-xs bg-muted px-1 rounded">backups/</code>) sont exclues.
              </Explainer>
            </div>
            <Button
              variant="default"
              size="sm"
              className="gap-2"
              disabled={exportingArchive || creatingBackup || !dbPath}
              onClick={() => void handleExportArchive()}
            >
              <FolderOutput className="h-4 w-4" />
              {exportingArchive ? "Export en cours…" : "Exporter vers un dossier externe…"}
            </Button>
          </div>

          {backups.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Copies automatiques de secours</p>
            <Explainer>
                Avant chaque mise à jour du logiciel (et une fois par jour), le CRM duplique votre base, le
                dossier <strong>documents</strong> (PDF), et les fichiers de configuration (Gmail OAuth,
                newsletter, verrou, logo). Ce ne sont pas des exports Excel : des fichiers techniques pour
                revenir en arrière. La restauration remet l&apos;ensemble de la même date si disponible.
              </Explainer>
              <ul className="rounded-xl border divide-y max-h-48 overflow-y-auto text-xs font-mono bg-background">
                {backups.slice(0, 12).map((b) => (
                  <li
                    key={b.name}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-muted-foreground"
                  >
                    <span className="truncate flex-1">{b.name}</span>
                    <span className="shrink-0 tabular-nums">{formatBackupSize(b.size)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      disabled={restoring || creatingBackup}
                      onClick={() => setRestoreTarget(b)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restaurer
                    </Button>
                  </li>
                ))}
              </ul>
              <Explainer>
                La restauration remplace votre base actuelle par la copie choisie. Une sauvegarde
                de sécurité est créée juste avant, puis l&apos;application redémarre automatiquement.
              </Explainer>
            </div>
          )}
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Corriger un doublon de contact"
        description="Uniquement si vous avez créé deux fois la même personne par erreur."
      >
        <div className="space-y-4">
          <Explainer>
            Recherchez par nom ou prénom, vérifiez l&apos;email affiché, puis supprimez la fiche en trop. Les
            vrais clients avec historique ne doivent pas être supprimés ici — préférez la fusion depuis la liste
            Contacts si les deux fiches sont utiles.
          </Explainer>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nom ou prénom…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSearchContacts()}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => void handleSearchContacts()}
                disabled={searching || !searchQuery.trim()}
              >
                {searching ? "Recherche…" : "Rechercher"}
              </Button>
              {searchResults.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSearchResults([]);
                    setSearchQuery("");
                  }}
                  title="Effacer"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {searchResults.length > 0 && (
            <ul className="rounded-xl border divide-y overflow-hidden">
              {searchResults.map((contact) => (
                <li
                  key={contact.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {contact.prenom} {contact.nom}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.categorie || "AUCUN"}
                      {contact.filleul_categorie ? ` · ${contact.filleul_categorie}` : ""}
                      {contact.email ? ` · ${contact.email}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => setContactToDelete(contact)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Supprimer
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {searchResults.length === 0 && searchQuery.trim() && !searching && (
            <p className="text-sm text-muted-foreground">Aucun résultat pour « {searchQuery} ».</p>
          )}
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Nettoyage technique (données « fantômes »)"
        description="Rarement nécessaire — en cas de base incohérente après d'anciennes manipulations."
        className="border-amber-200/50"
      >
        <div className="space-y-4">
          <Explainer>
            Parfois il reste des entrées vides dans la base : un <strong>foyer sans aucun membre</strong>, ou un{" "}
            <strong>investissement</strong> qui ne pointe plus vers aucun contact. Ce bouton supprime uniquement
            ces lignes orphelines — pas vos clients ni leurs placements valides.
          </Explainer>
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
            <li>Ne supprime pas un contact que vous voyez encore dans l&apos;onglet Contacts</li>
            <li>Utile après des imports ratés ou des tests</li>
            <li>Action irréversible sur ces lignes fantômes uniquement</li>
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300"
            onClick={() => setCleanupDialogOpen(true)}
            disabled={cleaningUp}
          >
            <Wrench className="h-4 w-4 mr-1.5" />
            Lancer le nettoyage technique
          </Button>
        </div>
      </SettingsPanel>
      </div>

      <AlertDialog
        open={restoreTarget != null}
        onOpenChange={(open) => !open && !restoring && setRestoreTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurer cette copie de secours ?</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              {restoreTarget && (
                <>
                  <span className="block font-mono text-xs break-all">{restoreTarget.name}</span>
                  <span className="block">
                    Toutes les données actuelles seront remplacées par cette version ({formatBackupSize(restoreTarget.size)}).
                  </span>
                  <span className="block text-sm font-medium text-amber-800">
                    Une copie de la base actuelle sera créée avant la restauration, puis le CRM
                    redémarrera.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={restoring}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmRestore();
              }}
            >
              {restoring ? "Restauration…" : "Restaurer et redémarrer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nettoyer les données fantômes ?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block">
                Le CRM va supprimer uniquement les foyers vides et les investissements sans propriétaire
                reconnu.
              </span>
              <span className="block text-sm">
                Vos contacts et foyers habituels ne sont pas ciblés. Cette action ne peut pas être annulée.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleaningUp}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cleaningUp}
              onClick={(e) => {
                e.preventDefault();
                void handleCleanupOrphaned();
              }}
            >
              {cleaningUp ? "Nettoyage…" : "Confirmer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!contactToDelete}
        onOpenChange={(open) => !open && !deletingContact && setContactToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement ce contact ?</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              {contactToDelete && (
                <>
                  <span className="block">
                    <strong>
                      {contactToDelete.prenom} {contactToDelete.nom}
                    </strong>{" "}
                    et ses données liées (investissements, documents, etc.) seront effacés.
                  </span>
                  <span className="block text-sm">
                    À n&apos;utiliser que pour un doublon ou une fiche créée par erreur.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingContact}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingContact}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDeleteContact();
              }}
            >
              {deletingContact ? "Suppression…" : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
