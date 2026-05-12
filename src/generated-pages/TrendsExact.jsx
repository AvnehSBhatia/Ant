import React from "react";
import { Clock3 } from "lucide-react";

export default function TrendsExact() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: "80px 24px",
        textAlign: "center",
      }}
    >
      <Clock3 size={56} strokeWidth={1.5} aria-hidden style={{ opacity: 0.55 }} />
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(40px, 7vw, 80px)",
          fontWeight: 800,
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        COMING SOON
      </h1>
      <p
        style={{
          margin: 0,
          maxWidth: 520,
          fontSize: 15,
          lineHeight: 1.5,
          opacity: 0.7,
        }}
      >
        Trend analysis is under construction. Check back soon.
      </p>
    </div>
  );
}
