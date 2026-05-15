import { QRCodeSVG } from "qrcode.react";
import { Gift, Star, TrendingUp } from "lucide-react";

interface LoyaltyCardProps {
  userId: string;
  customerName: string;
  points: number;
  tier?: string;
  totalOrders?: number;
}

const TIER_CONFIG: Record<string, { color: string; bg: string; next: string; minPoints: number }> = {
  "عميل جديد": { color: "text-muted-foreground", bg: "bg-muted", next: "برونزي", minPoints: 0 },
  "برونزي": { color: "text-amber-700", bg: "bg-amber-50", next: "فضي", minPoints: 100 },
  "فضي": { color: "text-slate-500", bg: "bg-slate-50", next: "ذهبي", minPoints: 500 },
  "ذهبي": { color: "text-yellow-600", bg: "bg-yellow-50", next: "بلاتيني", minPoints: 1000 },
  "بلاتيني": { color: "text-purple-600", bg: "bg-purple-50", next: "", minPoints: 5000 },
};

export function LoyaltyCard({ userId, customerName, points, tier = "عميل جديد", totalOrders = 0 }: LoyaltyCardProps) {
  const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG["عميل جديد"];
  const qrValue = JSON.stringify({ type: "zonemart_customer", id: userId, v: 1 });

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-primary p-4 text-primary-foreground">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold opacity-80">بطاقة الولاء</p>
            <h3 className="font-display text-lg font-bold mt-0.5">{customerName}</h3>
            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tierConfig.bg} ${tierConfig.color}`}>
              <Star className="h-3 w-3" /> {tier}
            </span>
          </div>
          <div className="bg-white rounded-xl p-2 shadow-md">
            <QRCodeSVG
              value={qrValue}
              size={80}
              level="M"
              bgColor="transparent"
              fgColor="#1a1a1a"
            />
          </div>
        </div>
      </div>

      {/* Points & Stats */}
      <div className="p-4 space-y-3">
        {/* Points display */}
        <div className="flex items-center justify-between rounded-xl bg-accent-soft p-3">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-foreground">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold">نقاطك</p>
              <p className="font-display text-2xl font-bold text-foreground tabular-nums" dir="ltr">{points}</p>
            </div>
          </div>
          <div className="text-left">
            <p className="text-[10px] text-muted-foreground">كل 10 ج.م = 1 نقطة</p>
            {tierConfig.next && (
              <p className="text-[10px] text-primary font-bold mt-0.5">
                <TrendingUp className="h-3 w-3 inline" /> {TIER_CONFIG[tierConfig.next]?.minPoints - points} نقطة للترقية
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border p-3 text-center">
            <p className="font-display text-xl font-bold text-primary tabular-nums" dir="ltr">{totalOrders}</p>
            <p className="text-[11px] text-muted-foreground font-semibold">طلب مكتمل</p>
          </div>
          <div className="rounded-xl border border-border p-3 text-center">
            <p className="font-display text-xl font-bold text-accent-foreground tabular-nums" dir="ltr">{points * 10}</p>
            <p className="text-[11px] text-muted-foreground font-semibold">ج.م وفّرتها</p>
          </div>
        </div>

        {/* How it works */}
        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-primary flex items-center gap-1">
            <span>كيف تكسب نقاط؟</span>
          </summary>
          <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground pr-2">
            <p>• كل 10 ج.م في طلبك = 1 نقطة</p>
            <p>• النقاط تتضاف تلقائياً بعد تسليم الطلب</p>
            <p>• اجمع نقاط واستبدلها بخصومات</p>
            <p>• كل 100 نقطة = 10 ج.م خصم</p>
          </div>
        </details>
      </div>
    </div>
  );
}
