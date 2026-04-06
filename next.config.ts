import type { NextConfig } from "next";

// 这里的仓库名必须和你 GitHub 上的名字完全一致
const repo = 'line-dance-studio';

const nextConfig: NextConfig = {
  output: 'export', // 必须：生成静态网页
  
  // 解决 404 和资源加载错误的关键
  basePath: `/${repo}`, 
  
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