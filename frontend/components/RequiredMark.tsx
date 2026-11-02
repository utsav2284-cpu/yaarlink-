"use client";

import { useLang } from "@/frontend/i18n";

/**
 * Visual required marker whose meaning is also available to assistive
 * technology. Use it alongside a real `required`/`aria-required` state.
 */
export default function RequiredMark() {
  const { t } = useLang();
  return (
    <>
      <span aria-hidden="true"> *</span>
      <span className="sr-only"> ({t("form.required")})</span>
    </>
  );
}
