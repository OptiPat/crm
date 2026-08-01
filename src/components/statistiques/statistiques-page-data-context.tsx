import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getDashboardStats, type DashboardStats } from "@/lib/api/tauri-dashboard";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import {
  getInvestissementsWithDetails,
  type InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { resolveOrganisationSelfContact } from "@/lib/organisation/organisation-tree";

export type StatistiquesPageData = {
  contacts: Contact[];
  investissementsWithDetails: InvestissementWithDetails[];
  dashboard: DashboardStats | null;
  selfContactId: number | null;
  loading: boolean;
  lastUpdatedAt: Date | null;
  dataRefreshKey: number;
  refreshData: (options?: { silent?: boolean }) => Promise<void>;
};

const StatistiquesPageDataContext = createContext<StatistiquesPageData | null>(null);

export function StatistiquesPageDataProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissementsWithDetails, setInvestissementsWithDetails] = useState<
    InvestissementWithDetails[]
  >([]);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [selfContactId, setSelfContactId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const loadSeqRef = useRef(0);

  const refreshData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const seq = ++loadSeqRef.current;
    if (!silent) setLoading(true);

    const [contactsResult, invResult, dashboardResult, cgpResult] = await Promise.allSettled([
      getAllContacts(),
      getInvestissementsWithDetails(),
      getDashboardStats(),
      getCgpConfig(),
    ]);

    if (loadSeqRef.current !== seq) return;

    let refreshed = false;

    if (contactsResult.status === "fulfilled") {
      const contactRows = contactsResult.value;
      setContacts(contactRows);
      refreshed = true;
      if (cgpResult.status === "fulfilled") {
        setSelfContactId(resolveOrganisationSelfContact(contactRows, cgpResult.value)?.id ?? null);
      }
    } else {
      console.error("Erreur chargement contacts statistiques:", contactsResult.reason);
      if (!silent) {
        setContacts([]);
        setSelfContactId(null);
      }
    }

    if (invResult.status === "fulfilled") {
      setInvestissementsWithDetails(invResult.value);
      refreshed = true;
    } else {
      console.error("Erreur chargement investissements statistiques:", invResult.reason);
      if (!silent) setInvestissementsWithDetails([]);
    }

    if (dashboardResult.status === "fulfilled") {
      setDashboard(dashboardResult.value);
      refreshed = true;
    } else {
      console.error("Erreur chargement dashboard statistiques:", dashboardResult.reason);
      if (!silent) setDashboard(null);
    }

    if (cgpResult.status !== "fulfilled") {
      console.error("Erreur chargement config CGP statistiques:", cgpResult.reason);
    }

    if (refreshed) {
      setLastUpdatedAt(new Date());
      setDataRefreshKey((key) => key + 1);
    } else if (!silent) {
      setLastUpdatedAt(null);
    }

    if (loadSeqRef.current === seq && !silent) setLoading(false);
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(
    () => subscribeContactsChanged(() => void refreshData({ silent: true })),
    [refreshData]
  );

  useEffect(
    () => subscribeInvestissementsChanged(() => void refreshData({ silent: true })),
    [refreshData]
  );

  const value = useMemo(
    () => ({
      contacts,
      investissementsWithDetails,
      dashboard,
      selfContactId,
      loading,
      lastUpdatedAt,
      dataRefreshKey,
      refreshData,
    }),
    [
      contacts,
      investissementsWithDetails,
      dashboard,
      selfContactId,
      loading,
      lastUpdatedAt,
      dataRefreshKey,
      refreshData,
    ]
  );

  return (
    <StatistiquesPageDataContext.Provider value={value}>{children}</StatistiquesPageDataContext.Provider>
  );
}

export function useStatistiquesPageData(): StatistiquesPageData {
  const ctx = useContext(StatistiquesPageDataContext);
  if (!ctx) {
    throw new Error("useStatistiquesPageData doit être utilisé dans StatistiquesPageDataProvider");
  }
  return ctx;
}

export function useOptionalStatistiquesPageData() {
  return useContext(StatistiquesPageDataContext);
}
