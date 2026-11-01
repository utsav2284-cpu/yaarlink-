"use client";

import { useEffect, useId, useRef, useState } from "react";
import QRCode from "qrcode";
import { useLang } from "@/frontend/i18n";

export type ContactKind = "whatsapp" | "call" | "email" | "instagram";

type Props = {
  kind: ContactKind;
  /** Main link: wa.me, tel:, mailto:, instagram.com … */
  href: string;
  /** Human-readable detail shown & copied: number, email, @handle. */
  value: string;
  /** Title of the help popup, e.g. "WhatsApp us". */
  title: string;
  /** For email on computers: Gmail compose link (no mail app needed). */
  webHref?: string;
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
};

function detectEnv() {
  let inFrame = false;
  try {
    inFrame = window.self !== window.top;
  } catch {
    inFrame = true;
  }
  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.matchMedia?.("(pointer: coarse)").matches;
  return { inFrame, isMobile: !!isMobile };
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const EXTERNAL = new Set<ContactKind>(["whatsapp", "instagram"]);

/**
 * A contact button that always does something useful:
 * - Phone: opens WhatsApp / Instagram / dialler / mail app directly.
 * - Computer: WhatsApp Web, Instagram and Gmail open in a new tab; "Call" shows a QR code to scan.
 * - Inside a preview frame (where browsers block these links): shows a QR code + copy button.
 */
export default function ContactLink({ kind, href, value, title, webHref, className, ariaLabel, children }: Props) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"frame" | "desktop">("frame");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const dialogTitleId = `contact-dialog-${dialogId}-title`;
  const dialogDescriptionId = `contact-dialog-${dialogId}-description`;

  const closeModal = () => {
    triggerRef.current?.focus();
    setOpen(false);
  };

  useEffect(() => {
    if (!open || qr) return;
    QRCode.toDataURL(href, { margin: 1, width: 440, color: { dark: "#1c1917", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [open, href, qr]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        triggerRef.current?.focus();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const { inFrame, isMobile } = detectEnv();
    if (inFrame) {
      e.preventDefault();
      setReason("frame");
      setOpen(true);
      return;
    }
    if (kind === "email" && !isMobile && webHref) {
      e.preventDefault();
      window.open(webHref, "_blank", "noopener,noreferrer");
      return;
    }
    if (kind === "call" && !isMobile) {
      e.preventDefault();
      setReason("desktop");
      setOpen(true);
    }
  };

  const doCopy = async () => {
    const ok = await copyText(value);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  };

  const scanLabel =
    kind === "whatsapp"
      ? t("contactLink.scanWhatsApp")
      : kind === "call"
        ? t("contactLink.scanCall")
        : kind === "email"
          ? t("contactLink.scanEmail")
          : t("contactLink.scanInstagram");

  return (
    <>
      <a
        ref={triggerRef}
        href={href}
        onClick={onClick}
        aria-label={ariaLabel}
        className={className}
        {...(EXTERNAL.has(kind) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>

      {open && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDescriptionId}
            tabIndex={-1}
            data-testid="contact-dialog"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-[24px] bg-white p-6 text-center text-[#1c1917] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 text-left">
              <div className="min-w-0">
                <h2 id={dialogTitleId} className="text-[20px] font-extrabold">{title}</h2>
                <p className="break-all text-[16px] font-bold text-[#c7431f]">{value}</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeModal}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#e9ddc3] text-[16px]"
                aria-label={t("common.close")}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div className="mx-auto mt-4 grid h-[220px] w-[220px] place-items-center rounded-2xl border border-[#e9ddc3] bg-white p-2">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={t("contactLink.qrAlt").replace("{value}", value)} className="h-full w-full" />
              ) : (
                <span role="status" className="text-[13px] text-[#6f6862]">{t("common.loading")}</span>
              )}
            </div>
            <p id={dialogDescriptionId} className="mt-3 text-[14px] font-semibold text-[#57534e]">{scanLabel}</p>

            <button
              type="button"
              onClick={doCopy}
              aria-live="polite"
              className="mt-4 w-full rounded-xl bg-[#1c1917] py-3 text-[15px] font-extrabold text-white hover:bg-black"
            >
              {copied
                ? t("contactLink.copied")
                : kind === "email"
                  ? t("contactLink.copyEmail")
                  : kind === "instagram"
                    ? t("contactLink.copyLink")
                    : kind === "whatsapp"
                      ? t("contactLink.copyWhatsApp")
                      : t("contactLink.copyNumber")}
            </button>

            {reason === "frame" ? (
              <p className="mt-3 rounded-xl bg-[#fff4de] px-3 py-2.5 text-[12.5px] leading-snug text-[#6f6862]">
                {t("contactLink.frameNote")}
              </p>
            ) : (
              <a href={href} className="mt-3 block text-[13.5px] font-bold text-[#c7431f]">
                {t("contactLink.desktopCall")}
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
