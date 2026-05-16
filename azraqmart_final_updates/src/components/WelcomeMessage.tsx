import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Pin } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Msg = {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  bg_color: string | null;
  text_color: string | null;
  pinned: boolean;
};

export function WelcomeMessage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: msg } = useQuery({
    queryKey: ["welcome_msg", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Msg | null> => {
      const { data: msgs } = await supabase
        .from("welcome_messages")
        .select("id, title, body, image_url, bg_color, text_color, pinned, target_customer_id")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (!msgs?.length) return null;

      const { data: dismissed } = await supabase
        .from("welcome_dismissals")
        .select("message_id")
        .eq("user_id", user!.id);
      const dismissedIds = new Set((dismissed ?? []).map((d) => d.message_id));

      // Targeted first
      const targeted = msgs.find((m) => m.target_customer_id && (m.pinned || !dismissedIds.has(m.id)));
      if (targeted) return targeted as Msg;
      const global = msgs.find((m) => !m.target_customer_id && (m.pinned || !dismissedIds.has(m.id)));
      return (global as Msg) ?? null;
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("welcome_dismissals").upsert({ user_id: user!.id, message_id: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["welcome_msg", user?.id] }),
  });

  if (!msg) return null;

  return (
    <div
      className="relative mx-auto max-w-[1440px] mt-3 mx-4 lg:mx-auto rounded-2xl border border-white/20 shadow-elevated overflow-hidden animate-float-up"
      style={{ background: msg.bg_color || "oklch(0.55 0.22 260)", color: msg.text_color || "#fff" }}
    >
      <div className="flex items-start gap-3 p-4">
        {msg.image_url && (
          <img src={msg.image_url} alt="" className="h-14 w-14 rounded-xl object-cover ring-2 ring-white/20 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {msg.pinned && <Pin className="h-3.5 w-3.5 opacity-80" />}
            <h3 className="font-display font-bold text-base">{msg.title}</h3>
          </div>
          {msg.body && <p className="text-xs opacity-90 mt-1 leading-relaxed whitespace-pre-wrap">{msg.body}</p>}
        </div>
        {!msg.pinned && (
          <button
            onClick={() => dismiss.mutate(msg.id)}
            className="grid h-7 w-7 place-items-center rounded-lg bg-white/15 hover:bg-white/25 transition shrink-0"
            aria-label="إغلاق"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
