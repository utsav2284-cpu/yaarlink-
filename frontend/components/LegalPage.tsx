"use client";

import Link from "next/link";
import { SITE, mailtoLink } from "@/config/site";
import { useLang, type Lang } from "@/frontend/i18n";

export type LegalPageKind = "privacy" | "terms" | "refunds" | "data-rights" | "account-deletion";

type LegalAction = {
  label: string;
  href: string;
  primary?: boolean;
};

type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

type LegalDoc = {
  title: string;
  intro: string;
  actions: LegalAction[];
  sections: LegalSection[];
};

type LegalCommon = {
  eyebrow: string;
  updated: string;
  contents: string;
  contactTitle: string;
  contactBody: string;
  emailButton: string;
  contactButton: string;
  emailSubject: string;
  translationNote: string;
};

const COMMON: Record<Lang, LegalCommon> = {
  en: {
    eyebrow: "Legal & privacy",
    updated: "Last updated: 31 October 2026",
    contents: "On this page",
    contactTitle: "Questions or a privacy request?",
    contactBody: "Contact YaarLink support. For an account request, use the email address on your account where possible so we can verify that the request is yours. Never send your password, a one-time link, or payment credentials.",
    emailButton: "Email us",
    contactButton: "Open contact page",
    emailSubject: "Privacy or legal question — YaarLink",
    translationNote: "This page is provided in English, Hindi and Punjabi for clarity. If a translation differs from the English text, the English version will be used to resolve the difference.",
  },
  hi: {
    eyebrow: "कानूनी और प्राइवेसी",
    updated: "आख़िरी अपडेट: 31 अक्टूबर 2026",
    contents: "इस पेज पर",
    contactTitle: "प्रश्न या प्राइवेसी अनुरोध?",
    contactBody: "YaarLink सपोर्ट से संपर्क करें। अकाउंट अनुरोध के लिए, जहाँ संभव हो अपने अकाउंट वाले ईमेल से लिखें ताकि हम सत्यापित कर सकें कि अनुरोध आपका है। अपना पासवर्ड, एक-बार का लिंक या पेमेंट जानकारी कभी न भेजें।",
    emailButton: "ईमेल करें",
    contactButton: "संपर्क पेज खोलें",
    emailSubject: "प्राइवेसी या कानूनी प्रश्न — YaarLink",
    translationNote: "यह पेज स्पष्टता के लिए अंग्रेज़ी, हिन्दी और पंजाबी में दिया गया है। यदि किसी अनुवाद और अंग्रेज़ी पाठ में अंतर हो, तो अंतर सुलझाने के लिए अंग्रेज़ी संस्करण उपयोग होगा।",
  },
  pa: {
    eyebrow: "ਕਾਨੂੰਨੀ ਅਤੇ ਪਰਾਈਵੇਸੀ",
    updated: "ਆਖਰੀ ਅਪਡੇਟ: 31 ਅਕਤੂਬਰ 2026",
    contents: "ਇਸ ਪੇਜ 'ਤੇ",
    contactTitle: "ਸਵਾਲ ਜਾਂ ਪਰਾਈਵੇਸੀ ਬੇਨਤੀ?",
    contactBody: "YaarLink ਸਪੋਰਟ ਨਾਲ ਸੰਪਰਕ ਕਰੋ। ਅਕਾਊਂਟ ਬੇਨਤੀ ਲਈ, ਜਿੱਥੇ ਸੰਭਵ ਹੋਵੇ ਆਪਣੇ ਅਕਾਊਂਟ ਵਾਲੀ ਈਮੇਲ ਤੋਂ ਲਿਖੋ ਤਾਂ ਜੋ ਅਸੀਂ ਪੁਸ਼ਟੀ ਕਰ ਸਕੀਏ ਕਿ ਬੇਨਤੀ ਤੁਹਾਡੀ ਹੈ। ਆਪਣਾ ਪਾਸਵਰਡ, ਇੱਕ-ਵਾਰੀ ਲਿੰਕ ਜਾਂ ਪੇਮੈਂਟ ਜਾਣਕਾਰੀ ਕਦੇ ਨਾ ਭੇਜੋ।",
    emailButton: "ਈਮੇਲ ਕਰੋ",
    contactButton: "ਸੰਪਰਕ ਪੇਜ ਖੋਲ੍ਹੋ",
    emailSubject: "ਪਰਾਈਵੇਸੀ ਜਾਂ ਕਾਨੂੰਨੀ ਸਵਾਲ — YaarLink",
    translationNote: "ਇਹ ਪੇਜ ਸਪਸ਼ਟਤਾ ਲਈ ਅੰਗਰੇਜ਼ੀ, ਹਿੰਦੀ ਅਤੇ ਪੰਜਾਬੀ ਵਿੱਚ ਦਿੱਤਾ ਗਿਆ ਹੈ। ਜੇ ਕਿਸੇ ਅਨੁਵਾਦ ਅਤੇ ਅੰਗਰੇਜ਼ੀ ਪਾਠ ਵਿੱਚ ਫਰਕ ਹੋਵੇ, ਤਾਂ ਫਰਕ ਸੁਲਝਾਉਣ ਲਈ ਅੰਗਰੇਜ਼ੀ ਸੰਸਕਰਣ ਵਰਤਿਆ ਜਾਵੇਗਾ।",
  },
};

const DOCS: Record<Lang, Record<LegalPageKind, LegalDoc>> = {
  en: {
    privacy: {
      title: "Privacy Policy",
      intro: "This policy explains what personal information YaarLink collects on theyaar.com, why we use it, when it is public or shared, and the choices you have.",
      actions: [
        { label: "Your data rights", href: "/data-rights", primary: true },
        { label: "Account & security", href: "/account" },
        { label: "Delete account guide", href: "/account-deletion" },
      ],
      sections: [
        {
          heading: "1. Who we are",
          paragraphs: [
            "YaarLink operates theyaar.com, a marketplace that helps brands and local businesses discover creators, meme pages and communities, and helps creators find campaign opportunities.",
            "For privacy questions or grievances, contact YaarLink support using the email address or contact page shown at the end of this policy. YaarLink is based in Punjab, India.",
          ],
        },
        {
          heading: "2. Information we collect",
          bullets: [
            "Account information: your name, email address, optional phone number, account role (brand or creator), email-verification status, account dates, and a hashed password. We do not store your plain-text password.",
            "Pending-signup information: the details submitted before email verification and a hashed one-time verification token. A usable account is created only after verification.",
            "Profile and campaign information: business or creator names, contact details, social profile links, category, languages, location, audience or follower information, campaign descriptions, budget, verification codes, and moderation status.",
            "Application and communication information: the application name, contact and message you enter, application status and decision notes, notifications, contact-form messages, and listing reports.",
            "Technical and security information: session identifiers, browser/device user-agent information, sign-in and activity times, IP addresses used for rate limits, security and admin audit logs, and limited hosting or email-delivery logs.",
            "Preferences: your selected site language is stored in your browser's local storage.",
          ],
          paragraphs: [
            "YaarLink does not intentionally collect card, bank-login or UPI PIN details through this website. Do not put passwords, one-time codes or payment credentials in contact, campaign, profile or application fields.",
          ],
        },
        {
          heading: "3. Why we use information",
          bullets: [
            "Create, verify, authenticate and secure accounts and sessions.",
            "Review and moderate creator profiles and campaigns before they become public.",
            "Display approved public listings and operate search, applications, decisions and notifications.",
            "Send transactional emails such as signup verification, password reset, email-change, application-status and account-security messages.",
            "Respond to support messages, listing reports and privacy requests.",
            "Prevent spam, fraud, impersonation, misuse and security incidents; enforce our Terms; debug and maintain the service.",
            "Comply with applicable law and respond to lawful requests.",
          ],
        },
        {
          heading: "4. What is public",
          bullets: [
            "An approved and verified creator profile may publicly show the creator or page name, social links, platform, verified follower count, category, languages, location, content types and bio. Creator phone numbers and email addresses are not included in the public listing response.",
            "An open and verified campaign may publicly show the business name, campaign title and description, promotion type, category, location, language, target audience, format and website. Campaign budget, phone and email are not included in the public listing response.",
            "Anything you place in a public profile or campaign field can be viewed, copied or indexed by others after the listing is approved. Do not put private personal information in public fields.",
          ],
        },
        {
          heading: "5. Applications and sharing",
          paragraphs: [
            "When you apply to a campaign, only the name, contact and message entered in that application form are shared with that campaign's brand. YaarLink does not automatically substitute your account phone number or account email address. You must enter the exact contact you want the brand to use and confirm the sharing before submission.",
          ],
          bullets: [
            "The campaign brand and authorised YaarLink administrators can view application details needed to operate and moderate the marketplace.",
            "Brands are instructed to use an applicant's contact only for that campaign application and related work, not for unrelated marketing, sale, sharing or spam.",
            "Withdrawing an application stops its active use on YaarLink, but it cannot recall screenshots, notes or messages that a recipient already copied outside YaarLink.",
            "We use service providers for hosting, database storage, transactional email and security. They process information only as needed to provide those services.",
            "We may disclose information when required by law, to protect people or the service, to investigate fraud or abuse, or as part of a business transfer subject to appropriate safeguards.",
            "We do not sell or rent personal information.",
          ],
        },
        {
          heading: "6. Cookies and local storage",
          bullets: [
            "Essential, signed session cookies keep users and administrators signed in and help protect accounts. Disabling them can prevent login and account features from working.",
            "Server-side session records store limited browser/device information and activity times so you can review and revoke devices in Account & security.",
            "Your language choice is saved in local storage. We do not use that preference to build an advertising profile.",
            "External services you open—such as WhatsApp, Instagram, YouTube or a brand/creator website—have their own privacy practices.",
          ],
        },
        {
          heading: "7. Retention and security",
          paragraphs: [
            "We keep information while an account, listing, application, support request or security purpose remains active, and for a reasonable period afterwards where needed for dispute handling, fraud prevention, accounting, legal compliance or service security. One-time signup and account-action tokens expire, and sessions expire or can be revoked.",
            "We use measures such as hashed passwords, hashed one-time tokens, access-controlled admin tools, private API responses for account data, and database access restrictions. No online service can guarantee absolute security, so please use a unique password and contact us if you suspect unauthorised access.",
          ],
        },
        {
          heading: "8. Your choices and rights",
          bullets: [
            "View and download your account data from Account & security.",
            "Correct account email or phone, edit your profile or campaign, and edit or withdraw eligible applications from your dashboard.",
            "Revoke signed-in devices and delete your account from Account & security.",
            "Ask us for access, correction, deletion, consent withdrawal or grievance help through the Data Rights page, especially for contact messages or reports that are not controlled from an account.",
            "We may need to verify your identity and may retain limited information where necessary for security, fraud prevention, disputes or legal obligations.",
          ],
        },
        {
          heading: "9. Children, international processing and changes",
          bullets: [
            "YaarLink is intended for people who can legally agree to the Terms, or who use it with parent/guardian permission where required. Contact us if you believe a child's information was submitted without appropriate permission.",
            "Our hosting, database and email providers may process information in India or other countries where they operate, subject to their safeguards.",
            "We may update this policy as the service or law changes. The new version will be posted here with a revised date; significant changes may also be announced on the website or by email where appropriate.",
          ],
        },
      ],
    },
    terms: {
      title: "Terms of Service",
      intro: "These terms govern your use of YaarLink and theyaar.com. By creating an account or using the marketplace, you agree to these terms and the Privacy Policy.",
      actions: [
        { label: "Privacy Policy", href: "/privacy", primary: true },
        { label: "Payments & Refunds", href: "/refund-policy" },
        { label: "Your data rights", href: "/data-rights" },
      ],
      sections: [
        {
          heading: "1. The YaarLink service",
          paragraphs: [
            "YaarLink helps brands and local businesses describe campaigns, helps creators and pages present profiles, and lets eligible creators apply to open campaigns. YaarLink reviews listings before publication and provides application status and notification tools.",
            "YaarLink does not guarantee that a campaign will receive applications, that a creator will be hired, that content will achieve any reach or sales result, or that another user will perform or pay. Users remain responsible for checking the other party and agreeing the work, price, dates and payment terms.",
          ],
        },
        {
          heading: "2. Eligibility and accounts",
          bullets: [
            "You must be legally able to enter this agreement, or have permission from a parent or guardian where required.",
            "Use an email address you control, keep account information accurate, and create the correct brand or creator account for the features you use.",
            "Keep your password and verification links private. You are responsible for activity under your account unless you notify us promptly of unauthorised use.",
            "Do not create accounts to impersonate another person, business, creator or page, or to evade moderation or security controls.",
          ],
        },
        {
          heading: "3. Profiles, campaigns and verification",
          bullets: [
            "Submit only information and social links that you own or are authorised to use. Keep follower counts, business details, budgets and campaign descriptions accurate and current.",
            "YaarLink may approve, reject, suspend, pause, remove or ask for verification of a profile or campaign. A reviewed or verified badge means checks were performed at a point in time; it is not a guarantee of identity, audience quality, performance or future conduct.",
            "Material edits to a public profile or campaign may require fresh review before the listing becomes or remains public.",
            "You grant YaarLink permission to store and display submitted listing information as needed to operate, moderate and promote the marketplace listing, subject to the Privacy Policy.",
          ],
        },
        {
          heading: "4. Applications and contacts",
          bullets: [
            "Only eligible creator accounts with a creator profile may apply to campaigns.",
            "A creator chooses the exact application contact. By confirming submission, the creator authorises YaarLink to show the entered name, contact and message to that campaign's brand.",
            "A brand may use applicant information only to evaluate and manage that application or campaign and related agreed work. The brand must not sell, rent, publish, spam or use it for unrelated marketing.",
            "An application or status on YaarLink does not by itself create employment, agency, partnership or a payment guarantee. Brands and creators should confirm deliverables, usage rights, dates, price and payment method before work starts.",
          ],
        },
        {
          heading: "5. Acceptable use",
          bullets: [
            "Do not post unlawful, deceptive, infringing, harassing, hateful, sexually exploitative, dangerous or fraudulent content or campaigns.",
            "Do not impersonate others, fake engagement or followers, submit spam, scrape personal contact details, or collect user information except as expressly permitted for a legitimate application.",
            "Do not bypass login, verification, rate limits, moderation or other security measures, and do not interfere with the service or another user's account.",
            "Follow applicable advertising, consumer-protection, intellectual-property, platform and disclosure rules for sponsored content.",
          ],
        },
        {
          heading: "6. Content and intellectual property",
          paragraphs: [
            "You retain ownership of content and information you submit. You are responsible for ensuring that you have the rights needed to submit and use it. YaarLink's name, branding, website design and software remain the property of YaarLink or its licensors and are not licensed to you except for normal use of the service.",
            "If you believe a listing infringes your rights or impersonates you, use the report control on the listing or contact support with enough information for review.",
          ],
        },
        {
          heading: "7. Payments",
          paragraphs: [
            "YaarLink does not currently provide an in-website checkout, escrow or payment-processing service. A campaign budget is an indication of intended spend, not a charge or deposit. Payments between brands and creators are handled directly unless a separate written agreement with YaarLink says otherwise. See the Payments & Refunds policy.",
          ],
        },
        {
          heading: "8. Availability, third parties and liability",
          bullets: [
            "The service may change, pause or be unavailable for maintenance, security or technical reasons.",
            "Links and integrations for WhatsApp, Instagram, YouTube and user websites are operated by third parties; YaarLink is not responsible for their content, availability or privacy practices.",
            "To the extent permitted by law, YaarLink is not liable for another user's conduct, indirect or consequential losses, lost profits, or results that were not expressly guaranteed in a signed written agreement. Nothing in these terms excludes liability that cannot legally be excluded.",
          ],
        },
        {
          heading: "9. Suspension, deletion and changes",
          bullets: [
            "You may delete your account from Account & security. Deletion is permanent and also removes linked listings and applications as described on the Delete Account page.",
            "YaarLink may restrict or terminate access for suspected fraud, impersonation, abuse, security risk, unlawful conduct or material violation of these terms.",
            "We may update these terms. The revised version will be posted here with a new date, and continued use after the effective date means you accept the updated terms.",
            "These terms are governed by the laws of India. Contact support first so we can try to resolve a concern informally.",
          ],
        },
      ],
    },
    refunds: {
      title: "Payments, Cancellation & Refunds",
      intro: "This policy explains how money works on YaarLink today. The most important point is that the website itself does not currently collect online payments.",
      actions: [
        { label: "Contact support", href: "/contact", primary: true },
        { label: "Terms of Service", href: "/terms" },
        { label: "Privacy Policy", href: "/privacy" },
      ],
      sections: [
        {
          heading: "1. No website checkout at present",
          bullets: [
            "Creating an account, joining as a creator, posting a campaign for review and applying to a campaign do not trigger an online payment on theyaar.com.",
            "The budget entered on a campaign form is the brand's intended campaign budget. It is not a payment, deposit, escrow balance, price guarantee or amount held by YaarLink.",
            "YaarLink does not ask for card details, bank-login details or a UPI PIN through website forms. Stop and contact support if anyone claiming to represent YaarLink asks for those secrets.",
          ],
        },
        {
          heading: "2. Paid services agreed separately",
          paragraphs: [
            "If YaarLink provides a paid managed service, the price, taxes, deliverables, dates, included creators and payment schedule must be confirmed in a written quote, invoice or agreement before payment. That written document controls the specific engagement if it differs from this general policy.",
          ],
        },
        {
          heading: "3. Cancellation and refund eligibility for amounts paid to YaarLink",
          bullets: [
            "If you cancel a paid YaarLink service before work begins, the unused amount paid to YaarLink is eligible for refund, less only non-recoverable third-party costs already incurred for your confirmed engagement.",
            "If work has started or deliverables were provided, any refund is assessed against completed work, committed creator/third-party costs and the written agreement.",
            "If YaarLink cannot start an agreed service, the unused amount paid for that service is eligible for refund.",
            "Verified duplicate or erroneous payments made to YaarLink are eligible for refund of the duplicate or excess amount.",
            "A refund is not guaranteed merely because campaign reach, engagement or sales differ from expectations, unless a specific result was expressly guaranteed in the written agreement.",
          ],
        },
        {
          heading: "4. Payments made directly between a brand and creator",
          bullets: [
            "Unless a separate written agreement clearly says YaarLink is collecting the money, brand-to-creator payments are direct transactions between those parties.",
            "YaarLink cannot refund money it did not receive, reverse a bank/UPI transfer, or act as escrow for a direct deal.",
            "Before paying, confirm the legal/business name, deliverables, posting dates, content rights, amount, tax treatment and payment reference in writing. Keep invoices and transfer receipts.",
            "If you suspect fraud or impersonation, contact your bank/payment provider promptly and report the listing or user to YaarLink so we can review the account or listing.",
          ],
        },
        {
          heading: "5. How to request a refund from YaarLink",
          bullets: [
            "Email support from the account email address and include the campaign, payment date, amount, payment method and transaction reference. Do not send card numbers, bank passwords or UPI PINs.",
            "We may ask for information needed to verify the payer and the engagement. Approved refunds are returned to the original payment method where possible.",
            "Bank and payment-provider processing times vary after a refund is approved and submitted.",
            "If a chargeback or payment dispute is raised, the outcome may also be governed by the bank or payment provider's process.",
          ],
        },
        {
          heading: "6. Changes to this policy",
          paragraphs: [
            "If YaarLink introduces website checkout or paid subscriptions later, the checkout terms and an updated version of this policy will explain the charges, cancellation window and refund process before payment is collected.",
          ],
        },
      ],
    },
    "data-rights": {
      title: "Your Data Rights",
      intro: "You can manage most account information yourself. This page shows the self-service controls and how to ask YaarLink for help with access, correction, deletion or a privacy grievance.",
      actions: [
        { label: "Open Account & security", href: "/account", primary: true },
        { label: "Delete account guide", href: "/account-deletion" },
        { label: "Contact support", href: "/contact" },
      ],
      sections: [
        {
          heading: "1. Choices available to you",
          bullets: [
            "Access a copy of your account, profile, campaign, application, notification, report and session information through the data download.",
            "Correct inaccurate account, profile, campaign or application information, subject to listing-review rules.",
            "Withdraw an eligible application so it is no longer active for the brand.",
            "Withdraw consent for future processing where consent is the basis for that processing; withdrawal does not undo lawful sharing that already happened.",
            "Delete your account and linked marketplace data.",
            "Revoke individual devices or all other signed-in sessions.",
            "Raise a privacy question or grievance with YaarLink support.",
          ],
        },
        {
          heading: "2. Do it yourself while signed in",
          bullets: [
            "Account & security: verify or change email, change phone or password, review/revoke devices, download data and delete the account.",
            "Creator dashboard: edit or delete a creator profile and edit or withdraw eligible applications.",
            "Brand dashboard: edit, pause, close, republish or delete campaigns and manage application decisions.",
            "Public listing pages: report impersonation, scams, spam or incorrect information for moderation review.",
          ],
        },
        {
          heading: "3. Ask us for help",
          paragraphs: [
            "Use the contact page or email support with the subject “Privacy request — YaarLink”. Tell us whether you want access, correction, deletion, consent withdrawal or grievance review. Include the account email and enough context—such as the listing name or approximate message date—for us to find the record.",
            "Do not send your password, reset link, verification code, card number, bank password or UPI PIN. If you cannot access the account, use password reset first where possible.",
          ],
        },
        {
          heading: "4. If you do not have an account",
          paragraphs: [
            "People who used the contact form or submitted a report without an account may also request access or deletion. Include the name, email or phone and approximate date used in that message so we can locate it. We may ask for proportionate proof that the record belongs to you.",
          ],
        },
        {
          heading: "5. Verification, timing and limits",
          bullets: [
            "We may verify identity through the account email or signed-in account before disclosing or deleting personal information.",
            "We aim to acknowledge requests promptly and complete them within 30 days where feasible. If a request is complex or a legal issue must be checked, we will explain the delay.",
            "Some information may need to be retained for security, fraud prevention, dispute handling, tax/accounting or legal compliance. If a request cannot be fully granted, we will explain the reason where permitted.",
            "A request made for another person may require proof of authority.",
            "Deleting data from YaarLink cannot delete copies that another user lawfully received and stored outside YaarLink, such as an application contact saved by a brand before withdrawal.",
          ],
        },
        {
          heading: "6. Complaints",
          paragraphs: [
            "Please contact YaarLink support first so we can investigate and try to resolve the concern. Using this process does not remove any rights or remedies available to you under applicable law.",
          ],
        },
      ],
    },
    "account-deletion": {
      title: "Delete Your Account",
      intro: "This public guide explains how to permanently delete a YaarLink account, what is removed, and what to do if you cannot sign in.",
      actions: [
        { label: "Go to account deletion", href: "/account#delete-account", primary: true },
        { label: "Download your data first", href: "/account#export-data" },
        { label: "Reset password", href: "/forgot-password" },
      ],
      sections: [
        {
          heading: "1. Before you delete",
          bullets: [
            "Download your data from Account & security if you may need your profile, campaigns, applications or notifications later.",
            "Finish, pause, close or withdraw active campaigns and applications first if another user is relying on them.",
            "Deletion is immediate and permanent. You may sign up again later, but the deleted account and its marketplace history cannot be restored.",
          ],
        },
        {
          heading: "2. Steps to delete",
          bullets: [
            "Sign in to the YaarLink account you want to delete.",
            "Open Account & security from the dashboard or signed-in menu.",
            "Optionally download your data from the “Download your data” section.",
            "Go to the “Delete account” section.",
            "Enter your current password and type the exact account email address.",
            "Confirm permanent deletion. You will be signed out and the account will be removed.",
          ],
        },
        {
          heading: "3. What is deleted",
          bullets: [
            "Your user account and sign-in sessions.",
            "Your brand record or creator profile.",
            "Campaigns you own and applications linked to those campaigns.",
            "Applications you submitted, notifications and account-action tokens.",
            "Public access to your creator profile and campaigns.",
          ],
        },
        {
          heading: "4. What may be anonymised or retained",
          bullets: [
            "Listing reports you submitted may keep the report reason and moderation details, but the account reference, reporter name and reporter contact are removed.",
            "Separate contact-form messages are not automatically linked to an account; ask through Your Data Rights if you also want a specific message reviewed or deleted.",
            "Limited security, fraud-prevention, accounting, dispute or legal records may be retained where necessary and permitted by law.",
            "Service-provider logs or backups may retain copies for a limited period before routine overwriting or deletion.",
            "Information another user already received and copied outside YaarLink—for example an application contact or a direct WhatsApp conversation—cannot be deleted by YaarLink account deletion.",
          ],
        },
        {
          heading: "5. If you cannot sign in",
          bullets: [
            "Use Forgot password to reset access through the account email, then delete the account yourself.",
            "If you no longer control the account email, contact support. We will need to verify identity before helping; never share your password, reset link or verification code with support or another user.",
            "If you only need a break, consider pausing a campaign, withdrawing applications, deleting a single listing, changing your phone/email, or revoking devices instead of deleting the whole account.",
          ],
        },
      ],
    },
  },
  hi: {
    privacy: {
      title: "प्राइवेसी नीति",
      intro: "यह नीति बताती है कि YaarLink theyaar.com पर कौन-सी व्यक्तिगत जानकारी इकट्ठा करता है, उसका उपयोग क्यों करता है, वह कब सार्वजनिक या शेयर होती है, और आपके पास क्या विकल्प हैं।",
      actions: [
        { label: "आपके डेटा अधिकार", href: "/data-rights", primary: true },
        { label: "अकाउंट और सुरक्षा", href: "/account" },
        { label: "अकाउंट हटाने की गाइड", href: "/account-deletion" },
      ],
      sections: [
        {
          heading: "1. हम कौन हैं",
          paragraphs: [
            "YaarLink theyaar.com चलाता है—एक मार्केटप्लेस जो ब्रांड और लोकल बिज़नेस को क्रिएटर्स, मीम पेज और कम्युनिटीज़ खोजने तथा क्रिएटर्स को कैंपेन अवसर खोजने में मदद करता है।",
            "प्राइवेसी प्रश्न या शिकायत के लिए इस नीति के अंत में दिए ईमेल या संपर्क पेज से YaarLink सपोर्ट से संपर्क करें। YaarLink पंजाब, भारत में स्थित है।",
          ],
        },
        {
          heading: "2. हम कौन-सी जानकारी इकट्ठा करते हैं",
          bullets: [
            "अकाउंट जानकारी: नाम, ईमेल, वैकल्पिक फोन, अकाउंट भूमिका (ब्रांड या क्रिएटर), ईमेल-सत्यापन स्थिति, अकाउंट तिथियाँ और हैश किया गया पासवर्ड। हम आपका सादा पासवर्ड सेव नहीं करते।",
            "लंबित साइन-अप जानकारी: ईमेल सत्यापन से पहले दी गई जानकारी और हैश किया गया एक-बार का सत्यापन टोकन। उपयोग योग्य अकाउंट सत्यापन के बाद ही बनता है।",
            "प्रोफाइल और कैंपेन जानकारी: बिज़नेस या क्रिएटर नाम, संपर्क विवरण, सोशल प्रोफाइल लिंक, कैटेगरी, भाषाएँ, स्थान, ऑडियंस या फॉलोअर जानकारी, कैंपेन विवरण, बजट, सत्यापन कोड और मॉडरेशन स्थिति।",
            "आवेदन और संचार जानकारी: आवेदन में लिखा नाम, संपर्क और संदेश, आवेदन स्थिति और निर्णय नोट, सूचनाएँ, संपर्क-फॉर्म संदेश और लिस्टिंग रिपोर्ट।",
            "तकनीकी और सुरक्षा जानकारी: सेशन पहचान, ब्राउज़र/डिवाइस यूज़र-एजेंट, साइन-इन और गतिविधि समय, रेट-लिमिट, सुरक्षा और एडमिन ऑडिट लॉग के लिए IP पते तथा सीमित होस्टिंग या ईमेल-डिलीवरी लॉग।",
            "पसंद: आपकी चुनी गई साइट भाषा ब्राउज़र के लोकल स्टोरेज में सेव होती है।",
          ],
          paragraphs: [
            "YaarLink इस वेबसाइट के ज़रिए कार्ड, बैंक-लॉगिन या UPI PIN विवरण जानबूझकर इकट्ठा नहीं करता। संपर्क, कैंपेन, प्रोफाइल या आवेदन फ़ील्ड में पासवर्ड, एक-बार के कोड या पेमेंट रहस्य न लिखें।",
          ],
        },
        {
          heading: "3. जानकारी का उपयोग क्यों",
          bullets: [
            "अकाउंट और सेशन बनाना, सत्यापित करना, प्रमाणित करना और सुरक्षित रखना।",
            "क्रिएटर प्रोफाइल और कैंपेन सार्वजनिक होने से पहले उनकी जाँच और मॉडरेशन।",
            "स्वीकृत सार्वजनिक लिस्टिंग दिखाना तथा खोज, आवेदन, निर्णय और सूचनाएँ चलाना।",
            "साइन-अप सत्यापन, पासवर्ड रीसेट, ईमेल बदलाव, आवेदन-स्थिति और अकाउंट-सुरक्षा जैसे लेन-देन ईमेल भेजना।",
            "सपोर्ट संदेश, लिस्टिंग रिपोर्ट और प्राइवेसी अनुरोधों का जवाब देना।",
            "स्पैम, धोखाधड़ी, नकली पहचान, दुरुपयोग और सुरक्षा घटनाओं को रोकना; शर्तें लागू करना; सेवा को ठीक और बनाए रखना।",
            "लागू कानून का पालन और कानूनी अनुरोधों का जवाब।",
          ],
        },
        {
          heading: "4. क्या सार्वजनिक होता है",
          bullets: [
            "स्वीकृत और सत्यापित क्रिएटर प्रोफाइल में क्रिएटर या पेज नाम, सोशल लिंक, प्लेटफॉर्म, सत्यापित फॉलोअर्स, कैटेगरी, भाषाएँ, स्थान, कंटेंट प्रकार और परिचय सार्वजनिक हो सकता है। क्रिएटर फोन और ईमेल सार्वजनिक लिस्टिंग में शामिल नहीं होते।",
            "खुले और सत्यापित कैंपेन में बिज़नेस नाम, शीर्षक व विवरण, प्रमोशन प्रकार, कैटेगरी, स्थान, भाषा, टारगेट ऑडियंस, फॉर्मेट और वेबसाइट सार्वजनिक हो सकती है। कैंपेन बजट, फोन और ईमेल सार्वजनिक लिस्टिंग में शामिल नहीं होते।",
            "सार्वजनिक प्रोफाइल या कैंपेन फ़ील्ड में लिखी चीज़ स्वीकृति के बाद दूसरों द्वारा देखी, कॉपी या इंडेक्स हो सकती है। सार्वजनिक फ़ील्ड में निजी जानकारी न लिखें।",
          ],
        },
        {
          heading: "5. आवेदन और शेयरिंग",
          paragraphs: [
            "जब आप किसी कैंपेन के लिए अप्लाई करते हैं, तो सिर्फ़ उसी आवेदन फॉर्म में लिखा नाम, संपर्क और संदेश उस कैंपेन के ब्रांड के साथ शेयर होता है। YaarLink अपने आप आपका अकाउंट फोन या अकाउंट ईमेल नहीं जोड़ता। आपको वही संपर्क लिखना होगा जो आप ब्रांड को उपयोग करने देना चाहते हैं और भेजने से पहले शेयरिंग की पुष्टि करनी होगी।",
          ],
          bullets: [
            "कैंपेन ब्रांड और अधिकृत YaarLink एडमिन मार्केटप्लेस चलाने और मॉडरेशन के लिए आवश्यक आवेदन विवरण देख सकते हैं।",
            "ब्रांड को आवेदक का संपर्क सिर्फ़ उस कैंपेन आवेदन और संबंधित काम के लिए उपयोग करना है—असंबंधित मार्केटिंग, बिक्री, शेयरिंग या स्पैम के लिए नहीं।",
            "आवेदन वापस लेने से YaarLink पर उसका सक्रिय उपयोग रुकता है, लेकिन प्राप्तकर्ता द्वारा पहले कॉपी किए स्क्रीनशॉट, नोट या संदेश वापस नहीं लिए जा सकते।",
            "हम होस्टिंग, डेटाबेस, लेन-देन ईमेल और सुरक्षा के लिए सेवा प्रदाताओं का उपयोग करते हैं। वे जानकारी सिर्फ़ उन सेवाओं के लिए आवश्यक सीमा तक प्रोसेस करते हैं।",
            "कानून की आवश्यकता, लोगों या सेवा की सुरक्षा, धोखाधड़ी/दुरुपयोग की जाँच, या उचित सुरक्षा के साथ बिज़नेस ट्रांसफर में जानकारी खोली जा सकती है।",
            "हम व्यक्तिगत जानकारी बेचते या किराए पर नहीं देते।",
          ],
        },
        {
          heading: "6. कुकीज़ और लोकल स्टोरेज",
          bullets: [
            "आवश्यक, हस्ताक्षरित सेशन कुकीज़ उपयोगकर्ताओं और एडमिन को साइन इन रखती हैं और अकाउंट सुरक्षा में मदद करती हैं। इन्हें बंद करने से लॉगिन और अकाउंट सुविधाएँ रुक सकती हैं।",
            "सर्वर-साइड सेशन रिकॉर्ड सीमित ब्राउज़र/डिवाइस जानकारी और गतिविधि समय रखते हैं ताकि आप खाता और सुरक्षा में डिवाइस देख और हट सकें।",
            "आपकी भाषा पसंद लोकल स्टोरेज में सेव होती है। हम इसका उपयोग विज्ञापन प्रोफाइल बनाने के लिए नहीं करते।",
            "WhatsApp, Instagram, YouTube या किसी ब्रांड/क्रिएटर वेबसाइट जैसी बाहरी सेवाओं की अपनी प्राइवेसी प्रथाएँ होती हैं।",
          ],
        },
        {
          heading: "7. रखने की अवधि और सुरक्षा",
          paragraphs: [
            "हम जानकारी तब तक रखते हैं जब तक अकाउंट, लिस्टिंग, आवेदन, सपोर्ट अनुरोध या सुरक्षा उद्देश्य सक्रिय है, और उसके बाद विवाद, धोखाधड़ी रोकथाम, लेखांकन, कानूनी पालन या सेवा सुरक्षा के लिए आवश्यक उचित अवधि तक। एक-बार के साइन-अप और अकाउंट-एक्शन टोकन समाप्त होते हैं, और सेशन समाप्त या हटाए जा सकते हैं।",
            "हम हैश किए पासवर्ड, हैश किए एक-बार टोकन, एक्सेस-नियंत्रित एडमिन टूल, अकाउंट डेटा के लिए निजी API जवाब और डेटाबेस एक्सेस प्रतिबंध जैसे उपाय उपयोग करते हैं। कोई ऑनलाइन सेवा पूर्ण सुरक्षा की गारंटी नहीं दे सकती, इसलिए अनोखा पासवर्ड उपयोग करें और अनधिकृत पहुँच का संदेह हो तो हमें बताएँ।",
          ],
        },
        {
          heading: "8. आपके विकल्प और अधिकार",
          bullets: [
            "खाता और सुरक्षा से अपना अकाउंट डेटा देखें और डाउनलोड करें।",
            "अकाउंट ईमेल या फोन सुधारें, प्रोफाइल या कैंपेन बदलें, और डैशबोर्ड से योग्य आवेदन बदलें या वापस लें।",
            "साइन-इन डिवाइस हटाएँ और खाता और सुरक्षा से अकाउंट हटाएँ।",
            "खासकर उन संपर्क संदेशों या रिपोर्ट के लिए जो अकाउंट से नियंत्रित नहीं होते, आपके डेटा अधिकार पेज के ज़रिए पहुँच, सुधार, हटाना, सहमति वापस लेना या शिकायत मदद माँगें।",
            "हमें आपकी पहचान सत्यापित करनी पड़ सकती है और सुरक्षा, धोखाधड़ी रोकथाम, विवाद या कानूनी जिम्मेदारियों के लिए सीमित जानकारी रखनी पड़ सकती है।",
          ],
        },
        {
          heading: "9. बच्चे, अंतरराष्ट्रीय प्रोसेसिंग और बदलाव",
          bullets: [
            "YaarLink उन लोगों के लिए है जो कानूनी रूप से शर्तों से सहमत हो सकते हैं, या जहाँ ज़रूरी हो माता-पिता/अभिभावक अनुमति से उपयोग करते हैं। यदि आपको लगता है कि किसी बच्चे की जानकारी उचित अनुमति बिना भेजी गई, तो हमें बताएँ।",
            "हमारे होस्टिंग, डेटाबेस और ईमेल प्रदाता भारत या अपने अन्य संचालन देशों में, अपनी सुरक्षा व्यवस्था के अधीन, जानकारी प्रोसेस कर सकते हैं।",
            "सेवा या कानून बदलने पर हम नीति अपडेट कर सकते हैं। नया संस्करण नई तिथि के साथ यहाँ पोस्ट होगा; बड़े बदलाव उचित होने पर वेबसाइट या ईमेल से भी बताए जा सकते हैं।",
          ],
        },
      ],
    },
    terms: {
      title: "सेवा की शर्तें",
      intro: "ये शर्तें YaarLink और theyaar.com के आपके उपयोग को नियंत्रित करती हैं। अकाउंट बनाने या मार्केटप्लेस उपयोग करने पर आप इन शर्तों और प्राइवेसी नीति से सहमत होते हैं।",
      actions: [
        { label: "प्राइवेसी नीति", href: "/privacy", primary: true },
        { label: "पेमेंट और रिफंड", href: "/refund-policy" },
        { label: "आपके डेटा अधिकार", href: "/data-rights" },
      ],
      sections: [
        {
          heading: "1. YaarLink सेवा",
          paragraphs: [
            "YaarLink ब्रांड और लोकल बिज़नेस को कैंपेन बताने, क्रिएटर्स और पेजों को प्रोफाइल दिखाने, और योग्य क्रिएटर्स को खुले कैंपेन के लिए अप्लाई करने में मदद करता है। YaarLink प्रकाशन से पहले लिस्टिंग की जाँच करता है और आवेदन स्थिति व सूचना टूल देता है।",
            "YaarLink गारंटी नहीं देता कि कैंपेन को आवेदन मिलेंगे, क्रिएटर हायर होगा, कंटेंट से कोई पहुँच या बिक्री परिणाम मिलेगा, या दूसरा उपयोगकर्ता काम या पेमेंट करेगा। उपयोगकर्ता खुद दूसरी पार्टी की जाँच तथा काम, कीमत, तिथि और पेमेंट शर्तें तय करने के जिम्मेदार हैं।",
          ],
        },
        {
          heading: "2. योग्यता और अकाउंट",
          bullets: [
            "आप कानूनी रूप से इस समझौते के योग्य होने चाहिए, या जहाँ ज़रूरी हो माता-पिता/अभिभावक अनुमति होनी चाहिए।",
            "अपने नियंत्रण वाला ईमेल उपयोग करें, अकाउंट जानकारी सही रखें, और उपयोग की जाने वाली सुविधाओं के लिए सही ब्रांड या क्रिएटर अकाउंट बनाएँ।",
            "पासवर्ड और सत्यापन लिंक निजी रखें। अनधिकृत उपयोग की तुरंत सूचना न देने पर आपके अकाउंट की गतिविधि आपकी जिम्मेदारी होगी।",
            "किसी अन्य व्यक्ति, बिज़नेस, क्रिएटर या पेज की नकली पहचान के लिए, या मॉडरेशन/सुरक्षा नियंत्रण से बचने के लिए अकाउंट न बनाएँ।",
          ],
        },
        {
          heading: "3. प्रोफाइल, कैंपेन और सत्यापन",
          bullets: [
            "सिर्फ़ वही जानकारी और सोशल लिंक भेजें जो आपके अपने हैं या जिनके उपयोग का आपको अधिकार है। फॉलोअर्स, बिज़नेस विवरण, बजट और कैंपेन विवरण सही व ताज़ा रखें।",
            "YaarLink प्रोफाइल या कैंपेन स्वीकृत, अस्वीकृत, निलंबित, रोका हुआ, हटाया हुआ रख सकता है या सत्यापन माँग सकता है। जाँचा/सत्यापित बैज का मतलब किसी समय जाँच हुई थी; यह पहचान, ऑडियंस गुणवत्ता, प्रदर्शन या भविष्य के व्यवहार की गारंटी नहीं है।",
            "सार्वजनिक प्रोफाइल या कैंपेन में बड़े बदलावों के लिए फिर जाँच लग सकती है।",
            "आप YaarLink को प्राइवेसी नीति के अधीन मार्केटप्लेस चलाने, मॉडरेशन और लिस्टिंग दिखाने के लिए भेजी गई जानकारी सेव व दिखाने की अनुमति देते हैं।",
          ],
        },
        {
          heading: "4. आवेदन और संपर्क",
          bullets: [
            "सिर्फ़ क्रिएटर प्रोफाइल वाले योग्य क्रिएटर अकाउंट कैंपेन के लिए अप्लाई कर सकते हैं।",
            "क्रिएटर खुद आवेदन संपर्क चुनता है। भेजने की पुष्टि करके क्रिएटर YaarLink को लिखा नाम, संपर्क और संदेश उस कैंपेन के ब्रांड को दिखाने की अनुमति देता है।",
            "ब्रांड आवेदक जानकारी सिर्फ़ उस आवेदन या कैंपेन तथा संबंधित सहमत काम का मूल्यांकन और संचालन करने के लिए उपयोग कर सकता है। वह उसे बेच, किराए पर दे, प्रकाशित, स्पैम या असंबंधित मार्केटिंग के लिए उपयोग नहीं कर सकता।",
            "YaarLink पर आवेदन या स्थिति अपने आप रोजगार, एजेंसी, साझेदारी या पेमेंट गारंटी नहीं बनाती। काम शुरू होने से पहले ब्रांड और क्रिएटर डिलीवरेबल, उपयोग अधिकार, तिथि, कीमत और पेमेंट तरीका पुष्ट करें।",
          ],
        },
        {
          heading: "5. स्वीकार्य उपयोग",
          bullets: [
            "गैरकानूनी, भ्रामक, उल्लंघनकारी, उत्पीड़नकारी, घृणास्पद, यौन शोषणकारी, खतरनाक या धोखाधड़ी वाला कंटेंट या कैंपेन न पोस्ट करें।",
            "दूसरों की नकली पहचान, नकली एंगेजमेंट/फॉलोअर्स, स्पैम, व्यक्तिगत संपर्क स्क्रेपिंग, या वैध आवेदन के लिए स्पष्ट अनुमति के अलावा उपयोगकर्ता जानकारी इकट्ठा न करें।",
            "लॉगिन, सत्यापन, रेट-लिमिट, मॉडरेशन या अन्य सुरक्षा उपायों को बायपास न करें और सेवा या दूसरे के अकाउंट में बाधा न डालें।",
            "प्रायोजित कंटेंट के लागू विज्ञापन, उपभोक्ता-संरक्षण, बौद्धिक-संपदा, प्लेटफॉर्म और खुलासा नियमों का पालन करें।",
          ],
        },
        {
          heading: "6. कंटेंट और बौद्धिक संपदा",
          paragraphs: [
            "आपके भेजे कंटेंट और जानकारी का स्वामित्व आपके पास रहता है। उन्हें भेजने व उपयोग करने के आवश्यक अधिकार सुनिश्चित करना आपकी जिम्मेदारी है। YaarLink का नाम, ब्रांडिंग, वेबसाइट डिज़ाइन और सॉफ़्टवेयर YaarLink या उसके लाइसेंसदाताओं की संपत्ति रहते हैं और सामान्य सेवा उपयोग के अलावा आपको लाइसेंस नहीं मिलता।",
            "यदि कोई लिस्टिंग आपके अधिकारों का उल्लंघन करती है या आपकी नकली पहचान है, तो लिस्टिंग पर रिपोर्ट नियंत्रण उपयोग करें या समीक्षा हेतु पर्याप्त जानकारी के साथ सपोर्ट से संपर्क करें।",
          ],
        },
        {
          heading: "7. पेमेंट",
          paragraphs: [
            "YaarLink अभी वेबसाइट में चेकआउट, एस्क्रो या पेमेंट-प्रोसेसिंग सेवा नहीं देता। कैंपेन बजट इच्छित खर्च का संकेत है, शुल्क या जमा नहीं। अलग लिखित समझौते में अन्यथा न कहा हो तो ब्रांड और क्रिएटर के बीच पेमेंट सीधे होती है। पेमेंट और रिफंड नीति देखें।",
          ],
        },
        {
          heading: "8. उपलब्धता, तीसरे पक्ष और जिम्मेदारी",
          bullets: [
            "रखरखाव, सुरक्षा या तकनीकी कारणों से सेवा बदल, रुक या अनुपलब्ध हो सकती है।",
            "WhatsApp, Instagram, YouTube और उपयोगकर्ता वेबसाइटों के लिंक व इंटीग्रेशन तीसरे पक्ष चलाते हैं; YaarLink उनके कंटेंट, उपलब्धता या प्राइवेसी प्रथाओं का जिम्मेदार नहीं है।",
            "कानून जितनी अनुमति देता है, YaarLink दूसरे उपयोगकर्ता के व्यवहार, अप्रत्यक्ष या परिणामी नुकसान, खोए लाभ, या हस्ताक्षरित लिखित समझौते में स्पष्ट गारंटी न दिए परिणामों का जिम्मेदार नहीं है। ये शर्तें कानूनी रूप से हटाई न जा सकने वाली जिम्मेदारी नहीं हटातीं।",
          ],
        },
        {
          heading: "9. निलंबन, हटाना और बदलाव",
          bullets: [
            "आप खाता और सुरक्षा से अकाउंट हटा सकते हैं। हटाना स्थायी है और अकाउंट हटाएँ पेज अनुसार जुड़ी लिस्टिंग व आवेदन भी हटते हैं।",
            "संदिग्ध धोखाधड़ी, नकली पहचान, दुरुपयोग, सुरक्षा जोखिम, गैरकानूनी व्यवहार या इन शर्तों के गंभीर उल्लंघन पर YaarLink पहुँच सीमित या समाप्त कर सकता है।",
            "हम शर्तें अपडेट कर सकते हैं। संशोधित संस्करण नई तिथि के साथ यहाँ पोस्ट होगा, और प्रभावी तिथि के बाद उपयोग जारी रखने का मतलब अपडेट शर्तों की स्वीकृति है।",
            "ये शर्तें भारत के कानून से नियंत्रित हैं। पहले सपोर्ट से संपर्क करें ताकि हम चिंता को अनौपचारिक रूप से सुलझाने की कोशिश कर सकें।",
          ],
        },
      ],
    },
    refunds: {
      title: "पेमेंट, रद्दीकरण और रिफंड",
      intro: "यह नीति बताती है कि आज YaarLink पर पैसा कैसे काम करता है। सबसे महत्वपूर्ण बात यह है कि वेबसाइट खुद अभी ऑनलाइन पेमेंट इकट्ठा नहीं करती।",
      actions: [
        { label: "सपोर्ट से संपर्क करें", href: "/contact", primary: true },
        { label: "सेवा की शर्तें", href: "/terms" },
        { label: "प्राइवेसी नीति", href: "/privacy" },
      ],
      sections: [
        {
          heading: "1. अभी वेबसाइट चेकआउट नहीं है",
          bullets: [
            "अकाउंट बनाना, क्रिएटर के रूप में जुड़ना, जाँच के लिए कैंपेन पोस्ट करना और कैंपेन के लिए अप्लाई करना theyaar.com पर ऑनलाइन पेमेंट शुरू नहीं करता।",
            "कैंपेन फॉर्म में लिखा बजट ब्रांड का इच्छित कैंपेन बजट है। यह पेमेंट, जमा, एस्क्रो बैलेंस, कीमत गारंटी या YaarLink के पास रखी राशि नहीं है।",
            "YaarLink वेबसाइट फॉर्म के ज़रिए कार्ड विवरण, बैंक-लॉगिन विवरण या UPI PIN नहीं माँगता। यदि YaarLink का प्रतिनिधि बताकर कोई ये रहस्य माँगे तो रुकें और सपोर्ट से संपर्क करें।",
          ],
        },
        {
          heading: "2. अलग से तय सशुल्क सेवाएँ",
          paragraphs: [
            "यदि YaarLink सशुल्क प्रबंधित सेवा देता है, तो पेमेंट से पहले कीमत, कर, डिलीवरेबल, तिथियाँ, शामिल क्रिएटर्स और पेमेंट कार्यक्रम लिखित कोटेशन, इनवॉइस या समझौते में पुष्ट होना चाहिए। यदि वह लिखित दस्तावेज़ इस सामान्य नीति से अलग हो तो विशिष्ट कार्य के लिए वही नियंत्रित करेगा।",
          ],
        },
        {
          heading: "3. YaarLink को दी राशि के लिए रद्दीकरण और रिफंड योग्यता",
          bullets: [
            "यदि आप काम शुरू होने से पहले सशुल्क YaarLink सेवा रद्द करते हैं, तो YaarLink को दी अप्रयुक्त राशि रिफंड योग्य है, केवल आपके पुष्ट कार्य के लिए पहले किए गए गैर-वसूली योग्य तीसरे-पक्ष खर्च घटाकर।",
            "यदि काम शुरू हुआ या डिलीवरेबल दिए गए, तो रिफंड पूरे काम, प्रतिबद्ध क्रिएटर/तीसरे-पक्ष खर्च और लिखित समझौते के आधार पर तय होगा।",
            "यदि YaarLink सहमत सेवा शुरू न कर पाए, तो उस सेवा के लिए दी अप्रयुक्त राशि रिफंड योग्य है।",
            "YaarLink को हुई सत्यापित डुप्लिकेट या गलत पेमेंट की डुप्लिकेट/अतिरिक्त राशि रिफंड योग्य है।",
            "सिर्फ़ कैंपेन पहुँच, एंगेजमेंट या बिक्री अपेक्षा से अलग होने पर रिफंड गारंटी नहीं है, जब तक लिखित समझौते में विशिष्ट परिणाम की स्पष्ट गारंटी न हो।",
          ],
        },
        {
          heading: "4. ब्रांड और क्रिएटर के बीच सीधी पेमेंट",
          bullets: [
            "जब तक अलग लिखित समझौता स्पष्ट न कहे कि YaarLink पैसा इकट्ठा कर रहा है, ब्रांड-से-क्रिएटर पेमेंट उन पक्षों के बीच सीधा लेन-देन है।",
            "YaarLink जो पैसा उसे मिला नहीं, उसे रिफंड नहीं कर सकता, बैंक/UPI ट्रांसफर उलट नहीं सकता, या सीधे सौदे के लिए एस्क्रो नहीं बन सकता।",
            "पेमेंट से पहले कानूनी/बिज़नेस नाम, डिलीवरेबल, पोस्ट तिथियाँ, कंटेंट अधिकार, राशि, कर व्यवस्था और पेमेंट संदर्भ लिखित में पुष्ट करें। इनवॉइस और ट्रांसफर रसीद रखें।",
            "धोखाधड़ी या नकली पहचान का संदेह हो तो तुरंत अपने बैंक/पेमेंट प्रदाता से संपर्क करें और लिस्टिंग या उपयोगकर्ता को YaarLink को रिपोर्ट करें ताकि हम अकाउंट/लिस्टिंग जांच सकें।",
          ],
        },
        {
          heading: "5. YaarLink से रिफंड कैसे माँगें",
          bullets: [
            "अकाउंट ईमेल से सपोर्ट को ईमेल करें और कैंपेन, पेमेंट तिथि, राशि, पेमेंट तरीका व लेन-देन संदर्भ लिखें। कार्ड नंबर, बैंक पासवर्ड या UPI PIN न भेजें।",
            "हम भुगतानकर्ता और कार्य सत्यापित करने के लिए आवश्यक जानकारी माँग सकते हैं। स्वीकृत रिफंड जहाँ संभव हो मूल पेमेंट तरीके पर लौटाया जाता है।",
            "रिफंड स्वीकृत और भेजे जाने के बाद बैंक व पेमेंट प्रदाता का समय अलग हो सकता है।",
            "चार्जबैक या पेमेंट विवाद होने पर परिणाम बैंक/पेमेंट प्रदाता की प्रक्रिया से भी नियंत्रित हो सकता है।",
          ],
        },
        {
          heading: "6. इस नीति में बदलाव",
          paragraphs: [
            "यदि YaarLink बाद में वेबसाइट चेकआउट या सशुल्क सदस्यता शुरू करता है, तो पेमेंट इकट्ठा करने से पहले चेकआउट शर्तें और इस नीति का अपडेट संस्करण शुल्क, रद्दीकरण अवधि व रिफंड प्रक्रिया बताएंगे।",
          ],
        },
      ],
    },
    "data-rights": {
      title: "आपके डेटा अधिकार",
      intro: "आप अधिकांश अकाउंट जानकारी खुद संभाल सकते हैं। यह पेज स्वयं-सेवा नियंत्रण और पहुँच, सुधार, हटाना या प्राइवेसी शिकायत के लिए YaarLink से मदद माँगने का तरीका बताता है।",
      actions: [
        { label: "खाता और सुरक्षा खोलें", href: "/account", primary: true },
        { label: "अकाउंट हटाने की गाइड", href: "/account-deletion" },
        { label: "सपोर्ट से संपर्क करें", href: "/contact" },
      ],
      sections: [
        {
          heading: "1. उपलब्ध विकल्प",
          bullets: [
            "डेटा डाउनलोड से अपने अकाउंट, प्रोफाइल, कैंपेन, आवेदन, सूचना, रिपोर्ट और सेशन जानकारी की प्रति प्राप्त करें।",
            "लिस्टिंग-जाँच नियमों के अधीन गलत अकाउंट, प्रोफाइल, कैंपेन या आवेदन जानकारी सुधारें।",
            "योग्य आवेदन वापस लें ताकि वह ब्रांड के लिए सक्रिय न रहे।",
            "जहाँ प्रोसेसिंग का आधार सहमति है, भविष्य की प्रोसेसिंग के लिए सहमति वापस लें; वापसी पहले कानूनी रूप से हुई शेयरिंग को पूर्ववत नहीं करती।",
            "अपना अकाउंट और जुड़ा मार्केटप्लेस डेटा हटाएँ।",
            "अलग डिवाइस या अन्य सभी साइन-इन सेशन हटाएँ।",
            "YaarLink सपोर्ट से प्राइवेसी प्रश्न या शिकायत उठाएँ।",
          ],
        },
        {
          heading: "2. साइन इन होकर खुद करें",
          bullets: [
            "खाता और सुरक्षा: ईमेल सत्यापित/बदलें, फोन या पासवर्ड बदलें, डिवाइस देखें/हटाएँ, डेटा डाउनलोड करें और अकाउंट हटाएँ।",
            "क्रिएटर डैशबोर्ड: क्रिएटर प्रोफाइल बदलें/हटाएँ और योग्य आवेदन बदलें/वापस लें।",
            "ब्रांड डैशबोर्ड: कैंपेन बदलें, रोकें, बंद करें, फिर प्रकाशित करें या हटाएँ तथा आवेदन निर्णय संभालें।",
            "सार्वजनिक लिस्टिंग पेज: नकली पहचान, घोटाला, स्पैम या गलत जानकारी मॉडरेशन समीक्षा के लिए रिपोर्ट करें।",
          ],
        },
        {
          heading: "3. हमसे मदद माँगें",
          paragraphs: [
            "संपर्क पेज उपयोग करें या “प्राइवेसी अनुरोध — YaarLink” विषय के साथ सपोर्ट को ईमेल करें। बताएँ कि आप पहुँच, सुधार, हटाना, सहमति वापसी या शिकायत समीक्षा चाहते हैं। रिकॉर्ड खोजने के लिए अकाउंट ईमेल और पर्याप्त संदर्भ—जैसे लिस्टिंग नाम या संदेश की अनुमानित तिथि—लिखें।",
            "अपना पासवर्ड, रीसेट लिंक, सत्यापन कोड, कार्ड नंबर, बैंक पासवर्ड या UPI PIN न भेजें। अकाउंट तक पहुँच न हो तो जहाँ संभव हो पहले पासवर्ड रीसेट उपयोग करें।",
          ],
        },
        {
          heading: "4. यदि आपका अकाउंट नहीं है",
          paragraphs: [
            "जिन लोगों ने अकाउंट बिना संपर्क फॉर्म उपयोग किया या रिपोर्ट भेजी, वे भी पहुँच या हटाना माँग सकते हैं। उस संदेश में उपयोग नाम, ईमेल या फोन और अनुमानित तिथि लिखें ताकि हम उसे खोज सकें। हम रिकॉर्ड आपका होने का उचित प्रमाण माँग सकते हैं।",
          ],
        },
        {
          heading: "5. सत्यापन, समय और सीमाएँ",
          bullets: [
            "व्यक्तिगत जानकारी खोलने या हटाने से पहले हम अकाउंट ईमेल या साइन-इन अकाउंट से पहचान सत्यापित कर सकते हैं।",
            "हम अनुरोधों को शीघ्र स्वीकार करने और जहाँ संभव हो 30 दिनों में पूरा करने का लक्ष्य रखते हैं। जटिल अनुरोध या कानूनी जाँच में देरी हो तो हम कारण बताएंगे।",
            "कुछ जानकारी सुरक्षा, धोखाधड़ी रोकथाम, विवाद, कर/लेखांकन या कानूनी पालन के लिए रखनी पड़ सकती है। अनुरोध पूरी तरह न माना जा सके तो अनुमति अनुसार कारण बताएंगे।",
            "किसी अन्य व्यक्ति के अनुरोध के लिए अधिकार प्रमाण लग सकता है।",
            "YaarLink से डेटा हटाना अन्य उपयोगकर्ता द्वारा कानूनी रूप से प्राप्त और YaarLink बाहर सेव प्रतियाँ नहीं हटा सकता, जैसे वापसी से पहले ब्रांड द्वारा सेव आवेदन संपर्क।",
          ],
        },
        {
          heading: "6. शिकायतें",
          paragraphs: [
            "कृपया पहले YaarLink सपोर्ट से संपर्क करें ताकि हम जाँच कर चिंता सुलझाने की कोशिश कर सकें। इस प्रक्रिया का उपयोग लागू कानून के तहत आपके अधिकार या उपाय नहीं हटाता।",
          ],
        },
      ],
    },
    "account-deletion": {
      title: "अपना अकाउंट हटाएँ",
      intro: "यह सार्वजनिक गाइड बताती है कि YaarLink अकाउंट स्थायी रूप से कैसे हटाएँ, क्या हटता है, और आप साइन इन न कर सकें तो क्या करें।",
      actions: [
        { label: "अकाउंट हटाने पर जाएँ", href: "/account#delete-account", primary: true },
        { label: "पहले अपना डेटा डाउनलोड करें", href: "/account#export-data" },
        { label: "पासवर्ड रीसेट करें", href: "/forgot-password" },
      ],
      sections: [
        {
          heading: "1. हटाने से पहले",
          bullets: [
            "यदि बाद में प्रोफाइल, कैंपेन, आवेदन या सूचनाएँ चाहिए हों तो खाता और सुरक्षा से डेटा डाउनलोड करें।",
            "यदि अन्य उपयोगकर्ता उन पर निर्भर है तो पहले सक्रिय कैंपेन और आवेदन पूरे, रोकें, बंद या वापस लें।",
            "हटाना तुरंत और स्थायी है। बाद में फिर साइन अप कर सकते हैं, लेकिन हटाया अकाउंट और मार्केटप्लेस इतिहास वापस नहीं मिलेगा।",
          ],
        },
        {
          heading: "2. हटाने के चरण",
          bullets: [
            "जिस YaarLink अकाउंट को हटाना है उसमें साइन इन करें।",
            "डैशबोर्ड या साइन-इन मेनू से खाता और सुरक्षा खोलें।",
            "यदि चाहिए तो “अपना डेटा डाउनलोड करें” भाग से डेटा डाउनलोड करें।",
            "“खाता हटाएँ” भाग पर जाएँ।",
            "वर्तमान पासवर्ड और ठीक अकाउंट ईमेल लिखें।",
            "स्थायी हटाने की पुष्टि करें। आप साइन आउट हो जाएंगे और अकाउंट हट जाएगा।",
          ],
        },
        {
          heading: "3. क्या हटता है",
          bullets: [
            "आपका उपयोगकर्ता अकाउंट और साइन-इन सेशन।",
            "आपका ब्रांड रिकॉर्ड या क्रिएटर प्रोफाइल।",
            "आपके कैंपेन और उनसे जुड़े आवेदन।",
            "आपके भेजे आवेदन, सूचनाएँ और अकाउंट-एक्शन टोकन।",
            "आपकी क्रिएटर प्रोफाइल और कैंपेन की सार्वजनिक पहुँच।",
          ],
        },
        {
          heading: "4. क्या गुमनाम या रखा जा सकता है",
          bullets: [
            "आपके द्वारा भेजी लिस्टिंग रिपोर्ट में कारण और मॉडरेशन विवरण रह सकता है, लेकिन अकाउंट संदर्भ, रिपोर्टर नाम और संपर्क हट जाता है।",
            "अलग संपर्क-फॉर्म संदेश अपने आप अकाउंट से जुड़े नहीं होते; किसी खास संदेश की समीक्षा/हटाना चाहिए तो आपके डेटा अधिकार से माँगें।",
            "आवश्यक और कानून अनुसार सीमित सुरक्षा, धोखाधड़ी रोकथाम, लेखांकन, विवाद या कानूनी रिकॉर्ड रखे जा सकते हैं।",
            "सेवा-प्रदाता लॉग या बैकअप में नियमित ओवरराइट/हटाने से पहले सीमित अवधि प्रतियाँ रह सकती हैं।",
            "अन्य उपयोगकर्ता द्वारा पहले प्राप्त व YaarLink बाहर कॉपी जानकारी—जैसे आवेदन संपर्क या सीधी WhatsApp बातचीत—YaarLink अकाउंट हटाने से नहीं हट सकती।",
          ],
        },
        {
          heading: "5. यदि आप साइन इन न कर सकें",
          bullets: [
            "अकाउंट ईमेल से पहुँच रीसेट करने के लिए पासवर्ड भूल गए उपयोग करें, फिर खुद अकाउंट हटाएँ।",
            "अकाउंट ईमेल आपके नियंत्रण में न हो तो सपोर्ट से संपर्क करें। मदद से पहले हमें पहचान सत्यापित करनी होगी; सपोर्ट या अन्य उपयोगकर्ता से पासवर्ड, रीसेट लिंक या सत्यापन कोड कभी शेयर न करें।",
            "यदि सिर्फ़ विराम चाहिए तो पूरा अकाउंट हटाने के बजाय कैंपेन रोकना, आवेदन वापस लेना, एक लिस्टिंग हटाना, फोन/ईमेल बदलना या डिवाइस हटाना विचार करें।",
          ],
        },
      ],
    },
  },
  pa: {
    privacy: {
      title: "ਪਰਾਈਵੇਸੀ ਨੀਤੀ",
      intro: "ਇਹ ਨੀਤੀ ਦੱਸਦੀ ਹੈ ਕਿ YaarLink theyaar.com 'ਤੇ ਕਿਹੜੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਇਕੱਠੀ ਕਰਦਾ ਹੈ, ਉਸ ਨੂੰ ਕਿਉਂ ਵਰਤਦਾ ਹੈ, ਉਹ ਕਦੋਂ ਜਨਤਕ ਜਾਂ ਸਾਂਝੀ ਹੁੰਦੀ ਹੈ, ਅਤੇ ਤੁਹਾਡੇ ਕੋਲ ਕੀ ਚੋਣਾਂ ਹਨ।",
      actions: [
        { label: "ਤੁਹਾਡੇ ਡੇਟਾ ਹੱਕ", href: "/data-rights", primary: true },
        { label: "ਅਕਾਊਂਟ ਅਤੇ ਸੁਰੱਖਿਆ", href: "/account" },
        { label: "ਅਕਾਊਂਟ ਹਟਾਉਣ ਦੀ ਗਾਈਡ", href: "/account-deletion" },
      ],
      sections: [
        {
          heading: "1. ਅਸੀਂ ਕੌਣ ਹਾਂ",
          paragraphs: [
            "YaarLink theyaar.com ਚਲਾਉਂਦਾ ਹੈ—ਇੱਕ ਮਾਰਕੀਟਪਲੇਸ ਜੋ ਬ੍ਰਾਂਡ ਅਤੇ ਲੋਕਲ ਕਾਰੋਬਾਰਾਂ ਨੂੰ ਕ੍ਰਿਏਟਰ, ਮੀਮ ਪੇਜ ਅਤੇ ਕਮਿਊਨਿਟੀਆਂ ਲੱਭਣ ਅਤੇ ਕ੍ਰਿਏਟਰਾਂ ਨੂੰ ਕੈਂਪੇਨ ਮੌਕੇ ਲੱਭਣ ਵਿੱਚ ਮਦਦ ਕਰਦਾ ਹੈ।",
            "ਪਰਾਈਵੇਸੀ ਸਵਾਲ ਜਾਂ ਸ਼ਿਕਾਇਤ ਲਈ ਇਸ ਨੀਤੀ ਦੇ ਅੰਤ ਵਿੱਚ ਦਿੱਤੀ ਈਮੇਲ ਜਾਂ ਸੰਪਰਕ ਪੇਜ ਰਾਹੀਂ YaarLink ਸਪੋਰਟ ਨਾਲ ਸੰਪਰਕ ਕਰੋ। YaarLink ਪੰਜਾਬ, ਭਾਰਤ ਵਿੱਚ ਸਥਿਤ ਹੈ।",
          ],
        },
        {
          heading: "2. ਅਸੀਂ ਕਿਹੜੀ ਜਾਣਕਾਰੀ ਇਕੱਠੀ ਕਰਦੇ ਹਾਂ",
          bullets: [
            "ਅਕਾਊਂਟ ਜਾਣਕਾਰੀ: ਨਾਮ, ਈਮੇਲ, ਵਿਕਲਪਿਕ ਫੋਨ, ਅਕਾਊਂਟ ਭੂਮਿਕਾ (ਬ੍ਰਾਂਡ ਜਾਂ ਕ੍ਰਿਏਟਰ), ਈਮੇਲ-ਤਸਦੀਕ ਸਥਿਤੀ, ਅਕਾਊਂਟ ਤਾਰੀਖਾਂ ਅਤੇ ਹੈਸ਼ ਕੀਤਾ ਪਾਸਵਰਡ। ਅਸੀਂ ਤੁਹਾਡਾ ਸਾਦਾ ਪਾਸਵਰਡ ਸੇਵ ਨਹੀਂ ਕਰਦੇ।",
            "ਲੰਬਿਤ ਸਾਈਨ-ਅੱਪ ਜਾਣਕਾਰੀ: ਈਮੇਲ ਤਸਦੀਕ ਤੋਂ ਪਹਿਲਾਂ ਦਿੱਤੀ ਜਾਣਕਾਰੀ ਅਤੇ ਹੈਸ਼ ਕੀਤਾ ਇੱਕ-ਵਾਰੀ ਤਸਦੀਕ ਟੋਕਨ। ਵਰਤੋਂਯੋਗ ਅਕਾਊਂਟ ਤਸਦੀਕ ਤੋਂ ਬਾਅਦ ਹੀ ਬਣਦਾ ਹੈ।",
            "ਪ੍ਰੋਫਾਈਲ ਅਤੇ ਕੈਂਪੇਨ ਜਾਣਕਾਰੀ: ਕਾਰੋਬਾਰ ਜਾਂ ਕ੍ਰਿਏਟਰ ਨਾਮ, ਸੰਪਰਕ ਵੇਰਵੇ, ਸੋਸ਼ਲ ਪ੍ਰੋਫਾਈਲ ਲਿੰਕ, ਕੈਟੇਗਰੀ, ਭਾਸ਼ਾਵਾਂ, ਥਾਂ, ਆਡੀਅੰਸ ਜਾਂ ਫਾਲੋਅਰ ਜਾਣਕਾਰੀ, ਕੈਂਪੇਨ ਵੇਰਵੇ, ਬਜਟ, ਤਸਦੀਕ ਕੋਡ ਅਤੇ ਮਾਡਰੇਸ਼ਨ ਸਥਿਤੀ।",
            "ਅਰਜ਼ੀ ਅਤੇ ਸੰਚਾਰ ਜਾਣਕਾਰੀ: ਅਰਜ਼ੀ ਵਿੱਚ ਲਿਖਿਆ ਨਾਮ, ਸੰਪਰਕ ਅਤੇ ਸੁਨੇਹਾ, ਅਰਜ਼ੀ ਸਥਿਤੀ ਅਤੇ ਫੈਸਲਾ ਨੋਟ, ਸੂਚਨਾਵਾਂ, ਸੰਪਰਕ-ਫਾਰਮ ਸੁਨੇਹੇ ਅਤੇ ਲਿਸਟਿੰਗ ਰਿਪੋਰਟਾਂ।",
            "ਤਕਨੀਕੀ ਅਤੇ ਸੁਰੱਖਿਆ ਜਾਣਕਾਰੀ: ਸੈਸ਼ਨ ਪਛਾਣ, ਬ੍ਰਾਊਜ਼ਰ/ਡਿਵਾਈਸ ਯੂਜ਼ਰ-ਏਜੰਟ, ਸਾਈਨ-ਇਨ ਅਤੇ ਗਤੀਵਿਧੀ ਸਮੇਂ, ਰੇਟ-ਲਿਮਿਟ, ਸੁਰੱਖਿਆ ਅਤੇ ਐਡਮਿਨ ਆਡਿਟ ਲੌਗ ਲਈ IP ਪਤੇ ਅਤੇ ਸੀਮਤ ਹੋਸਟਿੰਗ ਜਾਂ ਈਮੇਲ-ਡਿਲੀਵਰੀ ਲੌਗ।",
            "ਪਸੰਦ: ਤੁਹਾਡੀ ਚੁਣੀ ਸਾਈਟ ਭਾਸ਼ਾ ਬ੍ਰਾਊਜ਼ਰ ਦੇ ਲੋਕਲ ਸਟੋਰੇਜ ਵਿੱਚ ਸੇਵ ਹੁੰਦੀ ਹੈ।",
          ],
          paragraphs: [
            "YaarLink ਇਸ ਵੈੱਬਸਾਈਟ ਰਾਹੀਂ ਕਾਰਡ, ਬੈਂਕ-ਲਾਗਇਨ ਜਾਂ UPI PIN ਵੇਰਵੇ ਜਾਣ-ਬੁੱਝ ਕੇ ਇਕੱਠੇ ਨਹੀਂ ਕਰਦਾ। ਸੰਪਰਕ, ਕੈਂਪੇਨ, ਪ੍ਰੋਫਾਈਲ ਜਾਂ ਅਰਜ਼ੀ ਖੇਤਰਾਂ ਵਿੱਚ ਪਾਸਵਰਡ, ਇੱਕ-ਵਾਰੀ ਕੋਡ ਜਾਂ ਪੇਮੈਂਟ ਗੁਪਤ ਜਾਣਕਾਰੀ ਨਾ ਲਿਖੋ।",
          ],
        },
        {
          heading: "3. ਜਾਣਕਾਰੀ ਕਿਉਂ ਵਰਤਦੇ ਹਾਂ",
          bullets: [
            "ਅਕਾਊਂਟ ਅਤੇ ਸੈਸ਼ਨ ਬਣਾਉਣਾ, ਤਸਦੀਕ ਕਰਨਾ, ਪ੍ਰਮਾਣਿਤ ਕਰਨਾ ਅਤੇ ਸੁਰੱਖਿਅਤ ਰੱਖਣਾ।",
            "ਕ੍ਰਿਏਟਰ ਪ੍ਰੋਫਾਈਲ ਅਤੇ ਕੈਂਪੇਨ ਜਨਤਕ ਹੋਣ ਤੋਂ ਪਹਿਲਾਂ ਉਹਨਾਂ ਦੀ ਜਾਂਚ ਅਤੇ ਮਾਡਰੇਸ਼ਨ।",
            "ਮਨਜ਼ੂਰ ਜਨਤਕ ਲਿਸਟਿੰਗ ਦਿਖਾਉਣਾ ਅਤੇ ਖੋਜ, ਅਰਜ਼ੀਆਂ, ਫੈਸਲੇ ਅਤੇ ਸੂਚਨਾਵਾਂ ਚਲਾਉਣਾ।",
            "ਸਾਈਨ-ਅੱਪ ਤਸਦੀਕ, ਪਾਸਵਰਡ ਰੀਸੈਟ, ਈਮੇਲ ਬਦਲਾਅ, ਅਰਜ਼ੀ-ਸਥਿਤੀ ਅਤੇ ਅਕਾਊਂਟ-ਸੁਰੱਖਿਆ ਵਰਗੀਆਂ ਲੈਣ-ਦੇਣ ਈਮੇਲ ਭੇਜਣਾ।",
            "ਸਪੋਰਟ ਸੁਨੇਹਿਆਂ, ਲਿਸਟਿੰਗ ਰਿਪੋਰਟਾਂ ਅਤੇ ਪਰਾਈਵੇਸੀ ਬੇਨਤੀਆਂ ਦਾ ਜਵਾਬ ਦੇਣਾ।",
            "ਸਪੈਮ, ਧੋਖਾਧੜੀ, ਨਕਲੀ ਪਛਾਣ, ਦੁਰਵਰਤੋਂ ਅਤੇ ਸੁਰੱਖਿਆ ਘਟਨਾਵਾਂ ਰੋਕਣਾ; ਸ਼ਰਤਾਂ ਲਾਗੂ ਕਰਨਾ; ਸੇਵਾ ਠੀਕ ਰੱਖਣਾ।",
            "ਲਾਗੂ ਕਾਨੂੰਨ ਦੀ ਪਾਲਣਾ ਅਤੇ ਕਾਨੂੰਨੀ ਬੇਨਤੀਆਂ ਦਾ ਜਵਾਬ।",
          ],
        },
        {
          heading: "4. ਕੀ ਜਨਤਕ ਹੁੰਦਾ ਹੈ",
          bullets: [
            "ਮਨਜ਼ੂਰ ਅਤੇ ਤਸਦੀਕ ਕ੍ਰਿਏਟਰ ਪ੍ਰੋਫਾਈਲ ਵਿੱਚ ਕ੍ਰਿਏਟਰ ਜਾਂ ਪੇਜ ਨਾਮ, ਸੋਸ਼ਲ ਲਿੰਕ, ਪਲੇਟਫਾਰਮ, ਤਸਦੀਕ ਫਾਲੋਅਰ, ਕੈਟੇਗਰੀ, ਭਾਸ਼ਾਵਾਂ, ਥਾਂ, ਕੰਟੈਂਟ ਕਿਸਮਾਂ ਅਤੇ ਜਾਣ-ਪਛਾਣ ਜਨਤਕ ਹੋ ਸਕਦੀ ਹੈ। ਕ੍ਰਿਏਟਰ ਫੋਨ ਅਤੇ ਈਮੇਲ ਜਨਤਕ ਲਿਸਟਿੰਗ ਵਿੱਚ ਸ਼ਾਮਲ ਨਹੀਂ ਹੁੰਦੇ।",
            "ਖੁੱਲ੍ਹੇ ਅਤੇ ਤਸਦੀਕ ਕੈਂਪੇਨ ਵਿੱਚ ਕਾਰੋਬਾਰ ਨਾਮ, ਸਿਰਲੇਖ ਤੇ ਵੇਰਵਾ, ਪ੍ਰਮੋਸ਼ਨ ਕਿਸਮ, ਕੈਟੇਗਰੀ, ਥਾਂ, ਭਾਸ਼ਾ, ਟਾਰਗੇਟ ਆਡੀਅੰਸ, ਫਾਰਮੈਟ ਅਤੇ ਵੈੱਬਸਾਈਟ ਜਨਤਕ ਹੋ ਸਕਦੀ ਹੈ। ਕੈਂਪੇਨ ਬਜਟ, ਫੋਨ ਅਤੇ ਈਮੇਲ ਜਨਤਕ ਲਿਸਟਿੰਗ ਵਿੱਚ ਸ਼ਾਮਲ ਨਹੀਂ ਹੁੰਦੇ।",
            "ਜਨਤਕ ਪ੍ਰੋਫਾਈਲ ਜਾਂ ਕੈਂਪੇਨ ਖੇਤਰ ਵਿੱਚ ਲਿਖੀ ਚੀਜ਼ ਮਨਜ਼ੂਰੀ ਤੋਂ ਬਾਅਦ ਦੂਜਿਆਂ ਦੁਆਰਾ ਵੇਖੀ, ਕਾਪੀ ਜਾਂ ਇੰਡੈਕਸ ਹੋ ਸਕਦੀ ਹੈ। ਜਨਤਕ ਖੇਤਰਾਂ ਵਿੱਚ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਨਾ ਲਿਖੋ।",
          ],
        },
        {
          heading: "5. ਅਰਜ਼ੀਆਂ ਅਤੇ ਸਾਂਝ",
          paragraphs: [
            "ਜਦੋਂ ਤੁਸੀਂ ਕਿਸੇ ਕੈਂਪੇਨ ਲਈ ਅਪਲਾਈ ਕਰਦੇ ਹੋ, ਤਾਂ ਸਿਰਫ਼ ਉਸੇ ਅਰਜ਼ੀ ਫਾਰਮ ਵਿੱਚ ਲਿਖਿਆ ਨਾਮ, ਸੰਪਰਕ ਅਤੇ ਸੁਨੇਹਾ ਉਸ ਕੈਂਪੇਨ ਦੇ ਬ੍ਰਾਂਡ ਨਾਲ ਸਾਂਝਾ ਹੁੰਦਾ ਹੈ। YaarLink ਆਪਣੇ ਆਪ ਤੁਹਾਡਾ ਅਕਾਊਂਟ ਫੋਨ ਜਾਂ ਅਕਾਊਂਟ ਈਮੇਲ ਨਹੀਂ ਜੋੜਦਾ। ਤੁਹਾਨੂੰ ਉਹੀ ਸੰਪਰਕ ਲਿਖਣਾ ਹੋਵੇਗਾ ਜੋ ਤੁਸੀਂ ਬ੍ਰਾਂਡ ਨੂੰ ਵਰਤਣ ਦੇਣਾ ਚਾਹੁੰਦੇ ਹੋ ਅਤੇ ਭੇਜਣ ਤੋਂ ਪਹਿਲਾਂ ਸਾਂਝ ਦੀ ਪੁਸ਼ਟੀ ਕਰਨੀ ਹੋਵੇਗੀ।",
          ],
          bullets: [
            "ਕੈਂਪੇਨ ਬ੍ਰਾਂਡ ਅਤੇ ਅਧਿਕਾਰਤ YaarLink ਐਡਮਿਨ ਮਾਰਕੀਟਪਲੇਸ ਚਲਾਉਣ ਅਤੇ ਮਾਡਰੇਸ਼ਨ ਲਈ ਲੋੜੀਂਦੇ ਅਰਜ਼ੀ ਵੇਰਵੇ ਵੇਖ ਸਕਦੇ ਹਨ।",
            "ਬ੍ਰਾਂਡ ਨੂੰ ਬਿਨੈਕਾਰ ਦਾ ਸੰਪਰਕ ਸਿਰਫ਼ ਉਸ ਕੈਂਪੇਨ ਅਰਜ਼ੀ ਅਤੇ ਸੰਬੰਧਿਤ ਕੰਮ ਲਈ ਵਰਤਣਾ ਹੈ—ਅਸੰਬੰਧਿਤ ਮਾਰਕੀਟਿੰਗ, ਵੇਚਣ, ਸਾਂਝ ਜਾਂ ਸਪੈਮ ਲਈ ਨਹੀਂ।",
            "ਅਰਜ਼ੀ ਵਾਪਸ ਲੈਣ ਨਾਲ YaarLink 'ਤੇ ਉਸ ਦੀ ਸਰਗਰਮ ਵਰਤੋਂ ਰੁਕਦੀ ਹੈ, ਪਰ ਪ੍ਰਾਪਤਕਰਤਾ ਵੱਲੋਂ ਪਹਿਲਾਂ ਕਾਪੀ ਕੀਤੇ ਸਕ੍ਰੀਨਸ਼ਾਟ, ਨੋਟ ਜਾਂ ਸੁਨੇਹੇ ਵਾਪਸ ਨਹੀਂ ਲਏ ਜਾ ਸਕਦੇ।",
            "ਅਸੀਂ ਹੋਸਟਿੰਗ, ਡੇਟਾਬੇਸ, ਲੈਣ-ਦੇਣ ਈਮੇਲ ਅਤੇ ਸੁਰੱਖਿਆ ਲਈ ਸੇਵਾ ਪ੍ਰਦਾਤਿਆਂ ਨੂੰ ਵਰਤਦੇ ਹਾਂ। ਉਹ ਜਾਣਕਾਰੀ ਸਿਰਫ਼ ਉਹਨਾਂ ਸੇਵਾਵਾਂ ਲਈ ਲੋੜੀਂਦੀ ਸੀਮਾ ਤੱਕ ਪ੍ਰੋਸੈਸ ਕਰਦੇ ਹਨ।",
            "ਕਾਨੂੰਨ ਦੀ ਲੋੜ, ਲੋਕਾਂ ਜਾਂ ਸੇਵਾ ਦੀ ਸੁਰੱਖਿਆ, ਧੋਖਾਧੜੀ/ਦੁਰਵਰਤੋਂ ਦੀ ਜਾਂਚ, ਜਾਂ ਉਚਿਤ ਸੁਰੱਖਿਆ ਨਾਲ ਕਾਰੋਬਾਰੀ ਟ੍ਰਾਂਸਫਰ ਵਿੱਚ ਜਾਣਕਾਰੀ ਖੋਲ੍ਹੀ ਜਾ ਸਕਦੀ ਹੈ।",
            "ਅਸੀਂ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਵੇਚਦੇ ਜਾਂ ਕਿਰਾਏ 'ਤੇ ਨਹੀਂ ਦਿੰਦੇ।",
          ],
        },
        {
          heading: "6. ਕੂਕੀਜ਼ ਅਤੇ ਲੋਕਲ ਸਟੋਰੇਜ",
          bullets: [
            "ਜ਼ਰੂਰੀ, ਦਸਤਖਤ ਕੀਤੀਆਂ ਸੈਸ਼ਨ ਕੂਕੀਜ਼ ਉਪਭੋਗਤਾਵਾਂ ਅਤੇ ਐਡਮਿਨ ਨੂੰ ਸਾਈਨ ਇਨ ਰੱਖਦੀਆਂ ਹਨ ਅਤੇ ਅਕਾਊਂਟ ਸੁਰੱਖਿਆ ਵਿੱਚ ਮਦਦ ਕਰਦੀਆਂ ਹਨ। ਇਹਨਾਂ ਨੂੰ ਬੰਦ ਕਰਨ ਨਾਲ ਲਾਗਇਨ ਅਤੇ ਅਕਾਊਂਟ ਸੁਵਿਧਾਵਾਂ ਰੁਕ ਸਕਦੀਆਂ ਹਨ।",
            "ਸਰਵਰ-ਸਾਈਡ ਸੈਸ਼ਨ ਰਿਕਾਰਡ ਸੀਮਤ ਬ੍ਰਾਊਜ਼ਰ/ਡਿਵਾਈਸ ਜਾਣਕਾਰੀ ਅਤੇ ਗਤੀਵਿਧੀ ਸਮੇਂ ਰੱਖਦੇ ਹਨ ਤਾਂ ਜੋ ਤੁਸੀਂ ਖਾਤਾ ਅਤੇ ਸੁਰੱਖਿਆ ਵਿੱਚ ਡਿਵਾਈਸ ਵੇਖ ਅਤੇ ਹਟਾ ਸਕੋ।",
            "ਤੁਹਾਡੀ ਭਾਸ਼ਾ ਪਸੰਦ ਲੋਕਲ ਸਟੋਰੇਜ ਵਿੱਚ ਸੇਵ ਹੁੰਦੀ ਹੈ। ਅਸੀਂ ਇਸ ਨੂੰ ਵਿਗਿਆਪਨ ਪ੍ਰੋਫਾਈਲ ਬਣਾਉਣ ਲਈ ਨਹੀਂ ਵਰਤਦੇ।",
            "WhatsApp, Instagram, YouTube ਜਾਂ ਕਿਸੇ ਬ੍ਰਾਂਡ/ਕ੍ਰਿਏਟਰ ਵੈੱਬਸਾਈਟ ਵਰਗੀਆਂ ਬਾਹਰੀ ਸੇਵਾਵਾਂ ਦੀਆਂ ਆਪਣੀਆਂ ਪਰਾਈਵੇਸੀ ਪ੍ਰਥਾਵਾਂ ਹੁੰਦੀਆਂ ਹਨ।",
          ],
        },
        {
          heading: "7. ਰੱਖਣ ਦੀ ਮਿਆਦ ਅਤੇ ਸੁਰੱਖਿਆ",
          paragraphs: [
            "ਅਸੀਂ ਜਾਣਕਾਰੀ ਉਦੋਂ ਤੱਕ ਰੱਖਦੇ ਹਾਂ ਜਦੋਂ ਤੱਕ ਅਕਾਊਂਟ, ਲਿਸਟਿੰਗ, ਅਰਜ਼ੀ, ਸਪੋਰਟ ਬੇਨਤੀ ਜਾਂ ਸੁਰੱਖਿਆ ਮਕਸਦ ਸਰਗਰਮ ਹੈ, ਅਤੇ ਉਸ ਤੋਂ ਬਾਅਦ ਵਿਵਾਦ, ਧੋਖਾਧੜੀ ਰੋਕਥਾਮ, ਲੇਖਾਕਾਰੀ, ਕਾਨੂੰਨੀ ਪਾਲਣਾ ਜਾਂ ਸੇਵਾ ਸੁਰੱਖਿਆ ਲਈ ਲੋੜੀਂਦੀ ਉਚਿਤ ਮਿਆਦ ਤੱਕ। ਇੱਕ-ਵਾਰੀ ਸਾਈਨ-ਅੱਪ ਅਤੇ ਅਕਾਊਂਟ-ਐਕਸ਼ਨ ਟੋਕਨ ਖਤਮ ਹੁੰਦੇ ਹਨ, ਅਤੇ ਸੈਸ਼ਨ ਖਤਮ ਜਾਂ ਹਟਾਏ ਜਾ ਸਕਦੇ ਹਨ।",
            "ਅਸੀਂ ਹੈਸ਼ ਕੀਤੇ ਪਾਸਵਰਡ, ਹੈਸ਼ ਕੀਤੇ ਇੱਕ-ਵਾਰੀ ਟੋਕਨ, ਪਹੁੰਚ-ਨਿਯੰਤਰਿਤ ਐਡਮਿਨ ਟੂਲ, ਅਕਾਊਂਟ ਡੇਟਾ ਲਈ ਨਿੱਜੀ API ਜਵਾਬ ਅਤੇ ਡੇਟਾਬੇਸ ਪਹੁੰਚ ਪਾਬੰਦੀਆਂ ਵਰਗੇ ਉਪਾਅ ਵਰਤਦੇ ਹਾਂ। ਕੋਈ ਔਨਲਾਈਨ ਸੇਵਾ ਪੂਰੀ ਸੁਰੱਖਿਆ ਦੀ ਗਾਰੰਟੀ ਨਹੀਂ ਦੇ ਸਕਦੀ, ਇਸ ਲਈ ਵਿਲੱਖਣ ਪਾਸਵਰਡ ਵਰਤੋ ਅਤੇ ਅਣਅਧਿਕਾਰਤ ਪਹੁੰਚ ਦਾ ਸ਼ੱਕ ਹੋਵੇ ਤਾਂ ਸਾਨੂੰ ਦੱਸੋ।",
          ],
        },
        {
          heading: "8. ਤੁਹਾਡੀਆਂ ਚੋਣਾਂ ਅਤੇ ਹੱਕ",
          bullets: [
            "ਖਾਤਾ ਅਤੇ ਸੁਰੱਖਿਆ ਤੋਂ ਆਪਣਾ ਅਕਾਊਂਟ ਡੇਟਾ ਵੇਖੋ ਅਤੇ ਡਾਊਨਲੋਡ ਕਰੋ।",
            "ਅਕਾਊਂਟ ਈਮੇਲ ਜਾਂ ਫੋਨ ਠੀਕ ਕਰੋ, ਪ੍ਰੋਫਾਈਲ ਜਾਂ ਕੈਂਪੇਨ ਬਦਲੋ, ਅਤੇ ਡੈਸ਼ਬੋਰਡ ਤੋਂ ਯੋਗ ਅਰਜ਼ੀਆਂ ਬਦਲੋ/ਵਾਪਸ ਲਵੋ।",
            "ਸਾਈਨ-ਇਨ ਡਿਵਾਈਸ ਹਟਾਓ ਅਤੇ ਖਾਤਾ ਅਤੇ ਸੁਰੱਖਿਆ ਤੋਂ ਅਕਾਊਂਟ ਹਟਾਓ।",
            "ਖਾਸ ਕਰਕੇ ਉਹਨਾਂ ਸੰਪਰਕ ਸੁਨੇਹਿਆਂ ਜਾਂ ਰਿਪੋਰਟਾਂ ਲਈ ਜੋ ਅਕਾਊਂਟ ਤੋਂ ਨਿਯੰਤਰਿਤ ਨਹੀਂ ਹੁੰਦੇ, ਤੁਹਾਡੇ ਡੇਟਾ ਹੱਕ ਪੇਜ ਰਾਹੀਂ ਪਹੁੰਚ, ਸੁਧਾਰ, ਹਟਾਉਣ, ਸਹਿਮਤੀ ਵਾਪਸੀ ਜਾਂ ਸ਼ਿਕਾਇਤ ਮਦਦ ਮੰਗੋ।",
            "ਸਾਨੂੰ ਤੁਹਾਡੀ ਪਛਾਣ ਤਸਦੀਕ ਕਰਨੀ ਪੈ ਸਕਦੀ ਹੈ ਅਤੇ ਸੁਰੱਖਿਆ, ਧੋਖਾਧੜੀ ਰੋਕਥਾਮ, ਵਿਵਾਦ ਜਾਂ ਕਾਨੂੰਨੀ ਜ਼ਿੰਮੇਵਾਰੀਆਂ ਲਈ ਸੀਮਤ ਜਾਣਕਾਰੀ ਰੱਖਣੀ ਪੈ ਸਕਦੀ ਹੈ।",
          ],
        },
        {
          heading: "9. ਬੱਚੇ, ਅੰਤਰਰਾਸ਼ਟਰੀ ਪ੍ਰੋਸੈਸਿੰਗ ਅਤੇ ਬਦਲਾਅ",
          bullets: [
            "YaarLink ਉਹਨਾਂ ਲੋਕਾਂ ਲਈ ਹੈ ਜੋ ਕਾਨੂੰਨੀ ਤੌਰ 'ਤੇ ਸ਼ਰਤਾਂ ਨਾਲ ਸਹਿਮਤ ਹੋ ਸਕਦੇ ਹਨ, ਜਾਂ ਜਿੱਥੇ ਜ਼ਰੂਰੀ ਹੋਵੇ ਮਾਤਾ-ਪਿਤਾ/ਸਰਪ੍ਰਸਤ ਇਜਾਜ਼ਤ ਨਾਲ ਵਰਤਦੇ ਹਨ। ਜੇ ਤੁਹਾਨੂੰ ਲੱਗਦਾ ਹੈ ਕਿ ਕਿਸੇ ਬੱਚੇ ਦੀ ਜਾਣਕਾਰੀ ਉਚਿਤ ਇਜਾਜ਼ਤ ਬਿਨਾਂ ਭੇਜੀ ਗਈ, ਤਾਂ ਸਾਨੂੰ ਦੱਸੋ।",
            "ਸਾਡੇ ਹੋਸਟਿੰਗ, ਡੇਟਾਬੇਸ ਅਤੇ ਈਮੇਲ ਪ੍ਰਦਾਤਾ ਭਾਰਤ ਜਾਂ ਆਪਣੇ ਹੋਰ ਸੰਚਾਲਨ ਦੇਸ਼ਾਂ ਵਿੱਚ, ਆਪਣੀ ਸੁਰੱਖਿਆ ਵਿਵਸਥਾ ਅਧੀਨ, ਜਾਣਕਾਰੀ ਪ੍ਰੋਸੈਸ ਕਰ ਸਕਦੇ ਹਨ।",
            "ਸੇਵਾ ਜਾਂ ਕਾਨੂੰਨ ਬਦਲਣ 'ਤੇ ਅਸੀਂ ਨੀਤੀ ਅਪਡੇਟ ਕਰ ਸਕਦੇ ਹਾਂ। ਨਵਾਂ ਸੰਸਕਰਣ ਨਵੀਂ ਤਾਰੀਖ ਨਾਲ ਇੱਥੇ ਪੋਸਟ ਹੋਵੇਗਾ; ਵੱਡੇ ਬਦਲਾਅ ਉਚਿਤ ਹੋਣ 'ਤੇ ਵੈੱਬਸਾਈਟ ਜਾਂ ਈਮੇਲ ਰਾਹੀਂ ਵੀ ਦੱਸੇ ਜਾ ਸਕਦੇ ਹਨ।",
          ],
        },
      ],
    },
    terms: {
      title: "ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ",
      intro: "ਇਹ ਸ਼ਰਤਾਂ YaarLink ਅਤੇ theyaar.com ਦੀ ਤੁਹਾਡੀ ਵਰਤੋਂ ਨੂੰ ਨਿਯੰਤਰਿਤ ਕਰਦੀਆਂ ਹਨ। ਅਕਾਊਂਟ ਬਣਾਉਣ ਜਾਂ ਮਾਰਕੀਟਪਲੇਸ ਵਰਤਣ 'ਤੇ ਤੁਸੀਂ ਇਹਨਾਂ ਸ਼ਰਤਾਂ ਅਤੇ ਪਰਾਈਵੇਸੀ ਨੀਤੀ ਨਾਲ ਸਹਿਮਤ ਹੁੰਦੇ ਹੋ।",
      actions: [
        { label: "ਪਰਾਈਵੇਸੀ ਨੀਤੀ", href: "/privacy", primary: true },
        { label: "ਪੇਮੈਂਟ ਅਤੇ ਰਿਫੰਡ", href: "/refund-policy" },
        { label: "ਤੁਹਾਡੇ ਡੇਟਾ ਹੱਕ", href: "/data-rights" },
      ],
      sections: [
        {
          heading: "1. YaarLink ਸੇਵਾ",
          paragraphs: [
            "YaarLink ਬ੍ਰਾਂਡ ਅਤੇ ਲੋਕਲ ਕਾਰੋਬਾਰਾਂ ਨੂੰ ਕੈਂਪੇਨ ਦੱਸਣ, ਕ੍ਰਿਏਟਰਾਂ ਅਤੇ ਪੇਜਾਂ ਨੂੰ ਪ੍ਰੋਫਾਈਲ ਦਿਖਾਉਣ, ਅਤੇ ਯੋਗ ਕ੍ਰਿਏਟਰਾਂ ਨੂੰ ਖੁੱਲ੍ਹੇ ਕੈਂਪੇਨ ਲਈ ਅਪਲਾਈ ਕਰਨ ਵਿੱਚ ਮਦਦ ਕਰਦਾ ਹੈ। YaarLink ਪ੍ਰਕਾਸ਼ਨ ਤੋਂ ਪਹਿਲਾਂ ਲਿਸਟਿੰਗ ਦੀ ਜਾਂਚ ਕਰਦਾ ਹੈ ਅਤੇ ਅਰਜ਼ੀ ਸਥਿਤੀ ਤੇ ਸੂਚਨਾ ਟੂਲ ਦਿੰਦਾ ਹੈ।",
            "YaarLink ਗਾਰੰਟੀ ਨਹੀਂ ਦਿੰਦਾ ਕਿ ਕੈਂਪੇਨ ਨੂੰ ਅਰਜ਼ੀਆਂ ਮਿਲਣਗੀਆਂ, ਕ੍ਰਿਏਟਰ ਹਾਇਰ ਹੋਵੇਗਾ, ਕੰਟੈਂਟ ਤੋਂ ਕੋਈ ਪਹੁੰਚ ਜਾਂ ਵਿਕਰੀ ਨਤੀਜਾ ਮਿਲੇਗਾ, ਜਾਂ ਦੂਜਾ ਉਪਭੋਗਤਾ ਕੰਮ ਜਾਂ ਪੇਮੈਂਟ ਕਰੇਗਾ। ਉਪਭੋਗਤਾ ਖੁਦ ਦੂਜੀ ਧਿਰ ਦੀ ਜਾਂਚ ਅਤੇ ਕੰਮ, ਕੀਮਤ, ਤਾਰੀਖ ਤੇ ਪੇਮੈਂਟ ਸ਼ਰਤਾਂ ਤੈਅ ਕਰਨ ਦੇ ਜ਼ਿੰਮੇਵਾਰ ਹਨ।",
          ],
        },
        {
          heading: "2. ਯੋਗਤਾ ਅਤੇ ਅਕਾਊਂਟ",
          bullets: [
            "ਤੁਸੀਂ ਕਾਨੂੰਨੀ ਤੌਰ 'ਤੇ ਇਸ ਸਮਝੌਤੇ ਦੇ ਯੋਗ ਹੋਣੇ ਚਾਹੀਦੇ ਹੋ, ਜਾਂ ਜਿੱਥੇ ਜ਼ਰੂਰੀ ਹੋਵੇ ਮਾਤਾ-ਪਿਤਾ/ਸਰਪ੍ਰਸਤ ਇਜਾਜ਼ਤ ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ।",
            "ਆਪਣੇ ਨਿਯੰਤਰਣ ਵਾਲੀ ਈਮੇਲ ਵਰਤੋ, ਅਕਾਊਂਟ ਜਾਣਕਾਰੀ ਸਹੀ ਰੱਖੋ, ਅਤੇ ਵਰਤੀਆਂ ਜਾਣ ਵਾਲੀਆਂ ਸੁਵਿਧਾਵਾਂ ਲਈ ਸਹੀ ਬ੍ਰਾਂਡ ਜਾਂ ਕ੍ਰਿਏਟਰ ਅਕਾਊਂਟ ਬਣਾਓ।",
            "ਪਾਸਵਰਡ ਅਤੇ ਤਸਦੀਕ ਲਿੰਕ ਨਿੱਜੀ ਰੱਖੋ। ਅਣਅਧਿਕਾਰਤ ਵਰਤੋਂ ਦੀ ਤੁਰੰਤ ਸੂਚਨਾ ਨਾ ਦੇਣ 'ਤੇ ਤੁਹਾਡੇ ਅਕਾਊਂਟ ਦੀ ਗਤੀਵਿਧੀ ਤੁਹਾਡੀ ਜ਼ਿੰਮੇਵਾਰੀ ਹੋਵੇਗੀ।",
            "ਕਿਸੇ ਹੋਰ ਵਿਅਕਤੀ, ਕਾਰੋਬਾਰ, ਕ੍ਰਿਏਟਰ ਜਾਂ ਪੇਜ ਦੀ ਨਕਲੀ ਪਛਾਣ ਲਈ, ਜਾਂ ਮਾਡਰੇਸ਼ਨ/ਸੁਰੱਖਿਆ ਨਿਯੰਤਰਣ ਤੋਂ ਬਚਣ ਲਈ ਅਕਾਊਂਟ ਨਾ ਬਣਾਓ।",
          ],
        },
        {
          heading: "3. ਪ੍ਰੋਫਾਈਲ, ਕੈਂਪੇਨ ਅਤੇ ਤਸਦੀਕ",
          bullets: [
            "ਸਿਰਫ਼ ਉਹੀ ਜਾਣਕਾਰੀ ਅਤੇ ਸੋਸ਼ਲ ਲਿੰਕ ਭੇਜੋ ਜੋ ਤੁਹਾਡੇ ਆਪਣੇ ਹਨ ਜਾਂ ਜਿਨ੍ਹਾਂ ਦੀ ਵਰਤੋਂ ਦਾ ਤੁਹਾਨੂੰ ਹੱਕ ਹੈ। ਫਾਲੋਅਰ, ਕਾਰੋਬਾਰ ਵੇਰਵੇ, ਬਜਟ ਅਤੇ ਕੈਂਪੇਨ ਵੇਰਵੇ ਸਹੀ ਤੇ ਤਾਜ਼ਾ ਰੱਖੋ।",
            "YaarLink ਪ੍ਰੋਫਾਈਲ ਜਾਂ ਕੈਂਪੇਨ ਮਨਜ਼ੂਰ, ਰੱਦ, ਮੁਅੱਤਲ, ਰੋਕਿਆ, ਹਟਾ ਸਕਦਾ ਹੈ ਜਾਂ ਤਸਦੀਕ ਮੰਗ ਸਕਦਾ ਹੈ। ਜਾਂਚਿਆ/ਤਸਦੀਕ ਬੈਜ ਦਾ ਮਤਲਬ ਕਿਸੇ ਸਮੇਂ ਜਾਂਚ ਹੋਈ ਸੀ; ਇਹ ਪਛਾਣ, ਆਡੀਅੰਸ ਗੁਣਵੱਤਾ, ਪ੍ਰਦਰਸ਼ਨ ਜਾਂ ਭਵਿੱਖੀ ਵਰਤਾਰਾ ਦੀ ਗਾਰੰਟੀ ਨਹੀਂ ਹੈ।",
            "ਜਨਤਕ ਪ੍ਰੋਫਾਈਲ ਜਾਂ ਕੈਂਪੇਨ ਵਿੱਚ ਵੱਡੇ ਬਦਲਾਅ ਲਈ ਫਿਰ ਜਾਂਚ ਲੱਗ ਸਕਦੀ ਹੈ।",
            "ਤੁਸੀਂ YaarLink ਨੂੰ ਪਰਾਈਵੇਸੀ ਨੀਤੀ ਅਧੀਨ ਮਾਰਕੀਟਪਲੇਸ ਚਲਾਉਣ, ਮਾਡਰੇਸ਼ਨ ਅਤੇ ਲਿਸਟਿੰਗ ਦਿਖਾਉਣ ਲਈ ਭੇਜੀ ਜਾਣਕਾਰੀ ਸੇਵ ਤੇ ਦਿਖਾਉਣ ਦੀ ਇਜਾਜ਼ਤ ਦਿੰਦੇ ਹੋ।",
          ],
        },
        {
          heading: "4. ਅਰਜ਼ੀਆਂ ਅਤੇ ਸੰਪਰਕ",
          bullets: [
            "ਸਿਰਫ਼ ਕ੍ਰਿਏਟਰ ਪ੍ਰੋਫਾਈਲ ਵਾਲੇ ਯੋਗ ਕ੍ਰਿਏਟਰ ਅਕਾਊਂਟ ਕੈਂਪੇਨ ਲਈ ਅਪਲਾਈ ਕਰ ਸਕਦੇ ਹਨ।",
            "ਕ੍ਰਿਏਟਰ ਖੁਦ ਅਰਜ਼ੀ ਸੰਪਰਕ ਚੁਣਦਾ ਹੈ। ਭੇਜਣ ਦੀ ਪੁਸ਼ਟੀ ਕਰਕੇ ਕ੍ਰਿਏਟਰ YaarLink ਨੂੰ ਲਿਖਿਆ ਨਾਮ, ਸੰਪਰਕ ਅਤੇ ਸੁਨੇਹਾ ਉਸ ਕੈਂਪੇਨ ਦੇ ਬ੍ਰਾਂਡ ਨੂੰ ਦਿਖਾਉਣ ਦੀ ਇਜਾਜ਼ਤ ਦਿੰਦਾ ਹੈ।",
            "ਬ੍ਰਾਂਡ ਬਿਨੈਕਾਰ ਜਾਣਕਾਰੀ ਸਿਰਫ਼ ਉਸ ਅਰਜ਼ੀ ਜਾਂ ਕੈਂਪੇਨ ਅਤੇ ਸੰਬੰਧਿਤ ਸਹਿਮਤ ਕੰਮ ਦਾ ਮੁਲਾਂਕਣ ਤੇ ਸੰਚਾਲਨ ਕਰਨ ਲਈ ਵਰਤ ਸਕਦਾ ਹੈ। ਉਹ ਉਸ ਨੂੰ ਵੇਚ, ਕਿਰਾਏ 'ਤੇ, ਪ੍ਰਕਾਸ਼ਿਤ, ਸਪੈਮ ਜਾਂ ਅਸੰਬੰਧਿਤ ਮਾਰਕੀਟਿੰਗ ਲਈ ਨਹੀਂ ਵਰਤ ਸਕਦਾ।",
            "YaarLink 'ਤੇ ਅਰਜ਼ੀ ਜਾਂ ਸਥਿਤੀ ਆਪਣੇ ਆਪ ਰੁਜ਼ਗਾਰ, ਏਜੰਸੀ, ਭਾਈਵਾਲੀ ਜਾਂ ਪੇਮੈਂਟ ਗਾਰੰਟੀ ਨਹੀਂ ਬਣਾਉਂਦੀ। ਕੰਮ ਸ਼ੁਰੂ ਹੋਣ ਤੋਂ ਪਹਿਲਾਂ ਬ੍ਰਾਂਡ ਅਤੇ ਕ੍ਰਿਏਟਰ ਡਿਲੀਵਰੇਬਲ, ਵਰਤੋਂ ਹੱਕ, ਤਾਰੀਖਾਂ, ਕੀਮਤ ਅਤੇ ਪੇਮੈਂਟ ਤਰੀਕਾ ਪੁਸ਼ਟ ਕਰਨ।",
          ],
        },
        {
          heading: "5. ਸਵੀਕਾਰਯੋਗ ਵਰਤੋਂ",
          bullets: [
            "ਗੈਰਕਾਨੂੰਨੀ, ਭ੍ਰਾਮਕ, ਉਲੰਘਣਾਕਾਰੀ, ਪਰੇਸ਼ਾਨਕਾਰੀ, ਨਫ਼ਰਤਭਰਪੂਰ, ਜਿਨਸੀ ਸ਼ੋਸ਼ਣਕਾਰੀ, ਖਤਰਨਾਕ ਜਾਂ ਧੋਖਾਧੜੀ ਵਾਲਾ ਕੰਟੈਂਟ ਜਾਂ ਕੈਂਪੇਨ ਨਾ ਪੋਸਟ ਕਰੋ।",
            "ਦੂਜਿਆਂ ਦੀ ਨਕਲੀ ਪਛਾਣ, ਨਕਲੀ ਐਂਗੇਜਮੈਂਟ/ਫਾਲੋਅਰ, ਸਪੈਮ, ਨਿੱਜੀ ਸੰਪਰਕ ਸਕ੍ਰੈਪਿੰਗ, ਜਾਂ ਵੈਧ ਅਰਜ਼ੀ ਲਈ ਸਪਸ਼ਟ ਇਜਾਜ਼ਤ ਤੋਂ ਬਿਨਾਂ ਉਪਭੋਗਤਾ ਜਾਣਕਾਰੀ ਇਕੱਠੀ ਨਾ ਕਰੋ।",
            "ਲਾਗਇਨ, ਤਸਦੀਕ, ਰੇਟ-ਲਿਮਿਟ, ਮਾਡਰੇਸ਼ਨ ਜਾਂ ਹੋਰ ਸੁਰੱਖਿਆ ਉਪਾਵਾਂ ਨੂੰ ਬਾਈਪਾਸ ਨਾ ਕਰੋ ਅਤੇ ਸੇਵਾ ਜਾਂ ਦੂਜੇ ਦੇ ਅਕਾਊਂਟ ਵਿੱਚ ਰੁਕਾਵਟ ਨਾ ਪਾਓ।",
            "ਪ੍ਰਾਯੋਜਿਤ ਕੰਟੈਂਟ ਦੇ ਲਾਗੂ ਵਿਗਿਆਪਨ, ਖਪਤਕਾਰ-ਸੁਰੱਖਿਆ, ਬੌਧਿਕ-ਸੰਪਤੀ, ਪਲੇਟਫਾਰਮ ਅਤੇ ਖੁਲਾਸਾ ਨਿਯਮਾਂ ਦੀ ਪਾਲਣਾ ਕਰੋ।",
          ],
        },
        {
          heading: "6. ਕੰਟੈਂਟ ਅਤੇ ਬੌਧਿਕ ਸੰਪਤੀ",
          paragraphs: [
            "ਤੁਹਾਡੇ ਭੇਜੇ ਕੰਟੈਂਟ ਅਤੇ ਜਾਣਕਾਰੀ ਦੀ ਮਾਲਕੀ ਤੁਹਾਡੇ ਕੋਲ ਰਹਿੰਦੀ ਹੈ। ਉਹਨਾਂ ਨੂੰ ਭੇਜਣ ਤੇ ਵਰਤਣ ਦੇ ਲੋੜੀਂਦੇ ਹੱਕ ਯਕੀਨੀ ਬਣਾਉਣਾ ਤੁਹਾਡੀ ਜ਼ਿੰਮੇਵਾਰੀ ਹੈ। YaarLink ਦਾ ਨਾਮ, ਬ੍ਰਾਂਡਿੰਗ, ਵੈੱਬਸਾਈਟ ਡਿਜ਼ਾਈਨ ਅਤੇ ਸਾਫਟਵੇਅਰ YaarLink ਜਾਂ ਉਸ ਦੇ ਲਾਇਸੈਂਸਦਾਤਿਆਂ ਦੀ ਸੰਪਤੀ ਰਹਿੰਦੇ ਹਨ ਅਤੇ ਆਮ ਸੇਵਾ ਵਰਤੋਂ ਤੋਂ ਬਿਨਾਂ ਤੁਹਾਨੂੰ ਲਾਇਸੈਂਸ ਨਹੀਂ ਮਿਲਦਾ।",
            "ਜੇ ਕੋਈ ਲਿਸਟਿੰਗ ਤੁਹਾਡੇ ਹੱਕਾਂ ਦੀ ਉਲੰਘਣਾ ਕਰਦੀ ਹੈ ਜਾਂ ਤੁਹਾਡੀ ਨਕਲੀ ਪਛਾਣ ਹੈ, ਤਾਂ ਲਿਸਟਿੰਗ 'ਤੇ ਰਿਪੋਰਟ ਨਿਯੰਤਰਣ ਵਰਤੋ ਜਾਂ ਸਮੀਖਿਆ ਲਈ ਕਾਫੀ ਜਾਣਕਾਰੀ ਨਾਲ ਸਪੋਰਟ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।",
          ],
        },
        {
          heading: "7. ਪੇਮੈਂਟ",
          paragraphs: [
            "YaarLink ਹਾਲੇ ਵੈੱਬਸਾਈਟ ਵਿੱਚ ਚੈੱਕਆਊਟ, ਐਸਕ੍ਰੋ ਜਾਂ ਪੇਮੈਂਟ-ਪ੍ਰੋਸੈਸਿੰਗ ਸੇਵਾ ਨਹੀਂ ਦਿੰਦਾ। ਕੈਂਪੇਨ ਬਜਟ ਇੱਛਿਤ ਖਰਚ ਦਾ ਸੰਕੇਤ ਹੈ, ਫੀਸ ਜਾਂ ਜਮ੍ਹਾ ਨਹੀਂ। ਵੱਖਰੇ ਲਿਖਤੀ ਸਮਝੌਤੇ ਵਿੱਚ ਹੋਰ ਨਾ ਕਿਹਾ ਹੋਵੇ ਤਾਂ ਬ੍ਰਾਂਡ ਅਤੇ ਕ੍ਰਿਏਟਰ ਵਿਚਕਾਰ ਪੇਮੈਂਟ ਸਿੱਧੀ ਹੁੰਦੀ ਹੈ। ਪੇਮੈਂਟ ਅਤੇ ਰਿਫੰਡ ਨੀਤੀ ਵੇਖੋ।",
          ],
        },
        {
          heading: "8. ਉਪਲਬਧਤਾ, ਤੀਜੇ ਪੱਖ ਅਤੇ ਜ਼ਿੰਮੇਵਾਰੀ",
          bullets: [
            "ਰਖਰਖਾਵ, ਸੁਰੱਖਿਆ ਜਾਂ ਤਕਨੀਕੀ ਕਾਰਨਾਂ ਕਰਕੇ ਸੇਵਾ ਬਦਲ, ਰੁਕ ਜਾਂ ਅਣਉਪਲਬਧ ਹੋ ਸਕਦੀ ਹੈ।",
            "WhatsApp, Instagram, YouTube ਅਤੇ ਉਪਭੋਗਤਾ ਵੈੱਬਸਾਈਟਾਂ ਦੇ ਲਿੰਕ ਤੇ ਇੰਟੀਗ੍ਰੇਸ਼ਨ ਤੀਜੇ ਪੱਖ ਚਲਾਉਂਦੇ ਹਨ; YaarLink ਉਹਨਾਂ ਦੇ ਕੰਟੈਂਟ, ਉਪਲਬਧਤਾ ਜਾਂ ਪਰਾਈਵੇਸੀ ਪ੍ਰਥਾਵਾਂ ਦਾ ਜ਼ਿੰਮੇਵਾਰ ਨਹੀਂ ਹੈ।",
            "ਕਾਨੂੰਨ ਜਿੰਨੀ ਇਜਾਜ਼ਤ ਦਿੰਦਾ ਹੈ, YaarLink ਦੂਜੇ ਉਪਭੋਗਤਾ ਦੇ ਵਰਤਾਰੇ, ਅਸਿੱਧੇ ਜਾਂ ਅਨੁਭਵੀ ਨੁਕਸਾਨ, ਗੁਆਚੇ ਲਾਭ, ਜਾਂ ਦਸਤਖਤ ਕੀਤੇ ਲਿਖਤੀ ਸਮਝੌਤੇ ਵਿੱਚ ਸਪਸ਼ਟ ਗਾਰੰਟੀ ਨਾ ਦਿੱਤੇ ਨਤੀਜਿਆਂ ਦਾ ਜ਼ਿੰਮੇਵਾਰ ਨਹੀਂ ਹੈ। ਇਹ ਸ਼ਰਤਾਂ ਕਾਨੂੰਨੀ ਤੌਰ 'ਤੇ ਹਟਾਈ ਨਾ ਜਾ ਸਕਣ ਵਾਲੀ ਜ਼ਿੰਮੇਵਾਰੀ ਨਹੀਂ ਹਟਾਉਂਦੀਆਂ।",
          ],
        },
        {
          heading: "9. ਮੁਅੱਤਲੀ, ਹਟਾਉਣਾ ਅਤੇ ਬਦਲਾਅ",
          bullets: [
            "ਤੁਸੀਂ ਖਾਤਾ ਅਤੇ ਸੁਰੱਖਿਆ ਤੋਂ ਅਕਾਊਂਟ ਹਟਾ ਸਕਦੇ ਹੋ। ਹਟਾਉਣਾ ਸਥਾਈ ਹੈ ਅਤੇ ਅਕਾਊਂਟ ਹਟਾਓ ਪੇਜ ਅਨੁਸਾਰ ਜੁੜੀਆਂ ਲਿਸਟਿੰਗ ਤੇ ਅਰਜ਼ੀਆਂ ਵੀ ਹਟਦੀਆਂ ਹਨ।",
            "ਸ਼ੱਕੀ ਧੋਖਾਧੜੀ, ਨਕਲੀ ਪਛਾਣ, ਦੁਰਵਰਤੋਂ, ਸੁਰੱਖਿਆ ਜੋਖਮ, ਗੈਰਕਾਨੂੰਨੀ ਵਰਤਾਰਾ ਜਾਂ ਇਹਨਾਂ ਸ਼ਰਤਾਂ ਦੀ ਗੰਭੀਰ ਉਲੰਘਣਾ 'ਤੇ YaarLink ਪਹੁੰਚ ਸੀਮਤ ਜਾਂ ਖਤਮ ਕਰ ਸਕਦਾ ਹੈ।",
            "ਅਸੀਂ ਸ਼ਰਤਾਂ ਅਪਡੇਟ ਕਰ ਸਕਦੇ ਹਾਂ। ਸੋਧਿਆ ਸੰਸਕਰਣ ਨਵੀਂ ਤਾਰੀਖ ਨਾਲ ਇੱਥੇ ਪੋਸਟ ਹੋਵੇਗਾ, ਅਤੇ ਲਾਗੂ ਤਾਰੀਖ ਤੋਂ ਬਾਅਦ ਵਰਤੋਂ ਜਾਰੀ ਰੱਖਣ ਦਾ ਮਤਲਬ ਅਪਡੇਟ ਸ਼ਰਤਾਂ ਦੀ ਸਵੀਕ੍ਰਿਤੀ ਹੈ।",
            "ਇਹ ਸ਼ਰਤਾਂ ਭਾਰਤ ਦੇ ਕਾਨੂੰਨ ਨਾਲ ਨਿਯੰਤਰਿਤ ਹਨ। ਪਹਿਲਾਂ ਸਪੋਰਟ ਨਾਲ ਸੰਪਰਕ ਕਰੋ ਤਾਂ ਜੋ ਅਸੀਂ ਚਿੰਤਾ ਗੈਰਰਸਮੀ ਤੌਰ 'ਤੇ ਸੁਲਝਾਉਣ ਦੀ ਕੋਸ਼ਿਸ਼ ਕਰ ਸਕੀਏ।",
          ],
        },
      ],
    },
    refunds: {
      title: "ਪੇਮੈਂਟ, ਰੱਦ ਕਰਨਾ ਅਤੇ ਰਿਫੰਡ",
      intro: "ਇਹ ਨੀਤੀ ਦੱਸਦੀ ਹੈ ਕਿ ਅੱਜ YaarLink 'ਤੇ ਪੈਸਾ ਕਿਵੇਂ ਕੰਮ ਕਰਦਾ ਹੈ। ਸਭ ਤੋਂ ਮਹੱਤਵਪੂਰਨ ਗੱਲ ਇਹ ਹੈ ਕਿ ਵੈੱਬਸਾਈਟ ਖੁਦ ਹਾਲੇ ਔਨਲਾਈਨ ਪੇਮੈਂਟ ਇਕੱਠੀ ਨਹੀਂ ਕਰਦੀ।",
      actions: [
        { label: "ਸਪੋਰਟ ਨਾਲ ਸੰਪਰਕ ਕਰੋ", href: "/contact", primary: true },
        { label: "ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ", href: "/terms" },
        { label: "ਪਰਾਈਵੇਸੀ ਨੀਤੀ", href: "/privacy" },
      ],
      sections: [
        {
          heading: "1. ਹਾਲੇ ਵੈੱਬਸਾਈਟ ਚੈੱਕਆਊਟ ਨਹੀਂ ਹੈ",
          bullets: [
            "ਅਕਾਊਂਟ ਬਣਾਉਣਾ, ਕ੍ਰਿਏਟਰ ਵਜੋਂ ਜੁੜਨਾ, ਜਾਂਚ ਲਈ ਕੈਂਪੇਨ ਪੋਸਟ ਕਰਨਾ ਅਤੇ ਕੈਂਪੇਨ ਲਈ ਅਪਲਾਈ ਕਰਨਾ theyaar.com 'ਤੇ ਔਨਲਾਈਨ ਪੇਮੈਂਟ ਸ਼ੁਰੂ ਨਹੀਂ ਕਰਦਾ।",
            "ਕੈਂਪੇਨ ਫਾਰਮ ਵਿੱਚ ਲਿਖਿਆ ਬਜਟ ਬ੍ਰਾਂਡ ਦਾ ਇੱਛਿਤ ਕੈਂਪੇਨ ਬਜਟ ਹੈ। ਇਹ ਪੇਮੈਂਟ, ਜਮ੍ਹਾ, ਐਸਕ੍ਰੋ ਬੈਲੰਸ, ਕੀਮਤ ਗਾਰੰਟੀ ਜਾਂ YaarLink ਕੋਲ ਰੱਖੀ ਰਕਮ ਨਹੀਂ ਹੈ।",
            "YaarLink ਵੈੱਬਸਾਈਟ ਫਾਰਮ ਰਾਹੀਂ ਕਾਰਡ ਵੇਰਵੇ, ਬੈਂਕ-ਲਾਗਇਨ ਵੇਰਵੇ ਜਾਂ UPI PIN ਨਹੀਂ ਮੰਗਦਾ। ਜੇ YaarLink ਦਾ ਪ੍ਰਤਿਨਿਧੀ ਦੱਸ ਕੇ ਕੋਈ ਇਹ ਗੁਪਤ ਜਾਣਕਾਰੀ ਮੰਗੇ ਤਾਂ ਰੁਕੋ ਅਤੇ ਸਪੋਰਟ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।",
          ],
        },
        {
          heading: "2. ਵੱਖਰੇ ਤੌਰ 'ਤੇ ਤੈਅ ਭੁਗਤਾਨਯੋਗ ਸੇਵਾਵਾਂ",
          paragraphs: [
            "ਜੇ YaarLink ਭੁਗਤਾਨਯੋਗ ਪ੍ਰਬੰਧਿਤ ਸੇਵਾ ਦਿੰਦਾ ਹੈ, ਤਾਂ ਪੇਮੈਂਟ ਤੋਂ ਪਹਿਲਾਂ ਕੀਮਤ, ਟੈਕਸ, ਡਿਲੀਵਰੇਬਲ, ਤਾਰੀਖਾਂ, ਸ਼ਾਮਲ ਕ੍ਰਿਏਟਰ ਅਤੇ ਪੇਮੈਂਟ ਸ਼ਡਿਊਲ ਲਿਖਤੀ ਕੋਟੇਸ਼ਨ, ਇਨਵੌਇਸ ਜਾਂ ਸਮਝੌਤੇ ਵਿੱਚ ਪੁਸ਼ਟ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ। ਜੇ ਉਹ ਲਿਖਤੀ ਦਸਤਾਵੇਜ਼ ਇਸ ਆਮ ਨੀਤੀ ਤੋਂ ਵੱਖਰਾ ਹੋਵੇ ਤਾਂ ਖਾਸ ਕੰਮ ਲਈ ਉਹੀ ਨਿਯੰਤਰਿਤ ਕਰੇਗਾ।",
          ],
        },
        {
          heading: "3. YaarLink ਨੂੰ ਦਿੱਤੀ ਰਕਮ ਲਈ ਰੱਦਤਾ ਅਤੇ ਰਿਫੰਡ ਯੋਗਤਾ",
          bullets: [
            "ਜੇ ਤੁਸੀਂ ਕੰਮ ਸ਼ੁਰੂ ਹੋਣ ਤੋਂ ਪਹਿਲਾਂ ਭੁਗਤਾਨਯੋਗ YaarLink ਸੇਵਾ ਰੱਦ ਕਰਦੇ ਹੋ, ਤਾਂ YaarLink ਨੂੰ ਦਿੱਤੀ ਅਣਵਰਤੀ ਰਕਮ ਰਿਫੰਡ ਯੋਗ ਹੈ, ਸਿਰਫ਼ ਤੁਹਾਡੇ ਪੁਸ਼ਟ ਕੰਮ ਲਈ ਪਹਿਲਾਂ ਕੀਤੇ ਗੈਰ-ਵਸੂਲੀਯੋਗ ਤੀਜੇ-ਪੱਖ ਖਰਚੇ ਘਟਾ ਕੇ।",
            "ਜੇ ਕੰਮ ਸ਼ੁਰੂ ਹੋਇਆ ਜਾਂ ਡਿਲੀਵਰੇਬਲ ਦਿੱਤੇ ਗਏ, ਤਾਂ ਰਿਫੰਡ ਪੂਰੇ ਕੰਮ, ਵਚਨਬੱਧ ਕ੍ਰਿਏਟਰ/ਤੀਜੇ-ਪੱਖ ਖਰਚੇ ਅਤੇ ਲਿਖਤੀ ਸਮਝੌਤੇ ਦੇ ਆਧਾਰ 'ਤੇ ਤੈਅ ਹੋਵੇਗਾ।",
            "ਜੇ YaarLink ਸਹਿਮਤ ਸੇਵਾ ਸ਼ੁਰੂ ਨਾ ਕਰ ਸਕੇ, ਤਾਂ ਉਸ ਸੇਵਾ ਲਈ ਦਿੱਤੀ ਅਣਵਰਤੀ ਰਕਮ ਰਿਫੰਡ ਯੋਗ ਹੈ।",
            "YaarLink ਨੂੰ ਹੋਈ ਤਸਦੀਕ ਡੁਪਲੀਕੇਟ ਜਾਂ ਗਲਤ ਪੇਮੈਂਟ ਦੀ ਡੁਪਲੀਕੇਟ/ਵਾਧੂ ਰਕਮ ਰਿਫੰਡ ਯੋਗ ਹੈ।",
            "ਸਿਰਫ਼ ਕੈਂਪੇਨ ਪਹੁੰਚ, ਐਂਗੇਜਮੈਂਟ ਜਾਂ ਵਿਕਰੀ ਉਮੀਦ ਤੋਂ ਵੱਖਰੀ ਹੋਣ 'ਤੇ ਰਿਫੰਡ ਗਾਰੰਟੀ ਨਹੀਂ ਹੈ, ਜਦ ਤੱਕ ਲਿਖਤੀ ਸਮਝੌਤੇ ਵਿੱਚ ਖਾਸ ਨਤੀਜੇ ਦੀ ਸਪਸ਼ਟ ਗਾਰੰਟੀ ਨਾ ਹੋਵੇ।",
          ],
        },
        {
          heading: "4. ਬ੍ਰਾਂਡ ਅਤੇ ਕ੍ਰਿਏਟਰ ਵਿਚਕਾਰ ਸਿੱਧੀ ਪੇਮੈਂਟ",
          bullets: [
            "ਜਦ ਤੱਕ ਵੱਖਰਾ ਲਿਖਤੀ ਸਮਝੌਤਾ ਸਪਸ਼ਟ ਨਾ ਕਹੇ ਕਿ YaarLink ਪੈਸਾ ਇਕੱਠਾ ਕਰ ਰਿਹਾ ਹੈ, ਬ੍ਰਾਂਡ-ਤੋਂ-ਕ੍ਰਿਏਟਰ ਪੇਮੈਂਟ ਉਹਨਾਂ ਧਿਰਾਂ ਵਿਚਕਾਰ ਸਿੱਧਾ ਲੈਣ-ਦੇਣ ਹੈ।",
            "YaarLink ਜੋ ਪੈਸਾ ਉਸ ਨੂੰ ਮਿਲਿਆ ਨਹੀਂ, ਉਸ ਨੂੰ ਰਿਫੰਡ ਨਹੀਂ ਕਰ ਸਕਦਾ, ਬੈਂਕ/UPI ਟ੍ਰਾਂਸਫਰ ਉਲਟ ਨਹੀਂ ਸਕਦਾ, ਜਾਂ ਸਿੱਧੇ ਸੌਦੇ ਲਈ ਐਸਕ੍ਰੋ ਨਹੀਂ ਬਣ ਸਕਦਾ।",
            "ਪੇਮੈਂਟ ਤੋਂ ਪਹਿਲਾਂ ਕਾਨੂੰਨੀ/ਕਾਰੋਬਾਰੀ ਨਾਮ, ਡਿਲੀਵਰੇਬਲ, ਪੋਸਟ ਤਾਰੀਖਾਂ, ਕੰਟੈਂਟ ਹੱਕ, ਰਕਮ, ਟੈਕਸ ਵਿਵਸਥਾ ਅਤੇ ਪੇਮੈਂਟ ਹਵਾਲਾ ਲਿਖਤ ਵਿੱਚ ਪੁਸ਼ਟ ਕਰੋ। ਇਨਵੌਇਸ ਅਤੇ ਟ੍ਰਾਂਸਫਰ ਰਸੀਦਾਂ ਰੱਖੋ।",
            "ਧੋਖਾਧੜੀ ਜਾਂ ਨਕਲੀ ਪਛਾਣ ਦਾ ਸ਼ੱਕ ਹੋਵੇ ਤਾਂ ਤੁਰੰਤ ਆਪਣੇ ਬੈਂਕ/ਪੇਮੈਂਟ ਪ੍ਰਦਾਤਾ ਨਾਲ ਸੰਪਰਕ ਕਰੋ ਅਤੇ ਲਿਸਟਿੰਗ ਜਾਂ ਉਪਭੋਗਤਾ ਨੂੰ YaarLink ਨੂੰ ਰਿਪੋਰਟ ਕਰੋ ਤਾਂ ਜੋ ਅਸੀਂ ਅਕਾਊਂਟ/ਲਿਸਟਿੰਗ ਜਾਂਚ ਸਕੀਏ।",
          ],
        },
        {
          heading: "5. YaarLink ਤੋਂ ਰਿਫੰਡ ਕਿਵੇਂ ਮੰਗਣਾ ਹੈ",
          bullets: [
            "ਅਕਾਊਂਟ ਈਮੇਲ ਤੋਂ ਸਪੋਰਟ ਨੂੰ ਈਮੇਲ ਕਰੋ ਅਤੇ ਕੈਂਪੇਨ, ਪੇਮੈਂਟ ਤਾਰੀਖ, ਰਕਮ, ਪੇਮੈਂਟ ਤਰੀਕਾ ਤੇ ਲੈਣ-ਦੇਣ ਹਵਾਲਾ ਲਿਖੋ। ਕਾਰਡ ਨੰਬਰ, ਬੈਂਕ ਪਾਸਵਰਡ ਜਾਂ UPI PIN ਨਾ ਭੇਜੋ।",
            "ਅਸੀਂ ਭੁਗਤਾਨਕਰਤਾ ਅਤੇ ਕੰਮ ਤਸਦੀਕ ਕਰਨ ਲਈ ਲੋੜੀਂਦੀ ਜਾਣਕਾਰੀ ਮੰਗ ਸਕਦੇ ਹਾਂ। ਮਨਜ਼ੂਰ ਰਿਫੰਡ ਜਿੱਥੇ ਸੰਭਵ ਹੋਵੇ ਮੂਲ ਪੇਮੈਂਟ ਤਰੀਕੇ 'ਤੇ ਵਾਪਸ ਕੀਤਾ ਜਾਂਦਾ ਹੈ।",
            "ਰਿਫੰਡ ਮਨਜ਼ੂਰ ਅਤੇ ਭੇਜੇ ਜਾਣ ਤੋਂ ਬਾਅਦ ਬੈਂਕ ਤੇ ਪੇਮੈਂਟ ਪ੍ਰਦਾਤਾ ਦਾ ਸਮਾਂ ਵੱਖਰਾ ਹੋ ਸਕਦਾ ਹੈ।",
            "ਚਾਰਜਬੈਕ ਜਾਂ ਪੇਮੈਂਟ ਵਿਵਾਦ ਹੋਣ 'ਤੇ ਨਤੀਜਾ ਬੈਂਕ/ਪੇਮੈਂਟ ਪ੍ਰਦਾਤਾ ਦੀ ਪ੍ਰਕਿਰਿਆ ਨਾਲ ਵੀ ਨਿਯੰਤਰਿਤ ਹੋ ਸਕਦਾ ਹੈ।",
          ],
        },
        {
          heading: "6. ਇਸ ਨੀਤੀ ਵਿੱਚ ਬਦਲਾਅ",
          paragraphs: [
            "ਜੇ YaarLink ਬਾਅਦ ਵਿੱਚ ਵੈੱਬਸਾਈਟ ਚੈੱਕਆਊਟ ਜਾਂ ਭੁਗਤਾਨਯੋਗ ਸਦੱਸਤਾ ਸ਼ੁਰੂ ਕਰਦਾ ਹੈ, ਤਾਂ ਪੇਮੈਂਟ ਇਕੱਠੀ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਚੈੱਕਆਊਟ ਸ਼ਰਤਾਂ ਅਤੇ ਇਸ ਨੀਤੀ ਦਾ ਅਪਡੇਟ ਸੰਸਕਰਣ ਫੀਸ, ਰੱਦਤਾ ਮਿਆਦ ਤੇ ਰਿਫੰਡ ਪ੍ਰਕਿਰਿਆ ਦੱਸਣਗੇ।",
          ],
        },
      ],
    },
    "data-rights": {
      title: "ਤੁਹਾਡੇ ਡੇਟਾ ਹੱਕ",
      intro: "ਤੁਸੀਂ ਜ਼ਿਆਦਾਤਰ ਅਕਾਊਂਟ ਜਾਣਕਾਰੀ ਖੁਦ ਸੰਭਾਲ ਸਕਦੇ ਹੋ। ਇਹ ਪੇਜ ਸਵੈ-ਸੇਵਾ ਨਿਯੰਤਰਣ ਅਤੇ ਪਹੁੰਚ, ਸੁਧਾਰ, ਹਟਾਉਣ ਜਾਂ ਪਰਾਈਵੇਸੀ ਸ਼ਿਕਾਇਤ ਲਈ YaarLink ਤੋਂ ਮਦਦ ਮੰਗਣ ਦਾ ਤਰੀਕਾ ਦੱਸਦਾ ਹੈ।",
      actions: [
        { label: "ਖਾਤਾ ਅਤੇ ਸੁਰੱਖਿਆ ਖੋਲ੍ਹੋ", href: "/account", primary: true },
        { label: "ਅਕਾਊਂਟ ਹਟਾਉਣ ਦੀ ਗਾਈਡ", href: "/account-deletion" },
        { label: "ਸਪੋਰਟ ਨਾਲ ਸੰਪਰਕ ਕਰੋ", href: "/contact" },
      ],
      sections: [
        {
          heading: "1. ਉਪਲਬਧ ਚੋਣਾਂ",
          bullets: [
            "ਡੇਟਾ ਡਾਊਨਲੋਡ ਤੋਂ ਆਪਣੇ ਅਕਾਊਂਟ, ਪ੍ਰੋਫਾਈਲ, ਕੈਂਪੇਨ, ਅਰਜ਼ੀ, ਸੂਚਨਾ, ਰਿਪੋਰਟ ਅਤੇ ਸੈਸ਼ਨ ਜਾਣਕਾਰੀ ਦੀ ਕਾਪੀ ਲਵੋ।",
            "ਲਿਸਟਿੰਗ-ਜਾਂਚ ਨਿਯਮਾਂ ਅਧੀਨ ਗਲਤ ਅਕਾਊਂਟ, ਪ੍ਰੋਫਾਈਲ, ਕੈਂਪੇਨ ਜਾਂ ਅਰਜ਼ੀ ਜਾਣਕਾਰੀ ਠੀਕ ਕਰੋ।",
            "ਯੋਗ ਅਰਜ਼ੀ ਵਾਪਸ ਲਵੋ ਤਾਂ ਜੋ ਉਹ ਬ੍ਰਾਂਡ ਲਈ ਸਰਗਰਮ ਨਾ ਰਹੇ।",
            "ਜਿੱਥੇ ਪ੍ਰੋਸੈਸਿੰਗ ਦਾ ਆਧਾਰ ਸਹਿਮਤੀ ਹੈ, ਭਵਿੱਖੀ ਪ੍ਰੋਸੈਸਿੰਗ ਲਈ ਸਹਿਮਤੀ ਵਾਪਸ ਲਵੋ; ਵਾਪਸੀ ਪਹਿਲਾਂ ਕਾਨੂੰਨੀ ਤੌਰ 'ਤੇ ਹੋਈ ਸਾਂਝ ਨੂੰ ਉਲਟ ਨਹੀਂ ਕਰਦੀ।",
            "ਆਪਣਾ ਅਕਾਊਂਟ ਅਤੇ ਜੁੜਿਆ ਮਾਰਕੀਟਪਲੇਸ ਡੇਟਾ ਹਟਾਓ।",
            "ਵੱਖਰੇ ਡਿਵਾਈਸ ਜਾਂ ਹੋਰ ਸਾਰੇ ਸਾਈਨ-ਇਨ ਸੈਸ਼ਨ ਹਟਾਓ।",
            "YaarLink ਸਪੋਰਟ ਨਾਲ ਪਰਾਈਵੇਸੀ ਸਵਾਲ ਜਾਂ ਸ਼ਿਕਾਇਤ ਉਠਾਓ।",
          ],
        },
        {
          heading: "2. ਸਾਈਨ ਇਨ ਹੋ ਕੇ ਖੁਦ ਕਰੋ",
          bullets: [
            "ਖਾਤਾ ਅਤੇ ਸੁਰੱਖਿਆ: ਈਮੇਲ ਤਸਦੀਕ/ਬਦਲੋ, ਫੋਨ ਜਾਂ ਪਾਸਵਰਡ ਬਦਲੋ, ਡਿਵਾਈਸ ਵੇਖੋ/ਹਟਾਓ, ਡੇਟਾ ਡਾਊਨਲੋਡ ਕਰੋ ਅਤੇ ਅਕਾਊਂਟ ਹਟਾਓ।",
            "ਕ੍ਰਿਏਟਰ ਡੈਸ਼ਬੋਰਡ: ਕ੍ਰਿਏਟਰ ਪ੍ਰੋਫਾਈਲ ਬਦਲੋ/ਹਟਾਓ ਅਤੇ ਯੋਗ ਅਰਜ਼ੀਆਂ ਬਦਲੋ/ਵਾਪਸ ਲਵੋ।",
            "ਬ੍ਰਾਂਡ ਡੈਸ਼ਬੋਰਡ: ਕੈਂਪੇਨ ਬਦਲੋ, ਰੋਕੋ, ਬੰਦ ਕਰੋ, ਫਿਰ ਪ੍ਰਕਾਸ਼ਿਤ ਕਰੋ ਜਾਂ ਹਟਾਓ ਅਤੇ ਅਰਜ਼ੀ ਫੈਸਲੇ ਸੰਭਾਲੋ।",
            "ਜਨਤਕ ਲਿਸਟਿੰਗ ਪੇਜ: ਨਕਲੀ ਪਛਾਣ, ਘੁਟਾਲਾ, ਸਪੈਮ ਜਾਂ ਗਲਤ ਜਾਣਕਾਰੀ ਮਾਡਰੇਸ਼ਨ ਸਮੀਖਿਆ ਲਈ ਰਿਪੋਰਟ ਕਰੋ।",
          ],
        },
        {
          heading: "3. ਸਾਡੇ ਤੋਂ ਮਦਦ ਮੰਗੋ",
          paragraphs: [
            "ਸੰਪਰਕ ਪੇਜ ਵਰਤੋ ਜਾਂ “ਪਰਾਈਵੇਸੀ ਬੇਨਤੀ — YaarLink” ਵਿਸ਼ੇ ਨਾਲ ਸਪੋਰਟ ਨੂੰ ਈਮੇਲ ਕਰੋ। ਦੱਸੋ ਕਿ ਤੁਸੀਂ ਪਹੁੰਚ, ਸੁਧਾਰ, ਹਟਾਉਣ, ਸਹਿਮਤੀ ਵਾਪਸੀ ਜਾਂ ਸ਼ਿਕਾਇਤ ਸਮੀਖਿਆ ਚਾਹੁੰਦੇ ਹੋ। ਰਿਕਾਰਡ ਲੱਭਣ ਲਈ ਅਕਾਊਂਟ ਈਮੇਲ ਅਤੇ ਕਾਫੀ ਸੰਦਰਭ—ਜਿਵੇਂ ਲਿਸਟਿੰਗ ਨਾਮ ਜਾਂ ਸੁਨੇਹੇ ਦੀ ਅਨੁਮਾਨਿਤ ਤਾਰੀਖ—ਲਿਖੋ।",
            "ਆਪਣਾ ਪਾਸਵਰਡ, ਰੀਸੈਟ ਲਿੰਕ, ਤਸਦੀਕ ਕੋਡ, ਕਾਰਡ ਨੰਬਰ, ਬੈਂਕ ਪਾਸਵਰਡ ਜਾਂ UPI PIN ਨਾ ਭੇਜੋ। ਅਕਾਊਂਟ ਤੱਕ ਪਹੁੰਚ ਨਾ ਹੋਵੇ ਤਾਂ ਜਿੱਥੇ ਸੰਭਵ ਹੋਵੇ ਪਹਿਲਾਂ ਪਾਸਵਰਡ ਰੀਸੈਟ ਵਰਤੋ।",
          ],
        },
        {
          heading: "4. ਜੇ ਤੁਹਾਡਾ ਅਕਾਊਂਟ ਨਹੀਂ ਹੈ",
          paragraphs: [
            "ਜਿਨ੍ਹਾਂ ਲੋਕਾਂ ਨੇ ਅਕਾਊਂਟ ਬਿਨਾਂ ਸੰਪਰਕ ਫਾਰਮ ਵਰਤਿਆ ਜਾਂ ਰਿਪੋਰਟ ਭੇਜੀ, ਉਹ ਵੀ ਪਹੁੰਚ ਜਾਂ ਹਟਾਉਣ ਮੰਗ ਸਕਦੇ ਹਨ। ਉਸ ਸੁਨੇਹੇ ਵਿੱਚ ਵਰਤਿਆ ਨਾਮ, ਈਮੇਲ ਜਾਂ ਫੋਨ ਅਤੇ ਅਨੁਮਾਨਿਤ ਤਾਰੀਖ ਲਿਖੋ ਤਾਂ ਜੋ ਅਸੀਂ ਉਸ ਨੂੰ ਲੱਭ ਸਕੀਏ। ਅਸੀਂ ਰਿਕਾਰਡ ਤੁਹਾਡਾ ਹੋਣ ਦਾ ਉਚਿਤ ਸਬੂਤ ਮੰਗ ਸਕਦੇ ਹਾਂ।",
          ],
        },
        {
          heading: "5. ਤਸਦੀਕ, ਸਮਾਂ ਅਤੇ ਸੀਮਾਵਾਂ",
          bullets: [
            "ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਖੋਲ੍ਹਣ ਜਾਂ ਹਟਾਉਣ ਤੋਂ ਪਹਿਲਾਂ ਅਸੀਂ ਅਕਾਊਂਟ ਈਮੇਲ ਜਾਂ ਸਾਈਨ-ਇਨ ਅਕਾਊਂਟ ਤੋਂ ਪਛਾਣ ਤਸਦੀਕ ਕਰ ਸਕਦੇ ਹਾਂ।",
            "ਅਸੀਂ ਬੇਨਤੀਆਂ ਨੂੰ ਛੇਤੀ ਸਵੀਕਾਰ ਕਰਨ ਅਤੇ ਜਿੱਥੇ ਸੰਭਵ ਹੋਵੇ 30 ਦਿਨਾਂ ਵਿੱਚ ਪੂਰਾ ਕਰਨ ਦਾ ਟੀਚਾ ਰੱਖਦੇ ਹਾਂ। ਜਟਿਲ ਬੇਨਤੀ ਜਾਂ ਕਾਨੂੰਨੀ ਜਾਂਚ ਵਿੱਚ ਦੇਰੀ ਹੋਵੇ ਤਾਂ ਅਸੀਂ ਕਾਰਨ ਦੱਸਾਂਗੇ।",
            "ਕੁਝ ਜਾਣਕਾਰੀ ਸੁਰੱਖਿਆ, ਧੋਖਾਧੜੀ ਰੋਕਥਾਮ, ਵਿਵਾਦ, ਟੈਕਸ/ਲੇਖਾਕਾਰੀ ਜਾਂ ਕਾਨੂੰਨੀ ਪਾਲਣਾ ਲਈ ਰੱਖਣੀ ਪੈ ਸਕਦੀ ਹੈ। ਬੇਨਤੀ ਪੂਰੀ ਤਰ੍ਹਾਂ ਨਾ ਮੰਨੀ ਜਾ ਸਕੇ ਤਾਂ ਇਜਾਜ਼ਤ ਅਨੁਸਾਰ ਕਾਰਨ ਦੱਸਾਂਗੇ।",
            "ਕਿਸੇ ਹੋਰ ਵਿਅਕਤੀ ਦੀ ਬੇਨਤੀ ਲਈ ਅਧਿਕਾਰ ਸਬੂਤ ਲੱਗ ਸਕਦਾ ਹੈ।",
            "YaarLink ਤੋਂ ਡੇਟਾ ਹਟਾਉਣਾ ਹੋਰ ਉਪਭੋਗਤਾ ਦੁਆਰਾ ਕਾਨੂੰਨੀ ਤੌਰ 'ਤੇ ਪ੍ਰਾਪਤ ਅਤੇ YaarLink ਬਾਹਰ ਸੇਵ ਕਾਪੀਆਂ ਨਹੀਂ ਹਟਾ ਸਕਦਾ, ਜਿਵੇਂ ਵਾਪਸੀ ਤੋਂ ਪਹਿਲਾਂ ਬ੍ਰਾਂਡ ਦੁਆਰਾ ਸੇਵ ਅਰਜ਼ੀ ਸੰਪਰਕ।",
          ],
        },
        {
          heading: "6. ਸ਼ਿਕਾਇਤਾਂ",
          paragraphs: [
            "ਕਿਰਪਾ ਕਰਕੇ ਪਹਿਲਾਂ YaarLink ਸਪੋਰਟ ਨਾਲ ਸੰਪਰਕ ਕਰੋ ਤਾਂ ਜੋ ਅਸੀਂ ਜਾਂਚ ਕਰਕੇ ਚਿੰਤਾ ਸੁਲਝਾਉਣ ਦੀ ਕੋਸ਼ਿਸ਼ ਕਰ ਸਕੀਏ। ਇਸ ਪ੍ਰਕਿਰਿਆ ਦੀ ਵਰਤੋਂ ਲਾਗੂ ਕਾਨੂੰਨ ਅਧੀਨ ਤੁਹਾਡੇ ਹੱਕ ਜਾਂ ਉਪਾਅ ਨਹੀਂ ਹਟਾਉਂਦੀ।",
          ],
        },
      ],
    },
    "account-deletion": {
      title: "ਆਪਣਾ ਅਕਾਊਂਟ ਹਟਾਓ",
      intro: "ਇਹ ਜਨਤਕ ਗਾਈਡ ਦੱਸਦੀ ਹੈ ਕਿ YaarLink ਅਕਾਊਂਟ ਸਥਾਈ ਤੌਰ 'ਤੇ ਕਿਵੇਂ ਹਟਾਉਣਾ ਹੈ, ਕੀ ਹਟਦਾ ਹੈ, ਅਤੇ ਤੁਸੀਂ ਸਾਈਨ ਇਨ ਨਾ ਕਰ ਸਕੋ ਤਾਂ ਕੀ ਕਰਨਾ ਹੈ।",
      actions: [
        { label: "ਅਕਾਊਂਟ ਹਟਾਉਣ 'ਤੇ ਜਾਓ", href: "/account#delete-account", primary: true },
        { label: "ਪਹਿਲਾਂ ਆਪਣਾ ਡੇਟਾ ਡਾਊਨਲੋਡ ਕਰੋ", href: "/account#export-data" },
        { label: "ਪਾਸਵਰਡ ਰੀਸੈਟ ਕਰੋ", href: "/forgot-password" },
      ],
      sections: [
        {
          heading: "1. ਹਟਾਉਣ ਤੋਂ ਪਹਿਲਾਂ",
          bullets: [
            "ਜੇ ਬਾਅਦ ਵਿੱਚ ਪ੍ਰੋਫਾਈਲ, ਕੈਂਪੇਨ, ਅਰਜ਼ੀਆਂ ਜਾਂ ਸੂਚਨਾਵਾਂ ਚਾਹੀਦੀਆਂ ਹੋਣ ਤਾਂ ਖਾਤਾ ਅਤੇ ਸੁਰੱਖਿਆ ਤੋਂ ਡੇਟਾ ਡਾਊਨਲੋਡ ਕਰੋ।",
            "ਜੇ ਹੋਰ ਉਪਭੋਗਤਾ ਉਹਨਾਂ 'ਤੇ ਨਿਰਭਰ ਹੈ ਤਾਂ ਪਹਿਲਾਂ ਸਰਗਰਮ ਕੈਂਪੇਨ ਅਤੇ ਅਰਜ਼ੀਆਂ ਪੂਰੀਆਂ, ਰੋਕੋ, ਬੰਦ ਜਾਂ ਵਾਪਸ ਲਵੋ।",
            "ਹਟਾਉਣਾ ਤੁਰੰਤ ਅਤੇ ਸਥਾਈ ਹੈ। ਬਾਅਦ ਵਿੱਚ ਫਿਰ ਸਾਈਨ ਅੱਪ ਕਰ ਸਕਦੇ ਹੋ, ਪਰ ਹਟਾਇਆ ਅਕਾਊਂਟ ਅਤੇ ਮਾਰਕੀਟਪਲੇਸ ਇਤਿਹਾਸ ਵਾਪਸ ਨਹੀਂ ਮਿਲੇਗਾ।",
          ],
        },
        {
          heading: "2. ਹਟਾਉਣ ਦੇ ਚਰਨ",
          bullets: [
            "ਜਿਸ YaarLink ਅਕਾਊਂਟ ਨੂੰ ਹਟਾਉਣਾ ਹੈ ਉਸ ਵਿੱਚ ਸਾਈਨ ਇਨ ਕਰੋ।",
            "ਡੈਸ਼ਬੋਰਡ ਜਾਂ ਸਾਈਨ-ਇਨ ਮੈਨੂ ਤੋਂ ਖਾਤਾ ਅਤੇ ਸੁਰੱਖਿਆ ਖੋਲ੍ਹੋ।",
            "ਜੇ ਚਾਹੀਦਾ ਹੋਵੇ ਤਾਂ “ਆਪਣਾ ਡੇਟਾ ਡਾਊਨਲੋਡ ਕਰੋ” ਭਾਗ ਤੋਂ ਡੇਟਾ ਡਾਊਨਲੋਡ ਕਰੋ।",
            "“ਖਾਤਾ ਹਟਾਓ” ਭਾਗ 'ਤੇ ਜਾਓ।",
            "ਮੌਜੂਦਾ ਪਾਸਵਰਡ ਅਤੇ ਠੀਕ ਅਕਾਊਂਟ ਈਮੇਲ ਲਿਖੋ।",
            "ਸਥਾਈ ਹਟਾਉਣ ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ। ਤੁਸੀਂ ਸਾਈਨ ਆਊਟ ਹੋ ਜਾਵੋਗੇ ਅਤੇ ਅਕਾਊਂਟ ਹਟ ਜਾਵੇਗਾ।",
          ],
        },
        {
          heading: "3. ਕੀ ਹਟਦਾ ਹੈ",
          bullets: [
            "ਤੁਹਾਡਾ ਉਪਭੋਗਤਾ ਅਕਾਊਂਟ ਅਤੇ ਸਾਈਨ-ਇਨ ਸੈਸ਼ਨ।",
            "ਤੁਹਾਡਾ ਬ੍ਰਾਂਡ ਰਿਕਾਰਡ ਜਾਂ ਕ੍ਰਿਏਟਰ ਪ੍ਰੋਫਾਈਲ।",
            "ਤੁਹਾਡੇ ਕੈਂਪੇਨ ਅਤੇ ਉਹਨਾਂ ਨਾਲ ਜੁੜੀਆਂ ਅਰਜ਼ੀਆਂ।",
            "ਤੁਹਾਡੀਆਂ ਭੇਜੀਆਂ ਅਰਜ਼ੀਆਂ, ਸੂਚਨਾਵਾਂ ਅਤੇ ਅਕਾਊਂਟ-ਐਕਸ਼ਨ ਟੋਕਨ।",
            "ਤੁਹਾਡੀ ਕ੍ਰਿਏਟਰ ਪ੍ਰੋਫਾਈਲ ਅਤੇ ਕੈਂਪੇਨ ਦੀ ਜਨਤਕ ਪਹੁੰਚ।",
          ],
        },
        {
          heading: "4. ਕੀ ਗੁਮਨਾਮ ਜਾਂ ਰੱਖਿਆ ਜਾ ਸਕਦਾ ਹੈ",
          bullets: [
            "ਤੁਹਾਡੇ ਦੁਆਰਾ ਭੇਜੀ ਲਿਸਟਿੰਗ ਰਿਪੋਰਟ ਵਿੱਚ ਕਾਰਨ ਅਤੇ ਮਾਡਰੇਸ਼ਨ ਵੇਰਵਾ ਰਹਿ ਸਕਦਾ ਹੈ, ਪਰ ਅਕਾਊਂਟ ਹਵਾਲਾ, ਰਿਪੋਰਟਰ ਨਾਮ ਅਤੇ ਸੰਪਰਕ ਹਟ ਜਾਂਦਾ ਹੈ।",
            "ਵੱਖਰੇ ਸੰਪਰਕ-ਫਾਰਮ ਸੁਨੇਹੇ ਆਪਣੇ ਆਪ ਅਕਾਊਂਟ ਨਾਲ ਜੁੜੇ ਨਹੀਂ ਹੁੰਦੇ; ਕਿਸੇ ਖਾਸ ਸੁਨੇਹੇ ਦੀ ਸਮੀਖਿਆ/ਹਟਾਉਣਾ ਚਾਹੀਦਾ ਹੋਵੇ ਤਾਂ ਤੁਹਾਡੇ ਡੇਟਾ ਹੱਕ ਤੋਂ ਮੰਗੋ।",
            "ਜ਼ਰੂਰੀ ਅਤੇ ਕਾਨੂੰਨ ਅਨੁਸਾਰ ਸੀਮਤ ਸੁਰੱਖਿਆ, ਧੋਖਾਧੜੀ ਰੋਕਥਾਮ, ਲੇਖਾਕਾਰੀ, ਵਿਵਾਦ ਜਾਂ ਕਾਨੂੰਨੀ ਰਿਕਾਰਡ ਰੱਖੇ ਜਾ ਸਕਦੇ ਹਨ।",
            "ਸੇਵਾ-ਪ੍ਰਦਾਤਾ ਲੌਗ ਜਾਂ ਬੈਕਅੱਪ ਵਿੱਚ ਨਿਯਮਤ ਓਵਰਰਾਈਟ/ਹਟਾਉਣ ਤੋਂ ਪਹਿਲਾਂ ਸੀਮਤ ਮਿਆਦ ਕਾਪੀਆਂ ਰਹਿ ਸਕਦੀਆਂ ਹਨ।",
            "ਹੋਰ ਉਪਭੋਗਤਾ ਦੁਆਰਾ ਪਹਿਲਾਂ ਪ੍ਰਾਪਤ ਤੇ YaarLink ਬਾਹਰ ਕਾਪੀ ਜਾਣਕਾਰੀ—ਜਿਵੇਂ ਅਰਜ਼ੀ ਸੰਪਰਕ ਜਾਂ ਸਿੱਧੀ WhatsApp ਗੱਲਬਾਤ—YaarLink ਅਕਾਊਂਟ ਹਟਾਉਣ ਨਾਲ ਨਹੀਂ ਹਟ ਸਕਦੀ।",
          ],
        },
        {
          heading: "5. ਜੇ ਤੁਸੀਂ ਸਾਈਨ ਇਨ ਨਾ ਕਰ ਸਕੋ",
          bullets: [
            "ਅਕਾਊਂਟ ਈਮੇਲ ਰਾਹੀਂ ਪਹੁੰਚ ਰੀਸੈਟ ਕਰਨ ਲਈ ਪਾਸਵਰਡ ਭੁੱਲ ਗਏ ਵਰਤੋ, ਫਿਰ ਖੁਦ ਅਕਾਊਂਟ ਹਟਾਓ।",
            "ਅਕਾਊਂਟ ਈਮੇਲ ਤੁਹਾਡੇ ਨਿਯੰਤਰਣ ਵਿੱਚ ਨਾ ਹੋਵੇ ਤਾਂ ਸਪੋਰਟ ਨਾਲ ਸੰਪਰਕ ਕਰੋ। ਮਦਦ ਤੋਂ ਪਹਿਲਾਂ ਸਾਨੂੰ ਪਛਾਣ ਤਸਦੀਕ ਕਰਨੀ ਹੋਵੇਗੀ; ਸਪੋਰਟ ਜਾਂ ਹੋਰ ਉਪਭੋਗਤਾ ਨਾਲ ਪਾਸਵਰਡ, ਰੀਸੈਟ ਲਿੰਕ ਜਾਂ ਤਸਦੀਕ ਕੋਡ ਕਦੇ ਸਾਂਝਾ ਨਾ ਕਰੋ।",
            "ਜੇ ਸਿਰਫ਼ ਵਿਰਾਮ ਚਾਹੀਦਾ ਹੈ ਤਾਂ ਪੂਰਾ ਅਕਾਊਂਟ ਹਟਾਉਣ ਦੀ ਬਜਾਏ ਕੈਂਪੇਨ ਰੋਕਣਾ, ਅਰਜ਼ੀਆਂ ਵਾਪਸ ਲੈਣਾ, ਇੱਕ ਲਿਸਟਿੰਗ ਹਟਾਉਣਾ, ਫੋਨ/ਈਮੇਲ ਬਦਲਣਾ ਜਾਂ ਡਿਵਾਈਸ ਹਟਾਉਣਾ ਵਿਚਾਰੋ।",
          ],
        },
      ],
    },
  },
};

const NAV_ITEMS: Array<{ page: LegalPageKind; href: string; labelKey: string }> = [
  { page: "privacy", href: "/privacy", labelKey: "legal.privacy" },
  { page: "terms", href: "/terms", labelKey: "legal.terms" },
  { page: "refunds", href: "/refund-policy", labelKey: "legal.refunds" },
  { page: "data-rights", href: "/data-rights", labelKey: "legal.dataRights" },
  { page: "account-deletion", href: "/account-deletion", labelKey: "legal.accountDeletion" },
];

function ActionLink({ action }: { action: LegalAction }) {
  const className = action.primary
    ? "rounded-2xl bg-[#e4572e] px-5 py-3 text-center text-[14.5px] font-extrabold text-white hover:bg-[#c7431f]"
    : "rounded-2xl border border-[#1c1917] bg-white px-5 py-3 text-center text-[14.5px] font-extrabold text-[#1c1917] hover:bg-[#1c1917] hover:text-white";

  if (action.href.startsWith("mailto:") || action.href.startsWith("https://")) {
    return (
      <a href={action.href} className={className}>
        {action.label}
      </a>
    );
  }

  return (
    <Link href={action.href} className={className}>
      {action.label}
    </Link>
  );
}

export default function LegalPage({ page }: { page: LegalPageKind }) {
  const { lang, t } = useLang();
  const common = COMMON[lang];
  const doc = DOCS[lang][page];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <nav aria-label={t("legal.navLabel")} className="flex flex-wrap gap-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.page}
            href={item.href}
            aria-current={item.page === page ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-[13.5px] font-extrabold ${
              item.page === page
                ? "border-[#1c1917] bg-[#1c1917] text-white"
                : "border-[#e9ddc3] bg-white text-[#1c1917] hover:border-[#1c1917]"
            }`}
          >
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>

      <header className="mt-6 rounded-[28px] border border-[#e9ddc3] bg-white p-7 card-shadow sm:p-10">
        <p className="text-[12.5px] font-extrabold uppercase tracking-[0.18em] text-[#e4572e]">{common.eyebrow}</p>
        <h1 className="font-display mt-3 text-[38px] font-black leading-tight sm:text-[52px]">{doc.title}</h1>
        <p className="mt-3 max-w-3xl text-[16.5px] leading-relaxed text-[#57534e]">{doc.intro}</p>
        <p className="mt-4 text-[13px] font-bold uppercase tracking-wide text-[#a8a29e]">{common.updated}</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {doc.actions.map((action) => (
            <ActionLink key={`${action.href}-${action.label}`} action={action} />
          ))}
        </div>
      </header>

      <section className="mt-6 rounded-[24px] border border-[#e9ddc3] bg-[#fff4de] p-6" aria-labelledby="legal-contents-heading">
        <h2 id="legal-contents-heading" className="text-[15px] font-black uppercase tracking-wide text-[#78716c]">
          {common.contents}
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2.5">
          {doc.sections.map((section, index) => (
            <a key={section.heading} href={`#legal-section-${index + 1}`} className="text-[14px] font-bold text-[#1c1917] underline-offset-4 hover:underline">
              {section.heading}
            </a>
          ))}
        </div>
      </section>

      <article className="mt-6 grid gap-5">
        {doc.sections.map((section, index) => (
          <section
            key={section.heading}
            id={`legal-section-${index + 1}`}
            className="scroll-mt-24 rounded-[24px] border border-[#e9ddc3] bg-white p-6 card-shadow sm:p-8"
          >
            <h2 className="font-display text-[24px] font-black leading-snug">{section.heading}</h2>
            <div className="mt-4 grid gap-3.5 text-[15px] leading-relaxed text-[#44403c]">
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets && (
                <ul className="grid gap-2.5">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3">
                      <span aria-hidden="true" className="mt-[9px] h-2 w-2 shrink-0 rounded-full bg-[#e4572e]" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </article>

      <section className="mt-6 rounded-[24px] bg-[#17452e] p-6 text-white sm:p-8" aria-labelledby="legal-contact-heading">
        <h2 id="legal-contact-heading" className="font-display text-[26px] font-black">
          {common.contactTitle}
        </h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-white/85">{common.contactBody}</p>
        <p className="mt-4 break-all text-[15px] font-extrabold">
          {SITE.email} <span className="mx-1 text-white/50">·</span> {SITE.phoneDisplay} <span className="mx-1 text-white/50">·</span> {SITE.city}
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <a href={mailtoLink(common.emailSubject)} className="rounded-2xl bg-white px-5 py-3 text-[14.5px] font-extrabold text-[#17452e] hover:bg-[#fff4de]">
            {common.emailButton}
          </a>
          <Link href="/contact" className="rounded-2xl border border-white/40 px-5 py-3 text-[14.5px] font-extrabold text-white hover:bg-white/10">
            {common.contactButton}
          </Link>
        </div>
      </section>

      <p className="mt-5 text-center text-[13px] leading-relaxed text-[#78716c]">{common.translationNote}</p>
    </div>
  );
}
