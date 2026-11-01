"use client";

import type { ReactNode } from "react";
import { useLang } from "@/frontend/i18n";
import Reveal from "@/frontend/components/Reveal";

/**
 * "The real problems" — three everyday scenarios behind YaarLink's mission.
 * Illustrative situations, deliberately without names, photos or results:
 * these are not customer stories or testimonials (see "No fake numbers").
 * Visuals are typography + small hand-drawn SVG icons, as the project has
 * no photo assets or icon library.
 */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[26px] w-[26px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const StoreIcon = (
  <Icon>
    <path d="M3 9l1.8-5h14.4L21 9" />
    <path d="M3 9q3 4.5 6 0q3 4.5 6 0q3 4.5 6 0" />
    <path d="M5.5 11.8V20h13v-8.2" />
    <path d="M10 20v-4.5h4V20" />
  </Icon>
);

const CameraIcon = (
  <Icon>
    <rect x="2.5" y="6.5" width="12" height="11" rx="2.5" />
    <path d="M14.5 10.8 21 7.5v9l-6.5-3.3" />
    <path
      d="M7.2 9.9v4.2c0 .6.7 1 1.2.7l3.4-2.1c.5-.3.5-1 0-1.3L8.4 9.2c-.5-.3-1.2 0-1.2.7Z"
      fill="currentColor"
      stroke="none"
    />
  </Icon>
);

const BoardIcon = (
  <Icon>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <path d="M9 7.5v5" />
    <path d="M15 7.5v9" />
  </Icon>
);

type Story = {
  num: string;
  cat: string;
  title: string;
  paras: string[];
  take: string;
  icon: ReactNode;
  numClass: string;
  chipClass: string;
  barClass: string;
  spanClass?: string;
};

const STORIES: Story[] = [
  {
    num: "01",
    cat: "about.s1.cat",
    title: "about.s1.title",
    paras: ["about.s1.p1", "about.s1.p2", "about.s1.p3"],
    take: "about.s1.take",
    icon: StoreIcon,
    numClass: "text-[#c7431f]",
    chipClass: "bg-[#ffe8d6] text-[#c7431f]",
    barClass: "border-[#c7431f]",
  },
  {
    num: "02",
    cat: "about.s2.cat",
    title: "about.s2.title",
    paras: ["about.s2.p1", "about.s2.p2", "about.s2.p3"],
    take: "about.s2.take",
    icon: CameraIcon,
    numClass: "text-[#17452e]",
    chipClass: "bg-[#e8f1ea] text-[#17452e]",
    barClass: "border-[#17452e]",
  },
  {
    num: "03",
    cat: "about.s3.cat",
    title: "about.s3.title",
    paras: ["about.s3.p1", "about.s3.p2", "about.s3.p3"],
    take: "about.s3.take",
    icon: BoardIcon,
    numClass: "text-[#d97706]",
    chipClass: "bg-[#fff4de] text-[#92400e]",
    barClass: "border-[#ffc53d]",
    // On tablet (2-column grid) the third card spans the full row.
    spanClass: "sm:col-span-2 lg:col-span-1",
  },
];

export default function ProblemStories() {
  const { t } = useLang();

  return (
    <section className="mx-auto max-w-5xl px-4 pb-12 sm:px-6" aria-labelledby="problem-stories-title">
      <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">
        {t("about.stories.eyebrow")}
      </p>
      <h2
        id="problem-stories-title"
        className="font-display mt-2 max-w-2xl text-[32px] font-black leading-[1.12] sm:text-[40px]"
      >
        {t("about.stories.title")}
      </h2>
      <div className="mt-4 max-w-3xl space-y-3 text-[16.5px] leading-relaxed text-[#57534e]">
        <p>{t("about.stories.intro1")}</p>
        <p className="font-semibold text-[#1c1917]">{t("about.stories.intro2")}</p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STORIES.map((s, i) => (
          <Reveal key={s.num} delay={i * 110} className={`h-full ${s.spanClass ?? ""}`}>
            <article className="lift card-shadow flex h-full flex-col rounded-3xl border border-[#e9ddc3] bg-white p-7">
              <div className="flex items-start justify-between">
                <span className={`font-display text-[34px] font-black leading-none ${s.numClass}`} aria-hidden="true">
                  {s.num}
                </span>
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${s.chipClass}`} aria-hidden="true">
                  {s.icon}
                </span>
              </div>
              <p className="mt-5 text-[11.5px] font-bold uppercase tracking-widest text-[#6f6862]">{t(s.cat)}</p>
              <h3 className="font-display mt-1.5 text-[23px] font-black leading-snug">{t(s.title)}</h3>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[#57534e]">
                {s.paras.map((k) => (
                  <p key={k}>{t(k)}</p>
                ))}
              </div>
              <div className="mt-auto pt-6">
                <blockquote
                  className={`font-display border-l-[3px] ${s.barClass} pl-4 text-[16px] font-semibold leading-relaxed text-[#1c1917]`}
                >
                  {t(s.take)}
                </blockquote>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <p className="mt-5 text-center text-[13px] text-[#6f6862]">{t("about.stories.note")}</p>

      <Reveal>
        <div className="relative mt-6 overflow-hidden rounded-[28px] bg-[#1c1917] p-8 text-center sm:p-12">
          <div className="dotted-bg absolute inset-0 opacity-[0.13]" aria-hidden="true" />
          <div className="relative">
            <span className="mx-auto mb-6 block h-1 w-12 rounded-full bg-[#ffc53d]" aria-hidden="true" />
            <p className="font-display mx-auto max-w-3xl text-[24px] font-black leading-snug text-[#fff4de] sm:text-[30px]">
              {t("about.stories.banner")}
            </p>
            <p className="mt-4 text-[15px] font-medium text-white/70">{t("about.stories.bannerSub")}</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
