import type { NewsletterImagePlacement } from "@/lib/api/tauri-newsletter";

export function placementMatches(
  placement: NewsletterImagePlacement,
  target: NewsletterImagePlacement
): boolean {
  if (placement.type !== target.type) return false;
  if (placement.type === "before_section" || placement.type === "after_section") {
    return (
      (target.type === "before_section" || target.type === "after_section") &&
      placement.index === target.index
    );
  }
  return true;
}
