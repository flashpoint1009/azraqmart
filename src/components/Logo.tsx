import { Link } from "@tanstack/react-router";
import logoMark from "@/assets/logo.jpg";
import { useAppSettings } from "@/hooks/useAppSettings";

export function Logo({ compact = false }: { compact?: boolean }) {
  const { settings } = useAppSettings();
  const name = settings?.app_name || "Zone Mart";
  const slogan = settings?.app_slogan || "طلباتك توصلك";
  const src = settings?.logo_url || logoMark;

  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 via-background to-accent/15 ring-1 ring-primary/20 shadow-glow transition-all group-hover:scale-105 group-hover:rotate-3 overflow-hidden">
        <img src={src} alt={name} width={44} height={44} className="h-9 w-9 object-contain drop-shadow" />
        <span className="absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background animate-pulse" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="font-display text-lg font-bold tracking-tight">{name}</p>
          <p className="text-[10px] font-semibold text-muted-foreground">{slogan}</p>
        </div>
      )}
    </Link>
  );
}
