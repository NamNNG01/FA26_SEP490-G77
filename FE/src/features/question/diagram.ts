/**
 * Helpers for DIAGRAM questions. The model answer is drawn in draw.io (embed
 * mode) and kept as draw.io XML in questionMetadata; AI drafts arrive as
 * PlantUML, which is loaded into draw.io as an editable PlantUML shape.
 */

export const DRAWIO_ORIGIN = 'https://embed.diagrams.net';

export const DRAWIO_EMBED_URL = `${DRAWIO_ORIGIN}/?embed=1&proto=json&spin=1&ui=atlas&libraries=1&noSaveBtn=1&saveAndExit=0&noExitBtn=1`;

const PLANTUML_SERVER = 'https://www.plantuml.com/plantuml';

/** PlantUML server's "~h" hex encoding — no deflate library needed. */
function plantUmlHex(source: string): string {
  return Array.from(new TextEncoder().encode(source), b => b.toString(16).padStart(2, '0')).join('');
}

/** Rendered SVG of a PlantUML source (stands in for the Q-10 preview until the backend ships it). */
export const plantUmlSvgUrl = (source: string) => `${PLANTUML_SERVER}/svg/~h${plantUmlHex(source)}`;

/**
 * Whether the PlantUML server can render the source. It answers 400 (with an
 * error image) on syntax errors. `null` = couldn't reach the server.
 */
export async function checkPlantUml(source: string, signal?: AbortSignal): Promise<boolean | null> {
  try {
    const res = await fetch(plantUmlSvgUrl(source), { signal });
    return res.ok;
  } catch {
    return null;
  }
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#xa;');

/**
 * A draw.io document holding one PlantUML shape. draw.io recognises the
 * `plantUmlData` attribute, so double-clicking the shape reopens its source.
 */
export function plantUmlToDrawioXml(source: string): string {
  const plantUmlData = JSON.stringify({ data: source, format: 'svg' });
  const style = `shape=image;noLabel=1;verticalAlign=top;aspect=fixed;imageAspect=1;image=${plantUmlSvgUrl(source)};`;
  return (
    '<mxfile><diagram name="Page-1"><mxGraphModel><root>' +
    '<mxCell id="0"/><mxCell id="1" parent="0"/>' +
    `<UserObject label="" plantUmlData="${escapeXml(plantUmlData)}" id="2">` +
    `<mxCell style="${escapeXml(style)}" vertex="1" parent="1"><mxGeometry x="40" y="40" width="480" height="360" as="geometry"/></mxCell>` +
    '</UserObject></root></mxGraphModel></diagram></mxfile>'
  );
}

/**
 * The PlantUML source when the diagram is just the single PlantUML shape
 * plantUmlToDrawioXml makes (AI drafts), so it can be rendered without draw.io.
 * '' for anything else, including diagrams that were edited further.
 */
export function plantUmlFromDrawioXml(xml: string): string {
  if (!xml.includes('plantUmlData')) return '';
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return '';
    const shapes = Array.from(doc.querySelectorAll('mxCell[vertex="1"]'));
    const objects = doc.querySelectorAll('[plantUmlData]');
    if (shapes.length !== 1 || objects.length !== 1) return '';
    const data = JSON.parse(objects[0].getAttribute('plantUmlData') ?? '');
    return typeof data?.data === 'string' ? data.data : '';
  } catch {
    return '';
  }
}

/**
 * draw.io exports SVG with `color-scheme: light dark`, so in a dark-themed app
 * the shapes turn dark on the white preview box. Pin a base64 SVG data URI to light.
 */
export function lightSvgDataUri(uri: string): string {
  const prefix = 'data:image/svg+xml;base64,';
  if (!uri.startsWith(prefix)) return uri;
  try {
    const bytes = Uint8Array.from(atob(uri.slice(prefix.length)), c => c.charCodeAt(0));
    const svg = new TextDecoder().decode(bytes).replace(/color-scheme:\s*light dark/g, 'color-scheme: light');
    return prefix + btoa(Array.from(new TextEncoder().encode(svg), b => String.fromCharCode(b)).join(''));
  } catch {
    return uri;
  }
}

/** True when the draw.io XML has at least one shape besides the two root cells. */
export function hasDiagramContent(xml: string): boolean {
  if (!xml.trim()) return false;
  // Compressed diagrams can't be inspected cheaply — trust them.
  if (!xml.includes('<mxGraphModel')) return true;
  return /<(mxCell|UserObject|object)\b[^>]*\bid="(?!0"|1")[^"]*"/.test(xml);
}
