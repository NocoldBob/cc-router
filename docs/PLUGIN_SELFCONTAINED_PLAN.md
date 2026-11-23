# VS Code 插件自包含实施计划（一期）

> 状态：已评审（2026-11-24 用户拍板），进入实施。撰写日期 2026-11-24，基于桌面
> 0.5.0 / Companion 1.2.0。
>
> 目标：VS Code 用户只装插件即可完成全部路由管理，桌面端从"必装组件"降级为
> "可选的第二个 UI"。桌面端作为独立产品**继续维护**，有自己的版本节奏，
> 只是不再是插件运行的前提。本计划只覆盖一期。

## 1. 背景与问题

当前架构中插件的运行时（helper wrapper 注入、工作区选择、探测）**不依赖桌面端**，
但管理面依赖：

- Provider 编辑界面、API Key 写入凭据库、共享目录（`providers.json`）的首次生成
  都由桌面端完成。
- 由此产生版本配对负担（VSIX 内嵌桌面安装器）、安装/修复流程、以及
  "Shared Provider configuration is not initialized" 这一类跨进程同步故障。

关键事实：所有触碰凭据与进程环境的敏感逻辑本就在 `cc-router-helper` 及其链接的
Rust 库中；桌面端前端（`src/App.tsx`）只是 Tauri webview，经 `src/nativeRouter.ts`
单一边界调用。因此纯插件化是"换壳 + 补齐 helper CLI"，不是重写。

## 2. 目标与非目标

### 目标

- 插件内完成：Provider 增删改、预设切换、API Key 存取、工作区选择、探测、
  新会话启动、隔离终端、Windows 持久路由（应用/清除/回滚）、诊断导出。
- 插件自己维护 Provider 目录（globalState 为主存储，helper 目录为派生镜像），
  消除"共享目录未初始化"故障类。
- VSIX 不再内嵌桌面安装器（Windows 包约从 4.5MB 降到 ~2.6MB，
  Linux 包约从 85MB 降到 ~6MB）。
- 信任模型不变：Key 只经 stdin 进 helper、只存 OS 凭据库；
  前端（包括 webview）只见"是否已配置"布尔值。

### 非目标（一期不做）

- 不停维护桌面端；桌面端作为独立产品继续演进（同一目录格式，双 UI 共存）。
- **不做会话面板**（已决策：插件侧不实现；该功能为桌面端独有并保留在桌面端）。
- 不改变进程级注入 / 持久路由的既有安全语义。
- 不支持 WSL / SSH / Dev Container（维持现状）。

## 3. 目标架构

```text
VS Code 扩展
  ├─ 管理面板（webview，复用 src/App.tsx）
  │     └─ postMessage 桥 ──> 扩展后端（providerStore / helperClient）
  ├─ 扩展后端
  │     ├─ globalState：Provider 目录主存储（无密钥）
  │     ├─ helper sync-catalog（stdin JSON）──> helper 校验后写 providers.json
  │     └─ helper store-credential（stdin token）──> OS 凭据库
  └─ claudeProcessWrapper = cc-router-helper
        └─ 启动 Claude Code 时：读 providers.json + OS 凭据库 → 注入子进程环境
```

- helper 在 wrapper 路径上的读取来源不变，因此 Claude Code 扩展拉起会话时
  不需要我们的扩展在场。
- 目录文件路径与格式不变（`local.ccrouter.desktop/providers.json`），
  桌面端可继续读写同一文件（后写覆盖，见 §8 共存策略）。

## 4. 工作分解

### W1 Rust：helper 子命令补齐（基础，先行）

改动文件：

- `src-tauri/src/bin/cc-router-helper.rs`
  - 新增子命令：
    - `sync-catalog`：从 stdin 读取 ProviderConfig[] JSON，经
      `provider_store::save_provider_catalog` 校验并写入。校验失败原样返回错误文本。
    - `export-catalog`：打印完整无密钥目录 JSON（供插件首次迁移导入；
      目录设计上无密钥，已有测试保证）。
    - `store-credential <provider-id>`：从 stdin 读一行 token（trim 后非空），
      校验 provider 存在后写凭据库。**token 不出现在 argv、stdout、stderr、日志。**
    - `delete-credential <provider-id>`
    - `launch-terminal <provider-id> [working-dir]`：打开注入路由的隔离终端窗口。
    - `apply-route <provider-id>` / `clear-route` / `rollback-route`：
      Windows 持久路由三操作（先备份后写、失败回滚，语义与桌面端一致）。
    - `diagnostics`：打印脱敏诊断 JSON。
    - `version`：打印 helper 版本（插件做能力协商）。
  - 所有子命令输出不含凭据；错误信息复用现有脱敏文案。
- `src-tauri/src/backup.rs`：抽出基于路径的 `save_to/load_from/clear_at`，
  现有 AppHandle 版本改为薄封装（桌面端行为不变）。helper 用路径版本。
- `src-tauri/src/commands.rs` → 新增 `src-tauri/src/launch.rs`：
  把 `configure_isolated_environment`、`launch_isolated_terminal`
  及 Linux 终端探测下沉为 lib 公共函数，`commands.rs` 与 helper 共用。
- `src-tauri/src/lib.rs`：导出新模块。
- 版本：crate `0.6.0`（helper 随 crate 版本）。

测试（必须，属凭据/环境敏感路径）：

- store-credential：stdin 传入的 token 不出现在任何输出；空 token 拒绝；
  不存在的 provider 拒绝。
- sync-catalog：非法 JSON、重复 id、非法字段被拒；合法输入落盘且
  `load_provider_catalog` 可读回。
- apply-route：在备份不可用时失败不写入（用 CC_ROUTER_DATA_DIR 指向临时目录做
  集成测试，Windows runner）。
- export-catalog：输出 JSON 不含 `authToken` 等字段（断言级别同现有测试）。

### W2 扩展后端：目录主存储与 helper 客户端

改动文件：

- `vscode-extension/src/helperClient.ts`
  - 新增：`syncCatalog`、`exportCatalog`、`storeCredential`、`deleteCredential`、
    `launchTerminal`、`applyRoute`、`clearRoute`、`rollbackRoute`、`getDiagnostics`、
    `helperVersion`。
  - token 一律经 `spawn` 的 stdin 写入；禁止进入 argv 与输出通道。
- 新增 `vscode-extension/src/providerStore.ts`
  - globalState 键 `ccRouter.providers.v1` 为主存储（无密钥 JSON，与桌面端
    localStorage 同构，复用 `normalizeProvider` 逻辑——将该函数与
    `defaultProviders.ts` 抽到共享包 `vscode-extension/shared/`，桌面端
    通过 alias 复用，避免两份模板漂移）。
  - 每次变更后：写 globalState → 调 `sync-catalog` 推送镜像。
  - 激活时：无条件 `sync-catalog` 一次（幂等），根治"目录未初始化"。
  - 首启迁移：globalState 为空且 helper `export-catalog` 有数据 → 导入。
- `vscode-extension/src/extension.ts`
  - 注册 `ccRouter.manageProviders`（打开管理面板）。
  - `openDesktop` 相关安装/修复流程移除，改为"打开管理面板"；
    保留 `ccRouter.openDesktop` 作为可选入口（检测到桌面端才显示）。
  - 状态栏/树视图数据源切到 providerStore（不再每次 spawn helper list；
    凭据布尔值经 helper `list` 或新增 `credential-status` 批量获取）。

测试：

- providerStore：迁移导入、变更即同步、globalState 损坏回退默认模板。
- helperClient：mock spawn 验证 token 仅出现在 stdin。

### W3 管理面板 webview（UI 复用）

改动文件：

- 新增 `src/routerBridge.ts`（桌面前端仓库内）：
  - 定义与 `nativeRouter.ts` 同名的接口；Vite alias 按构建目标选择
    `nativeRouter.ts`（Tauri）或 `webviewBridge.ts`（postMessage）。
  - `App.tsx` 零改动或仅按钮适配（见下）。
- `vscode-extension/src/managePanel.ts`
  - 创建/复用 `ccRouter.manage` webview 面板；`nonce` CSP，仅允许本地资源；
  - 实现 postMessage 请求/响应协议（id + method + params），转发到
    providerStore / helperClient。
  - App.tsx 中桌面专属按钮的映射：
    - "切换并启动"→ 调 `claude-vscode.newConversation`（ wrapper 已配）。
    - "隔离终端"→ helper `launch-terminal`。
    - "在 VS Code 中打开"→ 复用现有 `ccRouter.selectSpecificProvider` + 当前工作区。
    - "设为 Windows 默认 / 清除 / 回滚"→ helper 三命令（保留确认弹窗，
      含"ANTHROPIC_AUTH_TOKEN 明文"警告文案）。
    - 会话面板：不实现（已决策剔除，该功能保留为桌面端独有）。
    - 诊断导出：helper `diagnostics` 输出写入用户选择的文件。
- 构建：`vscode-extension/scripts/build-webview.mjs`（esbuild 打包
  React 应用到 `media/manage.js` + `manage.css`），接入 `prepare:package`。

测试：

- 桥协议：未知 method 拒绝、响应按 id 配对、webview 无法直接触达凭据读取
  （协议中无 read-token 方法——编译期保证）。
- 手动冒烟：Windows + Ubuntu 各一遍新增 Provider → 存 Key → 选工作区 →
  新会话 `/status`。

### W4 打包与发布瘦身

- `vscode-extension/scripts/copy-binaries.mjs`：删除桌面安装器拷贝逻辑，
  仅保留 helper。
- `vscode-extension/src/desktopApp.ts`：整体移除（安装/修复/注册表探测），
  仅保留 `focusRunningDesktop` 供可选入口。
- 版本：扩展 `1.3.0`；crate/helper `0.6.0`；**桌面端维持 0.5.0**（功能不变，
  不随本次发布）。CHANGELOG 双写。
- release.yml：Ubuntu/Windows 不再期待桌面安装器进 VSIX（校验项调整），
  桌面安装器继续作为独立 Release 资产产出。

### W5 文档

- `README.md` / `vscode-extension/README.md`：安装步骤改为"只装插件"；
  桌面端标注为可选（纯终端用户）。
- `docs/PRODUCT_STRATEGY_AND_HANDOFF.md`：产品边界补充"管理面可在插件内完成"；
  信任模型段落不变。
- `docs/VSCODE_COMPANION_GUIDE.md`：更新操作路径。

## 5. 安全不变量（逐条对应现有承诺）

1. Key 只经 stdin 进 helper；不出现在 argv、日志、输出频道、webview 消息。
2. Key 只存 OS 凭据库；不写入 settings.json、globalState、providers.json、
   VS Code SecretStorage。
3. webview 协议中不存在"读取凭据"方法；凭据状态只有布尔值。
4. 持久 Windows 路由仍需显式确认 + 写前备份 + 可回滚 + 明文警告。
5. 目录文件保持无密钥（现有测试断言继续有效，新增 export-catalog 同级断言）。

## 6. 双 UI 共存策略

- 目录文件是单一事实来源的镜像：插件与桌面端"谁保存谁覆盖"，与今天
  桌面端单写语义一致。
- 插件每次激活先 `export-catalog` 对比主存储：不同步时以 globalState 为准
  重新推送（弹一次提示"已同步最新 Provider 配置"）。
- 不实现双向实时监听（一期）；文档注明"同时改两边时后保存者生效"。

## 7. 里程碑与验收

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| M1 | W1 helper 子命令 + lib 重构 | `cargo test` 全绿；新旧二进制对既有子命令行为一致 |
| M2 | W2 扩展后端 + 迁移 | 卸载桌面端后：装插件 → 添加 Provider → 存 Key → 新会话 `/status` 正确 |
| M3 | W3 webview 面板 | 面板内完成全部管理操作；CSP 无告警；中文/英文文案完整 |
| M4 | W4+W5 打包文档 | VSIX 体积达标；README 步骤在干净 Windows 与 Ubuntu VM 各走一遍 |

质量门槛（沿用 AGENTS.md）：`pnpm lint/test/build`、`cargo fmt/test/check`、
扩展 `tsc+oxlint`；凭据、环境、备份路径改动必须有新测试。

## 8. 工作量估计

- W1：约 1 天（含测试）。
- W2：约 1 天（共享模板抽取 + providerStore + 迁移）。
- W3：约 1.5–2 天（桥接 + 构建管线 + 按钮映射 + 双平台冒烟）。
- W4+W5：约 0.5 天。
- 合计约 4 个工作日；发布为 Companion 1.3.0（win32-x64 + linux-x64），
  桌面端不发布新版本。

## 9. 风险与对策

| 风险 | 对策 |
| --- | --- |
| webview 复用 App.tsx 时 Tauri API 残留 | 构建期 alias + `tsc` 双配置检查；CI 加 webview 构建 |
| 用户已有桌面端，双 UI 编辑冲突 | §6 策略 + 文档说明；二期再评估停维护 |
| helper 子命令扩大攻击面 | 全部走既有校验函数；stdin token 专项测试；`version` 能力协商防旧插件配新 helper |
| 旧插件（≤1.2.0）配新目录 | 目录格式不变，旧插件只读，兼容 |
| Ubuntu Secret Service 不可用 | 维持现状错误文案（与桌面端一致） |

## 10. 二期（仅记录，不在本计划）

- 桌面端独立演进（已决策继续维护）：可考虑复用插件 webview 的桥接层做 UI 统一。
- Marketplace 预发布通道。
