import { Fragment, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { isFeatureEnabled } from "@/lib/features";

type Msg = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_type: "customer" | "admin" | "bot";
  content: string;
  created_at: string;
};

type Faq = {
  question: string;
  keywords: string[] | null;
  answer: string;
};

const normalizeText = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/[؟?!.،,؛;:()\[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const getFaqTerms = (faq: Faq) =>
  [faq.question, ...(faq.keywords ?? [])]
    .flatMap((term) => normalizeText(term).split(/\s+/).concat(normalizeText(term)))
    .filter((term) => term.length > 1);

const formatMessageTime = (value: string) =>
  new Date(value).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

const formatMessageDate = (value: string) =>
  new Date(value).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const isSameMessageDay = (a?: string, b?: string) => {
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
};

export function ChatWidget() {
  const { user } = useAuth();
  const { settings } = useAppSettings();
  const botEnabled = isFeatureEnabled(settings?.features, "chatbot");
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find or create conversation when opening
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profErr) throw profErr;
        const pid = prof?.id;
        if (!pid) {
          toast.error("لم نجد ملفك الشخصي. سجّل دخولك من جديد.");
          return;
        }
        if (cancelled) return;
        setProfileId(pid);

        const { data: existing, error: convErr } = await supabase
          .from("chat_conversations")
          .select("id")
          .eq("customer_id", pid)
          .in("status", ["open", "assigned"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (convErr) throw convErr;

        let id = existing?.id ?? null;
        if (!id) {
          const { data: created, error } = await supabase
            .from("chat_conversations")
            .insert({ customer_id: pid, status: "open" })
            .select("id")
            .single();
          if (error) throw error;
          id = created.id;
          await supabase.from("chat_messages").insert({
            conversation_id: id,
            sender_type: "bot",
            content: "أهلاً بيك! أنا هنا أساعدك. اكتب سؤالك أو اكتب «دعم» للوصول لفريق الدعم.",
          });
        }
        if (cancelled) return;
        setConversationId(id);

        const { data: msgs, error: msgErr } = await supabase
          .from("chat_messages")
          .select("id, conversation_id, sender_id, sender_type, content, created_at")
          .eq("conversation_id", id)
          .order("created_at", { ascending: true });
        if (msgErr) throw msgErr;
        if (!cancelled) setMessages((msgs ?? []) as Msg[]);
      } catch (e) {
        console.error("[chat] open error", e);
        toast.error("تعذر فتح الدردشة. حاول مرة أخرى.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  // Realtime subscribe
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = payload.new as Msg;
          setMessages((prev) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev, message],
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || !conversationId || !profileId || sending) return;

    setSending(true);
    try {
      const { data: sentMessage, error } = await supabase
        .from("chat_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: profileId,
          sender_type: "customer",
          content: text,
        })
        .select("id, conversation_id, sender_id, sender_type, content, created_at")
        .single();

      if (error) {
        console.error("[chat] send error", error);
        toast.error("تعذر إرسال الرسالة: " + error.message);
        return;
      }

      setInput("");
      if (sentMessage) {
        setMessages((prev) =>
          prev.some((m) => m.id === sentMessage.id) ? prev : [...prev, sentMessage as Msg],
        );
      }

      await supabase
        .from("chat_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);

      // Bot reply from FAQs, with a fallback so the chat always responds.
      if (!botEnabled) return;
      const { data: faqs } = await supabase
        .from("chatbot_faqs")
        .select("question, keywords, answer")
        .eq("is_active", true);
      const lower = normalizeText(text);
      const match = ((faqs ?? []) as Faq[]).find((f) =>
        getFaqTerms(f).some((k) => lower.includes(k) || k.includes(lower)),
      );

      const wantsSupport = ["دعم", "موظف", "بشري", "خدمة العملاء", "اكلم حد", "كلم حد"].some(
        (keyword) => lower.includes(keyword),
      );
      const reply =
        match?.answer ??
        (wantsSupport
          ? "تمام، تم استلام رسالتك وسيتم متابعتها من فريق الدعم في أقرب وقت."
          : "تم استلام رسالتك. لو محتاج تتواصل مع فريق الدعم اكتب «دعم» وسيتم متابعتك.");

      const { data: botMessage, error: botErr } = await supabase
        .from("chat_messages")
        .insert({ conversation_id: conversationId, sender_type: "bot", content: reply })
        .select("id, conversation_id, sender_id, sender_type, content, created_at")
        .single();
      if (botErr) {
        console.error("[chat] bot reply error", botErr);
        toast.error("تم إرسال رسالتك لكن تعذر عرض الرد التلقائي.");
        return;
      }
      if (botMessage) {
        setMessages((prev) =>
          prev.some((m) => m.id === botMessage.id) ? prev : [...prev, botMessage as Msg],
        );
      }
    } catch (e) {
      console.error("[chat] send exception", e);
      toast.error("حدث خطأ غير متوقع.");
    } finally {
      setSending(false);
    }
  }

  if (!user) return null;

  const ready = !!conversationId && !!profileId && !loading;

  return (
    <>
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          size="icon"
          className="fixed bottom-24 left-4 z-40 h-14 w-14 rounded-full shadow-lg md:bottom-6"
          aria-label="فتح الدردشة"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
      {open && (
        <Card className="fixed bottom-24 left-4 z-40 flex h-[480px] w-[340px] flex-col overflow-hidden shadow-2xl md:bottom-6 max-w-[calc(100vw-2rem)]">
          <div className="flex items-center justify-between border-b border-border bg-primary px-3 py-2 text-primary-foreground">
            <p className="text-sm font-bold">الدردشة مع الدعم</p>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {loading && (
              <p className="text-center text-xs text-muted-foreground py-8">جارٍ التحميل…</p>
            )}
            {!loading && messages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-8">
                ابدأ المحادثة برسالتك الأولى…
              </p>
            )}
            {messages.map((m, index) => {
              const mine = m.sender_type === "customer";
              const showDate = !isSameMessageDay(messages[index - 1]?.created_at, m.created_at);
              return (
                <Fragment key={m.id}>
                  {showDate && (
                    <div className="flex justify-center py-1">
                      <span className="rounded-full border border-border bg-background px-3 py-1 text-[10px] font-bold text-muted-foreground">
                        {formatMessageDate(m.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={mine ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}
                    >
                      {m.sender_type === "bot" && (
                        <p className="mb-0.5 text-[10px] opacity-70">المساعد الآلي</p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      <p className="mt-1 text-end text-[10px] opacity-70" dir="ltr">
                        {formatMessageTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
          <div className="flex gap-2 border-t border-border p-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={ready ? "اكتب رسالتك…" : "جارٍ التجهيز…"}
              disabled={!ready}
            />
            <Button size="icon" onClick={send} disabled={!ready || sending || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
