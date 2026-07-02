import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` is reached as both localhost and 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1"],
  // In dev, /api/* is served by the Python dev server (`python api/check.py`).
  // In production Vercel routes /api/check to the Python function before Next.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:5328/api/:path*",
      },
    ];
  },
};

export default nextConfig;
