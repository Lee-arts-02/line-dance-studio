import type { NextConfig } from "next";

/**
 * GitHub Pages (project site): deploy the `out/` folder to the `line-dance-studio` repo.
 * `next dev` runs with NODE_ENV=development (no base path). `next build` uses production
 * paths so assets resolve under /line-dance-studio/.
 */
const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  basePath: isProduction ? "/line-dance-studio" : "",
  assetPrefix: isProduction ? "/line-dance-studio/" : "",
};

export default nextConfig;
