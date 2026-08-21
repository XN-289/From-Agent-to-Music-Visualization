import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本地开发经常用 127.0.0.1 打开；Next 16 默认只允许 localhost 访问 dev chunks，
  // 不加入白名单会导致页面 JS 被跨域拦截，按钮事件全部失效。
  allowedDevOrigins: ['127.0.0.1'],
  // better-sqlite3 是原生模块；pi 系列含 Turbopack 无法打包的动态 require，
  // 统一走 serverExternalPackages（Node 运行时原生加载）
  serverExternalPackages: [
    'better-sqlite3',
    '@resvg/resvg-js',
    '@earendil-works/pi-agent-core',
    '@earendil-works/pi-coding-agent',
    '@earendil-works/pi-ai',
  ],
};

export default nextConfig;
