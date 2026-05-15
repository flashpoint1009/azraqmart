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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div
        className="relative w-full max-w-sm rounded-3xl border border-white/20 shadow-elevated overflow-hidden animate-float-up"
        style={{ background: msg.bg_color || "var(--primary)", color: msg.text_color || "#fff" }}
      >
        {/* Image */}
        {msg.image_url && (
          <img src={msg.image_url} alt="" className="w-full h-48 object-cover" />
        )}

        {/* Content */}
        <div className="p-6 text-center">
          {msg.pinned && <Pin className="h-4 w-4 opacity-60 mx-auto mb-2" />}
          <h2 className="font-display font-bold text-xl leading-tight">{msg.title}</h2>
          {msg.body && (
            <p className="text-sm opacity-90 mt-3 leading-relaxed whitespace-pre-wrap">{msg.body}</p>
          )}

          {/* Dismiss button */}
          <button
            onClick={() => dismiss.mutate(msg.id)}
            className="mt-5 w-full h-12 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 font-bold text-sm transition active:scale-95"
          >
            تمام 👍
          </button>
        </div>

        {/* Close X */}
        <button
          onClick={() => dismiss.mutate(msg.id)}
          className="absolute top-3 left-3 grid h-8 w-8 place-items-center rounded-full bg-black/30 hover:bg-black/50 transition"
          aria-label="إغلاق"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
