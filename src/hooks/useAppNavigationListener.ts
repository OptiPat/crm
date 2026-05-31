import { useEffect } from "react";
import {
  subscribeAppNavigation,
  type AppNavigationDetail,
} from "@/lib/navigation/app-navigation";

export function useAppNavigationListener(
  handler: (detail: AppNavigationDetail) => void,
  deps: unknown[] = []
): void {
  useEffect(() => {
    return subscribeAppNavigation(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
