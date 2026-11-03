"use client";

import { useState } from "react";
import { useLang } from "@/frontend/i18n";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkPasswordRequirements,
  generateSuggestedPassword,
} from "@/shared/password-policy";

type NewPasswordFieldProps = {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** Called with the generated password too, so a confirm field can sync. */
  onSuggest?: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  /** Extra element ids to append to aria-describedby (the checklist is always included). */
  describedBy?: string;
  inputClassName?: string;
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

/**
 * Password-creation field shared by signup, password reset, and account
 * password change: rounded input with a show/hide toggle, four live
 * requirement indicators (segments + checklist), and a "Suggest one"
 * generator. Visuals follow the existing form design system (cream field,
 * ink focus border, deep-green success) rather than any external theme.
 * Requirement logic comes from `@/shared/password-policy` — the same
 * checker the server enforces.
 */
export default function NewPasswordField({
  id,
  name,
  value,
  onChange,
  onSuggest,
  placeholder,
  autoComplete = "new-password",
  describedBy,
  inputClassName = "rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]",
}: NewPasswordFieldProps) {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);
  const requirements = checkPasswordRequirements(value);
  const checklist = [
    { key: "auth.pwdReqLength" as const, met: requirements.minLength },
    { key: "auth.pwdReqCases" as const, met: requirements.letterCases },
    { key: "auth.pwdReqNumber" as const, met: requirements.number },
    { key: "auth.pwdReqSymbol" as const, met: requirements.symbol },
  ];
  const metCount = checklist.filter((item) => item.met).length;
  const requirementsId = `${id}-requirements`;

  const suggest = () => {
    const generated = generateSuggestedPassword();
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
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-describedby={[requirementsId, describedBy].filter(Boolean).join(" ")}
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

      <div className="flex gap-1.5" aria-hidden="true">
        {checklist.map((item, index) => (
          <span
            key={item.key}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${index < metCount ? "bg-[#17452e]" : "bg-[#e9ddc3]"}`}
          />
        ))}
      </div>

      <ul id={requirementsId} className="grid gap-1.5">
        {checklist.map((item) => (
          <li
            key={item.key}
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
            {t(item.key)}
          </li>
        ))}
      </ul>

      <div>
        <button
          type="button"
          onClick={suggest}
          className="rounded-full bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-extrabold text-white transition-colors hover:bg-black"
        >
          {t("auth.pwdSuggest")}
        </button>
      </div>
    </div>
  );
}
