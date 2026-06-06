import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Home,
  Link2,
  Trash2,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  formatFilleulCategorie,
  getContactDisplayName,
  getNiveauStyles,
  countTreeClients,
  calculateTreePatrimoine,
  type FoyerInfo,
  type PrescripteurNode,
} from "@/lib/prescripteurs/prescripteur-tree";
import {
  formatEuroCentimes,
  getTypeProduitBgColor,
} from "@/lib/investissements/investissement-display";
import { ContactInitialsAvatar } from "@/components/contacts/contacts-ui";
import { cn } from "@/lib/utils";

type PrescripteurTreeViewProps = {
  root: PrescripteurNode;
  foyersInfo: Record<number, FoyerInfo>;
  expandedNodes: Set<number>;
  expandedInvestissements: Set<number>;
  onToggleNode: (id: number) => void;
  onToggleInvestissements: (id: number) => void;
  onNodeClick: (contact: Contact) => void;
  onDeletePrescripteur: (contact: Contact) => void;
  onAddClientRecommande?: (contact: Contact) => void;
  onLinkClient?: (contact: Contact) => void;
  selectedContactId?: number;
};

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function TreeNode({
  node,
  foyersInfo,
  expandedNodes,
  expandedInvestissements,
  onToggleNode,
  onToggleInvestissements,
  onNodeClick,
  onDeletePrescripteur,
  onAddClientRecommande,
  onLinkClient,
  selectedContactId,
}: {
  node: PrescripteurNode;
  foyersInfo: Record<number, FoyerInfo>;
} & Omit<PrescripteurTreeViewProps, "root">) {
  const hasChildren = node.clientsRecommandes.length > 0;
  const isExpanded = expandedNodes.has(node.contact.id);
  const showInvestissements = expandedInvestissements.has(node.contact.id);
  const styles = getNiveauStyles(node.niveau);
  const isFoyerDisplay = !!(node.contact.foyer_id && foyersInfo[node.contact.foyer_id]);
  const brancheClients = countTreeClients(node);
  const branchePatrimoine = calculateTreePatrimoine(node) - node.patrimoine;
  const isSelected = selectedContactId === node.contact.id;
  const displayName = getContactDisplayName(node.contact, foyersInfo);

  return (
    <div className={cn(node.niveau > 0 && "ml-3 sm:ml-4 border-l-2 border-border/50 pl-3 sm:pl-4")}>
      <article
        className={cn(
          "rounded-xl border mb-2 overflow-hidden transition-colors",
          styles.bg,
          styles.border,
          isSelected && "ring-2 ring-primary/40"
        )}
      >
        <div className="flex items-start gap-2 p-2.5 sm:p-3">
          {hasChildren ? (
            <button
              type="button"
              className="p-1.5 rounded-md hover:bg-background/60 shrink-0 mt-0.5"
              onClick={() => onToggleNode(node.contact.id)}
              aria-expanded={isExpanded}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <div className="w-7 shrink-0" />
          )}

          <button
            type="button"
            className="flex flex-1 items-start gap-2.5 min-w-0 text-left rounded-lg hover:bg-background/50 -m-1 p-1 transition-colors group"
            onClick={() => onNodeClick(node.contact)}
          >
            {isFoyerDisplay ? (
              <div className="h-9 w-9 rounded-full bg-sky-100 border border-sky-200 flex items-center justify-center shrink-0">
                <Home className="h-4 w-4 text-sky-700" />
              </div>
            ) : (
              <ContactInitialsAvatar
                prenom={node.contact.prenom}
                nom={node.contact.nom}
                className="h-9 w-9"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className={cn("font-semibold text-sm flex flex-wrap gap-1.5", styles.text)}>
                <span className="group-hover:text-primary transition-colors truncate">
                  {getContactDisplayName(node.contact, foyersInfo)}
                </span>
                {node.contact.categorie === "CLIENT" && (
                  <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Client</Badge>
                )}
                {node.contact.categorie === "PRESCRIPTEUR" && (
                  <Badge className="bg-violet-100 text-violet-800 text-[10px]">
                    Prescripteur
                  </Badge>
                )}
                {node.contact.filleul_categorie && (
                  <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                    {formatFilleulCategorie(node.contact.filleul_categorie)}
                  </Badge>
                )}
              </div>
              <p className="text-xs font-medium text-primary tabular-nums mt-1">
                {formatEuroCentimes(node.patrimoine)} avec moi
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-2 group-hover:text-primary" />
          </button>

          <div
            className="flex flex-row items-center gap-0.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {onAddClientRecommande && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-primary hover:text-primary"
                onClick={() => onAddClientRecommande(node.contact)}
                title={`Nouveau client recommandé par ${displayName}`}
              >
                <UserPlus className="h-3 w-3" />
              </Button>
            )}
            {onLinkClient && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-primary hover:text-primary"
                onClick={() => onLinkClient(node.contact)}
                title={`Lier un contact à ${displayName}`}
              >
                <Link2 className="h-3 w-3" />
              </Button>
            )}
            {node.investissements.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onToggleInvestissements(node.contact.id)}
              >
                {showInvestissements ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                <span className="ml-1 tabular-nums">{node.investissements.length}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onDeletePrescripteur(node.contact)}
              title="Supprimer ce contact"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {hasChildren && (
          <div className="px-3 pb-2 text-[11px] text-muted-foreground flex items-center gap-1.5 border-t border-dashed border-border/40">
            <TrendingUp className="h-3 w-3 shrink-0" />
            Branche : {brancheClients} client{brancheClients > 1 ? "s" : ""} ·{" "}
            {formatEuroCentimes(branchePatrimoine)} apporté
          </div>
        )}

        {showInvestissements && node.investissements.length > 0 && (
          <div className="px-3 pb-3 pt-1 border-t border-dashed border-border/40 space-y-1.5 bg-background/30">
            <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              Investissements
            </p>
            {node.investissements.map((inv) => (
              <div
                key={inv.id}
                className={cn(
                  "flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-lg",
                  inv.isCommun ? "bg-sky-50/80 border border-sky-200/60" : "bg-muted/40"
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <Badge
                    className="text-[10px] text-white px-1.5"
                    style={{
                      backgroundColor: getTypeProduitBgColor(inv.type_produit, inv.origine),
                    }}
                  >
                    {inv.type_produit.replace(/_/g, " ")}
                  </Badge>
                  {inv.isCommun && (
                    <span className="text-[10px] text-sky-700 font-medium">Commun</span>
                  )}
                  {inv.ownerName && !inv.isCommun && (
                    <span className="text-[10px] text-muted-foreground">{inv.ownerName}</span>
                  )}
                  {inv.date_souscription && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(inv.date_souscription)}
                    </span>
                  )}
                </div>
                <span
                  className="font-semibold tabular-nums shrink-0"
                  style={{ color: getTypeProduitBgColor(inv.type_produit, inv.origine) }}
                >
                  {formatEuroCentimes(inv.montant_initial || 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>

      {hasChildren && isExpanded && (
        <div className="space-y-0">
          {node.clientsRecommandes.map((child) => (
            <TreeNode
              key={child.contact.id}
              node={child}
              foyersInfo={foyersInfo}
              expandedNodes={expandedNodes}
              expandedInvestissements={expandedInvestissements}
              onToggleNode={onToggleNode}
              onToggleInvestissements={onToggleInvestissements}
              onNodeClick={onNodeClick}
              onDeletePrescripteur={onDeletePrescripteur}
              onAddClientRecommande={onAddClientRecommande}
              onLinkClient={onLinkClient}
              selectedContactId={selectedContactId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PrescripteurTreeView({
  root,
  foyersInfo,
  expandedNodes,
  expandedInvestissements,
  onToggleNode,
  onToggleInvestissements,
  onNodeClick,
  onDeletePrescripteur,
  onAddClientRecommande,
  onLinkClient,
  selectedContactId,
}: PrescripteurTreeViewProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Clic sur le nom → fiche contact. Sur chaque ligne :{" "}
        <UserPlus className="inline h-3 w-3 -mt-0.5" aria-hidden /> nouveau recommandé,{" "}
        <Link2 className="inline h-3 w-3 -mt-0.5" aria-hidden /> lier un existant — sous
        cette personne (ex. Julien), pas seulement la racine.
      </p>
      <TreeNode
        node={root}
        foyersInfo={foyersInfo}
        expandedNodes={expandedNodes}
        expandedInvestissements={expandedInvestissements}
        onToggleNode={onToggleNode}
        onToggleInvestissements={onToggleInvestissements}
        onNodeClick={onNodeClick}
        onDeletePrescripteur={onDeletePrescripteur}
        onAddClientRecommande={onAddClientRecommande}
        onLinkClient={onLinkClient}
        selectedContactId={selectedContactId}
      />
    </div>
  );
}
