"use client";
// ABOUTME: Read-only archive view over the root-owned historical cores; archived records cannot become current observations.
import { selectReplanningHistory } from "@/application/replanning";
import type { Session } from "@/application/session";
import { formatDate } from "@/application/selectors";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Disclosure } from "./task-components";
import { JourneyOverview } from "./journey-overview";
export function ArchivedPlanHistory({ session }: { session: Session }) {
  const history = selectReplanningHistory(session);
  if (!history.length) return null;
  return (
    <section className="revision-history">
      <h2>Previous journeys</h2>
      <p className="subtle">
        Your earlier plans and measurements stay here after replanning.
      </p>
      {history.map((entry) => (
        <Disclosure
          key={entry.session.id}
          title={`Replaced ${formatDate(entry.archivedOn)} · ${entry.session.goal.kind === "weight" ? `${entry.session.goal.value} kg` : `${entry.session.goal.value}% body fat`}`}
        >
          <p>
            Starting report: {entry.session.profile.weightKg} kg ·{" "}
            {formatDate(entry.session.profile.startDate)}. These are historical
            facts.
          </p>
          {entry.session.profile.bodyFat && (
            <p>
              Starting body fat: {entry.session.profile.bodyFat.percent}% ·{" "}
              {entry.session.profile.bodyFat.method.toUpperCase()} ·{" "}
              {formatDate(entry.session.profile.startDate)}.
            </p>
          )}
          <h3>Measurements and notes</h3>
          {!entry.session.logs.length ? (
            <p>No later measurements were recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Body fat</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.session.logs.map((l) => (
                  <TableRow key={l.date}>
                    <TableCell>{formatDate(l.date)}</TableCell>
                    <TableCell>
                      {l.weightKg == null ? "—" : `${l.weightKg} kg`}
                    </TableCell>
                    <TableCell>
                      {l.bodyFat
                        ? `${l.bodyFat.percent}% · ${l.bodyFat.method.toUpperCase()}`
                        : "—"}
                    </TableCell>
                    <TableCell>{l.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <h3>Accepted plan versions</h3>
          {entry.revisions.map((r) => (
            <Disclosure
              key={r.id}
              title={`Accepted ${formatDate(r.acceptedOn)} · ${r.draft?.content.headline ?? "Saved plan"}`}
            >
              <p>Accepted goal date: {formatDate(r.reference.targetDate)}</p>
              {r.draft && <JourneyOverview content={r.draft.content} />}
              {r.draft?.revisionIntent?.notes && (
                <p>Feedback: {r.draft.revisionIntent.notes}</p>
              )}
            </Disclosure>
          ))}
          <Disclosure title="Saved numerical targets">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective date</TableHead>
                  <TableHead>Daily energy</TableHead>
                  <TableHead>Goal date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.session.targetRevisions.map((t) => (
                  <TableRow key={t.effectiveFrom}>
                    <TableCell>{formatDate(t.effectiveFrom)}</TableCell>
                    <TableCell>{t.dailyCalories} kcal</TableCell>
                    <TableCell>{formatDate(t.targetDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Disclosure>
        </Disclosure>
      ))}
    </section>
  );
}
