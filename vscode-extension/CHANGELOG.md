# Change Log

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
