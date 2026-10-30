"use client";
// ABOUTME: Optional model comparison inside Plan; reads validated snapshots without running a model.
// ABOUTME: Comparison is descriptive, with unsupported composition and failed models kept explicit.
import { formatDate } from "@/application/selectors";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  DailyObservation,
  ForecastSnapshot,
  ProfileFacts,
} from "@/domain/contracts";
import { useState } from "react";
import { ForecastChart } from "./forecast-chart";
import { MODEL_LABELS } from "./labels";
import { Disclosure } from "./task-components";

export function ModelDetails({
  forecast,
  profile,
  logs,
}: {
  forecast: ForecastSnapshot;
  profile: ProfileFacts;
  logs: DailyObservation[];
}) {
  const [metric, setMetric] = useState<"weight" | "body_fat">("weight");
  return (
    <div className="model-detail-content">
      <p className="subtle">
        Three published models, the same inputs. Hall guides the plan; the
        others show how the model choice affects its outlook.
      </p>
      <Tabs value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
        <TabsList aria-label="Compare model measure">
          <TabsTrigger value="weight">Weight</TabsTrigger>
          <TabsTrigger value="body_fat">Body fat</TabsTrigger>
        </TabsList>
      </Tabs>
      <ForecastChart
        forecast={forecast}
        profile={profile}
        logs={logs}
        metric={metric}
        models={
          metric === "weight"
            ? ["hall", "thomas", "antonetti"]
            : ["hall", "thomas"]
        }
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Weight</TableHead>
            <TableHead>Body fat</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {forecast.modelResults.map((model) => {
            const point = model.current.at(-1);
            return (
              <TableRow key={model.id}>
                <TableHead>{MODEL_LABELS[model.id]}</TableHead>
                <TableCell>
                  {point ? `${point.weightKg.toFixed(1)} kg` : "Unavailable"}
                </TableCell>
                <TableCell>
                  {!model.composition
                    ? "Not supported"
                    : point?.bodyFatPct != null
                      ? `${point.bodyFatPct.toFixed(1)}%`
                      : "Unavailable"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="field-hint">
        At {formatDate(forecast.projectionDate)}. Model agreement does not prove
        accuracy. These are conditional estimates, not promises.
      </p>
      {forecast.modelResults.map((model) => (
        <Disclosure
          key={model.id}
          title={`${MODEL_LABELS[model.id]} · sources and calculation details`}
        >
          <p className="meta">
            {model.equationVersion} · {model.implementationVersion}
          </p>
          {model.error && <p role="note">{model.error}</p>}
          {model.diagnostics.map((message, i) => (
            <p key={i}>{message}</p>
          ))}
          <dl className="evidence-grid">
            {Object.entries(model.parameters).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>
                  {typeof value === "number" ? Number(value.toFixed(3)) : value}
                </dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="link" asChild>
          <a
            href="https://www.niddk.nih.gov/-/media/Files/Labs-Branches-Sections/laboratory-biological-modeling/integrative-physiology-section/Hall-Lancet-Web-Appendix_508.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Hall equations ↗
          </a>
        </Button>
        <Button variant="link" asChild>
          <a
            href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9114632/"
            target="_blank"
            rel="noreferrer"
          >
            Thomas reference ↗
          </a>
        </Button>
        <Button variant="link" asChild>
          <a
            href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9691568/"
            target="_blank"
            rel="noreferrer"
          >
            Antonetti equations ↗
          </a>
        </Button>
      </div>
    </div>
  );
}
