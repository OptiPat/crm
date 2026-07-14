import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  dismissPlacementOperation,
  listPlacementOperations,
  notifyPlacementOperationsChanged,
  PLACEMENT_OPERATIONS_CHANGED_EVENT,
  scanBoxPlacementEmails,
  updatePlacementOperationStatus,
  type PlacementOperationWithContact,
} from "@/lib/api/tauri-box-placement";
import {
  notifyPlacementConformeClientAfterManualMark,
  notifyPlacementConformeClientsAfterScan,
  retryPlacementConformeClientEmail,
} from "@/lib/placement/placement-conforme-notify";
import {
  countOpenPlacementOperations,
  countPlacementPendingClientNotify,
  isPlacementRowVisibleInSuivi,
  placementConformeNeedsClientNotify,
  placementOperationIsUndeclared,
  placementOperationStatusAccent,
  placementOperationStatusLabel,
  placementOperationTypeLabel,
} from "@/lib/placement/placement-operations-ui";
import { toast } from "sonner";

export function PlacementOperationsPanel({
  onOpenContact,
}: {
  onOpenContact?: (contactId: number) => void;
}) {
  const [rows, setRows] = useState<PlacementOperationWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await listPlacementOperations();
      setRows(data);
    } catch (error) {
      console.error(error);
      toast.error("Impossible de charger les opérations partenaire");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const onChanged = () => {
      void reload();
    };
    window.addEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
  }, [reload]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await scanBoxPlacementEmails();
      notifyPlacementOperationsChanged();
      const total = result.updated;
      if (total > 0) {
        toast.success(`Box Placement : ${result.updated} opération(s) mise(s) à jour`);
      } else {
        toast.message("Box Placement : aucune nouvelle opération détectée");
      }
      if ((result.skipped_ambiguous_contacts ?? 0) > 0) {
        toast.warning(
          `${result.skipped_ambiguous_contacts} mail(s) ignoré(s) — homonymes contacts, rattachement manuel requis`
        );
      }
      if ((result.skipped_ambiguous_placements ?? 0) > 0) {
        toast.warning(
          `${result.skipped_ambiguous_placements} mail(s) ignoré(s) — plusieurs opérations en attente pour ce client, précisez l'affaire ou le produit`
        );
      }
      await notifyPlacementConformeClientsAfterScan(result.new_conforme_ids);
      await reload();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setScanning(false);
    }
  };

  const handleMarkConforme = async (id: number) => {
    setUpdatingId(id);
    try {
      const operation = await updatePlacementOperationStatus(id, "CONFORME");
      notifyPlacementOperationsChanged();
      toast.success("Opération marquée conforme");
      await notifyPlacementConformeClientAfterManualMark(operation);
      await reload();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleResendClientEmail = async (row: PlacementOperationWithContact) => {
    setResendingId(row.operation.id);
    try {
      await retryPlacementConformeClientEmail(row.operation);
      notifyPlacementOperationsChanged();
      await reload();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setResendingId(null);
    }
  };

  const handleDismiss = async (id: number) => {
    setDismissingId(id);
    try {
      await dismissPlacementOperation(id);
      notifyPlacementOperationsChanged();
      toast.success("Opération retirée du tableau");
      await reload();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDismissingId(null);
    }
  };

  const visibleRows = rows.filter((r) => isPlacementRowVisibleInSuivi(r.operation));
  const { pending, nonConforme } = countOpenPlacementOperations(visibleRows);
  const pendingNotify = countPlacementPendingClientNotify(visibleRows);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg">Opérations partenaire (Box Placement)</CardTitle>
          <CardDescription>
            Suivi des mails Stellium entrants — {pending} en attente
            {nonConforme > 0 ? `, ${nonConforme} non conforme(s)` : ""}
            {pendingNotify > 0 ? `, ${pendingNotify} email(s) client à envoyer` : ""}
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => void handleScan()}
          disabled={scanning}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
          Scanner les mails
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune opération en attente ou non conforme. Les arbitrages / réinvestissements
            journalisés sur un pipe Suivi créent une ligne « en attente partenaire ».
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleRows.map((row) => {
              const needsNotify = placementConformeNeedsClientNotify(row.operation);
              return (
                <li
                  key={row.operation.id}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium truncate">
                        {placementOperationTypeLabel(row.operation.operation_type)} —{" "}
                        {row.contact_prenom} {row.contact_nom}
                      </p>
                      {placementOperationIsUndeclared(row.operation) ? (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                          Non déclaré
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.operation.product_label ||
                        row.operation.stellium_label ||
                        row.pipe_titre ||
                        "Produit non renseigné"}
                    </p>
                    {needsNotify && (
                      <p className="text-xs text-amber-800 mt-0.5">
                        Conforme — email client non envoyé
                      </p>
                    )}
                    {row.operation.email_subject && row.operation.status === "NON_CONFORME" && (
                      <p
                        className="text-xs text-red-700/80 mt-0.5 truncate"
                        title={row.operation.email_subject}
                      >
                        {row.operation.email_subject}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {onOpenContact && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => onOpenContact(row.operation.contact_id)}
                      >
                        <User className="h-3 w-3" />
                        Contact
                      </Button>
                    )}
                    {needsNotify && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs border-amber-300 text-amber-900"
                        disabled={resendingId === row.operation.id}
                        onClick={() => void handleResendClientEmail(row)}
                      >
                        <Mail className="h-3 w-3" />
                        Envoyer email client
                      </Button>
                    )}
                    {(row.operation.status === "PENDING" ||
                      row.operation.status === "NON_CONFORME") && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        disabled={updatingId === row.operation.id}
                        onClick={() => void handleMarkConforme(row.operation.id)}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {row.operation.status === "NON_CONFORME" ? "Traiter" : "Marquer conforme"}
                      </Button>
                    )}
                    {row.operation.status === "PENDING" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                        disabled={dismissingId === row.operation.id}
                        onClick={() => void handleDismiss(row.operation.id)}
                      >
                        Retirer
                      </Button>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${placementOperationStatusAccent(
                        needsNotify ? "PENDING" : row.operation.status
                      )}`}
                    >
                      {row.operation.status === "NON_CONFORME" ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : needsNotify ? (
                        <Mail className="h-3 w-3" />
                      ) : row.operation.status === "CONFORME" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {needsNotify
                        ? "Email client en attente"
                        : placementOperationStatusLabel(row.operation.status)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
