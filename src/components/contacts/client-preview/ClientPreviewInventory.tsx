import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import { formatNomProduit } from "@/lib/investissements/investissement-display";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";
import { isDeclareClientOrigine } from "@/lib/investissements/investissement-origine";
import {
  getPatrimoineCategorie,
  PATRIMOINE_CATEGORIE_COLORS,
  PATRIMOINE_CATEGORIE_ORDER,
  type PatrimoineCategorie,
} from "@/lib/patrimoine/categories";
import { getClientPreviewInvestissementColor } from "@/lib/patrimoine/patrimoine-palette";
import { cn } from "@/lib/utils";
import type { ClientPreviewEmptyState } from "./ClientPreviewHero";
import { formatShortEuro } from "./client-preview-format";
import { CP } from "./client-preview-theme";

const DECLARE_BADGE_TITLE =
  "Non vérifié par le cabinet — saisi par le client dans son espace";

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

function resolveExtranetUrl(
  inv: Investissement,
  partenaire?: Partenaire
): string | undefined {
  const contract = inv.url_contrat?.trim();
  if (contract && /^https?:\/\//i.test(contract)) return contract;
  const partner = partenaire?.url_extranet?.trim();
  if (partner && /^https?:\/\//i.test(partner)) return partner;
  return undefined;
}

function ExtranetHint({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* garde l'URL brute */
  }

  return (
    <span
      className={`${CP.caption} inline-flex max-w-full items-center gap-1 truncate`}
      title={url}
    >
      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">{host}</span>
    </span>
  );
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
}: {
  inv: Investissement;
  partenaireById: Map<number, Partenaire>;
}) {
  const partenaire =
    inv.partenaire_id != null
      ? partenaireById.get(inv.partenaire_id)
      : undefined;
  const amount = getEffectiveEncoursCentimes(inv);
  const label = inv.nom_produit || formatNomProduit(inv.type_produit);
  const declared = isDeclareClientOrigine(inv.origine);
  const rowColor = getClientPreviewInvestissementColor(
    inv.type_produit,
    inv.origine
  );
  const extranetUrl = resolveExtranetUrl(inv, partenaire);

  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: rowColor }}
            aria-hidden
          />
          <p className={`${CP.body} truncate`}>{label}</p>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {partenaire ? (
            <span className={`${CP.caption} truncate`}>
              {partenaire.raison_sociale}
            </span>
          ) : null}
          {declared ? (
            <span className={CP.badge} title={DECLARE_BADGE_TITLE}>
              Déclaré
            </span>
          ) : null}
          {extranetUrl ? <ExtranetHint url={extranetUrl} /> : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={CP.amount}>{formatShortEuro(amount)}</p>
        {inv.encours_date ? (
          <p className={`${CP.caption} mt-0.5`}>
            Au {formatInventoryDate(inv.encours_date)}
          </p>
        ) : null}
        {inv.date_souscription ? (
          <p className={`${CP.caption} mt-0.5`}>
            Souscrit le {formatInventoryDate(inv.date_souscription)}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function CategorySection({
  category,
  items,
  partenaireById,
  open,
  onToggle,
}: {
  category: PatrimoineCategorie;
  items: Investissement[];
  partenaireById: Map<number, Partenaire>;
  open: boolean;
  onToggle: () => void;
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
  emptyState?: ClientPreviewEmptyState;
}

export function ClientPreviewInventory({
  sortedInventory,
  partenaireById,
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
            />
          ))}
        </div>
      )}
    </section>
  );
}
