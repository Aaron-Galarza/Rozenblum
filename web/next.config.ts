import type { NextConfig } from "next";

const tunnelHost = (() => {
  if (process.env.NODE_ENV !== "development" || !process.env.NEXT_PUBLIC_API_URL) return null;
  try {
    const url = new URL(process.env.NEXT_PUBLIC_API_URL);
    return url.hostname.endsWith(".trycloudflare.com") ? url.hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  agentRules: false,
  reactStrictMode: true,
  allowedDevOrigins: tunnelHost ? [tunnelHost] : [],
  // The shared workspace package ships TypeScript source; Next compiles it.
  transpilePackages: ["@rozenblum/shared"],
  experimental: {
    // Keep visual fidelity to the Figma export: no automatic font optimisation.
    optimizePackageImports: [],
  },
};

export default nextConfig;
