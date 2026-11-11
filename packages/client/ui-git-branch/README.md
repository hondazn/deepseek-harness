---
description: "The session-header Git branch chip and its branch switcher, over the Host git Remote that reads the Session working directory's checkout."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-git-branch

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-git-branch` puts the branch the Session's working directory has checked out beside the Session title, and switches branches from the chip's menu. The package ships both faces: the browser half registers one header action and its dictionaries, and the Host half serves the generated `git` Remote namespace that reads the branch position, lists local branches, and checks one out under the Session's sandbox policy.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Load the plugin through the web-app manifest. It renders nothing outside a Git checkout, so a conversation in a plain directory never grows a branch control.

The chip names the checked-out branch and opens a menu of local branches, the checked-out one highlighted and listed first. Choosing another branch runs `git switch` in the Session's effective working directory; the chip takes the new name, and a refused switch stays in the menu with the localized reason and Git's own diagnostic. A detached HEAD shows its abbreviated commit instead of a branch name, and the menu still offers every local branch.

The chip re-reads the position when the Session or its workspace directory changes, and whenever the menu opens. Nothing polls in the background, so a branch switched outside this control updates at the next open.

### Configuration

The Host half reads the Git executable and its process limits from the plugin row:

| Field | Default | Meaning |
|---|---|---|
| `gitCommand` | `git` | Git executable name or absolute path |
| `timeoutMs` | `10000` | Deadline in milliseconds for one command |
| `graceMs` | `2000` | Termination grace period in milliseconds per process |
| `maxOutputBytes` | `65536` | Maximum captured bytes per output stream |
| `maxBranches` | `200` | Most local branch names one menu lists |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser half registers one `conversation.session.header.actions` entry with order `0`, after the agent-preset label's leading band and before the background-job list. The component subscribes to nothing beyond the slot's standard session seats: the branch position and the branch listing are one-shot Remote reads through the injected face, and the menu refreshes them on open.

The Host half is a `TypertRemoteService` bound to `ctx.gitController` and the generated `git` namespace. Every command runs through `ctx.subprocess` in the directory `ctx.workingDirectory.get(session)` reports, confined by `ctx.sandboxPolicy.resolve({ session })` and `ctx.sandbox.confine` unless the policy is `danger-full-access`. The runner scrubs inherited repository selectors, disables prompts, hooks, optional index writes, and the filesystem monitor, and bounds each command by `timeoutMs` and `maxOutputBytes`.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The Host `git` Remote service and its configuration |
| [`src/git.ts`](src/git.ts) | Git invocations, output parsing, and refusal classification |
| [`src/types.ts`](src/types.ts) | Client-safe wire types of the `git` namespace |
| [`src/client/index.ts`](src/client/index.ts) | Slot registration, dictionaries, and Remote unwrapping |
| [`src/client/GitBranchAction.tsx`](src/client/GitBranchAction.tsx) | The chip, its menu, and the switch feedback |
| [`src/client/locales.ts`](src/client/locales.ts) | The `gitBranch` namespace copy (zh source of truth) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-api-gateway`](../../../docs/api-gateway.md) — the Remote model, generation pipeline, and invocation behind `ctx.remote.git`.
- [`dsh-sandbox-policy`](../../sandbox/sandbox-policy/README.md) — how a Session's file-effect policy is resolved.
- [`dsh-working-directory`](../../session/working-directory/README.md) — the effective directory the chip reports on.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package reads repository state for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define current package constraints, not a task backlog.

- **No background refresh** — a branch switched outside the chip updates at the next menu open or Session change, because the package polls no repository state.
- **No fetch or remote branches** — the menu lists local branches only; pulling, creating, and deleting branches stay outside this control.
- **Uncommitted changes block a switch** — Git refuses the checkout and the menu reports the refusal; the package never stashes or discards work on the user's behalf.