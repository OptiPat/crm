import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, History, Loader2, Send } from "lucide-react";
import {
  getNewsletterEditionDetail,
  listNewsletterEditions,
  type NewsletterEditionDetail,
  type NewsletterEditionSummary,
} from "@/lib/api/tauri-newsletter";
import {
  isResumableNewsletterEdition,
  newsletterEditionStatusLabel,
} from "@/lib/newsletter/newsletter-edition-resume";

import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";

type NewsletterHistoryPanelProps = {
  refreshKey?: number;
  initialExpandedEditionId?: number | null;
  onOpenContact?: DashboardDrillDownOpenContact;
  onResumeSend?: (edition: NewsletterEditionSummary) => void;
  resumingEditionId?: number | null;
};

function formatUnixDate(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts * 1000));
}

export function NewsletterHistoryPanel({
  refreshKey = 0,
  initialExpandedEditionId = null,
  onOpenContact,
  onResumeSend,
  resumingEditionId = null,
}: NewsletterHistoryPanelProps) {
  const [editions, setEditions] = useState<NewsletterEditionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<NewsletterEditionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listNewsletterEditions(30);
      setEditions(rows);
    } catch (e) {
      console.error(e);
      setEditions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEditionDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const d = await getNewsletterEditionDetail(id);
      setDetail(d);
    } catch (e) {
      console.error(e);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const toggleExpand = useCallback(
    async (id: number) => {
      if (expandedId === id) {
        setExpandedId(null);
        setDetail(null);
        return;
      }
      setExpandedId(id);
      await loadEditionDetail(id);
    },
    [expandedId, loadEditionDetail]
  );

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (initialExpandedEditionId == null) return;
    setExpandedId(initialExpandedEditionId);
    void loadEditionDetail(initialExpandedEditionId);
  }, [initialExpandedEditionId, loadEditionDetail]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-4 w-4" />
          Historique des éditions
        </CardTitle>
        <CardDescription>
          Qui a reçu quoi et quand — détail par édition préparée dans le CRM.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ?
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </p>
        : editions.length === 0 ?
          <p className="text-sm text-muted-foreground">
            Aucune édition enregistrée. L&apos;historique commence à la prochaine préparation de
            campagne.
          </p>
        : <ul className="space-y-2">
            {editions.map((edition) => {
              const open = expandedId === edition.id;
              return (
                <li key={edition.id} className="border rounded-md overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
                    onClick={() => void toggleExpand(edition.id)}
                  >
                    {open ?
                      <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" />
                    : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{edition.editionLabel}</span>
                        <Badge variant="outline" className="font-normal text-xs">
                          {newsletterEditionStatusLabel(edition)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{edition.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Préparée le {formatUnixDate(edition.preparedAt)}
                        {" · "}
                        {edition.sentCount}/{edition.queuedCount} envoyé
                        {edition.sentCount !== 1 ? "s" : ""}
                        {edition.errorCount > 0 ?
                          ` · ${edition.errorCount} erreur${edition.errorCount !== 1 ? "s" : ""}`
                        : null}
                      </p>
                      {isResumableNewsletterEdition(edition) && onResumeSend ?
                        <div className="mt-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={resumingEditionId === edition.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onResumeSend(edition);
                            }}
                          >
                            {resumingEditionId === edition.id ?
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Préparation…
                              </>
                            : <>
                                <Send className="h-4 w-4 mr-2" />
                                Relancer l&apos;envoi (
                                {edition.queuedCount - edition.sentCount} restant
                                {edition.queuedCount - edition.sentCount !== 1 ? "s" : ""})
                              </>
                            }
                          </Button>
                        </div>
                      : null}
                    </div>
                  </button>
                  {open ?
                    <div className="border-t px-3 py-2 bg-muted/20">
                      {detailLoading || detail?.id !== edition.id ?
                        <p className="text-sm text-muted-foreground flex items-center gap-2 py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Détail…
                        </p>
                      : <ul className="text-sm max-h-56 overflow-y-auto space-y-1.5">
                          {(() => {
                            const editionContactIds = detail.recipients.map(
                              (recipient) => recipient.contactId
                            );
                            return detail.recipients.map((r) => (
                            <li
                              key={r.contactEtiquetteId}
                              className="flex flex-wrap items-baseline gap-x-2"
                            >
                              {onOpenContact ?
                                <button
                                  type="button"
                                  className="font-medium underline-offset-2 hover:underline"
                                  onClick={() =>
                                    onOpenContact(r.contactId, editionContactIds)
                                  }
                                >
                                  {r.prenom} {r.nom}
                                </button>
                              : <span className="font-medium">
                                  {r.prenom} {r.nom}
                                </span>
                              }
                              <span className="text-muted-foreground text-xs">{r.email}</span>
                              {r.sentAt ?
                                <span className="text-xs text-green-700 dark:text-green-400">
                                  — envoyé {formatUnixDate(r.sentAt)}
                                </span>
                              : r.errorMessage ?
                                <span className="text-xs text-destructive">— {r.errorMessage}</span>
                              : <span className="text-xs text-muted-foreground">— en attente</span>}
                            </li>
                            ));
                          })()}
                        </ul>
                      }
                    </div>
                  : null}
                </li>
              );
            })}
          </ul>
        }
        {editions.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => void refresh()}>
            Actualiser
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
