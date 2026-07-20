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
import { getAllInvestissements, type Investissement } from "@/lib/api/tauri-investissements";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";

export type StatistiquesClientSharedData = {
  contacts: Contact[];
  investissements: Investissement[];
  dashboard: DashboardStats | null;
  loading: boolean;
  dataRefreshKey: number;
  refreshData: (options?: { silent?: boolean }) => Promise<void>;
};

const StatistiquesClientDataContext = createContext<StatistiquesClientSharedData | null>(null);

export function StatistiquesClientDataProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  const refreshData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [contactRows, investRows, dashboardStats] = await Promise.all([
        getAllContacts(),
        getAllInvestissements(),
        getDashboardStats(),
      ]);
      setContacts(contactRows);
      setInvestissements(investRows);
      setDashboard(dashboardStats);
      setDataRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Erreur chargement données statistiques clients:", error);
      setContacts([]);
      setInvestissements([]);
      setDashboard(null);
    } finally {
      if (!silent) setLoading(false);
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
      investissements,
      dashboard,
      loading,
      dataRefreshKey,
      refreshData,
    }),
    [contacts, investissements, dashboard, loading, dataRefreshKey, refreshData]
  );

  return (
    <StatistiquesClientDataContext.Provider value={value}>
      {children}
    </StatistiquesClientDataContext.Provider>
  );
}

export function useOptionalStatistiquesClientData() {
  return useContext(StatistiquesClientDataContext);
}

type ContactsFetchOptions = {
  /** Ne charge que les contacts (pas investissements / dashboard). */
  contactsOnly?: boolean;
};

/** Contacts (+ refresh) : données partagées section Clients si disponibles, sinon chargement local. */
export function useStatistiquesContactsFetch(options: ContactsFetchOptions = {}) {
  const shared = useOptionalStatistiquesClientData();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(!shared);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  const refreshData = useCallback(
    async (refreshOptions?: { silent?: boolean }) => {
      if (shared) {
        await shared.refreshData(refreshOptions);
        return;
      }
      const silent = refreshOptions?.silent ?? false;
      if (!silent) setLoading(true);
      try {
        setContacts(await getAllContacts());
        setDataRefreshKey((key) => key + 1);
      } catch (error) {
        console.error("Erreur chargement contacts statistiques:", error);
        setContacts([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [shared]
  );

  useEffect(() => {
    if (shared) return;
    void refreshData();
  }, [shared, refreshData]);

  useEffect(() => {
    if (shared) return;
    return subscribeContactsChanged(() => void refreshData({ silent: true }));
  }, [shared, refreshData]);

  if (shared) {
    return {
      contacts: shared.contacts,
      investissements: options.contactsOnly ? undefined : shared.investissements,
      dashboard: options.contactsOnly ? undefined : shared.dashboard,
      loading: shared.loading,
      dataRefreshKey: shared.dataRefreshKey,
      refreshData,
    };
  }

  return {
    contacts,
    investissements: undefined,
    dashboard: undefined,
    loading,
    dataRefreshKey,
    refreshData,
  };
}

/** Contacts + investissements + dashboard : partagé ou chargement local complet. */
export function useStatistiquesClientPatrimoineFetch() {
  const shared = useOptionalStatistiquesClientData();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(!shared);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const loadSeqRef = useRef(0);

  const refreshData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (shared) {
        await shared.refreshData(options);
        return;
      }
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      const seq = ++loadSeqRef.current;
      try {
        const [contactRows, investRows, dashboardStats] = await Promise.all([
          getAllContacts(),
          getAllInvestissements(),
          getDashboardStats(),
        ]);
        if (loadSeqRef.current !== seq) return;
        setContacts(contactRows);
        setInvestissements(investRows);
        setDashboard(dashboardStats);
        setDataRefreshKey((key) => key + 1);
      } catch (error) {
        if (loadSeqRef.current !== seq) return;
        console.error("Erreur chargement patrimoine statistiques clients:", error);
        setContacts([]);
        setInvestissements([]);
        setDashboard(null);
      } finally {
        if (loadSeqRef.current === seq && !silent) setLoading(false);
      }
    },
    [shared]
  );

  useEffect(() => {
    if (shared) return;
    void refreshData();
  }, [shared, refreshData]);

  useEffect(() => {
    if (shared) return;
    return subscribeContactsChanged(() => void refreshData({ silent: true }));
  }, [shared, refreshData]);

  useEffect(() => {
    if (shared) return;
    return subscribeInvestissementsChanged(() => void refreshData({ silent: true }));
  }, [shared, refreshData]);

  if (shared) {
    return {
      contacts: shared.contacts,
      investissements: shared.investissements,
      dashboard: shared.dashboard,
      loading: shared.loading,
      dataRefreshKey: shared.dataRefreshKey,
      refreshData,
    };
  }

  return {
    contacts,
    investissements,
    dashboard,
    loading,
    dataRefreshKey,
    refreshData,
  };
}

/** Dashboard seul : partagé ou chargement local. */
export function useStatistiquesDashboardFetch() {
  const shared = useOptionalStatistiquesClientData();
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(!shared);

  const refreshData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (shared) {
        await shared.refreshData(options);
        return;
      }
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      try {
        setDashboard(await getDashboardStats());
      } catch (error) {
        console.error("Erreur chargement dashboard statistiques:", error);
        setDashboard(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [shared]
  );

  useEffect(() => {
    if (shared) return;
    void refreshData();
  }, [shared, refreshData]);

  useEffect(() => {
    if (shared) return;
    return subscribeContactsChanged(() => void refreshData({ silent: true }));
  }, [shared, refreshData]);

  useEffect(() => {
    if (shared) return;
    return subscribeInvestissementsChanged(() => void refreshData({ silent: true }));
  }, [shared, refreshData]);

  if (shared) {
    return {
      dashboard: shared.dashboard,
      loading: shared.loading,
      refreshData,
    };
  }

  return { dashboard, loading, refreshData };
}
