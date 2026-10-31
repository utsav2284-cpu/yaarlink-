"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";
import ContactLink from "@/frontend/components/ContactLink";
import PrivacyNotice from "@/frontend/components/PrivacyNotice";
import { useEffect, useState } from "react";
import {
  SITE,
  callLink,
  gmailComposeLink,
  instagramDmLink,
  instagramLink,
  mailtoLink,
  whatsappLink,
  whatsappWithText,
} from "@/config/site";

type Kind = "brand" | "creator" | "other";

const KIND_INFO: Record<Kind, { label: string; emoji: string; wa: string; placeholder: string; subject: string }> = {
  brand: {
    label: "I'm a Brand",
    emoji: "🏪",
    wa: "Hi YaarLink! 👋 I run a business and want to promote it with creators. Can we talk?",
    placeholder: "e.g. I run a salon in Chandigarh and want Diwali promos from local pages. Budget around ₹10,000.",
    subject: "Brand enquiry — YaarLink",
  },
  creator: {
    label: "I'm a Creator",
    emoji: "🎥",
    wa: "Hi YaarLink! 👋 I'm a creator / page owner and want to join your network for paid campaigns.",
    placeholder: "e.g. I run a Punjabi meme page with 50K followers and want paid Story promotions.",
    subject: "Creator enquiry — YaarLink",
  },
  other: {
    label: "Something else",
    emoji: "💬",
    wa: "Hi YaarLink! 👋 I have a question.",
    placeholder: "Partnerships, press, jobs, feedback — anything.",
    subject: "Hello YaarLink",
  },
};

function IconWhatsApp({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43a9.37 9.37 0 0 1 6.67 2.77 9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.24 9.43-9.44 9.43M20.08 3.9A11.3 11.3 0 0 0 12.05.58C5.8.58.7 5.67.7 11.93c0 2 .52 3.95 1.52 5.67L.6 23.5l6.04-1.58a11.33 11.33 0 0 0 5.41 1.38h.01c6.25 0 11.35-5.1 11.35-11.35 0-3.03-1.18-5.88-3.33-8.03" />
    </svg>
  );
}

function IconInstagram({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function ContactPage() {
  const [kind, setKind] = useState<Kind>("brand");
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const { t } = useLang();
  const [copied, setCopied] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const info = KIND_INFO[kind];

  // Inside a preview frame (e.g. arena.ai) browsers block outside links — show a hint.
  const [inFrame, setInFrame] = useState(false);
  useEffect(() => {
    try {
      setInFrame(window.self !== window.top);
    } catch {
      setInFrame(true);
    }
  }, []);

  const copy = async (label: string, value: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {}
    }
    if (ok) {
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } else {
      window.prompt("Copy this:", value);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!form.email.trim() && !form.phone.trim()) {
      setErr(t("cont.errNoContact"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kind }),
      });
      if (!res.ok) throw new Error("Failed");
      setDone(true);
    } catch {
      setErr(t("cont.errSend"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* HEADER */}
      <section className="border-b border-[#e9ddc3] bg-[#fff4de]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#e9ddc3] bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-[#57534e]">
            <span className="h-2 w-2 rounded-full bg-green-600" />
            Real people reply · {SITE.hours}
          </p>
          <h1 className="font-display mt-4 text-[36px] font-black leading-tight sm:text-[52px]">
            {t("cont.title")} <span className="marker-underline">{t("cont.titleB")}</span>
          </h1>
          <p className="mt-3 max-w-xl text-[16.5px] text-[#57534e]">
            {t("cont.sub")}
          </p>

          {/* who are you */}
          <div className="mt-6">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#a8a29e]">{t("cont.askAs")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(KIND_INFO) as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-full border px-4 py-2.5 text-[14px] font-bold ${
                    kind === k ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-white"
                  }`}
                >
                  {KIND_INFO[k].emoji}{" "}{t(k === "brand" ? "cont.kindBrand" : k === "creator" ? "cont.kindCreator" : "cont.kindOther")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {inFrame && (
          <div className="mb-6 rounded-2xl border border-[#ffc53d] bg-[#fff4de] p-4 text-[14px] text-[#57534e]">
            <p className="font-extrabold text-[#1c1917]">👀 You&apos;re viewing a preview</p>
            <p className="mt-1">
              This preview window blocks WhatsApp, Instagram, call and email links. They work normally on your live site.
              Here, tapping a button shows a QR code — scan it with your phone to open WhatsApp, Instagram, call or email.
            </p>
          </div>
        )}
        {/* CHANNELS */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* WhatsApp */}
          <div className="flex flex-col rounded-3xl bg-[#17452e] p-6 text-white">
            <div className="flex items-center justify-between">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#25D366]">
                <IconWhatsApp className="h-7 w-7 text-white" />
              </span>
              <span className="rounded-full bg-[#ffc53d] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[#1c1917]">
                Fastest
              </span>
            </div>
            <p className="mt-4 text-[19px] font-extrabold">{t("cont.wa")}</p>
            <p className="text-[14.5px] font-semibold text-white/80">{SITE.phoneDisplay}</p>
            <p className="mt-1 text-[13px] text-white/60">{t("cont.waSub")}</p>
            <ContactLink kind="whatsapp" href={whatsappWithText(info.wa)} value={SITE.phoneDisplay} title={t("cont.wa")} className="mt-auto block rounded-xl bg-[#25D366] py-3 text-center text-[14.5px] font-extrabold text-white hover:brightness-95 [margin-top:1.25rem]">
              {t("cont.waBtn")}
            </ContactLink>
          </div>

          {/* Call */}
          <div className="flex flex-col rounded-3xl border border-[#e9ddc3] bg-white p-6 card-shadow">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff4de] text-[24px]">📞</span>
            <p className="mt-4 text-[19px] font-extrabold">{t("cont.call")}</p>
            <p className="text-[14.5px] font-semibold text-[#57534e]">{SITE.phoneDisplay}</p>
            <p className="mt-1 text-[13px] text-[#a8a29e]">{SITE.hours}</p>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <ContactLink kind="call" href={callLink} value={SITE.phoneDisplay} title={t("cont.call")} className="rounded-xl bg-[#1c1917] py-3 text-center text-[14.5px] font-extrabold text-white hover:bg-black">
                {t("cont.callBtn")}
              </ContactLink>
              <button
                type="button"
                onClick={() => copy("phone", SITE.phoneDisplay)}
                className="rounded-xl border border-[#e9ddc3] px-3.5 text-[13px] font-bold"
                aria-label={t("cont.copy")}
              >
                {copied === "phone" ? "✓" : t("cont.copy")}
              </button>
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col rounded-3xl border border-[#e9ddc3] bg-white p-6 card-shadow">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff4de] text-[24px]">✉️</span>
            <p className="mt-4 text-[19px] font-extrabold">{t("cont.email")}</p>
            <p className="truncate text-[14.5px] font-semibold text-[#57534e]">{SITE.email}</p>
            <p className="mt-1 text-[13px] text-[#a8a29e]">{t("cont.emailSub")}</p>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <ContactLink kind="email" href={mailtoLink(info.subject)} webHref={gmailComposeLink(info.subject)} value={SITE.email} title="Email us" className="rounded-xl bg-[#1c1917] py-3 text-center text-[14.5px] font-extrabold text-white hover:bg-black">
                {t("cont.emailBtn")}
              </ContactLink>
              <button
                type="button"
                onClick={() => copy("email", SITE.email)}
                className="rounded-xl border border-[#e9ddc3] px-3.5 text-[13px] font-bold"
                aria-label={t("cont.copy")}
              >
                {copied === "email" ? "✓" : t("cont.copy")}
              </button>
            </div>
          </div>

          {/* Instagram */}
          <div className="flex flex-col rounded-3xl border border-[#e9ddc3] bg-white p-6 card-shadow">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e4572e] text-white">
              <IconInstagram className="h-6 w-6" />
            </span>
            <p className="mt-4 text-[19px] font-extrabold">{t("cont.ig")}</p>
            <p className="text-[14.5px] font-semibold text-[#57534e]">@{SITE.instagram}</p>
            <p className="mt-1 text-[13px] text-[#a8a29e]">{t("cont.igSub")}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <ContactLink kind="instagram" href={instagramLink} value={"@" + SITE.instagram} title={t("cont.ig")} className="rounded-xl bg-[#e4572e] py-3 text-center text-[14px] font-extrabold text-white hover:bg-[#c7431f]">
                {t("cont.follow")}
              </ContactLink>
              <ContactLink kind="instagram" href={instagramDmLink} value={"@" + SITE.instagram} title={t("cont.ig")} className="rounded-xl border border-[#e9ddc3] py-3 text-center text-[14px] font-extrabold">
                {t("cont.dm")}
              </ContactLink>
            </div>
          </div>
        </div>

        {/* FORM + SIDE */}
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          {done ? (
            <div className="rounded-[24px] border border-[#e9ddc3] bg-white p-10 text-center card-shadow">
              <p className="text-[48px]">💌</p>
              <h2 className="font-display mt-2 text-[28px] font-black">{t("cont.sentTitle")}</h2>
              <p className="mt-2 text-[15px] text-[#57534e]">
                {t("cont.sentBody2")} {form.name.split(" ")[0] || "yaar"} — {t("cont.sentBody")}
              </p>
              <p className="mt-1 text-[14px] text-[#78716c]">{t("cont.sentHint")}</p>
              <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                <ContactLink kind="whatsapp" href={whatsappWithText(info.wa)} value={SITE.phoneDisplay} title={t("cont.wa")} className="rounded-2xl bg-[#25D366] px-6 py-3 text-[14.5px] font-extrabold text-white">
                  {t("cont.sentWa")}
                </ContactLink>
                <button
                  onClick={() => { setDone(false); setForm({ name: "", email: "", phone: "", message: "" }); }}
                  className="rounded-2xl border border-[#e9ddc3] px-6 py-3 text-[14.5px] font-bold"
                >
                  {t("cont.another")}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="rounded-[24px] border border-[#e9ddc3] bg-white p-6 sm:p-8 card-shadow">
              <h2 className="font-display text-[26px] font-black">{t("cont.formTitle")}</h2>
              <p className="text-[14px] text-[#78716c]">{t("cont.formSub")}</p>
              <div className="mt-5 grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("cont.name")}</span>
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder={kind === "creator" ? t("cont.namePhCreator") : t("cont.namePhBrand")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-[13.5px] font-bold">Phone / WhatsApp</span>
                    <input value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" placeholder="98XXX XXXXX" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[13.5px] font-bold">Email</span>
                    <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" placeholder="you@gmail.com" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("cont.message")} <span className="font-medium text-[#a8a29e]">{t("cont.messageHint")}</span></span>
                  <textarea value={form.message} onChange={(e) => set("message", e.target.value)} required rows={5} placeholder={info.placeholder} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <PrivacyNotice textKey="privacy.contactNotice" />
                {err && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-700">{err}</p>}
                <button disabled={saving} className="rounded-2xl bg-[#e4572e] py-4 text-[16px] font-extrabold text-white hover:bg-[#c7431f] disabled:opacity-60">
                  {saving ? t("cont.sending") : t("cont.send")}
                </button>
              </div>
            </form>
          )}

          <div className="grid content-start gap-4">
            <div className="rounded-[24px] bg-[#1c1917] p-6 text-white">
              <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#ffc53d]">{t("cont.nextTitle")}</p>
              <ol className="mt-3 grid gap-3">
                {[
                  ["1", t("cont.next1")],
                  ["2", t("cont.next2")],
                  ["3", kind === "creator" ? t("cont.next3Creator") : t("cont.next3Brand")],
                ].map(([n, t]) => (
                  <li key={n} className="flex items-start gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ffc53d] text-[13px] font-black text-[#1c1917]">{n}</span>
                    <span className="text-[14.5px] text-white/85">{t}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-[24px] border border-[#e9ddc3] bg-white p-6">
              <p className="text-[16px] font-extrabold">{t("cont.skip")}</p>
              <p className="mt-1 text-[14px] text-[#57534e]">{t("cont.skipSub")}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/brands" className="rounded-xl bg-[#e4572e] py-3 text-center text-[14px] font-bold text-white">{t("cont.skipPost")}</Link>
                <Link href="/creators" className="rounded-xl border border-[#1c1917] py-3 text-center text-[14px] font-bold">{t("cont.skipJoin")}</Link>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#e9ddc3] bg-[#fffbf1] p-6">
              <p className="text-[15px] font-extrabold">📍 {SITE.city}</p>
              <p className="mt-1 text-[14px] text-[#57534e]">{t("cont.city")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating WhatsApp button (mobile) */}
      {whatsappLink && (
        <ContactLink kind="whatsapp" href={whatsappWithText(info.wa)} value={SITE.phoneDisplay} title={t("cont.wa")} ariaLabel="Chat on WhatsApp" className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_10px_25px_-5px_rgba(0,0,0,0.35)] sm:hidden">
          <IconWhatsApp className="h-7 w-7" />
        </ContactLink>
      )}
    </div>
  );
}
