// 安卓 App（Capacitor）：把 dist/ 里的游戏装进原生外壳。APK 由 GitHub Actions 构建（见 .github/workflows/deploy.yml）。
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.picwordquest',
  appName: 'PicWord Quest',
  webDir: 'dist',
  android: {
    // 允许页面里的 http 图片（少数图库原图）；游戏本身走 https
    allowMixedContent: true,
  },
};

export default config;
