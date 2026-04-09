# Firewall Implementation Spec

This document is an implementation-ready spec for the firewall feature in this repo.

Its purpose is not to describe a generic MV3 firewall. Its purpose is to describe:
- what already exists in `uBlockResurrected`
- what is still missing or unreliable
- which files are the source of truth
- how to implement the remaining work without inventing a parallel architecture

## Goal

Implement a working uBlock-style dynamic firewall in the MV3 Chromium build so that:
- the popup firewall matrix displays current rules for the active tab
- clicking firewall cells updates session rules immediately
- persisting rules writes them to permanent storage
- permanent rules survive reloads and browser restarts
- actual request blocking in Chromium MV3 is enforced through DNR
- logical evaluation still exists for logging, popup state, and rule visualization

This feature is gated by `advancedUserEnabled`.

## Current Repo Reality

This repo already contains the core firewall model and much of the popup plumbing.

### Already Present

- Firewall model:
  - [dynamic-net-filtering.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/dynamic-net-filtering.ts)
- Firewall instances:
  - [filtering-engines.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/filtering-engines.ts)
  - `permanentFirewall`
  - `sessionFirewall`
- Popup/background message flow:
  - [messaging.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/messaging.ts)
- Rule toggle logic:
  - [ublock.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/ublock.ts)
- Startup restore:
  - [start.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/start.ts)
- Persistent storage key:
  - `dynamicFilteringString`
- Popup firewall UI code:
  - [popup-fenix.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/popup-fenix.ts)
- Background-side logical evaluation in request flow:
  - [pagestore.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/pagestore.ts)
  - [tab.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/tab.ts)
  - [traffic.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/traffic.ts)
- Existing MV3 DNR-related code:
  - [dnr-integration.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/dnr-integration.ts)
  - [blocker-core/adapters/dnr/index.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/blocker-core/adapters/dnr/index.ts)

### Already Working Conceptually

- Session firewall rules can be toggled via `toggleFirewallRule`.
- Permanent firewall rules can be saved via `saveFirewallRules`.
- Firewall state is serializable through `dynamicFilteringString`.
- Popup data already includes firewall-related data.
- Logical evaluation APIs like `evaluateCellZY()` already exist.

### Known Gaps / Unreliable Areas

- MV3 DNR syncing for firewall rules is not reliable enough yet.
- Existing DNR code should not be treated as authoritative without validation.
- The repo contains overlapping DNR/compiler code paths, so ownership must be explicit.
- The popup firewall matrix may render data, but actual browser-level blocking in MV3 is the part that still requires careful implementation and testing.

## Source Of Truth

These are the authoritative sources for firewall state.

### Rule Model

- `DynamicHostRuleFiltering` in [dynamic-net-filtering.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/dynamic-net-filtering.ts)

### Runtime / Persistent Instances

- `sessionFirewall`
- `permanentFirewall`

Defined in [filtering-engines.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/filtering-engines.ts)

### Persistent Storage

- `dynamicFilteringString`

Loaded on startup in [start.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/start.ts)

Saved/exported through:
- [storage.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/storage.ts)
- [messaging.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/messaging.ts)
- [ublock.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/ublock.ts)

## Files To Change

Implementation should be centered on these existing files.

### Must Keep

- [dynamic-net-filtering.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/dynamic-net-filtering.ts)
- [filtering-engines.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/filtering-engines.ts)
- [messaging.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/messaging.ts)
- [ublock.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/ublock.ts)
- [start.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/start.ts)
- [popup-fenix.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/popup-fenix.ts)

### DNR Ownership

Firewall-to-DNR synchronization should be implemented by repairing/extending:
- [dnr-integration.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/dnr-integration.ts)

If that file proves too broken to salvage, replacement must still integrate with the same existing firewall sources of truth. Do not create a parallel firewall state manager.

### Do Not Invent By Default

Do not create new top-level modules such as:
- `firewall-manager.js`
- `firewall-dnr.js`

unless there is a demonstrated architectural need. The default assumption is that the existing files are sufficient.

## Firewall Model

The core rule engine is already in place.

### Supported Dynamic Types

From [dynamic-net-filtering.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/dynamic-net-filtering.ts):

```ts
{
    '3p': true,
    'image': true,
    'inline-script': true,
    '1p-script': true,
    '3p-script': true,
    '3p-frame': true
}
```

### Actions

```ts
block = 1
allow = 2
noop  = 3
unset = 0
```

### Persistent Text Format

```text
srcHostname desHostname type action
```

Examples:

```text
* * 3p block
* * 3p-script block
example.com * 3p allow
example.com ads.example.com 3p-script block
```

### Behavior

- `sessionFirewall` is the current runtime state.
- `permanentFirewall` is the persisted state.
- `saveFirewallRules` copies from session to permanent for the current visible matrix scope.
- `toggleFirewallRule` changes `sessionFirewall`, and optionally `permanentFirewall` when `persist` is requested.

## MV3 Architecture For This Repo

The implementation must follow this split:

### Logical Evaluation

Logical firewall evaluation remains in the existing in-memory model:
- `sessionFirewall.evaluateCellZY(...)`

This is used for:
- logging
- popup state
- request statistics
- UI explanation of what rule matched

In this repo, this evaluation is primarily background/request-processing-side, not content-script-centric.

### Browser-Level Blocking

Actual Chromium MV3 request blocking must happen through DNR.

That means:
- permanent firewall rules must be compiled into DNR dynamic rules
- DNR must be refreshed on startup
- DNR must be refreshed after firewall changes
- browser-level blocking must still work after service worker restarts

### Important Clarification

The firewall is not “implemented” merely because `sessionFirewall.evaluateCellZY()` returns the right answer. In MV3 Chromium, the implementation is only complete once DNR actually blocks matching requests.

## MV3 Behavioral Decisions

These decisions must be treated as explicit requirements.

### 1. `noop`

`noop` has no direct DNR equivalent.

Implementation rule:
- `noop` remains a logical firewall state in `sessionFirewall` / `permanentFirewall`
- popup/UI must display it correctly
- logging may report it
- DNR must not emit a literal `noop` rule

If DNR needs a concrete action for precedence purposes, that behavior must be documented in code and tests before implementation. Default assumption: `noop` is not compiled to DNR.

### 2. `inline-script`

`inline-script` does not map cleanly to a normal MV3 DNR resource type.

Implementation rule:
- preserve logical support in the firewall engine and UI
- do not pretend it is fully enforceable through DNR unless a real mechanism exists
- if unsupported for MV3 blocking, explicitly mark it as UI/logical-only in this phase

### 3. Rule Precedence

Rule precedence in the logical firewall remains the existing `evaluateCellZY()` behavior.

DNR compilation must preserve the practical precedence order as closely as possible:
- more specific source/destination/type rules before broader rules
- allow rules must override broader block rules where intended

This must be validated by end-to-end tests, not assumed.

### 4. Rule ID Allocation

This repo already uses DNR for other purposes, so firewall rule IDs must be isolated.

Required policy:
- firewall DNR rules must use a dedicated ID range
- firewall code must remove only firewall-owned DNR rules
- firewall code must not wipe unrelated dynamic rules

Locked policy for implementation:
- firewall DNR rule IDs: `9_000_000` through `9_099_999`
- user-authored non-firewall dynamic DNR rules must start at `9_200_000` or above
- firewall sync code may remove only IDs in `9_000_000..9_099_999`

Implementation note:
- if the compiler needs separate subranges for block vs allow, they must still remain inside `9_000_000..9_099_999`
- example:
  - block rules: `9_000_000..9_049_999`
  - allow rules: `9_050_000..9_099_999`

### 6. DNR Priority Policy

Locked policy for implementation:
- firewall DNR rules must use a priority above ordinary static/user filter priorities used elsewhere in this repo
- default firewall priority base: `2_000_000`
- more specific firewall rules must receive higher priority than broader ones

Required ordering:
- source+destination+type
- source+destination+generic
- source+wildcard+type
- source+wildcard+generic
- wildcard+destination+generic
- wildcard+wildcard+type/generic

If two DNR rules would otherwise collide:
- allow must outrank broader block
- narrower rule must outrank broader rule

### 5. Persistence Semantics

- session click without persist: changes `sessionFirewall` only
- persist action: updates `permanentFirewall` and `dynamicFilteringString`
- on startup: `permanentFirewall` is restored, then copied into `sessionFirewall`
- persisted rules must survive browser restart

## Popup / UI Requirements

The popup firewall matrix is part of the implementation, not optional polish.

### The Popup Must

- render current firewall state for the active tab
- show global and per-site scopes
- show per-destination rows for observed hostnames
- update immediately after a rule toggle
- reflect dirty state when session differs from permanent

### Existing Relevant Files

- [popup-fenix.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/popup-fenix.ts)
- [messaging.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/messaging.ts)

### Existing Relevant Messages

- `toggleFirewallRule`
- `saveFirewallRules`
- popup data generation that includes firewall state

### Popup Interaction Targets

These are the concrete selectors/behaviors to use in Playwright and implementation work.

- firewall container:
  - [popup-fenix.html](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/popup-fenix.html)
  - `#firewall`
- hotspot/action widget:
  - `#actionSelector`
- explicit actions:
  - `#dynaBlock`
  - `#dynaAllow`
  - `#dynaNoop`
- save button:
  - `#saveRules`
- interactive matrix cells:
  - `#firewall span[data-src]`
- per-row grouping:
  - `#firewall > [data-des][data-type]`

Persistence UX rule:
- direct cell/action interaction updates session state
- clicking `#saveRules` persists current session matrix scope via `saveFirewallRules`

The implementation must not redefine this UX unless the popup itself is intentionally redesigned.

## Implementation Plan

This is the intended order of work.

### Phase 1: Verify Model + Popup Read Path

Confirm:
- startup restores `dynamicFilteringString` into `permanentFirewall`
- `sessionFirewall.assign(permanentFirewall)` occurs correctly
- popup data returns expected firewall rows and dirty state

Files:
- [start.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/start.ts)
- [messaging.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/messaging.ts)
- [popup-fenix.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/popup-fenix.ts)

### Phase 2: Verify Popup Write Path

Confirm:
- clicking firewall cells updates `sessionFirewall`
- persist path updates `permanentFirewall`
- `dynamicFilteringString` is saved
- popup refresh reflects the new state

Files:
- [popup-fenix.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/popup-fenix.ts)
- [messaging.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/messaging.ts)
- [ublock.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/ublock.ts)

### Phase 3: Implement Correct Firewall → DNR Compilation

Repair/replace firewall syncing in:
- [dnr-integration.ts](/home/glompy/Desktop/ASTROCYTECH/git_project/uBlockResurrected/src/js/dnr-integration.ts)

Requirements:
- compile from actual firewall state, not guessed object iteration
- use firewall-owned rule IDs only
- remove only firewall-owned DNR rules
- batch or debounce updates
- re-sync on startup

### Phase 4: End-To-End Blocking Validation

Validate in real Chromium MV3:
- block rule blocks matching request
- allow rule overrides broader block where intended
- persisted rules still block after browser restart
- service worker restart does not lose browser-level blocking

## What Not To Do

- do not move core firewall ownership into content scripts
- do not introduce a second firewall state model
- do not rely on `dnr-integration.ts` behavior without tests
- do not claim `noop` or `inline-script` are fully supported in MV3 blocking unless proven
- do not remove unrelated dynamic DNR rules during firewall updates

## Acceptance Criteria

Implementation is complete only when all of the following are true.

### Popup

- popup shows firewall matrix when `advancedUserEnabled` is true
- popup reads the correct current matrix state for the active tab
- toggling a cell updates the matrix immediately
- persisting rules clears dirty state after save

### Persistence

- persisted firewall rules are saved to `dynamicFilteringString`
- persisted rules survive extension reload
- persisted rules survive browser restart

### MV3 Blocking

- a persisted block rule causes real request blocking in Chromium MV3
- a persisted allow rule can override broader block behavior where expected
- firewall-owned DNR rules do not collide with other dynamic rules

### Logging / Logical Evaluation

- blocked/allowed requests still map back to logical firewall state for popup/logger use
- popup counts and rule indications remain coherent after DNR sync

## Playwright Test Plan

These tests are required.

### 1. Popup Matrix Read Test

- open real extension popup on a test page
- seed permanent firewall state
- verify popup matrix renders the expected rules

### 2. Popup Toggle Session Test

- click a firewall cell
- verify popup refresh reflects session-only state
- verify dirty state appears

### 3. Persist Firewall Rules Test

- persist a rule
- reopen popup
- verify permanent state remains

### 4. Restart Persistence Test

- persist a rule
- fully restart Chromium with same profile
- verify popup still shows the rule

### 5. Real Blocking Test

- persist a firewall block rule
- load a page that triggers a matching request
- verify request is blocked in Chromium MV3

### 6. Allow Override Test

- create a broad block and a narrower allow
- verify the narrower allow wins where intended

### 7. DNR Isolation Test

- install/update firewall rules
- verify non-firewall dynamic DNR rules are not removed

## Canonical End-To-End Examples

These examples are mandatory reference behaviors.

### Example 1: Global Third-Party Block

Rule:

```text
* * 3p block
```

Expected result:
- third-party requests from the active page are blocked in Chromium MV3
- popup matrix shows the global `3p` block state
- after browser restart, the rule still exists if saved

### Example 2: Site-Specific Allow Over Global Block

Rules:

```text
* * 3p block
example.com * 3p allow
```

Expected result:
- `example.com` can load third-party requests
- other sites remain blocked by the global rule
- popup matrix for `example.com` shows the narrower allow

### Example 3: Specific Destination Script Block

Rule:

```text
example.com ads.example.net 3p-script block
```

Expected result:
- third-party scripts from `ads.example.net` initiated by `example.com` are blocked
- unrelated third-party scripts are unaffected unless broader rules also exist
- popup row for `ads.example.net` reflects the script block

### Example 4: Session-Only Rule

Interaction:
- set a firewall rule without saving

Expected result:
- popup reflects changed session state
- dirty state is visible
- rule affects current runtime behavior if the logical/DNR bridge applies it immediately
- rule disappears after browser restart if not persisted

## Implementation Checklist

- [ ] Verify popup read path against current startup state
- [ ] Verify popup write path against `sessionFirewall` and `permanentFirewall`
- [ ] Verify `dynamicFilteringString` save/load roundtrip
- [ ] Repair firewall-specific compilation in `dnr-integration.ts`
- [ ] Reserve and document a firewall-specific DNR rule ID range
- [ ] Use `9_000_000..9_099_999` as the firewall-owned DNR ID range
- [ ] Use `2_000_000+` firewall DNR priorities
- [ ] Ensure only firewall-owned DNR rules are replaced during sync
- [ ] Debounce DNR updates for rapid popup interaction
- [ ] Add Playwright popup tests
- [ ] Add Playwright real-blocking tests
- [ ] Validate persistence across restart
- [ ] Explicitly document unsupported/approximate MV3 cases

## Bottom Line

The firewall feature is implementable in this repo because the core model already exists.

The remaining work is not to invent a new firewall architecture. The remaining work is to:
- trust the existing firewall model
- wire the popup behavior cleanly
- persist correctly
- make MV3 DNR synchronization authoritative and test it end to end
