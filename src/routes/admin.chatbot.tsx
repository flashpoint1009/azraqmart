import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, Save, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppSettings } from "@/hooks/useAppSettings";
import { isFeatureEnabled } from "@/lib/features";
import { useUserRoles } from "@/hooks/useUserRoles";

export const Route = createFileRoute("/admin/chatbot")({
  head: () => ({ meta: [{ title: "روبوت الدردشة — Zone Mart" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer"]}>
      <Page />
    </RoleGuard>
  ),
});

type Faq = {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string | null;
  sort_order: number;
  is_active: boolean;
};

const parseKeywords = (value: string, question = "") => {
  const clean = (text: string) => text.replace(/[؟?!.]/g, " ").replace(/\s+/g, " ").trim();
  const baseParts = [question, ...value.split(/[،,؛;|\n\r]+/)]
    .map(clean)
    .filter((k) => k.length > 1);
  const expanded = baseParts.flatMap((part) => {
    const words = part.split(/\s+/).filter((word) => word.length > 2 && !["إيه", "ايه"].includes(word));
    return [part, ...words];
  });
  return Array.from(new Set(expanded));
};

function Page() {
  const { can, isLoading: permLoading } = usePermissions();
  const { settings } = useAppSettings();
  const { hasAny } = useUserRoles();
  const isDev = hasAny("developer");
  const featureOn = isDev || isFeatureEnabled(settings?.features, "chatbot");

  if (permLoading) return null;
  if (!can("chatbot") && !isDev) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <StaffNav />
        <div className="mx-auto max-w-[900px] px-4 py-12 text-center text-muted-foreground">
          ليس لديك صلاحية لإدارة روبوت الدردشة.
        </div>
      </div>
    );
  }
  if (!featureOn) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <StaffNav />
        <div className="mx-auto max-w-[900px] px-4 py-12 text-center text-muted-foreground">
          ميزة روبوت الدردشة غير مفعّلة في هذه النسخة. يمكن للمطوّر تفعيلها من إعدادات المطوّر.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <StaffNav />
      <div className="border-b border-border bg-gradient-to-l from-accent/10 via-background to-primary/5">
        <div className="mx-auto max-w-[1100px] px-4 py-6 lg:px-6">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5" /> روبوت الدردشة
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">إدارة الأسئلة الشائعة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            أضف أسئلة وإجاباتها مع كلمات مفتاحية، وسيرد الشات تلقائياً عند تطابق أي كلمة مع رسالة العميل.
          </p>
        </div>
      </div>
      <main className="mx-auto max-w-[1100px] px-4 py-5 lg:px-6 space-y-4">
        <NewFaqCard />
        <FaqList />
      </main>
    </div>
  );
}

function NewFaqCard() {
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [keywords, setKeywords] = useState("");
  const [category, setCategory] = useState("general");

  const create = useMutation({
    mutationFn: async () => {
      if (!question.trim() || !answer.trim()) throw new Error("السؤال والإجابة مطلوبان");
      const kw = parseKeywords(keywords, question);
      const { error } = await supabase
        .from("chatbot_faqs")
        .insert({
          question: question.trim(),
          answer: answer.trim(),
          keywords: kw,
          category: category.trim() || "general",
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت إضافة السؤال");
      setQuestion(""); setAnswer(""); setKeywords(""); setCategory("general");
      qc.invalidateQueries({ queryKey: ["chatbot-faqs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <h2 className="font-bold inline-flex items-center gap-2"><Plus className="h-4 w-4" /> سؤال جديد</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input placeholder="السؤال (مثال: إزاي أطلب منتج؟)" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} />
        <Input placeholder="القسم (general, orders, payment...)" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={50} />
      </div>
      <Textarea placeholder="الإجابة التي سيرد بها الروبوت" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} maxLength={1000} />
      <Input
        placeholder="كلمات مفتاحية اختيارية — مثال: مساء الخير، مساء النور، تحية"
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">السؤال نفسه يُستخدم تلقائياً ككلمة مفتاحية، ويمكنك إضافة كلمات أخرى مفصولة بفاصلة.</p>
      <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full md:w-auto">
        <Plus className="h-4 w-4 me-1" /> {create.isPending ? "جارٍ الحفظ…" : "إضافة"}
      </Button>
    </Card>
  );
}

function FaqList() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["chatbot-faqs"],
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbot_faqs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Faq[];
    },
  });

  return (
    <Card className="p-4">
      <h2 className="font-bold mb-3 inline-flex items-center gap-2">
        <MessageSquare className="h-4 w-4" /> الأسئلة الحالية ({list.data?.length ?? 0})
      </h2>
      {list.isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
      {!list.isLoading && (list.data?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">لا توجد أسئلة بعد. أضف أول سؤال من الأعلى.</p>
      )}
      <div className="space-y-3">
        {list.data?.map((f) => <FaqRow key={f.id} faq={f} onChanged={() => qc.invalidateQueries({ queryKey: ["chatbot-faqs"] })} />)}
      </div>
    </Card>
  );
}

function FaqRow({ faq, onChanged }: { faq: Faq; onChanged: () => void }) {
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [keywords, setKeywords] = useState(faq.keywords.join(", "));
  const [category, setCategory] = useState(faq.category ?? "general");
  const [active, setActive] = useState(faq.is_active);

  const dirty =
    question !== faq.question ||
    answer !== faq.answer ||
    keywords !== faq.keywords.join(", ") ||
    category !== (faq.category ?? "general");

  const save = useMutation({
    mutationFn: async () => {
      if (!question.trim() || !answer.trim()) throw new Error("السؤال والإجابة مطلوبان");
      const kw = parseKeywords(keywords, question);
      const payload = {
        question: question.trim(),
        answer: answer.trim(),
        keywords: kw,
        category: category.trim() || "general",
      };
      const { data, error } = await supabase
        .from("chatbot_faqs")
        .update(payload)
        .eq("id", faq.id)
        .select("question, answer, keywords, category")
        .single();
      if (error) throw error;
      return data as Pick<Faq, "question" | "answer" | "keywords" | "category">;
    },
    onSuccess: (saved) => {
      setQuestion(saved.question);
      setAnswer(saved.answer);
      setKeywords(saved.keywords.join(", "));
      setCategory(saved.category ?? "general");
      toast.success("تم الحفظ");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase.from("chatbot_faqs").update({ is_active: next }).eq("id", faq.id);
      if (error) throw error;
    },
    onSuccess: () => { onChanged(); },
    onError: (e: Error) => { setActive(faq.is_active); toast.error(e.message); },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("chatbot_faqs").delete().eq("id", faq.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} className="font-bold" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px]">{category}</Badge>
          <Switch
            checked={active}
            onCheckedChange={(v) => { setActive(v); toggle.mutate(v); }}
          />
        </div>
      </div>
      <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} />
      <Input
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        placeholder="كلمات مفتاحية مفصولة بفاصلة"
      />
      <div className="flex items-center justify-between gap-2">
        <Input value={category} onChange={(e) => setCategory(e.target.value)} className="max-w-[200px]" placeholder="القسم" />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => del.mutate()} disabled={del.isPending}>
            <Trash2 className="h-3.5 w-3.5 me-1" /> حذف
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="h-3.5 w-3.5 me-1" /> حفظ
          </Button>
        </div>
      </div>
    </div>
  );
}
