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

/** True when the draw.io XML has at least one shape besides the two root cells. */
export function hasDiagramContent(xml: string): boolean {
  if (!xml.trim()) return false;
  // Compressed diagrams can't be inspected cheaply — trust them.
  if (!xml.includes('<mxGraphModel')) return true;
  return /<(mxCell|UserObject|object)\b[^>]*\bid="(?!0"|1")[^"]*"/.test(xml);
}
