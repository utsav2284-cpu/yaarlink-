"use client";

import { useState } from "react";
import { useLang } from "@/frontend/i18n";
import {
  ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH,
  ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH,
  ADMIN_ACCOUNT_PASSWORD_RECOMMENDED_LENGTH,
  adminPasswordStrength,
  checkAdminPasswordRequirements,
} from "@/shared/admin-password-policy";
import { generateSuggestedPassword } from "@/shared/password-policy";

type AdminPasswordFieldProps = {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onSuggest?: (value: string) => void;
  placeholder?: string;
  describedBy?: string;
  inputClassName?: string;
  showGuidance?: boolean;
};

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M2.5 12S5.5 5.5 12 5.5 21.5 12 21.5 12 18.5 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M4 4l16 16" />
      <path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 9.5 6 9.5 6a17.6 17.6 0 0 1-3 3.5M6.6 8A16.9 16.9 0 0 0 2.5 12S5.5 18 12 18c1.2 0 2.2-.2 3.2-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

const STRENGTH_KEYS = [
  "adminIdentity.strength0",
  "adminIdentity.strength1",
  "adminIdentity.strength2",
  "adminIdentity.strength3",
  "adminIdentity.strength4",
] as const;

export default function AdminPasswordField({
  id,
  name,
  value,
  onChange,
  onSuggest,
  placeholder,
  describedBy,
  inputClassName = "w-full rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]",
  showGuidance = true,
}: AdminPasswordFieldProps) {
  const { t, formatNumber } = useLang();
  const [visible, setVisible] = useState(false);
  const requirements = checkAdminPasswordRequirements(value);
  const strength = adminPasswordStrength(value);
  const requirementsId = `${id}-requirements`;
  const strengthId = `${id}-strength`;
  const checklist = [
    { label: t("auth.pwdReqLength", { min: ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH }), met: requirements.minLength },
    { label: t("adminIdentity.pwdReqUppercase"), met: requirements.uppercase },
    { label: t("adminIdentity.pwdReqLowercase"), met: requirements.lowercase },
    { label: t("auth.pwdReqNumber"), met: requirements.number },
    { label: t("auth.pwdReqSymbol"), met: requirements.symbol },
  ];

  const suggest = () => {
    const generated = generateSuggestedPassword(ADMIN_ACCOUNT_PASSWORD_RECOMMENDED_LENGTH);
    onChange(generated);
    onSuggest?.(generated);
    setVisible(true);
  };

  return (
    <div className="grid gap-3">
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH}
          maxLength={ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH}
          autoComplete="new-password"
          placeholder={placeholder}
          aria-describedby={showGuidance ? [requirementsId, strengthId, describedBy].filter(Boolean).join(" ") : describedBy}
          className={inputClassName}
          style={{ paddingRight: "3rem" }}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={visible ? t("auth.pwdHide") : t("auth.pwdShow")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#6f6862] transition-colors hover:text-[#1c1917]"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {showGuidance && (
        <>
      <div>
        <div className="flex items-center justify-between gap-3 text-[12.5px] font-bold text-[#6f6862]">
          <span id={strengthId}>{t("adminIdentity.strength")}</span>
          <span aria-live="polite">
            {t(STRENGTH_KEYS[strength])} · {formatNumber(strength)}/4
          </span>
        </div>
        <div className="mt-1.5 flex gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${index < strength ? "bg-[#17452e]" : "bg-[#e9ddc3]"}`}
            />
          ))}
        </div>
      </div>

      <ul id={requirementsId} className="grid gap-1.5">
        {checklist.map((item) => (
          <li
            key={item.label}
            className={`flex items-center gap-2.5 text-[13.5px] font-semibold transition-colors duration-300 ${item.met ? "text-[#17452e]" : "text-[#6f6862]"}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border transition-all duration-300 ${
                item.met ? "border-[#17452e] bg-[#17452e] text-white" : "border-[#d8c9a3] bg-transparent text-transparent"
              }`}
            >
              <CheckIcon />
            </span>
            {item.met && <span className="sr-only">{t("auth.pwdReqMet")}</span>}
            {item.label}
          </li>
        ))}
      </ul>

      <p className="text-[13px] leading-relaxed text-[#6f6862]">{t("adminIdentity.recommended")}</p>
      <div>
        <button
          type="button"
          onClick={suggest}
          className="rounded-full bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-extrabold text-white transition-colors hover:bg-black"
        >
          {t("auth.pwdSuggest")}
        </button>
      </div>
        </>
      )}
    </div>
  );
}
