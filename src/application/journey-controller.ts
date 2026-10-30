// ABOUTME: Async journey commands operate through the existing session owner's verified publish port.
// ABOUTME: Every request is persisted, bounded and revision-checked; this controller owns no duplicate store.
import { journeyRequestTimeoutMs } from "../domain/execution-policy";
import {
  InitializationInputSchema,
  type InitializationInput,
} from "../domain/initialization";
import {
  MAX_FEEDBACK_REVISIONS,
  RevisionIntentSchema,
  type JourneyFeedback,
  type RevisionIntent,
} from "../domain/journey";
import { numericalProseIssues } from "../domain/numeric-copy";
import { assertPlanningEligibility } from "../domain/planning-eligibility";
import {
  CalculationResponseSchema,
  StageResponseSchema,
  type CalculationResponse,
  type JourneyFlow,
  type JourneyPorts,
  type MeasurementUpdate,
  type RequestBinding,
  type StageRequest,
} from "../domain/workflow";
import { pointMeetsGoal } from "../planning/goal-policy";
import {
  assessMeasurementReview,
  type MeasurementReviewDecision,
} from "../planning/measurement-review";
import { alignForecast } from "../planning/reference";
import { journeyHttpPorts } from "./journey-client";
import {
  acceptDraft,
  activeAcceptance,
  bindingCurrent,
  buildCalculationRequest,
  buildStageRequest,
  enableJourney,
  newBinding,
  pendingDraft,
  receiveCalculation,
  receiveDraft,
  receiveInterpretation,
  recordFeedback,
  saveMeasurement,
} from "./journey-commands";
import {
  SessionCoreSchema,
  SessionSchema,
  createSession,
  type Session,
} from "./session";
import {
  assertReplanningSource,
  createReplanning,
  replanningSession,
} from "./replanning";
import type { ReplanningCommands } from "./replanning-contract";

export interface SessionAccess {
  read(): Session | null;
  /** Must verify persistence and readback before exposing this session. */
  publish(next: Session): void;
  today(): string;
}
type TaskStage = NonNullable<JourneyFlow["task"]>["stage"];
export class JourneyController implements ReplanningCommands {
  private child: JourneyController | null = null;
  private promoting = false;
  private active: AbortController | null = null;
  private activeRequest: string | null = null;
  private pendingSignal: AbortSignal | null = null;
  constructor(
    private readonly access: SessionAccess,
    private readonly ports: JourneyPorts = journeyHttpPorts,
  ) {}
  private session(): Session {
    const s = this.access.read();
    if (!s) throw new Error("Set up a session first.");
    return s;
  }
  private publish(s: Session) {
    const previous = this.access.read();
    if (
      previous &&
      (previous.id !== s.id ||
        previous.sourceRevision !== s.sourceRevision ||
        previous.actionsRevision !== s.actionsRevision)
    )
      this.child?.dispose();
    this.access.publish(SessionSchema.parse(s));
  }
  private stop() {
    this.active?.abort();
    this.active = null;
    this.activeRequest = null;
    this.pendingSignal = null;
  }
  get running(): boolean {
    const s = this.access.read(),
      task = s?.journey.task;
    return Boolean(
      this.active &&
        !this.pendingSignal?.aborted &&
        task?.status === "running" &&
        this.activeRequest === task.binding.requestId &&
        s &&
        bindingCurrent(s, task.binding, this.access.today()),
    );
  }
  /** Aborts this controller's work without writing another tab's session. */
  dispose(): void {
    this.child?.dispose();
    this.stop();
  }
  /** Public cancellation preserves the previous accepted plan and marks unfinished work recoverable. */
  cancel(): void {
    this.stop();
    const s = this.access.read();
    if (!s?.journey.task) return;
    this.publish({
      ...s,
      journey: {
        ...s.journey,
        task: {
          ...s.journey.task,
          status: "interrupted",
          error: "Request cancelled. Retry explicitly when ready.",
        },
      },
    });
  }
  private begin(stage: TaskStage): {
    binding: RequestBinding;
    signal: AbortSignal;
  } {
    this.stop();
    const s = this.session(),
      binding = newBinding(s, this.access.today());
    this.publish({
      ...s,
      journey: {
        ...s.journey,
        task: { binding, stage, status: "running", error: null },
      },
    });
    this.active = new AbortController();
    this.activeRequest = binding.requestId;
    this.pendingSignal = AbortSignal.any([
      this.active.signal,
      AbortSignal.timeout(journeyRequestTimeoutMs(stage)),
    ]);
    return { binding, signal: this.pendingSignal };
  }
  private current(binding: RequestBinding): Session {
    const s = this.session();
    if (
      this.activeRequest !== binding.requestId ||
      this.pendingSignal?.aborted ||
      !bindingCurrent(s, binding, this.access.today()) ||
      s.journey.task?.binding.requestId !== binding.requestId ||
      s.journey.task.status !== "running"
    )
      throw new Error(
        "The date, inputs, actions or accepted journey changed. The late result was not applied.",
      );
    return s;
  }
  private async wait<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(signal.reason ?? new Error("Request aborted"));
      signal.addEventListener("abort", rejectAbort, { once: true });
    });
    try {
      return await Promise.race([work, aborted]);
    } finally {
      signal.removeEventListener("abort", rejectAbort);
    }
  }
  private failure(b: RequestBinding, error: unknown): never {
    const s = this.access.read();
    if (
      s?.journey.task?.binding.requestId === b.requestId &&
      s.journey.task.status === "running"
    )
      this.publish({
        ...s,
        journey: {
          ...s.journey,
          task: {
            ...s.journey.task,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          },
        },
      });
    throw error;
  }
  /** A second executor over the root-owned candidate, never a second persistent store. */
  get replanningController(): JourneyController {
    if (!this.child)
      this.child = new JourneyController(
        {
          read: () => replanningSession(this.access.read()),
          today: () => this.access.today(),
          publish: (next) => {
            const root = this.session(),
              draft = assertReplanningSource(root);
            if (next.id !== draft.candidate.id)
              throw new Error(
                "This result belongs to a different new-plan draft.",
              );
            if (activeAcceptance(next)) {
              if (!this.promoting)
                throw new Error(
                  "Accept the new plan explicitly through the replanning command.",
                );
              this.publish({
                ...SessionCoreSchema.parse(next),
                forecastDisplay: root.forecastDisplay,
                replanning: null,
                archives: [
                  ...root.archives,
                  {
                    archivedOn: this.access.today(),
                    reason: "replanned",
                    session: SessionCoreSchema.parse(root),
                  },
                ],
              });
            } else
              this.publish({
                ...root,
                replanning: {
                  ...draft,
                  candidate: SessionCoreSchema.parse(next),
                },
              });
          },
        },
        this.ports,
      );
    return this.child;
  }
  async beginReplanning(): Promise<void> {
    this.cancel();
    this.publish(createReplanning(this.session(), this.access.today()));
  }
  async updateReplanningSetup(raw: InitializationInput): Promise<void> {
    assertReplanningSource(this.session());
    this.replanningController.updateSetup(raw);
    const root = this.session();
    this.publish({
      ...root,
      replanning: { ...assertReplanningSource(root), step: "setup" },
    });
  }
  private confirmReplanningDate() {
    const draft = assertReplanningSource(this.session());
    const candidate = draft.candidate;
    if (
      candidate.goal.requestedDate &&
      candidate.goal.requestedDate <= this.access.today()
    )
      throw new Error(
        "Choose a future goal date, or leave it blank for a calculated estimate.",
      );
    return draft;
  }
  async generateReplanning(): Promise<void> {
    const root = this.session();
    const draft = this.confirmReplanningDate();
    this.publish({
      ...root,
      replanning: { ...draft, step: "proposal" },
    });
    await this.replanningController.generate();
  }
  async acceptReplanning(): Promise<void> {
    this.confirmReplanningDate();
    this.promoting = true;
    try {
      await this.replanningController.accept();
    } finally {
      this.promoting = false;
    }
  }
  async retryReplanning(): Promise<void> {
    const draft = this.confirmReplanningDate();
    if (draft.candidate.journey.task?.stage === "accept")
      await this.acceptReplanning();
    else await this.replanningController.retry();
  }
  async cancelReplanning(): Promise<void> {
    this.child?.dispose();
    const root = this.session();
    if (root.replanning) this.publish({ ...root, replanning: null });
  }
  async start(raw: InitializationInput, isExample = false): Promise<void> {
    if (this.access.read())
      throw new Error(
        "Existing data is preserved; use a separate example session or explicitly clear before starting again.",
      );
    const input = InitializationInputSchema.parse(raw);
    assertPlanningEligibility(input.profile);
    this.publish(
      enableJourney(
        createSession(
          input.profile,
          input.goal,
          input.preferences,
          [],
          isExample,
        ),
      ),
    );
    await this.generate();
  }
  /** Explicitly adopt retained v4 facts without inventing a historical journey acceptance. */
  async adoptExisting(): Promise<void> {
    this.publish(enableJourney(this.session()));
    await this.generate();
  }
  updateSetup(raw: InitializationInput): void {
    const s = this.session(),
      input = InitializationInputSchema.parse(raw);
    assertPlanningEligibility(input.profile);
    this.stop();
    // An unaccepted setup has no dated plan history to preserve; its budget starts at the confirmed baseline.
    input.preferences.mealSchedules = [
      {
        ...input.preferences.mealSchedules.at(-1)!,
        effectiveFrom: input.profile.startDate,
      },
    ];
    if (s.targetRevisions.length || activeAcceptance(s))
      throw new Error(
        "Original accepted physiology and targets are preserved. Use a reviewed revision.",
      );
    const next = SessionSchema.parse({
      ...s,
      ...input,
      sourceRevision: s.sourceRevision + 1,
      initializationReview: null,
      journey: {
        ...s.journey,
        calculation: null,
        task: null,
        candidateDraftId: null,
        revisionRequest: null,
      },
    });
    buildCalculationRequest(next, newBinding(next, this.access.today()));
    this.publish(next);
  }
  async interpret(): Promise<boolean> {
    const t = this.begin("interpret");
    try {
      const response = StageResponseSchema.parse(
        await this.wait(
          this.ports.stage(
            buildStageRequest(this.session(), t.binding, "interpret"),
            t.signal,
          ),
          t.signal,
        ),
      );
      const s = this.current(t.binding);
      if (
        response.stage !== "interpret" ||
        JSON.stringify(response.binding) !== JSON.stringify(t.binding)
      )
        throw new Error("Interpretation response binding mismatch.");
      this.publish(receiveInterpretation(s, response.result));
      return !response.result.interpretation?.clarification;
    } catch (e) {
      return this.failure(t.binding, e);
    }
  }
  private async calculate(planning: boolean): Promise<CalculationResponse> {
    const t = this.begin("calculate");
    try {
      const request = buildCalculationRequest(
          this.session(),
          t.binding,
          planning,
        ),
        response = CalculationResponseSchema.parse(
          await this.wait(this.ports.calculate(request, t.signal), t.signal),
        );
      const s = this.current(t.binding);
      if (JSON.stringify(response.binding) !== JSON.stringify(t.binding))
        throw new Error("Calculation response binding mismatch.");
      this.publish(receiveCalculation(s, response, planning));
      return response;
    } catch (e) {
      return this.failure(t.binding, e);
    }
  }
  async generate(): Promise<void> {
    const s = this.session(),
      d = pendingDraft(s),
      feedback = s.journey.feedback.find((f) => f.draftId === d?.id);
    if (d && !feedback) {
      if (
        d.binding.sourceRevision === s.sourceRevision &&
        d.binding.actionsRevision === s.actionsRevision &&
        d.binding.startsOn === this.access.today()
      )
        throw new Error(
          "Review the existing draft instead of silently generating a replacement.",
        );
      this.publish({ ...s, journey: { ...s.journey, candidateDraftId: null } });
    }
    if (d && d.feedbackRevision >= MAX_FEEDBACK_REVISIONS)
      throw new Error(
        "The three feedback revisions are used. Edit setup or keep the saved draft; nothing is automatically accepted.",
      );
    if (!s.initializationReview && !(await this.interpret())) return;
    if (this.session().initializationReview?.interpretation?.clarification)
      throw new Error(
        "Resolve the initialization clarification before generating a plan.",
      );
    const calc = await this.calculate(true);
    if (
      !calc.snapshot.forecast ||
      ["paused", "needs_confirmation"].includes(calc.snapshot.decision.status)
    )
      return;
    const stage = pendingDraft(this.session()) ? "revise" : "generate",
      t = this.begin(stage);
    try {
      if (calc.snapshot.forecast.targetDate <= this.access.today())
        throw new Error(
          "The accepted date has elapsed. Propose and review a future date before generating a new journey.",
        );
      const response = StageResponseSchema.parse(
          await this.wait(
            this.ports.stage(
              buildStageRequest(this.session(), t.binding, stage),
              t.signal,
            ),
            t.signal,
          ),
        ),
        current = this.current(t.binding);
      if (
        response.stage !== stage ||
        JSON.stringify(response.binding) !== JSON.stringify(t.binding)
      )
        throw new Error("Journey response binding mismatch.");
      this.publish(receiveDraft(current, response.result, t.binding));
    } catch (e) {
      return this.failure(t.binding, e);
    }
  }
  async feedback(raw: JourneyFeedback): Promise<void> {
    this.stop();
    const s = this.session(),
      d = pendingDraft(s);
    this.publish(recordFeedback(s, raw, this.access.today()));
    if (d!.feedbackRevision < MAX_FEEDBACK_REVISIONS) await this.generate();
  }
  async proposeRevision(
    revision: JourneyFlow["revisionRequest"],
    feedback?: RevisionIntent,
  ): Promise<void> {
    this.stop();
    const s = this.session();
    if (!activeAcceptance(s))
      throw new Error("Accept the first journey before proposing a revision.");
    const intent = feedback ? RevisionIntentSchema.parse(feedback) : null;
    const availableTrainingMinutes =
      intent?.availableTrainingMinutes ??
      s.preferences.availableTrainingMinutes;
    // Proposed dates and guidance priorities belong to the pending workflow.
    // Only an actually changed, explicitly supplied capacity updates facts;
    // task/request identities still reject cancelled same-facts model replies.
    const factsChanged =
      availableTrainingMinutes !== s.preferences.availableTrainingMinutes;
    this.publish({
      ...s,
      sourceRevision: s.sourceRevision + Number(factsChanged),
      preferences: {
        ...s.preferences,
        availableTrainingMinutes,
      },
      journey: {
        ...s.journey,
        task: null,
        candidateDraftId: null,
        revisionIntent: intent,
        revisionRequest: revision,
        calculation: null,
      },
    });
    await this.generate();
  }
  /** Leave an unaccepted replacement while retaining its drafts, feedback and active acceptance. */
  async dismissProposal(): Promise<void> {
    this.stop();
    const s = this.session();
    if (!activeAcceptance(s))
      throw new Error("There is no accepted plan to return to.");
    this.publish({
      ...s,
      journey: {
        ...s.journey,
        candidateDraftId: null,
        task: null,
        calculation: null,
        revisionRequest: null,
        revisionIntent: null,
      },
    });
    await this.recalculate(false);
  }
  async accept(): Promise<void> {
    const s = this.session();
    if (!pendingDraft(s))
      throw new Error("There is no reviewed draft to accept.");
    const t = this.begin("accept");
    try {
      const checked = CalculationResponseSchema.parse(
          await this.wait(
            this.ports.calculate(
              buildCalculationRequest(this.session(), t.binding, true),
              t.signal,
            ),
            t.signal,
          ),
        ),
        current = this.current(t.binding);
      if (JSON.stringify(checked.binding) !== JSON.stringify(t.binding))
        throw new Error("Acceptance calculation binding mismatch.");
      this.publish(acceptDraft(current, checked, this.access.today()));
    } catch (e) {
      return this.failure(t.binding, e);
    }
  }
  async updateMeasurement(raw: MeasurementUpdate): Promise<void> {
    this.stop();
    const { session, numericalChanged } = saveMeasurement(
      this.session(),
      raw,
      this.access.today(),
    );
    this.publish(session); // publish/readback happens before even constructing a calculation request.
    if (numericalChanged) await this.recalculate(true);
    else if (
      session.snapshot?.decision.code === "scope" &&
      activeAcceptance(session)
    )
      await this.reviewProgress(true);
  }
  async recalculate(review = false): Promise<void> {
    await this.calculate(false);
    if (review) await this.reviewProgress();
  }
  async reviewProgress(
    manual = false,
  ): Promise<MeasurementReviewDecision | null> {
    let s = this.session();
    if (!activeAcceptance(s) || s.journey.task?.status === "running")
      return null;
    // Notes can invalidate the compact calculation without changing the stored
    // physiological forecast. Manual review still needs a current binding at
    // the model boundary; reuse the numerical command rather than bypass it.
    if (
      manual &&
      !reviewScopeConcern(s) &&
      (!s.journey.calculation ||
        !bindingCurrent(s, s.journey.calculation.binding, this.access.today()))
    ) {
      await this.calculate(false);
      s = this.session();
    }
    const accepted = activeAcceptance(s),
      f = s.snapshot?.forecast;
    if (!accepted) return null;
    if (s.journey.task?.status === "running") return null;
    const scope = reviewScopeConcern(s);
    const key =
      accepted.id + ":" + (f?.inputHash ?? "scope") + ":" + s.sourceRevision;
    if (s.journey.assessedKeys.includes(key) && !manual) return null;
    let comparison: StageRequest["comparison"] = null,
      decision: MeasurementReviewDecision | null = null;
    if (f && f.projectionDate > this.access.today()) {
      const preparation = newBinding(s, this.access.today());
      const end = f.projectionDate,
        reference = await alignForecast(accepted.reference, s.profile, end),
        last = s.journey.reviews.findLast(
          (r) => r.binding.acceptedJourneyId === accepted.id,
        ),
        prior = last
          ? await alignForecast(last.forecast, s.profile, end)
          : null;
      const summary = (v: typeof f) => {
        const p = v.modelResults[0].current.find((p) => p.date === end)!;
        return {
          inputHash: v.inputHash,
          comparisonDate: end,
          weightKg: p.weightKg,
          bodyFatPct: p.bodyFatPct,
          arrivalDate:
            v.modelResults[0].current.find((p) => pointMeetsGoal(p, s.goal))
              ?.date ?? null,
        };
      };
      const latest = this.session();
      if (
        !bindingCurrent(latest, preparation, this.access.today()) ||
        latest.journey.task?.status === "running" ||
        (latest.journey.assessedKeys.includes(key) && !manual)
      )
        return null;
      s = latest;
      decision = assessMeasurementReview({
        asOfDate: this.access.today(),
        hasChangedMeasurement: true,
        baselineWeightKg: s.profile.weightKg,
        reference: summary(reference),
        updated: summary(f),
        numericalDatesSinceAcceptance: s.logs
          .filter(
            (l) =>
              (l.weightKg !== null || l.bodyFat !== null) &&
              l.date >= accepted.acceptedOn,
          )
          .map((l) => l.date),
        bodyFatMethodChanged: hasMethodChange(
          s,
          last?.forecast ?? accepted.reference,
        ),
        scopeConcern: scope,
        pendingReview: false,
        previouslyAssessedHash: null,
        lastCoachDate: last?.binding.asOfDate ?? null,
        lastReviewedProjection: prior ? summary(prior) : null,
      });
      comparison = {
        date: end,
        reference: summary(reference),
        previous: prior ? summary(prior) : null,
        updated: summary(f),
        reasons: decision.reasons,
        evidence: decision.evidence,
      };
      this.publish({
        ...s,
        journey: {
          ...s.journey,
          assessments: [
            ...s.journey.assessments,
            {
              inputHash: f.inputHash,
              asOfDate: this.access.today(),
              eligible: decision.eligible,
              reasons: decision.reasons,
              suppression: decision.suppression,
              policyVersion: decision.policyVersion,
            },
          ],
        },
      });
      if (!manual && !decision.eligible) return decision;
    } else if (!scope) return null;
    const t = this.begin("review_progress");
    try {
      const request = buildStageRequest(
        this.session(),
        t.binding,
        "review_progress",
        comparison,
      );
      // Continuity includes earlier suggestions after new facts arrive. Suggestions
      // remain history even if dismissed; they are never completed actions.
      request.latestReview =
        s.journey.reviews.findLast(
          (r) => r.binding.acceptedJourneyId === accepted.id,
        )?.result ?? null;
      const includedDates = new Set(request.measurements.map((m) => m.date));
      request.sources.forecast = JSON.stringify({
        comparison,
        assumptions: this.session().snapshot?.forecast?.assumptions,
        decision: this.session().snapshot?.decision,
        // These are Hall's calculator-owned PRE-update residuals on the actual
        // observation dates, not differences between future endpoints.
        ...(f?.conditioning &&
        request.calculation?.forecastInputHash === f.inputHash
          ? {
              observations: {
                inputHash: f.inputHash,
                weight: f.weightErrors.filter((e) => includedDates.has(e.date)),
                bodyFat: f.bodyFatErrors.filter((e) =>
                  includedDates.has(e.date),
                ),
              },
            }
          : {}),
      });
      const response = StageResponseSchema.parse(
        await this.wait(this.ports.stage(request, t.signal), t.signal),
      );
      s = this.current(t.binding);
      if (
        response.stage !== "review_progress" ||
        JSON.stringify(response.binding) !== JSON.stringify(t.binding)
      )
        throw new Error("Progress review response binding mismatch.");
      const result = response.result,
        issues = numericalProseIssues(
          [
            result.summary,
            result.uncertainty,
            result.question ?? "",
            result.proposedChangeSummary ?? "",
            ...result.evidence.map((e) => e.reason),
          ].join("\n"),
        );
      if (
        issues.length ||
        result.evidence.some(
          (e) => !request.sources[e.sourceId]?.includes(e.quote),
        )
      )
        throw new Error(
          "Progress review must use exact source evidence and calculator-owned numbers.",
        );
      this.publish({
        ...s,
        // A current coach review does not revalidate the stored weekly/phase
        // plan against new notes. Retain its reviewed context until acceptance;
        // numeric-only updates already retain that key without promotion here.
        journey: {
          ...s.journey,
          task: null,
          assessedKeys: [...new Set([...s.journey.assessedKeys, key])],
          reviews: [
            ...s.journey.reviews,
            {
              binding: t.binding,
              forecast: f ?? accepted.reference,
              result,
              dismissed: false,
            },
          ],
        },
      });
      return decision;
    } catch (e) {
      return this.failure(t.binding, e);
    }
  }
  dismissReview(): void {
    const s = this.session();
    this.publish({
      ...s,
      journey: {
        ...s.journey,
        reviews: s.journey.reviews.map((r, i) =>
          i === s.journey.reviews.length - 1 ? { ...r, dismissed: true } : r,
        ),
      },
    });
  }
  async retry(): Promise<void> {
    const s = this.session(),
      stage = s.journey.task?.stage;
    this.stop();
    this.publish({ ...s, journey: { ...s.journey, task: null } });
    if (stage === "accept") return this.accept();
    if (stage === "review_progress") {
      await this.reviewProgress(true);
      return;
    }
    if (stage === "calculate" && activeAcceptance(s) && !pendingDraft(s))
      return this.recalculate(true);
    return this.generate();
  }
}
function reviewScopeConcern(s: Session): boolean {
  return (
    s.snapshot?.context.applicability !== "standard" ||
    s.snapshot.context.signals.some((v) => v.kind !== "low_feasibility")
  );
}
function hasMethodChange(
  s: Session,
  reference: NonNullable<Session["snapshot"]>["forecast"],
): boolean {
  const current =
    s.logs.filter((l) => l.bodyFat).at(-1)?.bodyFat?.method ??
    s.profile.bodyFat?.method;
  const prior =
    reference?.conditioning?.models
      .find((m) => m.id === "hall")
      ?.events.filter((e) => e.observedBodyFatPct !== null)
      .at(-1)?.method ?? s.profile.bodyFat?.method;
  return Boolean(current && prior && current !== prior);
}
