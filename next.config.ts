import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@tensorflow/tfjs-core",
    "@tensorflow/tfjs-backend-webgl",
    "@tensorflow-models/pose-detection",
  ],
};

export default nextConfig;
