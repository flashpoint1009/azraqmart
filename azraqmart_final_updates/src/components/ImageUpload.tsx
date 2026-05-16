import { Loader2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  label?: string;
};

export function ImageUpload({ value, onChange, folder = "uploads", label = "صورة" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الصورة كبيرة جداً (الحد الأقصى 5 ميجا)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("app-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("app-assets").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("تم رفع الصورة");
    } catch (e: any) {
      toast.error(e.message ?? "فشل رفع الصورة");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="text-[11px] font-bold text-muted-foreground block mb-1.5">{label}</label>
      {value ? (
        <div className="relative inline-block">
          <img src={value} alt="" className="h-24 w-24 rounded-xl object-cover border border-border" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -left-2 grid h-6 w-6 place-items-center rounded-full bg-destructive text-destructive-foreground shadow"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface-2 text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          <span className="text-[10px] font-bold">{uploading ? "جاري الرفع…" : "ارفع"}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
