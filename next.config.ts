import type { NextConfig } from "next";

// 这里的仓库名必须和你 GitHub 上的名字完全一致
const repo = "line-dance-studio";
const basePath = `/${repo}`;

const nextConfig: NextConfig = {
  output: "export", // 必须：生成静态网页

  // 解决 404 和资源加载错误的关键
  basePath,
  assetPrefix: `${basePath}/`,

  /** 供 `public/` 下静态资源在客户端拼路径（Link 会自动加 basePath，手写 URL 不会） */
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  
  images: {
    unoptimized: true, // 必须：GitHub Pages 不支持 Next.js 默认图片优化
  },
  
  // 保留你之前的 TensorFlow 配置
  transpilePackages: [
    "@tensorflow/tfjs-core",
    "@tensorflow/tfjs-backend-webgl",
    "@tensorflow/models/pose-detection",
  ],
};

export default nextConfig;