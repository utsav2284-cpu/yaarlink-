export const CATEGORIES = [
  "Food & Cafe",
  "Fashion & Lifestyle",
  "Memes & Comedy",
  "Education & Motivation",
  "Tech & Apps",
  "Travel & Local",
  "Fitness & Health",
  "Beauty & Skincare",
  "Finance & Business",
  "Music & Entertainment",
  "Punjabi Culture",
  "Other",
];

export const LANGUAGES = ["English", "Hindi", "Punjabi", "Hinglish", "Bengali", "Marathi", "Tamil", "Telugu"];

export const CONTENT_TYPES = ["Story", "Reel", "Post", "UGC Video", "YouTube Shorts", "YouTube Video"];

export const PROMOTION_TYPES = [
  { id: "Local Business", emoji: "🏪", title: "Local Business", desc: "Shops, cafes, salons, gyms, coaching. Get footfall from your own city.", example: "e.g. Cafe in Model Town, Ludhiana" },
  { id: "App", emoji: "📱", title: "App", desc: "Get installs from the right audience, in the right language.", example: "e.g. New UPI / gaming / learning app" },
  { id: "Website", emoji: "🌐", title: "Website", desc: "Drive traffic and enquiries to your site or landing page.", example: "e.g. D2C store, booking site" },
  { id: "Product", emoji: "🛍️", title: "Product", desc: "Unboxings, honest reviews and UGC that people trust.", example: "e.g. Snacks, skincare, clothing" },
  { id: "Creator / UGC", emoji: "🎥", title: "Creator / UGC", desc: "Raw, real videos made by creators — for ads or your own page.", example: "e.g. 30-sec Hindi review video" },
  { id: "Event", emoji: "🎟️", title: "Event", desc: "Fill seats for gigs, expos, college fests and store launches.", example: "e.g. Food fest in Chandigarh" },
];

export const BUDGETS = ["Under ₹2,000", "₹2,000 – ₹5,000", "₹5,000 – ₹15,000", "₹15,000 – ₹50,000", "₹50,000+"];

export function parseBudget(b: string): number {
  if (b.includes("2,000") && b.includes("Under")) return 2000;
  if (b.includes("5,000") && b.includes("2,000")) return 5000;
  if (b.includes("15,000")) return 15000;
  if (b.includes("50,000") && b.includes("15")) return 50000;
  return 60000;
}

export function formatINR(n: number) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}
