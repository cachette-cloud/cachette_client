import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },

  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*`},
      { source: "/s/:slug", destination: `${backendUrl}/s/:slug`},
    ];
  },
};

export default nextConfig;
