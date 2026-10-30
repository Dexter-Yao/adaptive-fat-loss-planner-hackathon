# Third-party notices

## INSP-RH/bw adult weight model

`src/planning/hall.ts` is derived from the adult C++ implementation in [INSP-RH/bw](https://github.com/INSP-RH/bw), commit `698ff71d037e778ac4fd8eb71039cbc941e2d758`. The package declares `MIT + file LICENSE`; the adult source files include the following license. The independent reference fixtures are outputs of that original implementation.

Copyright 2018 Instituto Nacional de Salud Pública de México

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Thomas / Pennington reference

`src/planning/models.ts` independently implements the equations in the author's 2018 public VBA reference linked from [the methodological letter](https://pmc.ncbi.nlm.nih.gov/articles/PMC9114632/). The reference document is used to identify version-specific RMR, Forbes, NEAT and adaptation behavior; VBA source is not embedded or redistributed. The downloadable document did not provide an explicit code-license header. Public availability is not labelled as a blanket commercial code license.

## Modified Antonetti equations

The 2022 analytic formulation is independently implemented from [the published paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC9691568/). No third-party program is bundled. Attribution identifies the formulation and separates application-level activity forcing. The article is not represented as a validation of this application.

## Activity references

Initial work/leisure mapping follows [NIDDK's Body Weight Planner classification](https://www.niddk.nih.gov/bwp/controllers/palDialogController.js) and [constants](https://www.niddk.nih.gov/bwp/constants/constants.js). The app does not claim NIDDK endorsement or exact replication of its website.

The seven representative exercise entries retain their published codes/MET values from the [2024 Adult Compendium of Physical Activities](https://pacompendium.com/). Its website explicitly permits commercial use with citation and asks users not to change MET values or combine different MET levels. Reference: Herrmann SD et al., _2024 Adult Compendium of Physical Activities: A third update of the energy costs of human activities_, Journal of Sport and Health Science 13(1), 6–12. Activity duration conversion and baseline-relative forcing are this application's assumptions, not changed Compendium MET values.

## Design format and dependencies

The [Google DESIGN.md format](https://github.com/google-labs-code/design.md) supplies the YAML/Markdown convention. This application's tokens generate the semantic shadcn theme.

Next.js, React, Zod, TypeScript, tsx, YAML, Prettier and transitive dependencies retain their distributed licenses. No upstream project endorses this prototype.

## shadcn/ui and visualization

The locally owned primitives under `src/components/ui/` were obtained from the official [shadcn registry](https://ui.shadcn.com/docs/components), style `radix-nova`, using shadcn 4.23.0. Application adaptations add ownership comments and use the shared touch-size/token policy. Source remains MIT-licensed. Copyright (c) 2023 shadcn. The full MIT permission and warranty text reproduced above applies to these source copies as well. [Upstream license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md).

Radix UI, Lucide React, Recharts, class-variance-authority, cn, Tailwind CSS, tw-animate-css and their dependencies retain their distributed notices. Lucide icons identify actions; the application does not claim they are custom brand artwork. Recharts draws the authoritative model projections and performs no physiological calculation.

## LangSmith tracing SDK

The server-only adapter uses official `langsmith` JavaScript SDK 0.11.4, distributed under MIT, with its dependency notices retained in the installed package. [Current SDK source](https://github.com/langchain-ai/langsmith-javascript). No LangChain agent framework, tracing account credentials, or hosted trace content is bundled in the application source.

## English date controls

The official shadcn Calendar and Popover reuse the shadcn license noted above. react-day-picker 10.0.2 and date-fns 4.4.0 are MIT-licensed dependencies; their distributed notices remain in the installed packages. Locale formatting changes presentation only, not the domain date or prediction policy.
