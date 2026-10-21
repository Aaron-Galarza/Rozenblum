import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The shared workspace package ships TypeScript source; Next compiles it.
  transpilePackages: ["@rozenblum/shared"],
  experimental: {
    // Keep visual fidelity to the Figma export: no automatic font optimisation.
    optimizePackageImports: [],
  },
};

export default nextConfig;
