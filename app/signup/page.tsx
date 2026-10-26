"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const { t } = useLang();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "brand" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <h1 className="font-display text-[30px] font-black">{t("auth.signupTitle")}</h1>
        <p className="mt-1 text-[14.5px] text-[#78716c]">{t("auth.signupSub")}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {(["brand", "creator"] as const).map((r) => (
            <button key={r} type="button" onClick={() => set("role", r)} className={`rounded-2xl border-2 p-4 text-left ${form.role === r ? "border-[#e4572e] bg-[#fff4de]" : "border-[#f0e6cc] bg-[#fffbf1]"}`}>
              <p className="text-[22px]">{r === "brand" ? "🏪" : "🎥"}</p>
              <p className="mt-1 text-[15px] font-extrabold capitalize">{t(r === "brand" ? "auth.brand" : "auth.creator")}</p>
              <p className="text-[12.5px] text-[#78716c]">{r === "brand" ? t("auth.brandHint") : t("auth.creatorHint")}</p>
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-5 grid gap-3">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder={form.role === "brand" ? t("auth.nameBrand") : t("auth.nameCreator")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
          <input value={form.email} onChange={(e) => set("email", e.target.value)} required type="email" placeholder={t("auth.email")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("auth.phone")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
          <input value={form.password} onChange={(e) => set("password", e.target.value)} required type="password" minLength={10} placeholder={t("auth.pwHint")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
          {err && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}
          <button disabled={saving} className="rounded-2xl bg-[#e4572e] py-3.5 text-[16px] font-extrabold text-white hover:bg-[#c7431f] disabled:opacity-60">{saving ? t("auth.creating") : t("auth.signupBtn")}</button>
        </form>
        <p className="mt-4 text-center text-[14px] text-[#78716c]">{t("auth.haveAccount")} <Link href="/login" className="font-bold text-[#e4572e]">{t("auth.login")}</Link></p>
      </div>
    </div>
  );
}
