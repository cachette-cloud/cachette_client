import { source } from "motion/react-client";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${process.env.BACKEND_URL}/api/:path*`},
    ];
  },
};

export default nextConfig;
