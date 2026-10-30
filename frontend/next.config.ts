import type { NextConfig } from "next";

const isExport = process.env.NEXT_EXPORT === "true";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: isExport ? "export" : undefined,
  trailingSlash: isExport ? true : false,
  images: {
    unoptimized: true,
  },
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  ...(isExport
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${process.env.BACKEND_URL || "http://localhost:8000"}/api/:path*`,
            },
          ];
        },
      }),
};

export default nextConfig;
