import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import '../src/index.css'
import '../src/App.css'

// Entry point for the VS Code management webview. The esbuild bundle aliases
// src/nativeRouter to src/webviewBridge, so App runs unchanged on top of the
// extension host instead of Tauri.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
