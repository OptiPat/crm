import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createContact, updateContact, getAllContacts, type NewContact, type Contact } from "@/lib/api/tauri-contacts";

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSuccess: () => void;
}

export function ContactForm({ open, onOpenChange, contact, onSuccess }: ContactFormProps) {
  const [loading, setLoading] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [searchParrain, setSearchParrain] = useState("");
  const [searchPrescripteur, setSearchPrescripteur] = useState("");
  const [showNewPrescripteurModal, setShowNewPrescripteurModal] = useState(false);
  const [newPrescripteurNom, setNewPrescripteurNom] = useState("");
  const [newPrescripteurPrenom, setNewPrescripteurPrenom] = useState("");
  // 🔥 Modal création parrain
  const [showNewParrainModal, setShowNewParrainModal] = useState(false);
  const [newParrainNom, setNewParrainNom] = useState("");
  const [newParrainPrenom, setNewParrainPrenom] = useState("");

  // Charger tous les contacts pour la sélection du parrain
  useEffect(() => {
    let retryCount = 0;
    const loadContacts = async () => {
      try {
        const contacts = await getAllContacts();
        setAllContacts(contacts);
      } catch (error) {
        // Réessayer une fois si erreur d'initialisation de la base
        if (retryCount === 0 && error instanceof Error && error.message.includes("Invalid column type")) {
          retryCount++;
          setTimeout(loadContacts, 500);
        } else {
          console.error("Error loading contacts:", error);
        }
      }
    };
    loadContacts();
  }, []);
  
  // Convertir les timestamps/ISO en dates pour les inputs
  const toDateInput = (dateValue: any) => {
    if (!dateValue) return "";
    try {
      // Si c'est un timestamp (number)
      if (typeof dateValue === 'number') {
        const date = new Date(dateValue * 1000);
        if (isNaN(date.getTime())) return "";
        // Utiliser UTC pour éviter les décalages de fuseau horaire
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      // Si c'est déjà une string ISO
      if (typeof dateValue === 'string') {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return "";
        return date.toISOString().split('T')[0];
      }
      return "";
    } catch {
      return "";
    }
  };
  
  const [formData, setFormData] = useState<NewContact>({
    categorie: "SUSPECT_CLIENT",
    nom: "",
    prenom: "",
    email: "",
    telephone: "",
    adresse: "",
    code_postal: "",
    ville: "",
    date_naissance: "",
    profession: "",
    source_lead: "",
    profil_risque_sri: undefined,
    date_dernier_contact: "",
    date_prochain_suivi: "",
    statut_suivi: "ACTIF",
    notes: "",
    parrain_id: undefined,
    prescripteur_id: undefined,
  });

  // Mettre à jour le formData quand le contact change
  useEffect(() => {
    if (contact) {
      // 🔥 Déterminer la bonne catégorie à afficher
      // Si le contact a une filleul_categorie, utiliser ça comme catégorie principale dans le dropdown
      // Sinon, utiliser la categorie standard
      let categorieToShow = contact.categorie || "SUSPECT_CLIENT";
      if (contact.filleul_categorie && (!contact.categorie || contact.categorie === "AUCUN")) {
        // Le contact est principalement un filleul
        categorieToShow = contact.filleul_categorie;
      }
      
      setFormData({
        categorie: categorieToShow,
        parrain_id: contact.parrain_id || undefined,
        prescripteur_id: contact.prescripteur_id || undefined,
        // 🔥 Préserver les liens foyer/famille
        foyer_id: contact.foyer_id || undefined,
        famille_id: contact.famille_id || undefined,
        role_foyer: contact.role_foyer || undefined,
        role_famille: contact.role_famille || undefined,
        // 🔥 Préserver filleul_categorie
        filleul_categorie: contact.filleul_categorie || undefined,
        // 🔥 Préserver dates filleul
        date_dernier_contact_filleul: toDateInput(contact.date_dernier_contact_filleul),
        date_prochain_suivi_filleul: toDateInput(contact.date_prochain_suivi_filleul),
        nom: contact.nom || "",
        prenom: contact.prenom || "",
        email: contact.email || "",
        telephone: contact.telephone || "",
        adresse: contact.adresse || "",
        code_postal: contact.code_postal || "",
        ville: contact.ville || "",
        date_naissance: toDateInput(contact.date_naissance),
        profession: contact.profession || "",
        source_lead: contact.source_lead || "",
        profil_risque_sri: contact.profil_risque_sri || undefined,
        date_dernier_contact: toDateInput(contact.date_dernier_contact),
        date_prochain_suivi: toDateInput(contact.date_prochain_suivi),
        statut_suivi: contact.statut_suivi || "ACTIF",
        notes: contact.notes || "",
      });
    } else {
      // Réinitialiser pour création
      setFormData({
        categorie: "SUSPECT_CLIENT",
        nom: "",
        prenom: "",
        email: "",
        telephone: "",
        adresse: "",
        code_postal: "",
        ville: "",
        date_naissance: "",
        profession: "",
        source_lead: "",
        profil_risque_sri: undefined,
        date_dernier_contact: "",
        date_prochain_suivi: "",
        statut_suivi: "ACTIF",
        notes: "",
        parrain_id: undefined,
        prescripteur_id: undefined,
      });
    }
  }, [contact, open]); // Réinitialiser quand le contact ou l'ouverture change

  // 🔥 Créer un nouveau parrain s'il n'existe pas
  const handleCreateParrain = async () => {
    if (!newParrainNom.trim() || !newParrainPrenom.trim()) {
      alert("Veuillez remplir le nom et le prénom");
      return;
    }
    try {
      const newParrain = await createContact({
        nom: newParrainNom.trim(),
        prenom: newParrainPrenom.trim(),
        categorie: "AUCUN", // Pas forcément client
        filleul_categorie: "FILLEUL", // Mais fait partie du réseau filleuls
      });
      setAllContacts([...allContacts, newParrain]);
      setFormData({ ...formData, parrain_id: newParrain.id });
      setShowNewParrainModal(false);
      setNewParrainNom("");
      setNewParrainPrenom("");
    } catch (error) {
      console.error("Erreur création parrain:", error);
      alert("Erreur lors de la création du parrain");
    }
  };

  // Créer un nouveau prescripteur s'il n'existe pas
  const handleCreatePrescripteur = async () => {
    if (!newPrescripteurNom.trim() || !newPrescripteurPrenom.trim()) {
      alert("Veuillez remplir le nom et le prénom");
      return;
    }
    
    try {
      // Créer le prescripteur avec catégorie "PRESCRIPTEUR" (n'apparaît pas dans Clients/Filleuls)
      const newPrescripteur = await createContact({
        nom: newPrescripteurNom.trim(),
        prenom: newPrescripteurPrenom.trim(),
        categorie: "PRESCRIPTEUR", // Catégorie spéciale, visible uniquement dans l'onglet Prescripteurs
      });
      
      // Ajouter à la liste et le sélectionner
      setAllContacts([...allContacts, newPrescripteur]);
      setFormData({ ...formData, prescripteur_id: newPrescripteur.id });
      
      // Fermer le modal
      setShowNewPrescripteurModal(false);
      setNewPrescripteurNom("");
      setNewPrescripteurPrenom("");
    } catch (error) {
      console.error("Erreur création prescripteur:", error);
      alert("Erreur lors de la création du prescripteur");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Convertir les dates en ISO strings si elles sont fournies
      const dataToSubmit: any = { ...formData };
      
      // Gérer les dates : convertir en ISO UTC ou undefined si vide
      if (formData.date_dernier_contact && formData.date_dernier_contact.trim() !== "") {
        const [year, month, day] = formData.date_dernier_contact.split('-').map(Number);
        const isoDate = new Date(Date.UTC(year, month - 1, day)).toISOString();
        dataToSubmit.date_dernier_contact = isoDate;
      } else {
        dataToSubmit.date_dernier_contact = undefined;
      }
      
      if (formData.date_prochain_suivi && formData.date_prochain_suivi.trim() !== "") {
        const [year, month, day] = formData.date_prochain_suivi.split('-').map(Number);
        const isoDate = new Date(Date.UTC(year, month - 1, day)).toISOString();
        dataToSubmit.date_prochain_suivi = isoDate;
      } else {
        dataToSubmit.date_prochain_suivi = undefined;
      }
      
      if (formData.date_naissance && formData.date_naissance.trim() !== "") {
        const [year, month, day] = formData.date_naissance.split('-').map(Number);
        const isoDate = new Date(Date.UTC(year, month - 1, day)).toISOString();
        dataToSubmit.date_naissance = isoDate;
      } else {
        dataToSubmit.date_naissance = undefined;
      }
      
      if (contact) {
        await updateContact(contact.id, dataToSubmit);
        onSuccess();
      } else {
        await createContact(dataToSubmit);
        onSuccess();
      }
      onOpenChange(false);
      // Réinitialiser le formulaire
      setFormData({
        categorie: "SUSPECT_CLIENT",
        nom: "",
        prenom: "",
        email: "",
        telephone: "",
        adresse: "",
        code_postal: "",
        ville: "",
        date_naissance: "",
        profession: "",
        source_lead: "",
        profil_risque_sri: undefined,
        date_dernier_contact: "",
        date_prochain_suivi: "",
        statut_suivi: "ACTIF",
        notes: "",
      });
    } catch (error) {
      console.error("Error saving contact:", error);
      alert("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {contact ? "Modifier le contact" : "Nouveau contact"}
          </DialogTitle>
          <DialogDescription>
            Remplissez les informations du contact
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Catégorie et Statut */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="categorie">Catégorie *</Label>
              <Select
                value={formData.categorie}
                onValueChange={(value) =>
                  setFormData({ ...formData, categorie: value as any })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT">Client</SelectItem>
                  <SelectItem value="PROSPECT_CLIENT">Prospect client</SelectItem>
                  <SelectItem value="SUSPECT_CLIENT">Suspect client</SelectItem>
                  <SelectItem value="FILLEUL">Filleul</SelectItem>
                  <SelectItem value="PROSPECT_FILLEUL">Prospect filleul</SelectItem>
                  <SelectItem value="SUSPECT_FILLEUL">Suspect filleul</SelectItem>
                  <SelectItem value="FILLEUL_DESINSCRIT">Filleul désinscrit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="statut_suivi">Statut de suivi *</Label>
              <Select
                value={formData.statut_suivi}
                onValueChange={(value) =>
                  setFormData({ ...formData, statut_suivi: value as any })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIF">Actif</SelectItem>
                  <SelectItem value="EN_PAUSE">En pause</SelectItem>
                  <SelectItem value="ARCHIVE">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Champ Parrain (uniquement pour les catégories filleul) - Combobox intelligent */}
          {(formData.categorie === "FILLEUL" || 
            formData.categorie === "PROSPECT_FILLEUL" || 
            formData.categorie === "SUSPECT_FILLEUL" || 
            formData.categorie === "FILLEUL_DESINSCRIT") && (
            <div className="space-y-2">
              <Label htmlFor="parrain_id">Parrain (optionnel)</Label>
              <div className="relative">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      placeholder="🔍 Taper pour rechercher un parrain..."
                      value={searchParrain}
                      onChange={(e) => setSearchParrain(e.target.value)}
                      onFocus={() => setSearchParrain(searchParrain || "")}
                    />
                    
                    {/* Afficher le parrain sélectionné */}
                    {formData.parrain_id && !searchParrain && (
                      <div className="absolute inset-0 flex items-center px-3 pointer-events-none bg-white rounded-md border">
                        <span className="text-sm">
                          ✓ {allContacts.find(c => c.id === formData.parrain_id)?.prenom}{" "}
                          {allContacts.find(c => c.id === formData.parrain_id)?.nom}
                        </span>
                        <button
                          type="button"
                          className="ml-auto pointer-events-auto text-muted-foreground hover:text-foreground"
                          onClick={() => setFormData({ ...formData, parrain_id: undefined })}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    
                    {/* Liste déroulante des résultats de recherche */}
                    {searchParrain && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
                        <div
                          className="px-3 py-2 hover:bg-muted cursor-pointer text-sm border-b"
                          onClick={() => {
                            setFormData({ ...formData, parrain_id: undefined });
                            setSearchParrain("");
                          }}
                        >
                          ❌ Aucun parrain
                        </div>
                        {allContacts
                          .filter((c) => {
                            const search = searchParrain.toLowerCase();
                            return (
                              c.nom.toLowerCase().includes(search) ||
                              c.prenom.toLowerCase().includes(search)
                            );
                          })
                          .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
                          .slice(0, 20)
                          .map((c) => (
                            <div
                              key={c.id}
                              className="px-3 py-2 hover:bg-muted cursor-pointer text-sm flex items-center justify-between"
                              onClick={() => {
                                setFormData({ ...formData, parrain_id: c.id });
                                setSearchParrain("");
                              }}
                            >
                              <span>👤 {c.prenom} {c.nom}</span>
                              <span className="text-xs text-muted-foreground">
                                {c.filleul_categorie || c.categorie}
                              </span>
                            </div>
                          ))}
                        {allContacts.filter((c) => {
                          const search = searchParrain.toLowerCase();
                          return c.nom.toLowerCase().includes(search) || c.prenom.toLowerCase().includes(search);
                        }).length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            Aucun résultat pour "{searchParrain}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowNewParrainModal(true)}
                  >
                    + Nouveau
                  </Button>
                </div>
                
                {/* Mini-modal création parrain */}
                {showNewParrainModal && (
                  <div className="p-4 border rounded-lg bg-muted/50 space-y-3 mt-2">
                    <div className="font-medium">Créer un nouveau parrain</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Nom"
                        value={newParrainNom}
                        onChange={(e) => setNewParrainNom(e.target.value)}
                      />
                      <Input
                        placeholder="Prénom"
                        value={newParrainPrenom}
                        onChange={(e) => setNewParrainPrenom(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={handleCreateParrain}>
                        Créer
                      </Button>
                      <Button 
                        type="button" 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => setShowNewParrainModal(false)}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Champ Prescripteur (pour tous les contacts - qui a recommandé ce client) */}
          <div className="space-y-2">
            <Label htmlFor="prescripteur_id">Prescripteur (qui a recommandé ce contact)</Label>
            <div className="relative">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    placeholder="🔍 Taper pour rechercher un prescripteur..."
                    value={searchPrescripteur}
                    onChange={(e) => setSearchPrescripteur(e.target.value)}
                    onFocus={() => setSearchPrescripteur(searchPrescripteur || "")}
                  />
                  
                  {/* Afficher le prescripteur sélectionné */}
                  {formData.prescripteur_id && !searchPrescripteur && (
                    <div className="absolute inset-0 flex items-center px-3 pointer-events-none bg-white rounded-md border">
                      <span className="text-sm">
                        ✓ {allContacts.find(c => c.id === formData.prescripteur_id)?.prenom}{" "}
                        {allContacts.find(c => c.id === formData.prescripteur_id)?.nom}
                      </span>
                      <button
                        type="button"
                        className="ml-auto pointer-events-auto text-muted-foreground hover:text-foreground"
                        onClick={() => setFormData({ ...formData, prescripteur_id: undefined })}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  
                  {/* Liste déroulante des résultats de recherche */}
                  {searchPrescripteur && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
                      <div
                        className="px-3 py-2 hover:bg-muted cursor-pointer text-sm border-b"
                        onClick={() => {
                          setFormData({ ...formData, prescripteur_id: undefined });
                          setSearchPrescripteur("");
                        }}
                      >
                        ❌ Aucun prescripteur (contact direct)
                      </div>
                      {allContacts
                        .filter((c) => {
                          const search = searchPrescripteur.toLowerCase();
                          return (
                            c.nom.toLowerCase().includes(search) ||
                            c.prenom.toLowerCase().includes(search)
                          );
                        })
                        .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
                        .slice(0, 20)
                        .map((c) => (
                          <div
                            key={c.id}
                            className="px-3 py-2 hover:bg-muted cursor-pointer text-sm flex items-center justify-between"
                            onClick={() => {
                              setFormData({ ...formData, prescripteur_id: c.id });
                              setSearchPrescripteur("");
                            }}
                          >
                            <span>👤 {c.prenom} {c.nom}</span>
                            <span className="text-xs text-muted-foreground">{c.categorie}</span>
                          </div>
                        ))}
                      {allContacts.filter((c) => {
                        const search = searchPrescripteur.toLowerCase();
                        return c.nom.toLowerCase().includes(search) || c.prenom.toLowerCase().includes(search);
                      }).length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Aucun résultat pour "{searchPrescripteur}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowNewPrescripteurModal(true)}
                >
                  + Nouveau
                </Button>
              </div>
              
              {/* Mini-modal création prescripteur */}
              {showNewPrescripteurModal && (
                <div className="p-4 border rounded-lg bg-muted/50 space-y-3 mt-2">
                  <div className="font-medium">Créer un nouveau prescripteur</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Nom"
                      value={newPrescripteurNom}
                      onChange={(e) => setNewPrescripteurNom(e.target.value)}
                    />
                    <Input
                      placeholder="Prénom"
                      value={newPrescripteurPrenom}
                      onChange={(e) => setNewPrescripteurPrenom(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={handleCreatePrescripteur}>
                      Créer
                    </Button>
                    <Button 
                      type="button" 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setShowNewPrescripteurModal(false)}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Nom et Prénom */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nom">Nom *</Label>
              <Input
                id="nom"
                value={formData.nom}
                onChange={(e) =>
                  setFormData({ ...formData, nom: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prenom">Prénom *</Label>
              <Input
                id="prenom"
                value={formData.prenom}
                onChange={(e) =>
                  setFormData({ ...formData, prenom: e.target.value })
                }
                required
              />
            </div>
          </div>

          {/* Email et Téléphone */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ""}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telephone">Téléphone</Label>
              <Input
                id="telephone"
                value={formData.telephone || ""}
                onChange={(e) =>
                  setFormData({ ...formData, telephone: e.target.value })
                }
              />
            </div>
          </div>

          {/* Adresse */}
          <div className="space-y-2">
            <Label htmlFor="adresse">Adresse</Label>
            <Input
              id="adresse"
              value={formData.adresse || ""}
              onChange={(e) =>
                setFormData({ ...formData, adresse: e.target.value })
              }
            />
          </div>

          {/* Code postal et Ville */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code_postal">Code postal</Label>
              <Input
                id="code_postal"
                value={formData.code_postal || ""}
                onChange={(e) =>
                  setFormData({ ...formData, code_postal: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ville">Ville</Label>
              <Input
                id="ville"
                value={formData.ville || ""}
                onChange={(e) =>
                  setFormData({ ...formData, ville: e.target.value })
                }
              />
            </div>
          </div>

          {/* Date de naissance et Profession */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date_naissance">Date de naissance</Label>
              <Input
                id="date_naissance"
                type="date"
                value={formData.date_naissance || ""}
                onChange={(e) =>
                  setFormData({ ...formData, date_naissance: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profession">Profession</Label>
              <Input
                id="profession"
                value={formData.profession || ""}
                onChange={(e) =>
                  setFormData({ ...formData, profession: e.target.value })
                }
              />
            </div>
          </div>

          {/* Source / Lead et Profil risque */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="source_lead">Source / Lead</Label>
              <Input
                id="source_lead"
                value={formData.source_lead || ""}
                onChange={(e) =>
                  setFormData({ ...formData, source_lead: e.target.value })
                }
                placeholder="Ex: Recommandation, Site web..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profil_risque_sri">Profil investisseur (1-7)</Label>
              <Input
                id="profil_risque_sri"
                type="number"
                min="1"
                max="7"
                value={formData.profil_risque_sri || ""}
                onChange={(e) =>
                  setFormData({ ...formData, profil_risque_sri: e.target.value ? parseInt(e.target.value) : undefined })
                }
              />
            </div>
          </div>

          {/* Dates de suivi */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date_dernier_contact">Dernier contact</Label>
              <Input
                id="date_dernier_contact"
                type="date"
                value={formData.date_dernier_contact || ""}
                onChange={(e) =>
                  setFormData({ ...formData, date_dernier_contact: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date_prochain_suivi">Prochain suivi</Label>
              <Input
                id="date_prochain_suivi"
                type="date"
                value={formData.date_prochain_suivi || ""}
                onChange={(e) =>
                  setFormData({ ...formData, date_prochain_suivi: e.target.value })
                }
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : contact ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
