import { cn } from "@/lib/utils";

type BrandIconProps = {
  className?: string;
  title?: string;
};

/** Bulle Messages (vert #34C759, style app mobile / Phone Link). */
export function SmsBrandIcon({ className, title = "SMS" }: BrandIconProps) {
  return (
    <img
      src="/icons/sms.svg"
      alt=""
      aria-hidden={title ? undefined : true}
      title={title}
      className={cn("h-5 w-5 shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}

/** Logo WhatsApp officiel (#25D366). */
export function WhatsAppBrandIcon({ className, title = "WhatsApp" }: BrandIconProps) {
  return (
    <img
      src="/icons/whatsapp.svg"
      alt=""
      aria-hidden={title ? undefined : true}
      title={title}
      className={cn("h-5 w-5 shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}
