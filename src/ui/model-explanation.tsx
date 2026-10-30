"use client";
// ABOUTME: Shared user-facing model explanations, separating published mechanisms from this application's adaptations.
// ABOUTME: These descriptions do not run models, select comparisons or redefine planning authority.
import type { ForecastSelection } from "@/application/forecast-display";
import { ExplanationDialog } from "./explanation-dialog";
import { MODEL_LABELS } from "./labels";

const references = {
  hall: {
    label: "Hall et al. (2011) · model equations",
    href: "https://www.niddk.nih.gov/-/media/Files/Labs-Branches-Sections/laboratory-biological-modeling/integrative-physiology-section/Hall-Lancet-Web-Appendix_508.pdf",
  },
  thomas: {
    label: "Thomas et al. (2018) · author reference algorithm",
    href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9114632/",
  },
  antonetti: {
    label: "Gerving et al. (2022) · modified Antonetti model",
    href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9691568/",
  },
} as const;

const explanations: Record<ForecastSelection, readonly string[]> = {
  hall: [
    "Developed by Kevin Hall and colleagues at NIDDK, this dynamic energy-balance model underlies the NIH Body Weight Planner. It estimates how weight and body fat respond over time to a specified calorie intake and activity scenario. It updates energy expenditure as body composition changes, including modeled metabolic adaptation, glycogen and fluid dynamics.",
    "In this app, Hall supplies the calorie-plan checks and goal outlook. It starts from your profile and estimated baseline energy needs, then follows the accepted daily assumptions. Carbohydrate share is held at 50% and dietary sodium change at zero. Saved measurements update the ongoing model state under this app's observation policy; they do not reveal your actual intake or metabolism.",
    "Read the curve as a conditional trajectory. Population equations and estimated inputs cannot describe every person's biology. The application's measurement-update policy is separate from the published model and has not been clinically validated.",
  ],
  thomas: [
    "Developed by Diana Thomas and collaborators at Pennington, the PBRC Weight Loss Predictor is another dynamic energy-balance approach. This app follows the authors' released 2018 reference algorithm. It uses the Forbes relationship between fat and fat-free mass to estimate body composition and updates energy expenditure as weight and intake change.",
    "The implementation retains the reference's resting metabolic adaptation and activity initialization. It uses our shared estimated baseline energy expenditure, whereas the released reference requires measured total expenditure. Dated activity changes and measurement updates are application adaptations. The retained equations can produce a changing trajectory even with no prescribed calorie reduction; a difference from Hall does not identify its cause in your body.",
    "Use this model to see how a different set of assumptions changes the outlook. It supports weight and body-fat comparison here, but it does not set your calorie target or trigger plan changes. Agreement with another model does not establish personal accuracy.",
  ],
  antonetti: [
    "Originally proposed by Vincent Antonetti and modified in research by Gerving, Thomas and colleagues in 2022, this is a simpler dynamic energy-balance model. It predicts total weight from baseline weight, age, sex, height, energy needs and specified intake. The modified equation uses the Mifflin–St Jeor resting-energy relationship and a fixed effective energy density of 7,700 kcal per kilogram. Its solution describes how weight approaches a new energy balance.",
    "This app applies the formula one day at a time so dated intake and activity assumptions can change. A saved weight can update its weight state while the original coefficients remain fixed. These are application adaptations, separate from the published study; the app does not infer actual food intake from your scale readings.",
    "This model has no fat-mass or body-fat output, so it appears only in weight comparisons. Its simpler curve does not establish better personal accuracy. Hall remains the basis of the plan and goal outlook.",
  ],
  mean: [
    "Model mean is a descriptive chart summary created by this app, rather than a separate physiological model. On each shared date, it averages the applicable, successful models under the same scenario. Weight can include Hall, Thomas/Pennington and Modified Antonetti; body fat includes only models that calculate body composition. The number beside Mean shows the contributors.",
    "Every contributor has equal weight. A failed model is excluded; a date with a missing value from any contributing model stays a gap. With one available model, the mean equals that model. There is no fitting or automatic choice of the model closest to your measurements.",
    "The mean helps compare their shared direction with actual readings. It is not a confidence interval, a probability or evidence of improved accuracy: models can share incorrect assumptions. Selecting or saving it changes the chart only. Hall still governs plan checks and the goal outlook. The references below describe the contributing models, not a validation of this average.",
  ],
};

export function ModelExplanation({ model }: { model: ForecastSelection }) {
  const title = model === "mean" ? "Model mean" : MODEL_LABELS[model];
  const sources =
    model === "mean" ? Object.values(references) : [references[model]];
  return (
    <ExplanationDialog
      title={`About ${title}`}
      description="Background, prediction method and assumptions"
    >
      {explanations[model].map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p className="meta">Further reading</p>
      <ul>
        {sources.map((source) => (
          <li key={source.href}>
            <a href={source.href} target="_blank" rel="noreferrer">
              {source.label} ↗
            </a>
          </li>
        ))}
      </ul>
    </ExplanationDialog>
  );
}
