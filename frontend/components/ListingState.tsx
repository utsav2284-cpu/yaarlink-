"use client";

import { useLang } from "@/frontend/i18n";

type ListingLoadingProps = {
  count?: number;
  className?: string;
  itemClassName?: string;
  labelKey?: string;
};

export function ListingLoading({
  count = 3,
  className = "grid gap-3",
  itemClassName = "h-24 animate-pulse rounded-2xl bg-[#f0e6cc]/70",
  labelKey = "common.loading",
}: ListingLoadingProps) {
  const { t } = useLang();
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{t(labelKey)}</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden="true" className={itemClassName} />
      ))}
    </div>
  );
}

type ListingErrorProps = {
  errorKey: string;
  onRetry: () => void;
  className?: string;
  buttonClassName?: string;
};

export function ListingError({
  errorKey,
  onRetry,
  className = "rounded-2xl border border-red-200 bg-red-50 p-5 text-[14.5px] font-semibold text-red-800",
  buttonClassName = "mt-3 rounded-xl bg-[#1c1917] px-4 py-2 text-[13.5px] font-bold text-white hover:bg-black",
}: ListingErrorProps) {
  const { t } = useLang();
  return (
    <div role="alert" className={className}>
      <p>{t(errorKey)}</p>
      <button type="button" onClick={onRetry} className={buttonClassName}>
        {t("common.retry")}
      </button>
    </div>
  );
}

type ListingPaginationProps = {
  loaded: number;
  total: number;
  hasMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
  className?: string;
  textClassName?: string;
  buttonClassName?: string;
};

export function ListingPagination({
  loaded,
  total,
  hasMore,
  loading = false,
  onLoadMore,
  className = "mt-5 flex flex-col items-center gap-2",
  textClassName = "text-[13px] font-semibold text-[#6f6862]",
  buttonClassName = "rounded-2xl border border-[#1c1917] bg-white px-6 py-3 text-[14px] font-bold text-[#1c1917] hover:bg-[#fffbf1] disabled:cursor-not-allowed disabled:opacity-60",
}: ListingPaginationProps) {
  const { t, formatNumber } = useLang();
  if (total <= 0 && !hasMore) return null;
  return (
    <div className={className}>
      <p role="status" aria-live="polite" className={textClassName}>
        {t("listing.showing").replace("{loaded}", formatNumber(loaded)).replace("{total}", formatNumber(total))}
      </p>
      {hasMore && (
        <button type="button" disabled={loading} onClick={onLoadMore} className={buttonClassName}>
          {loading ? t("listing.loadingMore") : t("listing.loadMore")}
        </button>
      )}
    </div>
  );
}
