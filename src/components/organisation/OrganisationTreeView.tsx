import { useCallback, useRef, useState } from "react";

import { ChevronDown, ChevronRight, Crown, UserRound, UserX } from "lucide-react";

import type { Contact } from "@/lib/api/tauri-contacts";

import type {

  OrganisationDesinscritEntry,

  OrganisationDownlineNode,

  OrganisationTreeResult,

  OrganisationUplineNode,

} from "@/lib/organisation/organisation-tree";

import { groupDesinscritsByParrain, isOrganisationActifFilleul } from "@/lib/organisation/organisation-tree";

import {

  countActiveDescendants,

  isDeepBranchCollapsed,

  ORGANISATION_COLLAPSE_DEPTH,

} from "@/lib/organisation/organisation-branch-stats";

import { OrganisationTreeViewport,

  type OrganisationTreeViewportHandle,

} from "@/components/organisation/OrganisationTreeViewport";

import { OrganisationBranchVolumesPanel } from "@/components/organisation/OrganisationBranchVolumesPanel";

import { FilleulRankBadges } from "@/components/organisation/FilleulRankBadges";

import { FilleulRankEditor } from "@/components/organisation/FilleulRankEditor";

import { ContactInitialsAvatar } from "@/components/contacts/contacts-ui";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";



type RankSaveHandler = (

  contact: Contact,

  ranks: { filleul_titre?: string | null; filleul_qualification?: string | null }

) => void | Promise<void>;



type OrganisationTreeViewProps = {

  tree: OrganisationTreeResult;

  contacts: Contact[];

  onNodeClick: (contact: Contact) => void;

  onParrainClick?: (parrainId: number) => void;

  onRankSave?: RankSaveHandler;

  onVolumeSave?: (contact: Contact, volume: number | null) => void | Promise<void>;

  onManagerVolumeSave?: (contact: Contact, volume: number | null) => void | Promise<void>;

  volumeRows?: import("@/lib/organisation/organisation-branch-volumes").OrganisationVolumeRow[];

  volumeReadOnly?: boolean;

  exerciceLabel?: string;

  selectedContactId?: number | null;

  /** Affiche le tableau volumes sous l'arbre (défaut : true). */
  showBranchVolumesPanel?: boolean;

};



const DOUBLE_CLICK_MS = 320;



function TreeConnector({ className }: { className?: string }) {

  return (

    <div

      className={cn("w-px bg-gradient-to-b from-border/30 via-primary/25 to-primary/40", className)}

      aria-hidden

    />

  );

}



function VerticalStem({ className }: { className?: string }) {

  return (

    <div

      className={cn("w-px shrink-0 bg-primary/30", className)}

      aria-hidden

    />

  );

}



function SiblingConnectorBar({ siblingCount }: { siblingCount: number }) {

  if (siblingCount <= 0) return null;

  if (siblingCount === 1) {

    return <VerticalStem className="h-5" />;

  }



  return (

    <div

      className="relative h-5 w-full min-w-[4rem]"

      style={{ display: "grid", gridTemplateColumns: `repeat(${siblingCount}, minmax(5.5rem, 1fr))` }}

      aria-hidden

    >

      {Array.from({ length: siblingCount }).map((_, i) => (

        <div key={i} className="relative h-full">

          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-primary/30" />

          {i > 0 && (

            <div className="absolute left-0 top-0 right-1/2 h-px bg-primary/30" />

          )}

          {i < siblingCount - 1 && (

            <div className="absolute left-1/2 top-0 right-0 h-px bg-primary/30" />

          )}

        </div>

      ))}

    </div>

  );

}



function CollapsedBranchChip({

  count,

  expanded,

  onToggle,

}: {

  count: number;

  expanded: boolean;

  onToggle: () => void;

}) {

  return (

    <button

      type="button"

      data-org-node

      onClick={(e) => {

        e.stopPropagation();

        onToggle();

      }}

      className="mb-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"

      title={expanded ? "Replier cette branche" : "Afficher les filleuls de cette branche"}

    >

      {expanded ? "−" : "+"}

      {count} filleul{count > 1 ? "s" : ""}

    </button>

  );

}



function indexActiveDownlineByParrain(

  generations: OrganisationDownlineNode[][]

): Map<number, Contact[]> {

  const map = new Map<number, Contact[]>();

  for (const layer of generations) {

    for (const node of layer) {

      if (node.parrainId == null) continue;

      const list = map.get(node.parrainId) ?? [];

      list.push(node.contact);

      map.set(node.parrainId, list);

    }

  }

  return map;

}



function FilleulSubtree({

  contact,

  byParrain,

  depth,

  expandedBranches,

  onToggleBranch,

  onNodeClick,

  onNodeDoubleClick,

  onRankSave,

  selectedContactId,

}: {

  contact: Contact;

  byParrain: Map<number, Contact[]>;

  depth: number;

  expandedBranches: Set<number>;

  onToggleBranch: (contactId: number) => void;

  onNodeClick: (contact: Contact) => void;

  onNodeDoubleClick: (contactId: number) => void;

  onRankSave?: RankSaveHandler;

  selectedContactId?: number | null;

}) {

  const children = (byParrain.get(contact.id) ?? []).filter(isOrganisationActifFilleul);

  const name = `${contact.prenom} ${contact.nom}`.trim();

  const descendantCount = countActiveDescendants(contact.id, byParrain);

  const isDeepBranchAnchor = depth === ORGANISATION_COLLAPSE_DEPTH - 1 && descendantCount > 0;

  const isDeepBranchExpanded = expandedBranches.has(contact.id);

  const hideDeepBranch = isDeepBranchCollapsed(

    depth,

    descendantCount,

    isDeepBranchExpanded

  );



  return (

    <div className="flex flex-col items-center">

      {!hideDeepBranch && children.length > 0 && (

        <>

          <div className="flex flex-row items-end justify-center gap-0">

            {children.map((child) => (

              <div key={child.id} className="flex flex-col items-center px-1 sm:px-1.5">

                <FilleulSubtree

                  contact={child}

                  byParrain={byParrain}

                  depth={depth + 1}

                  expandedBranches={expandedBranches}

                  onToggleBranch={onToggleBranch}

                  onNodeClick={onNodeClick}

                  onNodeDoubleClick={onNodeDoubleClick}

                  onRankSave={onRankSave}

                  selectedContactId={selectedContactId}

                />

              </div>

            ))}

          </div>

          <SiblingConnectorBar siblingCount={children.length} />

        </>

      )}

      {isDeepBranchAnchor && (

        <CollapsedBranchChip

          count={descendantCount}

          expanded={isDeepBranchExpanded}

          onToggle={() => onToggleBranch(contact.id)}

        />

      )}

      <OrganisationNodeCard

        contact={contact}

        displayName={name}

        onClick={() => onNodeClick(contact)}

        onDoubleClick={() => onNodeDoubleClick(contact.id)}

        isSelected={selectedContactId === contact.id}

        onRankSave={onRankSave}

      />

    </div>

  );

}



function DownlineForest({

  selfContact,

  generations,

  expandedBranches,

  onToggleBranch,

  onNodeClick,

  onNodeDoubleClick,

  onRankSave,

  selectedContactId,

}: {

  selfContact: Contact;

  generations: OrganisationDownlineNode[][];

  expandedBranches: Set<number>;

  onToggleBranch: (contactId: number) => void;

  onNodeClick: (contact: Contact) => void;

  onNodeDoubleClick: (contactId: number) => void;

  onRankSave?: RankSaveHandler;

  selectedContactId?: number | null;

}) {

  const byParrain = indexActiveDownlineByParrain(generations);

  const directs = byParrain.get(selfContact.id) ?? [];



  if (directs.length === 0) return null;



  return (

    <div className="flex flex-col items-center w-full mb-1">

      <div className="flex flex-row items-end justify-center gap-0 w-full pb-1">

        {directs.map((contact) => (

          <div key={contact.id} className="flex flex-col items-center px-1 sm:px-2">

            <FilleulSubtree

              contact={contact}

              byParrain={byParrain}

              depth={1}

              expandedBranches={expandedBranches}

              onToggleBranch={onToggleBranch}

              onNodeClick={onNodeClick}

              onNodeDoubleClick={onNodeDoubleClick}

              onRankSave={onRankSave}

              selectedContactId={selectedContactId}

            />

          </div>

        ))}

      </div>

      <SiblingConnectorBar siblingCount={directs.length} />

    </div>

  );

}



function OrganisationNodeCard({

  contact,

  displayName,

  isSelf,

  subtitle,

  onClick,

  onDoubleClick,

  isSelected,

  compact,

  onRankSave,

}: {

  contact?: Contact;

  displayName: string;

  isSelf?: boolean;

  subtitle?: string;

  onClick?: () => void;

  onDoubleClick?: () => void;

  isSelected?: boolean;

  compact?: boolean;

  onRankSave?: RankSaveHandler;

}) {

  const clickable = contact != null && onClick != null;

  const editable = contact != null && onRankSave != null;

  const pendingClickRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  const handleClick = useCallback(() => {

    if (!clickable || !onClick) return;

    if (pendingClickRef.current) clearTimeout(pendingClickRef.current);

    pendingClickRef.current = setTimeout(() => {

      pendingClickRef.current = null;

      onClick();

    }, DOUBLE_CLICK_MS);

  }, [clickable, onClick]);



  const handleDoubleClick = useCallback(

    (event: React.MouseEvent) => {

      event.preventDefault();

      if (pendingClickRef.current) {

        clearTimeout(pendingClickRef.current);

        pendingClickRef.current = null;

      }

      onDoubleClick?.();

    },

    [onDoubleClick]

  );



  return (

    <div className={cn("relative group shrink-0", editable && "pr-0")}>

      <button

        type="button"

        disabled={!clickable}

        data-org-node

        data-org-node-id={contact?.id}

        onClick={handleClick}

        onDoubleClick={onDoubleClick ? handleDoubleClick : undefined}

        className={cn(

          "relative rounded-xl border text-left transition-all duration-200 w-full",

          isSelf

            ? "border-primary/50 bg-gradient-to-br from-primary/10 via-primary/5 to-background shadow-md shadow-primary/10 px-4 py-3 min-w-[10rem]"

            : compact

              ? "border-border/50 bg-background px-2 py-1.5 min-w-0 max-w-[9rem]"

              : "border-emerald-200/70 bg-emerald-50/60 hover:bg-emerald-50 hover:border-emerald-300/80 hover:shadow-sm px-3 py-2 min-w-[8.5rem]",

          clickable &&

            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",

          !clickable && "cursor-default",

          isSelected && "ring-2 ring-primary/45"

        )}

      >

        <div className="flex items-center gap-2">

          {isSelf ? (

            <div className="h-10 w-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">

              <Crown className="h-4 w-4 text-primary" aria-hidden />

            </div>

          ) : contact ? (

            <ContactInitialsAvatar

              prenom={contact.prenom}

              nom={contact.nom}

              className={cn(compact ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-xs")}

            />

          ) : null}

          <div className="min-w-0 flex-1">

            <p

              className={cn(

                "font-semibold truncate",

                isSelf ? "text-sm text-primary" : compact ? "text-[11px]" : "text-xs"

              )}

            >

              {displayName}

            </p>

            {subtitle && (

              <p className="text-[10px] text-muted-foreground/80 truncate">{subtitle}</p>

            )}

            {contact && (

              <FilleulRankBadges

                titre={contact.filleul_titre}

                qualification={contact.filleul_qualification}

                compact={compact}

                className="mt-1"

              />

            )}

          </div>

          {clickable && !isSelf && !compact && (

            <UserRound className="h-3 w-3 text-muted-foreground/50 shrink-0" aria-hidden />

          )}

        </div>

      </button>

      {editable && contact && (

        <FilleulRankEditor contact={contact} onSave={onRankSave} />

      )}

    </div>

  );

}



function UplineNode({

  node,

  onNodeClick,

  onNodeDoubleClick,

  selectedContactId,

}: {

  node: OrganisationUplineNode;

  onNodeClick: (contact: Contact) => void;

  onNodeDoubleClick: (contactId: number) => void;

  selectedContactId?: number | null;

}) {

  const name = `${node.contact.prenom} ${node.contact.nom}`.trim();

  return (

    <div className="flex flex-col items-center">

      <OrganisationNodeCard

        contact={node.contact}

        displayName={name}

        subtitle={`Parrain · niveau ${node.level}`}

        onClick={() => onNodeClick(node.contact)}

        onDoubleClick={() => onNodeDoubleClick(node.contact.id)}

        isSelected={selectedContactId === node.contact.id}

      />

      <TreeConnector className="h-5" />

    </div>

  );

}



function DesinscritsPanel({

  entries,

  onNodeClick,

  onParrainClick,

  onRankSave,

  selectedContactId,

}: {

  entries: OrganisationDesinscritEntry[];

  onNodeClick: (contact: Contact) => void;

  onParrainClick?: (parrainId: number) => void;

  onRankSave?: RankSaveHandler;

  selectedContactId?: number | null;

}) {

  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;



  const groups = groupDesinscritsByParrain(entries);



  return (

    <div className="w-full mt-2 border-t border-dashed border-border/60 pt-3 px-4 sm:px-6">

      <Button

        type="button"

        variant="ghost"

        size="sm"

        className="w-full justify-between text-muted-foreground hover:text-foreground h-auto py-2 px-3"

        onClick={() => setOpen((v) => !v)}

        aria-expanded={open}

      >

        <span className="flex items-center gap-2 text-xs font-medium">

          <UserX className="h-3.5 w-3.5 shrink-0" aria-hidden />

          Filleuls désinscrits ({entries.length})

        </span>

        {open ? (

          <ChevronDown className="h-4 w-4 shrink-0" />

        ) : (

          <ChevronRight className="h-4 w-4 shrink-0" />

        )}

      </Button>



      {open && (

        <div className="mt-3 space-y-4">

          {groups.map((group) => (

            <div

              key={group.parrainId ?? "none"}

              className="rounded-lg border border-border/50 bg-muted/15 overflow-hidden"

            >

              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">

                <div className="min-w-0 flex-1">

                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">

                    Parrain

                  </p>

                  {group.parrainId != null && onParrainClick ? (

                    <button

                      type="button"

                      className="text-sm font-semibold text-primary hover:underline truncate text-left mt-0.5"

                      onClick={() => onParrainClick(group.parrainId!)}

                    >

                      {group.parrainLabel}

                    </button>

                  ) : (

                    <p className="text-sm font-semibold truncate mt-0.5">{group.parrainLabel}</p>

                  )}

                </div>

                <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 rounded-full bg-background border px-2 py-0.5">

                  {group.entries.length} désinscrit{group.entries.length > 1 ? "s" : ""}

                </span>

              </div>

              <ul className="divide-y divide-border/30">

                {group.entries.map((entry) => {

                  const name = `${entry.contact.prenom} ${entry.contact.nom}`.trim();

                  const isSelected = selectedContactId === entry.contact.id;

                  return (

                    <li key={entry.contact.id}>

                      <div

                        className={cn(

                          "relative group flex items-center gap-2 px-3 py-2.5",

                          isSelected && "bg-primary/5"

                        )}

                      >

                        <button

                          type="button"

                          className="flex flex-1 items-center gap-3 min-w-0 text-left hover:opacity-80"

                          onClick={() => onNodeClick(entry.contact)}

                        >

                          <ContactInitialsAvatar

                            prenom={entry.contact.prenom}

                            nom={entry.contact.nom}

                            className="h-8 w-8 text-xs opacity-70 shrink-0"

                          />

                          <div className="min-w-0 flex-1">

                            <p className="text-sm font-medium text-muted-foreground truncate">

                              {name}

                            </p>

                            <p className="text-[11px] text-muted-foreground/70 mt-0.5">

                              Niveau {entry.generation} · Parrain : {entry.parrainLabel}

                            </p>

                            <FilleulRankBadges

                              titre={entry.contact.filleul_titre}

                              qualification={entry.contact.filleul_qualification}

                              compact

                              className="mt-1"

                            />

                          </div>

                          <UserRound className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />

                        </button>

                        {onRankSave && (

                          <FilleulRankEditor contact={entry.contact} onSave={onRankSave} />

                        )}

                      </div>

                    </li>

                  );

                })}

              </ul>

            </div>

          ))}

        </div>

      )}

    </div>

  );

}



export function OrganisationTreeView({

  tree,

  contacts,

  onNodeClick,

  onParrainClick,

  onRankSave,

  onVolumeSave,

  onManagerVolumeSave,

  volumeRows,

  volumeReadOnly,

  exerciceLabel,

  selectedContactId,

  showBranchVolumesPanel = true,

}: OrganisationTreeViewProps) {

  const { selfContact, selfDisplayName, upline, generations, desinscrits, stats } = tree;

  const level1Count = generations[0]?.length ?? 0;

  const viewportRef = useRef<OrganisationTreeViewportHandle>(null);

  const [expandedBranches, setExpandedBranches] = useState<Set<number>>(() => new Set());



  const handleToggleBranch = useCallback((contactId: number) => {

    setExpandedBranches((prev) => {

      const next = new Set(prev);

      if (next.has(contactId)) next.delete(contactId);

      else next.add(contactId);

      return next;

    });

  }, []);



  const handleNodeDoubleClick = useCallback((contactId: number) => {

    viewportRef.current?.focusNode(contactId);

  }, []);



  const treeContent = (

    <div className="flex flex-col items-center w-full min-w-max py-6 px-4 sm:px-8">

      {upline.length > 0 && (

        <div className="flex flex-col items-center mb-1">

          {upline.map((node) => (

            <UplineNode

              key={node.contact.id}

              node={node}

              onNodeClick={onNodeClick}

              onNodeDoubleClick={handleNodeDoubleClick}

              selectedContactId={selectedContactId}

            />

          ))}

        </div>

      )}



      {selfContact && generations.length > 0 && (

        <DownlineForest

          selfContact={selfContact}

          generations={generations}

          expandedBranches={expandedBranches}

          onToggleBranch={handleToggleBranch}

          onNodeClick={onNodeClick}

          onNodeDoubleClick={handleNodeDoubleClick}

          onRankSave={onRankSave}

          selectedContactId={selectedContactId}

        />

      )}



      {level1Count > 0 && <VerticalStem className="h-4" />}



      <OrganisationNodeCard

        contact={selfContact ?? undefined}

        displayName={selfDisplayName}

        isSelf

        subtitle={

          selfContact

            ? level1Count > 0

              ? `${level1Count} filleul${level1Count > 1 ? "s" : ""} direct${level1Count > 1 ? "s" : ""}${

                  desinscrits.length > 0

                    ? ` · ${desinscrits.length} désinscrit${desinscrits.length > 1 ? "s" : ""}`

                    : ""

                }`

              : desinscrits.length > 0

                ? `${desinscrits.length} désinscrit${desinscrits.length > 1 ? "s" : ""} enregistré${desinscrits.length > 1 ? "s" : ""}`

                : "Origine de votre organisation"

            : "Renseignez votre identité dans Paramètres et créez votre fiche contact"

        }

        onClick={selfContact ? () => onNodeClick(selfContact) : undefined}

        onDoubleClick={selfContact ? () => handleNodeDoubleClick(selfContact.id) : undefined}

        isSelected={selfContact != null && selectedContactId === selfContact.id}

        onRankSave={onRankSave}

      />

    </div>

  );



  return (

    <div className="flex flex-col w-full">

      <OrganisationTreeViewport

        ref={viewportRef}

        layoutKey={`${stats.actifs}-${stats.desinscrits}-${upline.length}`}

      >

        {treeContent}

      </OrganisationTreeViewport>



      {showBranchVolumesPanel &&
      ((onVolumeSave && onManagerVolumeSave && volumeRows) || (volumeReadOnly && volumeRows)) ? (

        <OrganisationBranchVolumesPanel

          rows={volumeRows}

          contacts={contacts}

          readOnly={volumeReadOnly}

          exerciceLabel={exerciceLabel}

          onVolumeSave={onVolumeSave ?? (async () => {})}

          onManagerVolumeSave={onManagerVolumeSave ?? (async () => {})}

          onNodeClick={onNodeClick}

        />

      ) : null}



      <DesinscritsPanel

        entries={desinscrits}

        onNodeClick={onNodeClick}

        onParrainClick={onParrainClick}

        onRankSave={onRankSave}

        selectedContactId={selectedContactId}

      />

    </div>

  );

}


