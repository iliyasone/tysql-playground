import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` is reached as both localhost and 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1"],
  // In dev, /api/* is served by the Python dev server (`python api/check.py`).
  // In production Vercel routes /api/check to the Python function before Next.
  async rewrites() {
    // Filename URLs like /5_join.py serve the single-page app (the URL stays in
    // the bar; the client reads the pathname and loads that bundled example).
    const examplePaths = [
      { source: "/:name(\\d+_[^/]+\\.py)", destination: "/" },
    ];
    if (process.env.NODE_ENV !== "development") return examplePaths;
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:5328/api/:path*",
      },
      ...examplePaths,
    ];
  },
};

export default nextConfig;
