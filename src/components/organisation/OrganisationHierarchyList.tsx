import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, UserX } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { OrganisationVolumeRow } from "@/lib/organisation/organisation-branch-volumes";
import { formatFilleulVolumeDisplay } from "@/lib/organisation/organisation-branch-volumes";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import {
  buildOrganisationHierarchyList,
  collectAllHierarchyNodeIds,
  collectHierarchyExpandIdsToContact,
  defaultHierarchyExpandedIds,
  expandHierarchyToGeneration,
  resolveHierarchyFocusZone,
  type OrganisationHierarchyNode,
} from "@/lib/organisation/organisation-hierarchy-list";
import { organisationMemberLevelLabel } from "@/lib/organisation/organisation-member-roster";
import type { OrganisationTreeResult } from "@/lib/organisation/organisation-tree";
import { ContactInitialsAvatar } from "@/components/contacts/contacts-ui";
import { FilleulRankBadges } from "@/components/organisation/FilleulRankBadges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OrganisationHierarchyListProps = {
  tree: OrganisationTreeResult;
  contacts: Contact[];
  volumeRows: OrganisationVolumeRow[];
  dossiersByContactId: Map<number, FilleulDossier>;
  selectedContactId?: number | null;
  focusContactId?: number | null;
  onFocusContactHandled?: () => void;
  onSelect: (contact: Contact) => void;
};

function HierarchyRow({
  node,
  depth,
  expandedIds,
  selectedContactId,
  focusContactId,
  onToggle,
  onSelect,
}: {
  node: OrganisationHierarchyNode;
  depth: number;
  expandedIds: Set<number>;
  selectedContactId?: number | null;
  focusContactId?: number | null;
  onToggle: (contactId: number) => void;
  onSelect: (contact: Contact) => void;
}) {
  const contactId = node.contact.id;
  const rowRef = useRef<HTMLButtonElement>(null);
  const hasChildren = node.children.length > 0;
  const isExpanded = contactId != null && expandedIds.has(contactId);
  const isSelected = contactId != null && selectedContactId === contactId;
  const levelLabel = organisationMemberLevelLabel(node.generation);
  const isFocusTarget = contactId != null && focusContactId === contactId;

  useEffect(() => {
    if (!isFocusTarget) return;
    rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isFocusTarget]);

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        data-hierarchy-contact-id={contactId ?? undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/70",
          isSelected && "bg-primary/10 ring-1 ring-primary/20",
          isFocusTarget && "ring-2 ring-primary/40"
        )}
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
        onClick={() => onSelect(node.contact)}
      >
        {hasChildren ? (
          <span
            role="presentation"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-muted"
            onClick={(event) => {
              event.stopPropagation();
              if (contactId != null) onToggle(contactId);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            )}
          </span>
        ) : (
          <span className="h-6 w-6 shrink-0" aria-hidden />
        )}

        <ContactInitialsAvatar
          prenom={node.contact.prenom}
          nom={node.contact.nom}
          className="h-7 w-7 shrink-0 text-[10px]"
        />

        <span className="min-w-0 flex-1 truncate font-medium">{node.label}</span>

        <FilleulRankBadges
          titre={node.contact.filleul_titre}
          qualification={node.contact.filleul_qualification}
          className="hidden sm:inline-flex shrink-0"
        />

        {levelLabel ? (
          <span className="hidden md:inline text-[10px] text-muted-foreground shrink-0 tabular-nums">
            {levelLabel}
          </span>
        ) : null}

        {node.status === "desinscrit" ? (
          <span className="text-[10px] rounded-full border border-muted-foreground/30 px-1.5 py-0.5 text-muted-foreground shrink-0">
            Désinscrit
          </span>
        ) : null}

        <span className="hidden lg:inline text-[11px] tabular-nums text-muted-foreground shrink-0 w-[4.5rem] text-right">
          {formatFilleulVolumeDisplay(node.ownVolume)}
        </span>
        <span className="hidden lg:inline text-[11px] tabular-nums text-muted-foreground shrink-0 w-[5rem] text-right">
          {formatFilleulVolumeDisplay(node.branchVolume)}
        </span>

        {node.descendantCount > 0 ? (
          <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 w-6 text-right">
            {node.descendantCount}
          </span>
        ) : (
          <span className="w-6 shrink-0" aria-hidden />
        )}
      </button>

      {hasChildren && isExpanded
        ? node.children.map((child) => (
            <HierarchyRow
              key={child.contact.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              selectedContactId={selectedContactId}
              focusContactId={focusContactId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
    </>
  );
}

function UplineRow({
  node,
  selectedContactId,
  focusContactId,
  onSelect,
}: {
  node: OrganisationHierarchyNode;
  selectedContactId?: number | null;
  focusContactId?: number | null;
  onSelect: (contact: Contact) => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const isFocusTarget = node.contact.id === focusContactId;

  useEffect(() => {
    if (!isFocusTarget) return;
    rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isFocusTarget]);

  return (
    <button
      ref={rowRef}
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/70",
        selectedContactId === node.contact.id && "bg-primary/10 ring-1 ring-primary/20",
        isFocusTarget && "ring-2 ring-primary/40"
      )}
      onClick={() => onSelect(node.contact)}
    >
      <ContactInitialsAvatar
        prenom={node.contact.prenom}
        nom={node.contact.nom}
        className="h-7 w-7 shrink-0 text-[10px]"
      />
      <span className="truncate font-medium">{node.label}</span>
      <span className="text-[10px] text-muted-foreground ml-auto">Parrain</span>
    </button>
  );
}

function UplineSection({
  nodes,
  selectedContactId,
  focusContactId,
  onSelect,
}: {
  nodes: OrganisationHierarchyNode[];
  selectedContactId?: number | null;
  focusContactId?: number | null;
  onSelect: (contact: Contact) => void;
}) {
  const focusInUpline = nodes.some((node) => node.contact.id === focusContactId);
  const [open, setOpen] = useState(focusInUpline);

  useEffect(() => {
    if (focusInUpline) setOpen(true);
  }, [focusInUpline]);

  if (nodes.length === 0) return null;

  return (
    <div className="border-b border-dashed border-border/60 px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto w-full justify-between px-2 py-1.5 text-xs text-muted-foreground"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>Parrains ({nodes.length})</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </Button>
      {open
        ? nodes.map((node) => (
            <UplineRow
              key={node.contact.id}
              node={node}
              selectedContactId={selectedContactId}
              focusContactId={focusContactId}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}

function DesinscritRow({
  node,
  dossier,
  selectedContactId,
  focusContactId,
  onSelect,
}: {
  node: OrganisationHierarchyNode;
  dossier?: FilleulDossier;
  selectedContactId?: number | null;
  focusContactId?: number | null;
  onSelect: (contact: Contact) => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const isFocusTarget = node.contact.id === focusContactId;
  const desinscriptionLabel = dossier?.dateDesinscription
    ? formatCalendarDateFr(dossier.dateDesinscription)
    : null;

  useEffect(() => {
    if (!isFocusTarget) return;
    rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isFocusTarget]);

  return (
    <button
      ref={rowRef}
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/70",
        selectedContactId === node.contact.id && "bg-primary/10 ring-1 ring-primary/20",
        isFocusTarget && "ring-2 ring-primary/40"
      )}
      onClick={() => onSelect(node.contact)}
    >
      <ContactInitialsAvatar
        prenom={node.contact.prenom}
        nom={node.contact.nom}
        className="h-7 w-7 shrink-0 text-[10px] opacity-80"
      />
      <span className="min-w-0 flex-1 truncate font-medium">{node.label}</span>
      {desinscriptionLabel ? (
        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
          {desinscriptionLabel}
        </span>
      ) : null}
      {organisationMemberLevelLabel(node.generation) ? (
        <span className="text-[10px] text-muted-foreground shrink-0">
          {organisationMemberLevelLabel(node.generation)}
        </span>
      ) : null}
    </button>
  );
}

function DesinscritsSection({
  nodes,
  dossiersByContactId,
  selectedContactId,
  focusContactId,
  onSelect,
}: {
  nodes: OrganisationHierarchyNode[];
  dossiersByContactId: Map<number, FilleulDossier>;
  selectedContactId?: number | null;
  focusContactId?: number | null;
  onSelect: (contact: Contact) => void;
}) {
  if (nodes.length === 0) return null;

  return (
    <div className="border-t border-dashed border-border/60 px-1 py-2">
      {nodes.map((node) => (
        <DesinscritRow
          key={node.contact.id}
          node={node}
          dossier={node.contact.id != null ? dossiersByContactId.get(node.contact.id) : undefined}
          selectedContactId={selectedContactId}
          focusContactId={focusContactId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function OrganisationHierarchyList({
  tree,
  contacts,
  volumeRows,
  dossiersByContactId,
  selectedContactId,
  focusContactId,
  onFocusContactHandled,
  onSelect,
}: OrganisationHierarchyListProps) {
  const list = useMemo(
    () => buildOrganisationHierarchyList(tree, contacts, volumeRows),
    [tree, contacts, volumeRows]
  );

  const [expandedIds, setExpandedIds] = useState<Set<number>>(() =>
    defaultHierarchyExpandedIds(list)
  );
  const [showDesinscrits, setShowDesinscrits] = useState(false);

  const listLayoutKey = useMemo(
    () => `${tree.stats.actifs}-${tree.stats.desinscrits}-${volumeRows.length}`,
    [tree.stats.actifs, tree.stats.desinscrits, volumeRows.length]
  );

  useEffect(() => {
    setExpandedIds(defaultHierarchyExpandedIds(list));
  }, [listLayoutKey, list]);

  const handleToggle = useCallback((contactId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }, []);

  const applyExpandIds = useCallback((ids: Iterable<number>) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (focusContactId == null) return;

    const zone = resolveHierarchyFocusZone(focusContactId, list);
    if (zone === "desinscrit") {
      setShowDesinscrits(true);
    }

    if (zone === "active") {
      const pathIds = collectHierarchyExpandIdsToContact(
        focusContactId,
        tree.selfContact?.id ?? null,
        contacts
      );
      applyExpandIds(pathIds);
    }

    const timer = window.setTimeout(() => onFocusContactHandled?.(), 150);
    return () => window.clearTimeout(timer);
  }, [
    focusContactId,
    list,
    tree.selfContact?.id,
    contacts,
    applyExpandIds,
    onFocusContactHandled,
  ]);

  if (!list.root) {
    return (
      <p className="text-sm text-muted-foreground p-8 text-center">
        Aucun filleul ni parrain enregistré pour le moment.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setExpandedIds(defaultHierarchyExpandedIds(list))}
        >
          <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden />
          Niveau 1
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => applyExpandIds(expandHierarchyToGeneration(list.root, 2))}
        >
          Jusqu&apos;au niv. 2
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => applyExpandIds(expandHierarchyToGeneration(list.root, 4))}
        >
          Jusqu&apos;au niv. 4
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => applyExpandIds(collectAllHierarchyNodeIds(list.root))}
        >
          <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
          Tout déplier
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            const ids = new Set<number>();
            if (list.root?.contact.id != null) ids.add(list.root.contact.id);
            setExpandedIds(ids);
          }}
        >
          Replier
        </Button>

        <Button
          type="button"
          variant={showDesinscrits ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowDesinscrits((value) => !value)}
        >
          <UserX className="h-3.5 w-3.5" aria-hidden />
          Désinscrits ({list.desinscrits.length})
        </Button>

        <div className="ml-auto hidden lg:flex items-center gap-4 pr-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="w-[4.5rem] text-right">Perso</span>
          <span className="w-[5rem] text-right">Organisation</span>
          <span className="w-6 text-right" title="Descendants actifs">
            ↓
          </span>
        </div>
      </div>

      <UplineSection
        nodes={list.upline}
        selectedContactId={selectedContactId}
        focusContactId={focusContactId}
        onSelect={onSelect}
      />

      <div className="max-h-[min(72vh,calc(100vh-12rem))] overflow-y-auto px-1 py-2">
        <HierarchyRow
          node={list.root}
          depth={0}
          expandedIds={expandedIds}
          selectedContactId={selectedContactId}
          focusContactId={focusContactId}
          onToggle={handleToggle}
          onSelect={onSelect}
        />
      </div>

      {showDesinscrits ? (
        <DesinscritsSection
          nodes={list.desinscrits}
          dossiersByContactId={dossiersByContactId}
          selectedContactId={selectedContactId}
          focusContactId={focusContactId}
          onSelect={onSelect}
        />
      ) : null}
    </div>
  );
}
