import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GitBranch, Settings, Users2 } from "lucide-react";
import { toast } from "sonner";
import { getAllContacts, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { contactFilleulRankUpdatePayload, contactFilleulVolumeUpdatePayload, contactFilleulManagerVolumeUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import {
  buildOrganisationTree,
  collectOrganisationContactIds,
} from "@/lib/organisation/organisation-tree";
import { OrganisationTreeView } from "@/components/organisation/OrganisationTreeView";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { requestOpenParametres } from "@/lib/navigation/app-navigation";

type OrganisationProps = {
  onNavigate?: (page: string) => void;
};

export function Organisation({ onNavigate }: OrganisationProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [cgp, setCgp] = useState<CgpConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [loadedContacts, loadedCgp] = await Promise.all([
        getAllContacts(),
        getCgpConfig(),
      ]);
      setContacts(loadedContacts);
      setCgp(loadedCgp);
    } catch (error) {
      console.error("Error loading organisation:", error);
      toast.error("Impossible de charger l'organisation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEventAutoRefresh(loadData, subscribeContactsChanged);

  const tree = useMemo(
    () => buildOrganisationTree(contacts, cgp ?? {}),
    [contacts, cgp]
  );

  const organisationContactIds = useMemo(() => collectOrganisationContactIds(tree), [tree]);

  const { openContactSheet, sheet: contactDetailSheet, activeContactId } =
    useContactDetailSheet({
      onNavigate,
      onUpdate: () => void loadData(),
    });

  const handleNodeClick = useCallback(
    (contact: Contact) => {
      void openContactSheet(contact.id, organisationContactIds);
    },
    [openContactSheet, organisationContactIds]
  );

  const handleParrainClick = useCallback(
    (parrainId: number) => {
      void openContactSheet(parrainId, organisationContactIds);
    },
    [openContactSheet, organisationContactIds]
  );

  const handleRankSave = useCallback(
    async (
      contact: Contact,
      ranks: { filleul_titre?: string | null; filleul_qualification?: string | null }
    ) => {
      try {
        await updateContact(contact.id, contactFilleulRankUpdatePayload(contact, ranks));
        toast.success("Titre et qualification enregistrés");
      } catch (error) {
        console.error("Error saving filleul ranks:", error);
        toast.error("Impossible d'enregistrer le titre");
        throw error;
      }
    },
    []
  );

  const handleVolumeSave = useCallback(
    async (contact: Contact, volume: number | null) => {
      try {
        await updateContact(contact.id, contactFilleulVolumeUpdatePayload(contact, volume));
        toast.success("Volume exercice enregistré");
      } catch (error) {
        console.error("Error saving filleul volume:", error);
        toast.error("Impossible d'enregistrer le volume");
        throw error;
      }
    },
    []
  );

  const handleManagerVolumeSave = useCallback(
    async (contact: Contact, volume: number | null) => {
      try {
        await updateContact(
          contact.id,
          contactFilleulManagerVolumeUpdatePayload(contact, volume)
        );
        toast.success("Objectif Manager enregistré");
      } catch (error) {
        console.error("Error saving manager volume:", error);
        toast.error("Impossible d'enregistrer l'objectif Manager");
        throw error;
      }
    },
    []
  );

  const missingSelfContact = !loading && tree.selfContact == null;

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" aria-hidden />
            Organisation
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Réseau filleuls et parrains.
          </p>
        </div>
        {!loading && tree.stats.total > 0 && (
          <div className="flex gap-1.5 text-xs shrink-0">
            <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70 px-2.5 py-0.5 tabular-nums">
              {tree.stats.actifs} actif{tree.stats.actifs > 1 ? "s" : ""}
            </span>
            <span className="rounded-full bg-muted text-muted-foreground border px-2.5 py-0.5 tabular-nums">
              {tree.stats.desinscrits} désinscrit{tree.stats.desinscrits > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {missingSelfContact && (
        <Card className="border-amber-200/80 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fiche contact introuvable</CardTitle>
            <CardDescription>
              Votre prénom et nom (Paramètres → Profil) doivent correspondre à une fiche
              contact pour ancrer l&apos;arbre. L&apos;import Mon Organisation depuis
              Contacts peut aussi peupler le réseau.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {onNavigate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  requestOpenParametres("profil", {
                    setCurrentPage: onNavigate,
                    currentPage: "organisation",
                  })
                }
              >
                <Settings className="h-4 w-4" />
                Ouvrir Paramètres
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 py-3 px-4 space-y-0">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users2 className="h-4 w-4 text-primary" aria-hidden />
              Filleuls et parrains
            </CardTitle>
            {!loading && tree.stats.total > 0 && (
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {tree.stats.actifs} actif{tree.stats.actifs > 1 ? "s" : ""}
                {tree.stats.desinscrits > 0 &&
                  ` · ${tree.stats.desinscrits} désinscrit${tree.stats.desinscrits > 1 ? "s" : ""}`}
              </span>
            )}
          </div>
          <CardDescription className="text-xs mt-1">
            Molette = zoom · glisser le fond · niveau 5+ repliées
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-6 text-center">Chargement…</p>
          ) : tree.selfContact &&
            tree.generations.length === 0 &&
            tree.upline.length === 0 &&
            tree.desinscrits.length === 0 ? (
            <p className="text-sm text-muted-foreground p-8 text-center">
              Aucun filleul ni parrain enregistré pour le moment.
            </p>
          ) : (
            <OrganisationTreeView
              tree={tree}
              contacts={contacts}
              onNodeClick={handleNodeClick}
              onParrainClick={handleParrainClick}
              onRankSave={handleRankSave}
              onVolumeSave={handleVolumeSave}
              onManagerVolumeSave={handleManagerVolumeSave}
              selectedContactId={activeContactId}
            />
          )}
        </CardContent>
      </Card>

      {contactDetailSheet}
    </div>
  );
}
