import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        fs: path.resolve(__dirname, "src/components/ui/browser-fs-shim.ts"),
      };
    }
    return config;
  },
};

export default nextConfig;
