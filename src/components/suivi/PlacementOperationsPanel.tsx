import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listPlacementOperations,
  notifyPlacementOperationsChanged,
  PLACEMENT_OPERATIONS_CHANGED_EVENT,
  scanBoxPlacementEmails,
  updatePlacementOperationStatus,
  type PlacementOperationWithContact,
} from "@/lib/api/tauri-box-placement";
import {
  countOpenPlacementOperations,
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
      const total = result.updated + result.created;
      if (total > 0) {
        toast.success(
          `Box Placement : ${result.created} créée(s), ${result.updated} mise(s) à jour`
        );
      } else {
        toast.message("Box Placement : aucune nouvelle opération détectée");
      }
      if ((result.skipped_ambiguous ?? 0) > 0) {
        toast.warning(
          `${result.skipped_ambiguous} mail(s) ignoré(s) — homonymes contacts, rattachement manuel requis`
        );
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setScanning(false);
    }
  };

  const handleMarkConforme = async (id: number) => {
    setUpdatingId(id);
    try {
      await updatePlacementOperationStatus(id, "CONFORME");
      notifyPlacementOperationsChanged();
      toast.success("Opération marquée conforme");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setUpdatingId(null);
    }
  };

  const { pending, nonConforme } = countOpenPlacementOperations(rows);
  const openRows = rows.filter(
    (r) => r.operation.status === "PENDING" || r.operation.status === "NON_CONFORME"
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg">Opérations partenaire (Box Placement)</CardTitle>
          <CardDescription>
            Suivi des mails Stellium entrants — {pending} en attente
            {nonConforme > 0 ? `, ${nonConforme} non conforme(s)` : ""}
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
        ) : openRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune opération en attente ou non conforme. Les arbitrages / réinvestissements
            journalisés sur un pipe Suivi créent une ligne « en attente partenaire ».
          </p>
        ) : (
          <ul className="space-y-2">
            {openRows.map((row) => (
              <li
                key={row.operation.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {placementOperationTypeLabel(row.operation.operation_type)} —{" "}
                    {row.contact_prenom} {row.contact_nom}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {row.operation.product_label ||
                      row.operation.stellium_label ||
                      row.pipe_titre ||
                      "Produit non renseigné"}
                  </p>
                  {row.operation.email_subject && row.operation.status === "NON_CONFORME" && (
                    <p className="text-xs text-red-700/80 mt-0.5 truncate" title={row.operation.email_subject}>
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
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${placementOperationStatusAccent(row.operation.status)}`}
                  >
                    {row.operation.status === "NON_CONFORME" ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : row.operation.status === "CONFORME" ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    {placementOperationStatusLabel(row.operation.status)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
