import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  createSegment,
  updateSegment,
  type SegmentWithCount,
  type NewSegment,
} from "@/lib/api/tauri-segments";
import { ConditionBuilder } from "@/components/etiquettes/ConditionBuilder";
import { SegmentRulePreview } from "@/components/etiquettes/SegmentRulePreview";
import {
  buildRuleTree,
  leafFromLegacy,
  parseRuleTree,
  stringifyRuleTree,
  type RuleLeaf,
  type RuleOp,
} from "@/lib/etiquettes/rule-ast";
import { getAllEtiquettes, type Etiquette } from "@/lib/api/tauri-etiquettes";
import { getCustomFieldDefs, type CustomFieldDef } from "@/lib/api/tauri-custom-fields";

interface SegmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment?: SegmentWithCount | null;
  onSuccess: () => void;
}

export function SegmentForm({ open, onOpenChange, segment, onSuccess }: SegmentFormProps) {
  const [loading, setLoading] = useState(false);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [actif, setActif] = useState(true);
  const [op, setOp] = useState<RuleOp>("and");
  const [children, setChildren] = useState<RuleLeaf[]>([
    leafFromLegacy("DELAI_SANS_CONTACT", { jours: 365, inclure_sans_date: false }, ["CLIENT"]),
  ]);
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);

  useEffect(() => {
    if (open) {
      getAllEtiquettes().then(setEtiquettes).catch(console.error);
      getCustomFieldDefs().then(setCustomFields).catch(console.error);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (segment) {
      setNom(segment.nom);
      setDescription(segment.description ?? "");
      setActif(segment.actif);
      const tree = parseRuleTree(segment.rule_json);
      if (tree) {
        setOp(tree.op);
        setChildren(tree.children);
      }
    } else {
      setNom("");
      setDescription("");
      setActif(true);
      setOp("and");
      setChildren([
        leafFromLegacy("DELAI_SANS_CONTACT", { jours: 365, inclure_sans_date: false }, ["CLIENT"]),
      ]);
    }
  }, [open, segment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) {
      toast.error("Nom obligatoire");
      return;
    }
    if (children.length === 0 || children.some((c) => c.categories.length === 0)) {
      toast.error("Chaque condition doit cibler au moins une catégorie");
      return;
    }
    setLoading(true);
    try {
      const payload: NewSegment = {
        nom: nom.trim(),
        description: description.trim() || null,
        rule_json: stringifyRuleTree(buildRuleTree(children, op)),
        actif,
      };
      if (segment) {
        await updateSegment(segment.id, payload);
        toast.success("Segment modifié");
      } else {
        await createSegment(payload);
        toast.success("Segment créé");
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{segment ? "Modifier le segment" : "Nouveau segment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Actif</Label>
              <Switch checked={actif} onCheckedChange={setActif} />
            </div>
            <ConditionBuilder
              op={op}
              onOpChange={setOp}
              children={children}
              onChange={setChildren}
              etiquettesOptions={etiquettes.map((e) => ({ id: e.id, nom: e.nom }))}
              customFieldsOptions={customFields}
              showPreview={false}
            />
            <SegmentRulePreview op={op} children={children} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
