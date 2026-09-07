type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
};

type TemplateLike = {
  body?: unknown;
  headerType?: unknown;
  headerContent?: unknown;
  metaComponents?: unknown;
};

export type TemplateParameterValues = Record<string, string>;

export function getMetaComponents(template: TemplateLike): TemplateComponent[] {
  return Array.isArray(template.metaComponents)
    ? template.metaComponents.filter((component): component is TemplateComponent =>
        Boolean(component && typeof component === "object"),
      )
    : [];
}

function variableIndices(text: string): number[] {
  return [...new Set(
    [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])),
  )].sort((a, b) => a - b);
}

export function getTemplateStructure(template: TemplateLike) {
  const components = getMetaComponents(template);
  const metaBody = components.find((component) => String(component.type).toUpperCase() === "BODY");
  const metaHeader = components.find((component) => String(component.type).toUpperCase() === "HEADER");
  const bodyText = typeof metaBody?.text === "string"
    ? metaBody.text
    : String(template.body ?? "");
  const headerFormat = String(metaHeader?.format ?? template.headerType ?? "NONE").toUpperCase();
  const headerText = typeof metaHeader?.text === "string"
    ? metaHeader.text
    : String(template.headerContent ?? "");

  return {
    bodyText,
    bodyVariableIndices: variableIndices(bodyText),
    headerFormat,
    headerText,
    headerVariableIndices: variableIndices(headerText),
    requiresMediaHeader: ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat),
  };
}

export function validateTemplateParameters(
  template: TemplateLike,
  bodyValues: TemplateParameterValues,
  headerValues: TemplateParameterValues = {},
): string[] {
  const structure = getTemplateStructure(template);
  const missing: string[] = [];

  for (const index of structure.bodyVariableIndices) {
    if (!String(bodyValues[String(index)] ?? "").trim()) {
      missing.push(`body variable {{${index}}}`);
    }
  }

  for (const index of structure.headerVariableIndices) {
    if (!String(headerValues[String(index)] ?? "").trim()) {
      missing.push(`header variable {{${index}}}`);
    }
  }

  if (structure.requiresMediaHeader && !String(headerValues.media ?? "").trim()) {
    missing.push(`${structure.headerFormat.toLowerCase()} header media`);
  }

  return missing;
}

function resolveValue(value: string, contact: { name?: string; phone: string }) {
  return value
    .replace(/\{\{name\}\}/gi, contact.name ?? "")
    .replace(/\{\{phone\}\}/gi, contact.phone);
}

export function buildTemplateComponents(
  template: TemplateLike,
  bodyValues: TemplateParameterValues,
  headerValues: TemplateParameterValues,
  contact: { name?: string; phone: string },
) {
  const structure = getTemplateStructure(template);
  const components: Array<Record<string, unknown>> = [];

  if (structure.bodyVariableIndices.length > 0) {
    components.push({
      type: "body",
      parameters: structure.bodyVariableIndices.map((index) => ({
        type: "text",
        text: resolveValue(String(bodyValues[String(index)] ?? ""), contact),
      })),
    });
  }

  if (structure.headerVariableIndices.length > 0 && structure.headerFormat === "TEXT") {
    components.push({
      type: "header",
      parameters: structure.headerVariableIndices.map((index) => ({
        type: "text",
        text: resolveValue(String(headerValues[String(index)] ?? ""), contact),
      })),
    });
  } else if (structure.requiresMediaHeader) {
    const mediaValue = resolveValue(String(headerValues.media ?? ""), contact);
    const mediaType = structure.headerFormat.toLowerCase();
    const media = /^https?:\/\//i.test(mediaValue)
      ? { link: mediaValue }
      : { id: mediaValue };
    components.push({
      type: "header",
      parameters: [{ type: mediaType, [mediaType]: media }],
    });
  }

  return components;
}