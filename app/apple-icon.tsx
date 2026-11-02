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
          position: "relative",
          background: "#1c1917",
          color: "#ffc53d",
          fontFamily: "Georgia, serif",
          fontSize: 118,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        <span>y</span>
        <span
          style={{
            position: "absolute",
            top: 30,
            right: 30,
            width: 25,
            height: 25,
            borderRadius: 999,
            background: "#e4572e",
          }}
        />
      </div>
    ),
    size,
  );
}
