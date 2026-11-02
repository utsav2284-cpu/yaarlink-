import { ImageResponse } from "next/og";
import { SITE } from "@/config/site";

export const alt = "YaarLink — simple marketing for brands, creators, and local pages";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#fffbf1",
          color: "#1c1917",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 92,
              height: 92,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 24,
              background: "#1c1917",
            }}
          >
            {/* Same vector mark as app/icon.svg — paths, not font-dependent text. */}
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <path
                d="M16 14 L31 35 L46 14 M31 35 L22.5 50.5 Q18.5 57.5 10.5 55.5"
                stroke="#ffc53d"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="47" cy="19" r="5" fill="#e4572e" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 900, letterSpacing: -2 }}>
            <span>yaar</span>
            <span style={{ color: "#c7431f" }}>link</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              maxWidth: 920,
              fontFamily: "Georgia, serif",
              fontSize: 76,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: -2,
            }}
          >
            Simple marketing for everyone.
          </div>
          <div style={{ display: "flex", fontSize: 30, lineHeight: 1.35, color: "#57534e" }}>
            Brands, local businesses, creators, meme pages, and communities — in English, Hindi, and Punjabi.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "2px solid #e9ddc3",
            paddingTop: 28,
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          <span>{SITE.host}</span>
          <span style={{ color: "#c7431f" }}>{SITE.domain}</span>
        </div>
      </div>
    ),
    size,
  );
}
