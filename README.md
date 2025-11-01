# 时间宝盒（TimeBox）

时间宝盒是一款基于 Vue 3 + Vite + Pinia 的响应式 PWA，帮助你以 Time Boxing 方式沉浸专注，配合「10 分钟法则」「不适处方」「输入/输出成对」以及「学习禁区」规则，持续学得进去、做得出来。

## 功能速览

- **专注首屏**：圆形剩余时间计、环形进度、输入/输出切换、25/45/60/90/自定义时长、到点自动结束、10 分钟缓冲、到点通知/震动。
- **计划视图**：日/周切换，30 分钟网格拖拽建盒，自动配对输出盒，学习禁区白名单拦截并写入稍后清单。
- **记录视图**：本周有效分钟柱状图、输入:输出比、10 分钟法则次数、不适处方日志、会话三问回顾与产出链接。
- **不适应对面板**：物理/认知/情绪三类策略，启用排序、执行即记录，数据同步到记录视图。
- **设置**：学习主题白名单、每日目标、策略启停排序、外观主题（浅色/深色/系统跟随）。
- **PWA 能力**：离线可用、添加到主屏、Service Worker 缓存核心资源与最近 30 天记录，支持 Web Notification、震动与提示音。

## 安装与构建

```bash
# 安装依赖
npm install

# 本地开发（默认 http://localhost:5173 ）
npm run dev

# 生产构建
npm run build

# 预览构建产物
npm run preview
```

构建后资源位于 `dist/`，`npm run build` 同时触发 TypeScript 类型检查与 PWA Service Worker 生成。

## 技术栈

- Vue 3 `<script setup>` + TypeScript
- Pinia 状态管理（时间盒、会话、策略、统计）
- Vue Router、@vueuse/core
- Vite PWA 插件（`vite-plugin-pwa`）与自定义 Service Worker
- 本地存储抽象（LocalStorage，可平滑切换 IndexedDB）

## 目录结构

- `src/components/focus`：专注页组件（计时器、时长选择、复盘）
- `src/components/plan`：计划视图与创建对话框
- `src/stores`：Pinia 仓库（timeboxes、sessions、settings、stats、discomfort、ui）
- `src/services`：存储、通知、Service Worker 辅助
- `public/manifest.webmanifest` 与 `public/icons`：PWA 资源

## 数据持久化

所有关键数据（时间盒、会话、设置、统计、稍后清单）默认存储于 LocalStorage，并通过 Service Worker 消息同步至 Cache Storage（保留近 30 天）。如需升级，可通过 `setStorageAdapter` 切换到 IndexedDB 或远端存储。

## 云同步（Cloudflare D1）

为了在多设备之间同步进度，需要在 Cloudflare Pages 上绑定 D1 数据库，并启用 Functions：

1. **创建并绑定 D1**  
   - 运行 `wrangler d1 create timebox-sync-db` 创建数据库，并记下返回的 `database_id`。  
   - 更新根目录 `wrangler.toml` 中 `[[d1_databases]]` 的 `database_id`，并确保 Pages 项目已绑定同名数据库（环境名称需与 binding `DB` 保持一致）。
2. **执行数据库迁移**  
   - 本地执行 `wrangler d1 migrations apply timebox-sync-db`，或在 Cloudflare 控制台中执行 `db/migrations/0001_init.sql`，初始化 `sync_accounts` 与 `storage_records` 表。
3. **部署 Functions**  
   - Pages 会自动使用 `functions/` 下的处理器。若本地调试，可使用 `wrangler pages dev dist -- d1=DB` 启动并带上数据库绑定。
4. **配置前端访问**  
   - 若前端和 API 不同源，可通过 `VITE_SYNC_API_BASE` 指向 Worker/Pages Functions 的地址；同源部署时可忽略。
5. **启用同步**  
   - 访问应用的“设置”页，在“云同步”卡片中创建新的同步密钥或粘贴已有密钥，即可在各设备间共享时间盒、会话与设置。

## 无障碍与响应式

- 支持键盘焦点、ARIA 标签、AA 对比度
- 尊重 `prefers-reduced-motion`，自动降级动画
- 响应式断点：移动（≤480）、平板（481–1024）、桌面（≥1025），桌面端附带今日计划边栏

欢迎继续扩展 AI 提示、策略自动化或云同步等能力，让时间宝盒更贴近你的学习与产出流程。
