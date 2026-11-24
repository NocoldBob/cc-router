# Change Log

## 1.3.0

### 从旧版本升级 / Upgrading from an earlier release

- **直接更新扩展即可。** 不需要安装、升级、修复或卸载 CC Router 桌面端；插件运行
  不再检查桌面端版本，也不会自动更新桌面端。已经安装的桌面端可以保留并独立使用。
- 更新后，如果管理面板已经打开，请先关闭旧的“CC Router Provider 管理”标签页，
  再执行 `Ctrl+Shift+P` → `Developer: Reload Window`（开发人员: 重新加载窗口），
  然后重新运行 **CC Router：管理 Provider**。
- 正常从 Marketplace 升级不需要手动清理任何缓存。如果重载后仍看到旧标题或桌面端
  专属控件，请在扩展详情页确认版本为 `1.3.0`，完全退出所有 VS Code 窗口后重新打开。
  不建议删除 VS Code 缓存目录或扩展全局数据。
- 首次从旧版升级时，扩展会导入桌面端此前保存的 Provider 列表，因此列表中可能暂时
  只有旧版已有的三个 Provider；这是保留旧配置，不是新模板缺失。已有 API Key 仍留在
  系统凭据库中。
- 从早期版本升级后，第一次选择 Provider 或启动新会话时，VS Code 可能提示旧版
  CC Router wrapper 路径需要更新。请选择 **配置**，让设置指向当前扩展自带的 helper；
  这只需操作一次。若选择取消，管理面板不会继续用旧 wrapper 启动会话。

### 加载新版 Provider 模板

**保留现有配置，只补充缺失模板（推荐）：**

1. 打开 **CC Router：管理 Provider**。
2. 点击左侧 **＋ 新建 / 模板**，逐个添加需要的 DeepSeek、Kimi Global、Kimi Code、
   GLM、Qwen、MiniMax 或本地/局域网模板。
3. 为新增 Provider 填入 API Key，先点击 **保存凭据**，再点击 **保存配置**。这两个按钮
   分别保存系统凭据和 Provider 参数，都需要执行。保存一次后，下次打开面板会直接显示
   该列表，不需要重复恢复模板。

**改为完整内置模板列表：**

1. 如有自定义 Provider，先点击 **导出配置** 备份；导出文件不包含 API Key。
2. 点击 **恢复模板**，再点击 **保存配置**。
3. 注意：“恢复模板”会用完整内置列表替换当前 Provider 列表，而不是合并。它不会删除
   系统凭据库中的 Key，但被移除的自定义 Provider 需要通过备份重新导入。

新用户没有旧目录需要迁移，首次打开就会看到全部内置模板，无需执行上述恢复步骤。

### Changes

- The extension is now self-contained: a new "CC Router: Manage Providers"
  command opens the full management UI (the same interface as the desktop app)
  in a webview panel — add or edit Providers, switch model presets, save API
  Keys to the OS credential store, run connection probes, open isolated
  terminals, manage the Windows default route (with backup/rollback), and
  export redacted diagnostics, all without installing the desktop app.
- New "CC Router: Save API Key to Credential Store" command with a
  password-masked input.
- Providers are stored by the extension and mirrored to the bundled helper on
  activation and on every save; an existing desktop-written catalog is imported
  automatically on first run. The desktop app remains an optional standalone
  product and is no longer required, installed, or repaired by the extension.
- The VSIX no longer embeds the desktop installer (Windows package shrinks
  from ~4.5 MB to ~1.8 MB, Linux from ~85 MB to ~6 MB) and now includes the
  management webview bundle.
- The webview uses production React, complete base styles, build-time VS Code
  host detection, and cache-busted script/style URLs. Desktop-only controls and
  the session panel are hidden in the extension host.

## 1.2.0

- Bundled CC Router desktop `0.5.0` with refreshed official templates (DeepSeek
  `deepseek-flash` naming, Kimi K3.1 Pro presets) and new GLM, Qwen (Model Studio Token Plan
  and Coding Plan), MiniMax, and local/LAN Provider templates.
- The bundled helper now manages three additional route variables (`API_TIMEOUT_MS`,
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`) when launching
  Claude Code sessions.
- Extension code is unchanged from `1.1.0`; the version bump keeps the bundled desktop
  payload traceable.

## 1.1.0

- Bundled CC Router desktop `0.4.0` with Provider-isolated terminal launch, "open this
  workspace in VS Code" desktop entry point, an app-launched session panel, and redacted
  diagnostics export.
- Extension code is unchanged from `1.0.0`; the version bump keeps the bundled desktop
  payload traceable (the `1.0.0` bundle shipped desktop `0.3.0`).

## 1.0.0

- Added native Ubuntu 22.04/24.04 x64 support using Linux Secret Service.
- Added platform-specific Windows and Linux helpers and desktop bundles.
- Kept process-isolated routing as the default on both platforms; Ubuntu does not modify shell profiles.
- Promoted CC Router Companion from beta to its first stable extension release.

## 0.3.2

- Bundled CC Router desktop `0.2.0-beta.3` with one-click Kimi Code profiles for
  K3 1M, K3 256K, and quota-saving K2.7 Code.
- Added manual Provider connectivity probes with sanitized status and latency.

## 0.3.1

- Bundled CC Router desktop `0.2.0-beta.2` with trusted intranet `http://` custom Provider support.
- Made manual refresh report whether the shared Provider catalog was loaded or why it failed.
- Added a confirmation-gated repair action that replaces an outdated desktop installation with
  the matching version bundled in the VSIX.
- Improved guidance for missing shared configuration and mismatched Windows user accounts.

## 0.3.0

- Bundled the matching CC Router desktop installer in the VSIX.
- Added first-run, confirmation-gated desktop installation and automatic launch.
- Kept registry discovery and a remembered file picker as recovery paths.

## 0.2.1

- Fixed untranslated placeholders in the empty sidebar state.
- Improved desktop discovery with running-process focus, registry lookup and a remembered file picker.

## 0.2.0

- Added a native Activity Bar sidebar with current route, Provider list and one-click actions.
- Added automatic first-run onboarding and Chinese localization.
- Added a bilingual Chinese/English Marketplace README.

## 0.1.0

- Initial Windows beta.
- Select a CC Router Provider per local workspace.
- Launch new official Claude Code extension sessions through a Credential Manager-backed wrapper.
- Keep API Keys out of VS Code settings and extension state.
