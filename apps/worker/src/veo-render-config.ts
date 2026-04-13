/**
 * render_config_json for video_templates when render_provider = veo3.
 * Aligned with Gemini Veo 3.1 REST: instances[0].prompt, referenceImages, parameters.*
 */

export const DEFAULT_VEO_PROMPT_TEMPLATE = `{{projectTitle}}. Affiliate product showcase for "{{productTitle}}".
Product details: {{productDescription}}

Brand voice: {{brandName}}. Typography should feel like font family "{{fontFamily}}" with accent color {{primaryColor}}.
Cinematic product video, stable camera, soft studio lighting, clean background, professional motion, no custom watermark.`;

export type VeoReferenceImagesConfig = {
  /** default true for veo3 when building refs */
  enabled?: boolean;
  /** max 3 (Veo 3.1) */
  max?: number;
  includeBrandLogo?: boolean;
  /** when true, logo counts as first slot if present */
  brandLogoFirst?: boolean;
  /** order of product images from DB */
  productImageOrder?: "oldest" | "newest";
  /** if true and no reference bytes could be built, fail the job */
  require?: boolean;
};

export type VeoApiOverrides = {
  personGeneration?: string;
  resolution?: string;
  /** "4" | "6" | "8" — with reference images API requires "8" */
  durationSeconds?: string;
};

export type VeoRenderConfig = {
  promptTemplate?: string;
  referenceImages?: VeoReferenceImagesConfig;
  veo?: VeoApiOverrides;
};

export function parseVeoRenderConfig(raw: string | null | undefined): VeoRenderConfig {
  if (!raw?.trim()) {
    return {};
  }
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      return {};
    }
    return v as VeoRenderConfig;
  } catch {
    return {};
  }
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function interpolatePromptTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(PLACEHOLDER, (_, key: string) => vars[key] ?? "");
}

export type ReferenceImageInput = {
  absolutePath: string;
  mimeType: string;
};

/**
 * Pick up to `max` local image files for Veo referenceImages (product + optional brand logo).
 */
export function pickVeoReferenceImages(input: {
  config: VeoRenderConfig;
  productImages: ReferenceImageInput[];
  brandLogo: ReferenceImageInput | null;
}): ReferenceImageInput[] {
  const refCfg = input.config.referenceImages ?? {};
  const enabled = refCfg.enabled !== false;
  if (!enabled) {
    return [];
  }

  const max = Math.min(3, Math.max(1, refCfg.max ?? 3));
  const includeLogo = refCfg.includeBrandLogo !== false;
  const logoFirst = refCfg.brandLogoFirst !== false;

  let products = [...input.productImages];
  if (refCfg.productImageOrder === "newest") {
    products = products.reverse();
  }

  const logo = includeLogo && input.brandLogo ? input.brandLogo : null;
  const ordered: ReferenceImageInput[] = [];
  if (logoFirst && logo) {
    ordered.push(logo);
  }
  for (const p of products) {
    ordered.push(p);
  }
  if (!logoFirst && logo) {
    ordered.push(logo);
  }

  // De-dupe by path while preserving order
  const seen = new Set<string>();
  const unique: ReferenceImageInput[] = [];
  for (const item of ordered) {
    if (seen.has(item.absolutePath)) continue;
    seen.add(item.absolutePath);
    unique.push(item);
    if (unique.length >= max) break;
  }

  return unique.slice(0, max);
}
