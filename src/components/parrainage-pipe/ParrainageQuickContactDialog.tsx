import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createContact, type Contact } from "@/lib/api/tauri-contacts";
import { ContactRegistreToggle } from "@/components/contacts/ContactRegistreSwitch";
import { toast } from "sonner";

const PARRAINAGE_CONTACT_CATEGORIES = [
  { value: "SUSPECT_FILLEUL", label: "Suspect filleul" },
  { value: "PROSPECT_FILLEUL", label: "Prospect filleul" },
  { value: "FILLEUL", label: "Filleul" },
] as const;

interface ParrainageQuickContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSearch?: string;
  onCreated: (contact: Contact) => void;
}

function splitSearchHint(search: string): { prenom: string; nom: string } {
  const parts = search.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { prenom: "", nom: "" };
  if (parts.length === 1) return { prenom: "", nom: parts[0]!.toUpperCase() };
  return {
    prenom: parts[0]!,
    nom: parts.slice(1).join(" ").toUpperCase(),
  };
}

export function ParrainageQuickContactDialog({
  open,
  onOpenChange,
  initialSearch = "",
  onCreated,
}: ParrainageQuickContactDialogProps) {
  const hint = splitSearchHint(initialSearch);
  const [nom, setNom] = useState(hint.nom);
  const [prenom, setPrenom] = useState(hint.prenom);
  const [filleulCategorie, setFilleulCategorie] = useState<string>("SUSPECT_FILLEUL");
  const [registre, setRegistre] = useState<"TU" | "VOUS">("VOUS");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [loading, setLoading] = useState(false);

  const resetFromSearch = (search: string) => {
    const next = splitSearchHint(search);
    setNom(next.nom);
    setPrenom(next.prenom);
    setFilleulCategorie("SUSPECT_FILLEUL");
    setRegistre("VOUS");
    setEmail("");
    setTelephone("");
  };

  const handleOpenChange = (next: boolean) => {
    if (next) resetFromSearch(initialSearch);
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!nom.trim()) {
      toast.error("Le nom est obligatoire.");
      return;
    }
    if (!prenom.trim()) {
      toast.error("Le prénom est obligatoire.");
      return;
    }
    setLoading(true);
    try {
      const created = await createContact({
        nom: nom.trim().toUpperCase(),
        prenom: prenom.trim(),
        categorie: "AUCUN",
        filleul_categorie: filleulCategorie,
        registre,
        email: email.trim() || undefined,
        telephone: telephone.trim() || undefined,
        statut_suivi: "ACTIF",
      });
      const contact: Contact = {
        ...created,
        prenom: prenom.trim(),
        nom: nom.trim().toUpperCase(),
        filleul_categorie: filleulCategorie,
      };
      toast.success("Contact créé");
      onCreated(contact);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau contact</DialogTitle>
          <DialogDescription>
            Création rapide depuis le pipe parrainage — vous pourrez compléter la fiche plus tard.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Prénom *</Label>
              <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={nom} onChange={(e) => setNom(e.target.value.toUpperCase())} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2 min-w-[10rem] flex-1">
              <Label>Catégorie filleul</Label>
              <Select value={filleulCategorie} onValueChange={setFilleulCategorie}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARRAINAGE_CONTACT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Registre</Label>
              <ContactRegistreToggle value={registre} onChange={setRegistre} disabled={loading} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="a@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="06 12 34 56 78"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Création…" : "Créer et sélectionner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
