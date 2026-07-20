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
    try {
      const [contactRows, invRows, dashboardStats, cgp] = await Promise.all([
        getAllContacts(),
        getInvestissementsWithDetails(),
        getDashboardStats(),
        getCgpConfig(),
      ]);
      if (loadSeqRef.current !== seq) return;
      setContacts(contactRows);
      setInvestissementsWithDetails(invRows);
      setDashboard(dashboardStats);
      setSelfContactId(resolveOrganisationSelfContact(contactRows, cgp)?.id ?? null);
      setLastUpdatedAt(new Date());
      setDataRefreshKey((key) => key + 1);
    } catch (error) {
      if (loadSeqRef.current !== seq) return;
      console.error("Erreur chargement données statistiques:", error);
      setContacts([]);
      setInvestissementsWithDetails([]);
      setDashboard(null);
      setSelfContactId(null);
      setLastUpdatedAt(null);
    } finally {
      if (loadSeqRef.current === seq && !silent) setLoading(false);
    }
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
