import type {
  GeneratedNewsletterContent,
  GeneratedNewsletterSection,
  NewsletterImagePlacement,
  NewsletterPlacedImage,
} from "@/lib/api/tauri-newsletter";
import { newNewsletterImageId } from "@/lib/newsletter/newsletter-image-import";

export function defaultImagePlacement(): NewsletterImagePlacement {
  return { type: "after_intro" };
}

export function placementLabel(
  placement: NewsletterImagePlacement,
  _sectionCount: number
): string {
  switch (placement.type) {
    case "header":
      return "En-tête (sous la bannière)";
    case "after_intro":
      return "Après l'introduction";
    case "before_cta":
      return "Avant l'appel à l'action";
    case "before_section":
      return `Avant la section ${placement.index + 1}`;
    case "after_section":
      return `Après la section ${placement.index + 1}`;
    default:
      return "Image";
  }
}

export function buildPlacementOptions(sectionCount: number): NewsletterImagePlacement[] {
  const options: NewsletterImagePlacement[] = [
    { type: "header" },
    { type: "after_intro" },
    { type: "before_cta" },
  ];
  for (let i = 0; i < sectionCount; i++) {
    options.push({ type: "before_section", index: i });
    options.push({ type: "after_section", index: i });
  }
  return options;
}

export function placementKey(placement: NewsletterImagePlacement): string {
  switch (placement.type) {
    case "header":
      return "header";
    case "after_intro":
      return "after_intro";
    case "before_cta":
      return "before_cta";
    case "before_section":
      return `before_section_${placement.index}`;
    case "after_section":
      return `after_section_${placement.index}`;
    default:
      return "unknown";
  }
}

export function parsePlacementKey(key: string, sectionCount: number): NewsletterImagePlacement {
  if (key === "header") return { type: "header" };
  if (key === "after_intro") return { type: "after_intro" };
  if (key === "before_cta") return { type: "before_cta" };
  const before = key.match(/^before_section_(\d+)$/);
  if (before) {
    const index = Math.min(Number(before[1]), Math.max(0, sectionCount - 1));
    return { type: "before_section", index };
  }
  const after = key.match(/^after_section_(\d+)$/);
  if (after) {
    const index = Math.min(Number(after[1]), Math.max(0, sectionCount - 1));
    return { type: "after_section", index };
  }
  return { type: "after_intro" };
}

/** Fusionne images structurées + anciens champs headerImageUrl / section.imageUrl. */
export function normalizeNewsletterImages(
  content: Pick<
    GeneratedNewsletterContent,
    "images" | "headerImageUrl" | "sections"
  >
): NewsletterPlacedImage[] {
  const list: NewsletterPlacedImage[] = Array.isArray(content.images)
    ? content.images.filter((img) => img.dataUrl?.trim())
    : [];

  if (content.headerImageUrl?.trim() && !list.some((i) => i.placement.type === "header")) {
    list.unshift({
      id: newNewsletterImageId(),
      dataUrl: content.headerImageUrl.trim(),
      placement: { type: "header" },
    });
  }

  content.sections.forEach((section: GeneratedNewsletterSection, index) => {
    if (!section.imageUrl?.trim()) return;
    const key = `after_section_${index}`;
    if (list.some((img) => placementKey(img.placement) === key)) return;
    list.push({
      id: newNewsletterImageId(),
      dataUrl: section.imageUrl.trim(),
      placement: { type: "after_section", index },
    });
  });

  return list;
}

export function imagesMatching(
  images: NewsletterPlacedImage[],
  matcher: (placement: NewsletterImagePlacement) => boolean
): NewsletterPlacedImage[] {
  return images.filter((img) => matcher(img.placement));
}
