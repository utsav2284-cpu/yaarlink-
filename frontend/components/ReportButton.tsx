"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLang } from "@/frontend/i18n";
import { solveBotChallenge } from "@/frontend/bot-challenge";
import PrivacyNotice from "@/frontend/components/PrivacyNotice";
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from "@/shared/constants";

type Props = {
  targetType: ReportTargetType;
  targetId: string;
  targetName?: string;
  className?: string;
  buttonClassName?: string;
};

export default function ReportButton({ targetType, targetId, targetName, className = "", buttonClassName = "" }: Props) {
  const { t, apiErrorKey } = useLang();
  const uid = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reason, setReason] = useState<ReportReason>("impersonation");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  const closeForm = (returnFocus = false) => {
    if (returnFocus) triggerRef.current?.focus();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => firstFieldRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      triggerRef.current?.focus();
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const formId = `report-form-${uid}`;
  const title = t(targetType === "campaign" ? "report.campaignTitle" : "report.creatorTitle");
  const buttonLabel = targetName ? `${t("report.button")}: ${targetName}` : t("report.button");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setErrorKey("");
    try {
      let botChallenge;
      try {
        botChallenge = await solveBotChallenge("report");
      } catch {
        setErrorKey("api.botChallengeFailed");
        return;
      }
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          details: details.trim() || undefined,
          reporterContact: contact.trim() || undefined,
          website_url: websiteUrl,
          botChallenge,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorKey(apiErrorKey(res.status, data?.code, "report.error"));
        return;
      }
      setSubmitted(true);
      setOpen(false);
    } catch {
      setErrorKey("report.error");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className={className} role="status">
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-[12.5px] font-semibold text-green-800">
          {t("report.success")}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeForm(true) : setOpen(true))}
        aria-expanded={open}
        aria-controls={formId}
        aria-label={buttonLabel}
        className={`inline-flex items-center gap-1 rounded-full border border-current px-2.5 py-1 text-[11.5px] font-bold ${buttonClassName}`}
      >
        <span aria-hidden="true">⚑</span>
        {t("report.button")}
      </button>

      {open && (
        <form
          id={formId}
          onSubmit={submit}
          className="mt-3 w-full rounded-2xl border border-[#e9ddc3] bg-white p-3 text-left text-[#1c1917] shadow-sm"
        >
          <p className="text-[13px] font-extrabold">{title}</p>

          <div className="hidden" aria-hidden="true">
            <input name="website_url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} tabIndex={-1} autoComplete="off" />
          </div>

          <label htmlFor={`${formId}-reason`} className="mt-2 block text-[11.5px] font-bold text-[#57534e]">
            {t("report.reason")}
          </label>
          <select
            ref={firstFieldRef}
            id={`${formId}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value as ReportReason)}
            className="mt-1 w-full rounded-lg border border-[#e9ddc3] bg-white px-2 py-2 text-[12.5px]"
          >
            {REPORT_REASONS.map((value) => (
              <option key={value} value={value}>
                {t(`report.${value}`)}
              </option>
            ))}
          </select>

          <label htmlFor={`${formId}-details`} className="mt-2 block text-[11.5px] font-bold text-[#57534e]">
            {t("report.details")}
          </label>
          <textarea
            id={`${formId}-details`}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder={t("report.detailsPh")}
            maxLength={1000}
            rows={3}
            className="mt-1 w-full resize-none rounded-lg border border-[#e9ddc3] px-2 py-2 text-[12.5px]"
          />

          <label htmlFor={`${formId}-contact`} className="mt-2 block text-[11.5px] font-bold text-[#57534e]">
            {t("report.contact")}
          </label>
          <input
            id={`${formId}-contact`}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder={t("report.contactPh")}
            maxLength={160}
            className="mt-1 w-full rounded-lg border border-[#e9ddc3] px-2 py-2 text-[12.5px]"
          />

          <PrivacyNotice textKey="privacy.reportNotice" compact className="mt-3" />

          {errorKey && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[12px] font-semibold text-red-700">
              {t(errorKey)}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-[#1c1917] px-3 py-2 text-[12.5px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t("report.sending") : t("report.submit")}
            </button>
            <button
              type="button"
              onClick={() => closeForm(true)}
              className="rounded-lg border border-[#e9ddc3] px-3 py-2 text-[12.5px] font-bold"
            >
              {t("report.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
