import { useStatistiquesPageData } from "./statistiques-page-data-context";

type ContactsFetchOptions = {
  contactsOnly?: boolean;
};

/** Contacts (+ refresh) — délègue au provider page Statistiques. */
export function useStatistiquesContactsFetch(_options: ContactsFetchOptions = {}) {
  const pageData = useStatistiquesPageData();
  return {
    contacts: pageData.contacts,
    investissements: undefined,
    dashboard: undefined,
    loading: pageData.loading,
    dataRefreshKey: pageData.dataRefreshKey,
    refreshData: pageData.refreshData,
  };
}

/** Contacts, investissements et dashboard — délègue au provider page Statistiques. */
export function useStatistiquesClientPatrimoineFetch() {
  const pageData = useStatistiquesPageData();
  return {
    contacts: pageData.contacts,
    investissements: pageData.investissementsWithDetails,
    dashboard: pageData.dashboard,
    loading: pageData.loading,
    dataRefreshKey: pageData.dataRefreshKey,
    refreshData: pageData.refreshData,
  };
}
