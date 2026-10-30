---
name: Adaptive Fat Loss Planner
description: A personalized journey, a manageable week and a clear response to progress.
colors:
  background: "#FAFAF9"
  foreground: "#202020"
  card: "#ffffff"
  card-foreground: "{colors.foreground}"
  popover: "{colors.card}"
  popover-foreground: "{colors.foreground}"
  primary: "#FF6A33"
  primary-text: "#B63F16"
  primary-foreground: "#202020"
  secondary: "#F1F1EE"
  secondary-foreground: "{colors.foreground}"
  muted: "#F1F1EE"
  muted-foreground: "#66635F"
  accent: "#FFF0E8"
  accent-foreground: "{colors.foreground}"
  destructive: "#B42318"
  border: "#E4E4E0"
  input: "#CBCBC5"
  ring: "#B63F16"
  chart-1: "#B63F16"
  chart-2: "#765A30"
  chart-3: "#68635D"
  chart-4: "#99968E"
  chart-5: "#202020"
  goal-on-track: "#1F6B49"
  goal-on-track-surface: "#EDF6F0"
  goal-review: "#9B3429"
  goal-review-surface: "#FBEFEC"
  review: "#8b5e2a"
  review-surface: "#fff5e8"
  error-surface: "#fff5f4"
  sidebar: "{colors.card}"
  sidebar-foreground: "{colors.foreground}"
  sidebar-primary: "{colors.primary}"
  sidebar-primary-foreground: "{colors.primary-foreground}"
  sidebar-accent: "{colors.accent}"
  sidebar-accent-foreground: "{colors.foreground}"
  sidebar-border: "{colors.border}"
  sidebar-ring: "{colors.ring}"
typography:
  body:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 15px
    lineHeight: 1.6
  heading:
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.8px
  section:
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontSize: 13px
    fontWeight: 500
  caption:
    fontSize: 12px
    lineHeight: 1.6
rounded:
  base: 0.625rem
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
components:
  control:
    height: 44px
    typography: "{typography.label}"
  content:
    width: 1120px
  reading:
    width: 760px
  plan-reader:
    columns: "minmax(0, 1fr) minmax(0, 3fr)"
  journey-chart:
    height: 320px
    weekWidth: 88px
  comparison:
    primaryWidth: 2.5px
    actualWidth: 3px
    secondaryWidth: 1.25px
    secondaryOpacity: "0.24"
    variationOpacity: "0.16"
    legendKeyWidth: 16px
    selectionWidth: 2px
  measurement-action:
    size: 44px
  check-in:
    columns: "minmax(0, 1fr) minmax(0, 2fr)"
  setup:
    width: 600px
  editor:
    width: 600px
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
  muted:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
  error:
    textColor: "{colors.destructive}"
  review:
    backgroundColor: "{colors.review-surface}"
    textColor: "{colors.review}"
---

## Overview

Updated 2026-10-30. Applies to the measurement-first English application. Name and logo geometry remain Adaptive Fat Loss Planner. Slogan: “A personalized plan that adapts to your progress and everyday life.” This front matter is the sole design-value authority; generate CSS with pnpm design:tokens. Dexter's October 30 whole-page correction supersedes the earlier 700px canvas and the later split-width arrangement: header and every page section share the 1120px maximum outer grid. The 760px reading measure constrains text inside sections, never a separately centered group of sections. No parallel palette or theme is introduced.

## Experience and color

White surfaces, charcoal type, quiet neutral structure and a small vivid orange accent. Orange buttons use charcoal text; chart-1 uses darker orange for legibility. Error and pending review remain separately labelled semantic states. Never judge a body measurement with red/green success colors. Logo geometry stays unchanged and uses semantic brand tokens.

Plan connects the accepted strategy, reference/current forecast, coach review and read-only weekly guidance. A compact accepted-approach section puts the current phase and this week's focus before the forecast; weekly details follow it without repeating the focus sentence. Records owns measurement and accepted-plan history. Update is measurement-only. Daily action calendars, completion controls and individual action editors are retired. Settings remains secondary. The example uses the same screens and isolated data.

Use official shadcn controls and existing system fonts. Minimum primary touch targets are 44px; phone fields use at least 16px text. Use flat sections, restrained borders and consistent spacing rather than nested dashboards. The full-plan reader uses an internal phase index and reading column; its week selector exposes the whole horizon without a long stack of week sections. Accepted phases form one proportional line below the overview forecast X axis; the selected phase shades the matching dates and reveals one compact focus with previous/next controls. Structured phase guidance unfolds on request. Phase selection changes presentation only, never the forecast or accepted plan. Optional model details stay folded.

## Decisions before detail

Use one heading and necessary inputs per setup step. General setup, measurement and forecast explanations belong behind keyboard-operable info buttons with explicit accessible names. Keep goal/period, the complete plan/current week, measurements, actual-versus-forecast distinctions and required decisions visible. Do not repeat healthy freshness/acceptance status across sections. Safety pauses, unsaved entries, failures, stale guidance and unaccepted replacements remain explicit. Settings uses the shared header Replan entry rather than a duplicate section.

Accepted Plan has two mutually exclusive views, Overview and Full plan, using official shadcn tabs. Overview contains the goal, compact latest check-in status, primary forecast, selected-phase focus and this week's practical suggestions. Full plan is a dedicated reader for the accepted strategy, phase index, one selected phase/week and supporting reasons. The selected phase's objective stays visible; structured detail unfolds on request so it cannot bury the weekly guide. Reading a different week offers a direct return to the application-owned current week. It contains no forecast dashboard or repeated current check-in. Phase/week selections are URL fragments; browser back and refresh restore them without a second store. The whole horizon stays accessible without stacking every phase and week into the overview. Application-owned guidance gates still pause current phase/week advice; the reader explains this state and links to saved accepted versions in Records.

Plan and Records share a compact check-in summary with expandable details. Current facts and coach conclusions are not duplicated as another always-open dashboard. Live/recoverable tasks stay expanded; new saved inputs or a new bound review reveal the result. The update-result anchor always exists when a result is available and opens the saved result on navigation or reload. Saving, calculation and coach review have separate receipts; a note-only update never appears as a new measurement. Retry controls name the unfinished stage. A common-date Hall difference is explicitly current minus accepted reference for that future date, not today's measured residual. The explicit review button invokes the existing command; it does not change automatic eligibility policy.

Proposal review is a separate decision surface with no accepted-plan tabs or overview dashboard. It distinguishes the accepted plan, previous unaccepted proposal and new unaccepted version. Present calculator-owned target records and dates side by side; exact strategy and week-level comparisons unfold. Structured feedback is a request, not proof that the new content addressed it. A review shortcut reaches the decision panel, which stays in document flow rather than covering weekly content. A replacement can be left to inspect the retained accepted plan without dismissing it; that plan has an explicit return-to-review notice. Feedback on an accepted plan opens a guarded dialog rather than another inline page. No replacement takes effect until explicit acceptance. Detailed phase guidance is disclosed, not expanded across the whole horizon. Older prose stays a saved summary.

Plan/Records navigation remains in the header, including a narrow desktop window; there is no separate bottom-navigation/mobile product. Use the existing semantic tokens for every decision surface.

## State, access and ownership

Screens use application projections and commands; no storage, physiology, target or comparison calculations belong in UI. Preserve keyboard access, modal focus restoration and unsaved draft protection. Facts save before calculation; failed coaching leaves saved facts and usable numerical output intact. Old output stays labelled stale. Only accepted proposals change the active plan. Honor reduced motion with short optional transitions, never scroll pinning. Fictional examples must remain explicit and isolated.

## Goal outlook and replanning

Only A's current goal assessment drives the outlook card's semantic tint: on_track is goal-on-track, needs_review is goal-review, unknown stays neutral. This is a conditional projection, never a success probability or judgment of a person's measurement. Always include a textual state/reason. Starting/latest reports stay neutral. The accepted-plan heading uses the brand text color; Overview reads “Your Fat-Loss Plan”. One official button labelled Update measurements, with a charcoal background, light text, a Lucide ClipboardPlus and a quiet accent tile, is the primary measurement entry on Plan; the header holds labelled Settings and Replan, not a second Update. The forecast refresh icon sits directly beside its automatic-update explanation. Replanning retains the active journey until a server-checked candidate is explicitly accepted; destructive clearing is separately confirmed in Settings.

## Forecast interaction hierarchy

The default plot emphasizes a dashed model mean and a solid measured series with real-point markers. In the mean view, applicable individual models are quiet context. Compact text-and-line buttons select one model for a focused comparison; the selected button and the named saved default are distinct. A separate keyboard-accessible information icon beside each method opens a concise explanation of its purpose, mechanism, application assumptions and original references. Reading an explanation never selects or pins a model. Pinning saves the default per measure, explicitly labelled Weight or Body-fat. Full model names remain accessible through labels/titles. Unsupported body-fat models are absent. Actual readings stay visible. Supporting reference/sensitivity layers live in Chart display options.

The lighter seeded AM/PM weight illustration is distinctly labelled and can be switched off. It never replaces the exact trend or appears as a body-fat prediction. No regenerated randomness on refresh, hover or zoom. The Hall basis stays visible on the goal-outlook card, because display selection does not replace the planning policy. Default Whole journey fits the complete date range and labelled plan end without horizontal scrolling. Tick labels thin to the available width without altering daily points, planned check-ins or phases. Zoom in enters weekly detail at the token-defined week width; long plots then use one keyboard-accessible scrolling canvas with a pinned y scale and explicit earlier/later controls. Whole journey restores the full period. Shared geometry, stroke weights and opacity values come only from the front matter.

## Date entry

`ui/date-input.tsx` composes official shadcn Input, Popover and Calendar. Display uses an explicit English YYYY-MM-DD prompt and en-US calendar, independent of browser locale. The form owns the date string; shared domain validation and existing min/max limits remain authoritative. Calendar targets use the existing control-height token.
