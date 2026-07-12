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
const PIPE_CONTACT_CATEGORIES = [
  { value: "SUSPECT_CLIENT", label: "Suspect client" },
  { value: "PROSPECT_CLIENT", label: "Prospect client" },
  { value: "CLIENT", label: "Client" },
] as const;

interface PipeQuickContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pré-remplissage depuis la recherche contact (nom saisi). */
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

export function PipeQuickContactDialog({
  open,
  onOpenChange,
  initialSearch = "",
  onCreated,
}: PipeQuickContactDialogProps) {
  const hint = splitSearchHint(initialSearch);
  const [nom, setNom] = useState(hint.nom);
  const [prenom, setPrenom] = useState(hint.prenom);
  const [categorie, setCategorie] = useState<string>("PROSPECT_CLIENT");
  const [registre, setRegistre] = useState<"TU" | "VOUS">("VOUS");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [loading, setLoading] = useState(false);

  const resetFromSearch = (search: string) => {
    const next = splitSearchHint(search);
    setNom(next.nom);
    setPrenom(next.prenom);
    setCategorie("PROSPECT_CLIENT");
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
        categorie,
        registre,
        email: email.trim() || undefined,
        telephone: telephone.trim() || undefined,
        statut_suivi: "ACTIF",
      });
      const contact: Contact = {
        ...created,
        prenom: prenom.trim(),
        nom: nom.trim().toUpperCase(),
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
            Création rapide depuis Pipe — vous pourrez compléter la fiche plus tard.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Prénom *</Label>
              <Input
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input
                value={nom}
                onChange={(e) => setNom(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2 min-w-[10rem] flex-1">
              <Label>Catégorie</Label>
              <Select value={categorie} onValueChange={setCategorie}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPE_CONTACT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Registre</Label>
              <ContactRegistreToggle
                value={registre}
                onChange={setRegistre}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">            <div className="space-y-2">
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
