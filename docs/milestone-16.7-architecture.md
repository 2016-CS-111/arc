# Milestone 16.7: Release Boundary

Arc releases are local, reviewable operations. The repository creates the backend build and a
versioned VSIX but never publishes, upgrades, restores data, or transmits a publisher credential.

## Artifacts

`pnpm extension:package` creates `apps/vscode-extension/arc-<version>.vsix`. It contains the
bundled extension host, webview assets, manifest, icon, and extension README only. The version in
the root package and extension package must be the same for a release.

The generated private VSIX is unsigned. It is suitable for a local developer install after review,
but it is not a signed distribution artifact. The Visual Studio Marketplace signs extensions after
they are published; Marketplace publishing therefore requires an approved publisher and an
operator-controlled credential outside this repository. See the [VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) and [extension runtime security documentation](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security).

No publisher identity, access token, signing certificate, or publishing command is stored in Arc.
This keeps the local product safe to build while making external distribution an intentional release
decision.

## Acceptance

The static, local-service, extension, platform, package, and distribution checks are ordered in
[the release checklist](milestone-16.7-acceptance.md). A release is blocked by any failed command,
pending migration, unavailable configured model, unsafe dependency report, or platform entry that
has not been verified for its intended audience.
