import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1c1917",
        }}
      >
        {/* Same vector mark as app/icon.svg — paths, not font-dependent text. */}
        <svg width="180" height="180" viewBox="0 0 64 64" fill="none">
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
    ),
    size,
  );
}
