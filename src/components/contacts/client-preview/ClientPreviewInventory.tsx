import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";
import {
  getPatrimoineCategorie,
  PATRIMOINE_CATEGORIE_COLORS,
  PATRIMOINE_CATEGORIE_ORDER,
  type PatrimoineCategorie,
} from "@/lib/patrimoine/categories";
import { getClientPreviewInvestissementColor } from "@/lib/patrimoine/patrimoine-palette";
import { cn } from "@/lib/utils";
import type { ClientPreviewEmptyState } from "./ClientPreviewHero";
import { ClientPreviewPlacementDetail } from "./ClientPreviewPlacementDetail";
import type {
  ClientInvestissementNatureById,
  ClientInvestissementUpdateInput,
} from "@/lib/espace-client/client-investissement-update";
import type { ClientAvoirDeclarationInput } from "@/lib/espace-client/client-avoir-declaration";
import {
  inventoryOriginDatePrefix,
  inventoryRowLabels,
} from "@/lib/espace-client/client-inventory-labels";
import { ClientPreviewAddAvoir } from "./ClientPreviewAddAvoir";
import type { EvolutionHistoryById } from "./ClientPreviewEvolution";
import { formatShortEuro } from "./client-preview-format";
import { CP } from "./client-preview-theme";

function groupByCategory(
  items: Investissement[]
): Map<PatrimoineCategorie, Investissement[]> {
  const map = new Map<PatrimoineCategorie, Investissement[]>();
  for (const inv of items) {
    const cat = getPatrimoineCategorie(inv.type_produit);
    const list = map.get(cat) ?? [];
    list.push(inv);
    map.set(cat, list);
  }
  for (const [, list] of map) {
    list.sort(
      (a, b) =>
        getEffectiveEncoursCentimes(b) - getEffectiveEncoursCentimes(a)
    );
  }
  return map;
}

/** Date courte côté client (ex. « 24 janv. 2019 »). */
function formatInventoryDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PlacementRow({
  inv,
  partenaireById,
  onSelect,
}: {
  inv: Investissement;
  partenaireById: Map<number, Partenaire>;
  onSelect: (inv: Investissement) => void;
}) {
  const partenaire =
    inv.partenaire_id != null
      ? partenaireById.get(inv.partenaire_id)
      : undefined;
  const amount = getEffectiveEncoursCentimes(inv);
  const { title, subtitle } = inventoryRowLabels({
    typeProduit: inv.type_produit,
    nomProduit: inv.nom_produit,
    partenaireNom: partenaire?.raison_sociale,
  });
  const rowColor = getClientPreviewInvestissementColor(
    inv.type_produit,
    inv.origine
  );

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(inv)}
        className="flex w-full items-start justify-between gap-4 py-3 text-left transition-colors hover:bg-[var(--cp-surface-raised)]/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: rowColor }}
              aria-hidden
            />
            <p className={`${CP.body} truncate`}>{title}</p>
          </div>
          {subtitle ? (
            <p className={`${CP.caption} mt-0.5 truncate`}>{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="text-right">
            <p className={CP.amount}>{formatShortEuro(amount)}</p>
            {inv.encours_date ? (
              <p className={`${CP.caption} mt-0.5`}>
                Au {formatInventoryDate(inv.encours_date)}
              </p>
            ) : null}
            {inv.date_souscription ? (
              <p className={`${CP.caption} mt-0.5`}>
                {inventoryOriginDatePrefix(getPatrimoineCategorie(inv.type_produit))}{" "}
                {formatInventoryDate(inv.date_souscription)}
              </p>
            ) : null}
          </div>
          <ChevronRight
            className="mt-1 h-4 w-4 shrink-0 text-[var(--cp-ink-faint)]"
            aria-hidden
          />
        </div>
      </button>
    </li>
  );
}

function CategorySection({
  category,
  items,
  partenaireById,
  open,
  onToggle,
  onSelect,
}: {
  category: PatrimoineCategorie;
  items: Investissement[];
  partenaireById: Map<number, Partenaire>;
  open: boolean;
  onToggle: () => void;
  onSelect: (inv: Investissement) => void;
}) {
  const color = PATRIMOINE_CATEGORIE_COLORS[category];
  const subtotal = items.reduce(
    (s, inv) => s + getEffectiveEncoursCentimes(inv),
    0
  );

  return (
    <section className={CP.card}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 border-b border-[var(--cp-line-soft)] px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <h4 className={`${CP.categoryTitle} truncate`}>{category}</h4>
          <span className={`${CP.caption} shrink-0`}>({items.length})</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={CP.caption}>{formatShortEuro(subtotal)}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[var(--cp-ink-faint)] transition-transform",
              open && "rotate-180"
            )}
            aria-hidden
          />
        </div>
      </button>
      {open ? (
        <ul className="divide-y divide-[var(--cp-line-soft)] px-4">
          {items.map((inv) => (
            <PlacementRow
              key={inv.id}
              inv={inv}
              partenaireById={partenaireById}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export interface ClientPreviewInventoryProps {
  sortedInventory: Investissement[];
  partenaireById: Map<number, Partenaire>;
  valorisationHistoriesByInvestissementId?: EvolutionHistoryById;
  natureByInvestissementId?: ClientInvestissementNatureById;
  enableScpiTracking?: boolean;
  scpiDeclarationSubmitting?: boolean;
  onSubmitScpiDeclaration?: (
    input: ClientInvestissementUpdateInput
  ) => Promise<void>;
  enableAddAvoir?: boolean;
  avoirSubmitting?: boolean;
  onSubmitAvoir?: (input: ClientAvoirDeclarationInput) => Promise<void>;
  enableRetirerAvoir?: boolean;
  retirerSubmitting?: boolean;
  onRetirerAvoir?: (investissementId: number) => Promise<void>;
  emptyState?: ClientPreviewEmptyState;
}

export function ClientPreviewInventory({
  sortedInventory,
  partenaireById,
  valorisationHistoriesByInvestissementId,
  natureByInvestissementId,
  enableScpiTracking = false,
  scpiDeclarationSubmitting = false,
  onSubmitScpiDeclaration,
  enableAddAvoir = false,
  avoirSubmitting = false,
  onSubmitAvoir,
  enableRetirerAvoir = false,
  retirerSubmitting = false,
  onRetirerAvoir,
  emptyState = null,
}: ClientPreviewInventoryProps) {
  const grouped = useMemo(
    () => groupByCategory(sortedInventory),
    [sortedInventory]
  );

  const sections = useMemo(
    () => PATRIMOINE_CATEGORIE_ORDER.filter((cat) => grouped.has(cat)),
    [grouped]
  );

  const sectionKey = useMemo(() => sections.join("|"), [sections]);

  const [openCategories, setOpenCategories] = useState<
    Set<PatrimoineCategorie>
  >(() => new Set(sections.slice(0, 1)));
  /**
   * L'identifiant, pas la ligne : après un enregistrement le portail recharge
   * la photo, et une copie figée de l'objet aurait continué d'afficher
   * l'ancien encours — le client aurait cru sa saisie perdue, et le formulaire
   * aurait renvoyé des valeurs périmées.
   */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(
    () => sortedInventory.find((inv) => inv.id === selectedId) ?? null,
    [sortedInventory, selectedId]
  );

  useEffect(() => {
    const first = sectionKey.split("|")[0] as PatrimoineCategorie | undefined;
    setOpenCategories(first ? new Set([first]) : new Set());
  }, [sectionKey]);

  const emptyMessage =
    emptyState === "all_hidden"
      ? "Des placements existent dans le dossier mais aucun n'est visible pour ce contact (confidentialité conjuguale)."
      : emptyState === "empty"
        ? "Aucun placement enregistré — le client verra un patrimoine vide."
        : "Aucun placement à afficher";

  const selectedPartenaire =
    selected?.partenaire_id != null
      ? partenaireById.get(selected.partenaire_id)
      : undefined;

  return (
    <section className={`${CP.sectionGap} ${CP.padX} pb-2`}>
      <h3 className={CP.sectionTitle}>Détail par investissement</h3>

      {sortedInventory.length === 0 ? (
        <p className={`${CP.meta} mt-3`}>{emptyMessage}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {sections.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              items={grouped.get(cat)!}
              partenaireById={partenaireById}
              open={openCategories.has(cat)}
              onToggle={() => {
                setOpenCategories((prev) => {
                  const next = new Set(prev);
                  if (next.has(cat)) next.delete(cat);
                  else next.add(cat);
                  return next;
                });
              }}
              onSelect={(inv) => setSelectedId(inv.id)}
            />
          ))}
        </div>
      )}

      {enableAddAvoir ? (
        <ClientPreviewAddAvoir
          submitting={avoirSubmitting}
          onSubmit={onSubmitAvoir}
        />
      ) : null}

      {selected ? (
        <ClientPreviewPlacementDetail
          // Remonter la fiche à chaque placement : le formulaire pré-remplit
          // loyer et mensualité depuis la ligne affichée, et garderait sinon
          // les valeurs du placement précédent.
          key={selected.id}
          inv={selected}
          partenaire={selectedPartenaire}
          valorisationHistoriesByInvestissementId={
            valorisationHistoriesByInvestissementId
          }
          nature={natureByInvestissementId?.get(selected.id)}
          enableScpiTracking={enableScpiTracking}
          scpiDeclarationSubmitting={scpiDeclarationSubmitting}
          onSubmitScpiDeclaration={onSubmitScpiDeclaration}
          enableRetirerAvoir={enableRetirerAvoir}
          retirerSubmitting={retirerSubmitting}
          onRetirerAvoir={onRetirerAvoir}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </section>
  );
}
