"use client";
// ABOUTME: Measurement and accepted-plan history from the shared Session; no independent history store.
import { selectAcceptedPlanHistory } from "@/application/journey-experience-view";
import { formatDate } from "@/application/selectors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil } from "lucide-react";
import { useShell } from "./app-shell";
import { useJourneyView } from "./journey-view";
import { ArchivedPlanHistory } from "./archived-plan-history";
import { Disclosure } from "./task-components";
import { CheckInReview } from "./check-in-review";
import { JourneyOverview } from "./journey-overview";
import { JourneyStatus } from "./journey-status";
export function RecordsScreen() {
  const { app, view } = useJourneyView(),
    shell = useShell(),
    s = app.session;
  if (!s) return null;
  const revisions = selectAcceptedPlanHistory(s, app.today);
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Your records</h1>
        </div>
      </div>
      {(app.journey.running || view?.phase === "recovery") &&
        !["calculate", "review_progress"].includes(
          s.journey.task?.stage ?? "",
        ) && <JourneyStatus />}
      <CheckInReview inRecords />
      <Card id="check-ins" className="measurement-history">
        <CardContent>
          <div className="section-title">
            <h2>Your check-ins</h2>
            <Button variant="ghost" onClick={() => shell.record()}>
              Add update
            </Button>
          </div>
          {!s.logs.length ? (
            <p className="subtle">
              Your starting point is saved. Add your first check-in when you are
              ready.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Body fat</TableHead>
                  <TableHead>
                    <span className="sr-only">Edit</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...s.logs].reverse().map((l) => (
                  <TableRow key={l.date}>
                    <TableCell>
                      <strong>{formatDate(l.date)}</strong>
                      {l.notes && <p className="measurement-note">{l.notes}</p>}
                    </TableCell>
                    <TableCell>
                      {l.weightKg != null ? `${l.weightKg} kg` : "—"}
                    </TableCell>
                    <TableCell>
                      {l.bodyFat ? `${l.bodyFat.percent}%` : "—"}
                      {l.bodyFat && (
                        <small className="block subtle">
                          {l.bodyFat.method.toUpperCase()}
                        </small>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit check-in on ${l.date}`}
                        onClick={() => shell.record(l.date)}
                      >
                        <Pencil aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <section id="accepted-plans" className="revision-history">
        <h2>Accepted plans</h2>
        {revisions.length === 0 ? (
          <p className="subtle">No plan has been accepted yet.</p>
        ) : (
          revisions.map((revision) => (
            <Disclosure
              key={revision.id}
              title={
                <>
                  {revision.isCurrent ? "Current plan · " : ""}
                  Version {revision.version} · Accepted{" "}
                  {formatDate(revision.acceptedOn)} ·{" "}
                  {revision.content?.headline ?? "Saved plan"}
                </>
              }
            >
              {revision.content && (
                <JourneyOverview content={revision.content} />
              )}
              <p className="subtle">
                Goal date: {formatDate(revision.targetDate)}
              </p>
              {revision.intent?.notes && (
                <p>
                  <strong>Feedback behind this version:</strong>{" "}
                  {revision.intent.notes}
                </p>
              )}
            </Disclosure>
          ))
        )}
      </section>
      <ArchivedPlanHistory session={s} />
    </>
  );
}
