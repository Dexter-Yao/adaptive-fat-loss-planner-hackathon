// ABOUTME: Formats named instruction sections shared by business stages and the offline plan judge.
// ABOUTME: Stage owners supply all policy text; this formatter owns no context, tool, model or numerical rule.
export interface PromptSection {
  heading: string;
  body: string;
}

export function sectionedPrompt(sections: readonly PromptSection[]): string {
  const headings = new Set<string>();
  if (!sections.length) throw new Error("A prompt needs named sections.");
  return sections
    .map(({ heading, body }) => {
      const name = heading.trim();
      if (!name || /[\r\n]/.test(name) || headings.has(name) || !body.trim())
        throw new Error(
          "Prompt sections need unique headings and nonempty text.",
        );
      headings.add(name);
      return `## ${name}\n${body.trim()}`;
    })
    .join("\n\n");
}
