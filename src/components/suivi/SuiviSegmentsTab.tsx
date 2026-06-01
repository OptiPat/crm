import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAllSegmentsWithCount,
  getContactsMatchingSegment,
  type SegmentWithCount,
} from "@/lib/api/tauri-segments";
import { SuiviEtiquetteContactRow } from "@/components/suivi/SuiviEtiquetteContactRow";
import type { Contact } from "@/lib/api/tauri-contacts";
import { toast } from "sonner";

interface SuiviSegmentsTabProps {
  onOpenContact?: (contactId: number) => void;
}

export function SuiviSegmentsTab({ onOpenContact }: SuiviSegmentsTabProps) {
  const [segments, setSegments] = useState<SegmentWithCount[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const loadSegments = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllSegmentsWithCount();
      const actifs = list.filter((s) => s.actif);
      setSegments(actifs);
      setSelectedId((prev) => {
        if (prev && actifs.some((s) => String(s.id) === prev)) return prev;
        return actifs.length > 0 ? String(actifs[0].id) : "";
      });
    } catch {
      toast.error("Impossible de charger les segments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSegments();
  }, [loadSegments]);

  useEffect(() => {
    if (!selectedId) {
      setContacts([]);
      return;
    }
    const id = parseInt(selectedId, 10);
    if (Number.isNaN(id)) return;
    setLoadingContacts(true);
    getContactsMatchingSegment(id)
      .then(setContacts)
      .catch(() => {
        toast.error("Erreur chargement contacts");
        setContacts([]);
      })
      .finally(() => setLoadingContacts(false));
  }, [selectedId]);

  const selected = segments.find((s) => String(s.id) === selectedId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Par segment
        </CardTitle>
        <CardDescription>
          Tous les contacts qui correspondent à la règle du segment (avec ou sans étiquette posée).
        </CardDescription>
        <div className="pt-3 max-w-md">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un segment" />
            </SelectTrigger>
            <SelectContent>
              {segments.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.nom} ({s.contact_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Chargement…</p>
        ) : segments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Aucun segment actif. Créez-en sur la page Étiquettes.
          </p>
        ) : loadingContacts ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Chargement des contacts…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Aucun contact ne correspond à « {selected?.nom} ».
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
              <Users className="h-3.5 w-3.5" />
              {contacts.length} contact{contacts.length > 1 ? "s" : ""}
            </p>
            {contacts.map((c) => (
              <SuiviEtiquetteContactRow
                key={c.id}
                contact={c}
                onOpenContact={
                  onOpenContact && c.id != null
                    ? () => onOpenContact(c.id!)
                    : undefined
                }
              />
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-4 px-0"
          onClick={() => void loadSegments()}
        >
          Actualiser la liste
        </Button>
      </CardContent>
    </Card>
  );
}
