import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: "#18181b",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "10px",
      }}
    >
      <div
        style={{
          color: "#ffffff",
          fontSize: 20,
          fontWeight: 900,
          display: "flex",
          lineHeight: 1,
        }}
      >
        K
      </div>
    </div>,
    {
      ...size,
    },
  );
}
