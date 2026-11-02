import type { Category, ContentType, Language, PromotionType } from "@/shared/constants";
import type { enMessages } from "./locales/en";

/** English is the source of truth: every other locale must provide every key. */
export type TranslationKey = keyof typeof enMessages;
export type Dictionary = Record<TranslationKey, string>;

export type CategoryLabels = Record<Category, string> & Record<string, string>;
export type LanguageLabels = Record<Language, string> & Record<string, string>;
export type ContentTypeLabels = Record<ContentType, string> & Record<string, string>;
export type PromotionTypeLabels = Record<PromotionType, string> & Record<string, string>;

export type PromotionDetail = { desc: string; example: string };

/** One complete, independently loadable locale bundle. */
export type LocaleData = {
  messages: Dictionary;
  categories: CategoryLabels;
  languages: LanguageLabels;
  contentTypes: ContentTypeLabels;
  promotionTypes: PromotionTypeLabels;
  promotionDetails: Record<PromotionType, PromotionDetail>;
};
