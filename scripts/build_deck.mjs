import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.PROJECT_ROOT || path.resolve(here, "..");
const requireFromProject = createRequire(import.meta.url);
const artifactToolEntry = process.env.ARTIFACT_TOOL_ENTRY
  ? path.resolve(process.env.ARTIFACT_TOOL_ENTRY)
  : requireFromProject.resolve("@oai/artifact-tool");
const { Presentation, PresentationFile } = await import(pathToFileURL(artifactToolEntry).href);

const OUT_DIR = path.join(ROOT, "outputs");
const WORKSPACE = path.join(os.tmpdir(), "codex-presentations", "aws-agent-registry-first-look-v3");
const TMP_DIR = path.join(WORKSPACE, "tmp");
const PREVIEW_DIR = path.join(TMP_DIR, "preview");
const LAYOUT_DIR = path.join(TMP_DIR, "layout");
const QA_DIR = path.join(TMP_DIR, "qa");
const FINAL_PPTX = path.join(OUT_DIR, "aws-agent-registry-first-look.pptx");

const W = 1280;
const H = 720;
const FONT = "Arial";
const MONO = "Courier New";

const C = {
  ink: "#151A1F",
  navy: "#161E2D",
  navy2: "#202A3A",
  muted: "#5D6875",
  line: "#D7DEE8",
  wash: "#F4F7FB",
  white: "#FFFFFF",
  aws: "#FF9900",
  teal: "#0F766E",
  tealLight: "#E6F5F2",
  blue: "#2563EB",
  blueLight: "#EAF1FF",
  green: "#15803D",
  greenLight: "#EAF7EE",
  amber: "#B45309",
  amberLight: "#FFF4DF",
  red: "#B91C1C",
  redLight: "#FDECEC",
  violet: "#6D28D9",
  violetLight: "#F1EBFF",
  grayLight: "#EEF1F4"
};

const sources = {
  overview: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry.html",
  launch: "https://aws.amazon.com/blogs/machine-learning/the-future-of-managing-agents-at-scale-aws-agent-registry-now-in-preview/",
  types: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-supported-record-types.html",
  lifecycle: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-record-lifecycle.html",
  search: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-search-records.html",
  mcp: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-mcp-endpoint.html",
  sample: "https://github.com/awslabs/agentcore-samples/tree/main/06-workshops/10-Agent-Registry"
};

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(OUT_DIR, { recursive: true }),
    fs.mkdir(PREVIEW_DIR, { recursive: true }),
    fs.mkdir(LAYOUT_DIR, { recursive: true }),
    fs.mkdir(QA_DIR, { recursive: true })
  ]);
}

function addShape(slide, geometry, { x, y, w, h, fill = C.white, line = fill, width = 1, radius = 0, name }) {
  const config = {
    geometry,
    name,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width }
  };
  if (["rect", "textbox", "roundRect"].includes(geometry)) config.borderRadius = radius;
  return slide.shapes.add(config);
}

function addBox(slide, opts) {
  return addShape(slide, "roundRect", { radius: 6, ...opts });
}

function addRule(slide, { x, y, w, h = 2, color = C.line }) {
  return addShape(slide, "rect", { x, y, w, h, fill: color, line: color, width: 0 });
}

function addNumberedCircle(slide, { x, y, diameter, number, fill, line, color, fontSize = 22, lineWidth = 2 }) {
  addShape(slide, "ellipse", { x, y, w: diameter, h: diameter, fill, line, width: lineWidth });
  addText(slide, String(number), {
    x,
    y,
    w: diameter,
    h: diameter,
    size: fontSize,
    color,
    bold: true,
    align: "center",
    valign: "center",
    lineSpacing: 1
  });
}

function addText(slide, text, { x, y, w, h, size = 20, color = C.ink, bold = false, align = "left", valign = "top", font = FONT, name, lineSpacing = 1.08 }) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    name,
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 }
  });
  shape.text = text;
  shape.text.style = {
    fontSize: size,
    color,
    bold,
    alignment: align,
    verticalAlignment: valign,
    typeface: font,
    lineSpacing,
    autoFit: "shrinkText"
  };
  return shape;
}

function addFooter(slide, n, source = "") {
  if (source) addText(slide, source, { x: 72, y: 682, w: 1000, h: 18, size: 9, color: C.muted });
  addText(slide, String(n).padStart(2, "0"), { x: 1160, y: 678, w: 48, h: 20, size: 11, color: C.muted, align: "right" });
}

function addTitle(slide, n, kicker, title, subtitle = "", source = "") {
  slide.background.fill = C.wash;
  addText(slide, kicker, { x: 72, y: 44, w: 480, h: 24, size: 12, color: C.aws, bold: true });
  addText(slide, title, { x: 72, y: 80, w: 1080, h: 58, size: 40, color: C.ink, bold: true, lineSpacing: 0.96 });
  if (subtitle) addText(slide, subtitle, { x: 74, y: 148, w: 980, h: 48, size: 19, color: C.muted, lineSpacing: 1.15 });
  addFooter(slide, n, source);
}

function setNotes(slide, lines) {
  slide.speakerNotes.textFrame.setText(lines.join("\n"));
  slide.speakerNotes.setVisible(true);
}

function termRow(slide, { x, y, w, term, definition, color }) {
  addRule(slide, { x, y: y + 2, w, h: 1, color: C.line });
  addText(slide, term, { x, y: y + 18, w: 168, h: 30, size: 23, color, bold: true });
  addText(slide, definition, { x: x + 184, y: y + 18, w: w - 184, h: 54, size: 17, color: C.muted, lineSpacing: 1.13 });
}

function codePanel(slide, code, { x, y, w, h, title }) {
  addBox(slide, { x, y, w, h, fill: C.navy, line: C.navy, radius: 6 });
  if (title) addText(slide, title, { x: x + 22, y: y + 18, w: w - 44, h: 24, size: 13, color: C.aws, bold: true, font: MONO });
  addText(slide, code, { x: x + 22, y: y + (title ? 54 : 24), w: w - 44, h: h - (title ? 72 : 42), size: 15, color: "#E7EEF7", font: MONO, lineSpacing: 1.16 });
}

function makeDeck() {
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });

  // 1. Title
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.navy;
    addText(slide, "AWS USER GROUP MIDWEST COMMUNITY DAY", { x: 72, y: 54, w: 620, h: 26, size: 13, color: C.aws, bold: true });
    addText(slide, "Agentic Sprawl\nto Enterprise Spool", { x: 72, y: 142, w: 690, h: 154, size: 56, color: C.white, bold: true, lineSpacing: 0.92 });
    addText(slide, "A first look at AWS Agent Registry", { x: 76, y: 330, w: 620, h: 38, size: 25, color: "#DCE5EF" });
    addText(slide, "Anil Yanamandra\nPrincipal Engineer - Applied AI\nAWS Community Builder", { x: 76, y: 548, w: 520, h: 78, size: 18, color: C.white, lineSpacing: 1.18 });

    addText(slide, "PREVIEW · APRIL 2026", { x: 848, y: 112, w: 300, h: 24, size: 13, color: C.aws, bold: true, align: "center" });
    addRule(slide, { x: 892, y: 178, w: 6, h: 320, color: C.aws });
    [
      ["DISCOVER", "Find approved resources by name or intent."],
      ["GOVERN", "Control what becomes discoverable."],
      ["REUSE", "Make vetted capabilities easier to find."]
    ].forEach(([head, body], i) => {
      const y = 174 + i * 118;
      addNumberedCircle(slide, { x: 869, y: y + 3, diameter: 52, number: i + 1, fill: C.navy2, line: C.aws, color: C.white, fontSize: 22 });
      addText(slide, head, { x: 946, y, w: 230, h: 28, size: 23, color: C.white, bold: true });
      addText(slide, body, { x: 946, y: y + 40, w: 230, h: 42, size: 16, color: "#B9C5D3" });
    });
    addFooter(slide, 1);
    setNotes(slide, [
      "Timing: 0:00-0:45.",
      "Open with the shift from building isolated agents to operating a discoverable, governed fleet.",
      "AWS Agent Registry was introduced in preview in April 2026.",
      `Sources: ${sources.overview} | ${sources.launch}`
    ]);
  }

  // 2. Speaker bio
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.navy;
    addText(slide, "SPEAKER", { x: 72, y: 48, w: 360, h: 24, size: 12, color: C.aws, bold: true });
    addText(slide, "Anil Yanamandra", { x: 72, y: 92, w: 720, h: 68, size: 48, color: C.white, bold: true });
    addText(slide, "Principal Engineer - Applied AI", { x: 74, y: 174, w: 660, h: 34, size: 25, color: "#DCE5EF", bold: true });
    addText(slide, "AWS Community Builder", { x: 74, y: 218, w: 560, h: 30, size: 21, color: C.aws, bold: true });
    addRule(slide, { x: 72, y: 286, w: 1136, h: 1, color: "#394553" });
    addText(slide,
      "Anil is a Principal Engineer focused on Applied AI with more than 18 years of experience building global, consumer-facing applications. He applies generative AI to transform legacy enterprise systems and bridges emerging research with production-ready engineering.",
      { x: 72, y: 330, w: 700, h: 158, size: 24, color: C.white, lineSpacing: 1.2 }
    );
    const highlights = [
      ["18+ YEARS", "Building global consumer applications"],
      ["APPLIED AI", "Modernizing enterprise processes with GenAI"],
      ["BUILDER MINDSET", "Turning research into production systems"]
    ];
    highlights.forEach(([head, body], i) => {
      const y = 322 + i * 104;
      addText(slide, head, { x: 846, y, w: 330, h: 26, size: 14, color: C.aws, bold: true });
      addText(slide, body, { x: 846, y: y + 34, w: 330, h: 52, size: 20, color: "#DCE5EF", bold: true, lineSpacing: 1.12 });
      if (i < highlights.length - 1) addRule(slide, { x: 846, y: y + 90, w: 330, h: 1, color: "#394553" });
    });
    addFooter(slide, 2);
  }

  // 3. Experiments to fleets
  {
    const slide = presentation.slides.add();
    addTitle(slide, 3, "MOTIVATION", "The problem changed", "The experiment question was capability. The enterprise question is trust and reuse.");
    addText(slide, "Can we build it?", { x: 96, y: 222, w: 430, h: 52, size: 34, color: C.teal, bold: true });
    addText(slide, "Can we find, trust, and reuse it?", { x: 628, y: 222, w: 560, h: 52, size: 34, color: C.aws, bold: true, align: "right" });
    addRule(slide, { x: 100, y: 332, w: 1080, h: 3, color: C.line });
    const stages = [
      ["1", "Prototype", "One team, one workflow"],
      ["2", "Adoption", "More teams wrap APIs"],
      ["3", "Fleet", "Agents, MCP servers, skills"],
      ["4", "Platform", "Discovery becomes shared infrastructure"]
    ];
    stages.forEach(([num, title, body], i) => {
      const x = 100 + i * 282;
      addNumberedCircle(slide, { x: x - 3, y: 306, diameter: 54, number: num, fill: i < 2 ? C.tealLight : C.amberLight, line: i < 2 ? C.teal : C.aws, color: i < 2 ? C.teal : C.amber, fontSize: 22 });
      addText(slide, title, { x, y: 384, w: 230, h: 32, size: 24, color: C.ink, bold: true });
      addText(slide, body, { x, y: 426, w: 230, h: 54, size: 17, color: C.muted });
    });
    addText(slide, "Once resources cross team boundaries, discoverability becomes architecture.", { x: 184, y: 558, w: 912, h: 38, size: 26, color: C.ink, bold: true, align: "center" });
    setNotes(slide, [
      "Timing: 0:45-2:10.",
      "Do not linger on agent hype. The point is that successful experimentation creates a fleet-level information problem.",
      "Transition: what does that problem look like operationally?"
    ]);
  }

  // 4. Sprawl
  {
    const slide = presentation.slides.add();
    addTitle(slide, 4, "SPRAWL CHALLENGE", "Agentic sprawl is an operating problem", "The failure mode is not a lack of ideas. It is a lack of governed visibility.");
    addText(slide, "SCATTERED RESOURCES", { x: 84, y: 224, w: 540, h: 26, size: 13, color: C.muted, bold: true, align: "center" });
    const nodes = [
      [100, 270, 204, "Support agent", C.blueLight, C.blue],
      [354, 252, 220, "Order MCP server", C.violetLight, C.violet],
      [158, 374, 194, "Refund tool", C.tealLight, C.teal],
      [398, 370, 194, "CRM skill", C.grayLight, C.muted],
      [96, 486, 222, "Invoice agent", C.amberLight, C.amber],
      [366, 492, 234, "PII redaction tool", C.redLight, C.red]
    ];
    nodes.forEach(([x, y, w, label, fill, line]) => {
      addBox(slide, { x, y, w, h: 64, fill, line, radius: 6 });
      addText(slide, label, { x: x + 16, y: y + 20, w: w - 32, h: 26, size: 18, color: C.ink, bold: true, align: "center" });
    });
    addText(slide, "No shared owner · status · search path", { x: 120, y: 586, w: 470, h: 24, size: 16, color: C.muted, align: "center" });

    [
      ["Visibility", "What exists, where is it hosted, and who owns it?", C.blue],
      ["Control", "Who can publish, curate, discover, and retire records?", C.aws],
      ["Reuse", "Can a team find the capability before rebuilding it?", C.teal]
    ].forEach(([head, body, color], i) => {
      const y = 248 + i * 124;
      addRule(slide, { x: 704, y, w: 8, h: 86, color });
      addText(slide, head, { x: 740, y: y - 2, w: 420, h: 34, size: 27, color: C.ink, bold: true });
      addText(slide, body, { x: 740, y: y + 42, w: 420, h: 44, size: 18, color: C.muted });
    });
    setNotes(slide, [
      "Timing: 2:10-3:45.",
      "Frame Shadow AI carefully: resources can be useful and still remain outside the governed discovery path.",
      "The three problems are visibility, control, and reuse.",
      `Source: ${sources.launch}`
    ]);
  }

  // 5. AWS Agent Registry
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.navy;
    addText(slide, "AWS AGENT REGISTRY · PREVIEW", { x: 72, y: 52, w: 540, h: 26, size: 13, color: C.aws, bold: true });
    addText(slide, "AWS Agent Registry: first look", { x: 72, y: 100, w: 980, h: 62, size: 44, color: C.white, bold: true });
    addText(slide, "A fully managed discovery service for organizing, curating, and discovering agentic resources across an organization.", { x: 74, y: 192, w: 1010, h: 86, size: 26, color: "#DCE5EF", lineSpacing: 1.18 });
    addRule(slide, { x: 72, y: 324, w: 1136, h: 1, color: "#394553" });
    [
      ["ORGANIZE", "Centralize structured metadata."],
      ["CURATE", "Approve what enters discovery."],
      ["SEARCH", "Match exact terms and intent."],
      ["ACCESS", "Use APIs, CLI, or MCP clients."]
    ].forEach(([head, body], i) => {
      const x = 72 + i * 284;
      if (i) addRule(slide, { x: x - 28, y: 362, w: 1, h: 176, color: "#394553" });
      addText(slide, head, { x, y: 366, w: 236, h: 32, size: 23, color: C.aws, bold: true });
      addText(slide, body, { x, y: 424, w: 230, h: 60, size: 18, color: "#C6D0DC" });
    });
    addText(slide, "It catalogs metadata. It does not deploy or execute agents.", { x: 206, y: 580, w: 868, h: 38, size: 25, color: C.white, bold: true, align: "center" });
    addFooter(slide, 5, "Sources: AWS Agent Registry developer guide; AWS launch blog, Apr 9 2026.");
    setNotes(slide, [
      "Timing: 3:45-5:15.",
      "Name the service only after the problem is clear.",
      "Be explicit about the boundary: this is managed discovery and curation of metadata, not runtime deployment.",
      `Sources: ${sources.overview} | ${sources.launch}`
    ]);
  }

  // 6. Architecture
  {
    const slide = presentation.slides.add();
    addTitle(slide, 6, "REGISTRY ARCHITECTURE", "Control plane in. Discovery surfaces out.", "Two core resources - registries and records - sit behind distinct management and discovery interfaces.", "Source: AWS Agent Registry developer guide.");
    addText(slide, "PUBLISHER + CURATOR", { x: 78, y: 230, w: 276, h: 24, size: 13, color: C.blue, bold: true, align: "center" });
    addText(slide, "CONTROL PLANE", { x: 414, y: 230, w: 332, h: 24, size: 13, color: C.aws, bold: true, align: "center" });
    addText(slide, "DISCOVERY", { x: 866, y: 230, w: 310, h: 24, size: 13, color: C.teal, bold: true, align: "center" });
    addRule(slide, { x: 318, y: 346, w: 102, h: 3, color: C.line });
    addRule(slide, { x: 318, y: 496, w: 102, h: 3, color: C.line });
    addRule(slide, { x: 816, y: 354, w: 90, h: 3, color: C.line });

    addBox(slide, { x: 86, y: 286, w: 232, h: 120, fill: C.blueLight, line: C.blue, radius: 6 });
    addText(slide, "Publisher", { x: 112, y: 308, w: 180, h: 28, size: 23, color: C.ink, bold: true, align: "center" });
    addText(slide, "Create · edit · submit", { x: 106, y: 354, w: 192, h: 24, size: 17, color: C.muted, align: "center" });
    addBox(slide, { x: 86, y: 436, w: 232, h: 120, fill: C.amberLight, line: C.aws, radius: 6 });
    addText(slide, "Curator", { x: 112, y: 458, w: 180, h: 28, size: 23, color: C.ink, bold: true, align: "center" });
    addText(slide, "Approve · reject · deprecate", { x: 96, y: 504, w: 212, h: 24, size: 16, color: C.muted, align: "center" });

    addBox(slide, { x: 420, y: 274, w: 390, h: 288, fill: C.navy, line: C.navy, radius: 6 });
    addText(slide, "bedrock-agentcore-control", { x: 458, y: 302, w: 314, h: 24, size: 15, color: C.aws, bold: true, font: MONO, align: "center" });
    addText(slide, "Registry", { x: 492, y: 354, w: 246, h: 40, size: 31, color: C.white, bold: true, align: "center" });
    ["MCP record", "A2A agent record", "Agent Skill record", "Custom record"].forEach((label, i) => {
      addBox(slide, { x: 492, y: 414 + i * 34, w: 246, h: 26, fill: i === 0 ? C.amberLight : C.navy2, line: i === 0 ? C.aws : "#394553", radius: 4 });
      addText(slide, label, { x: 506, y: 419 + i * 34, w: 218, h: 17, size: 13, color: i === 0 ? C.amber : "#DCE5EF", bold: true, align: "center" });
    });
    addText(slide, "Inbound authorization: IAM or JWT", { x: 470, y: 580, w: 290, h: 24, size: 15, color: C.muted, bold: true, align: "center" });

    addBox(slide, { x: 904, y: 284, w: 276, h: 122, fill: C.tealLight, line: C.teal, radius: 6 });
    addText(slide, "Search API", { x: 932, y: 310, w: 220, h: 30, size: 24, color: C.ink, bold: true, align: "center" });
    addText(slide, "bedrock-agentcore", { x: 932, y: 356, w: 220, h: 20, size: 14, color: C.teal, font: MONO, align: "center" });
    addBox(slide, { x: 904, y: 436, w: 276, h: 122, fill: C.violetLight, line: C.violet, radius: 6 });
    addText(slide, "Registry MCP endpoint", { x: 920, y: 462, w: 244, h: 30, size: 22, color: C.ink, bold: true, align: "center" });
    addText(slide, "search_registry_records", { x: 926, y: 510, w: 232, h: 20, size: 14, color: C.violet, font: MONO, align: "center" });
    setNotes(slide, [
      "Timing: 5:15-7:15.",
      "Keep the architecture at interaction-model level, not a service topology diagram.",
      "Control plane: bedrock-agentcore-control. Data plane search: bedrock-agentcore. Each registry also exposes an MCP endpoint.",
      `Source: ${sources.overview}`
    ]);
  }

  // 7. Terminology
  {
    const slide = presentation.slides.add();
    addTitle(slide, 7, "AWS TERMINOLOGY", "Six terms carry the model", "Use AWS's vocabulary so architecture, governance, and demo commands stay connected.", "Source: AWS Agent Registry developer guide.");
    termRow(slide, { x: 84, y: 216, w: 524, term: "Registry", definition: "Top-level catalog with authorization, approval settings, and records.", color: C.blue });
    termRow(slide, { x: 84, y: 326, w: 524, term: "Record", definition: "The governed metadata unit representing one agentic resource.", color: C.teal });
    termRow(slide, { x: 84, y: 436, w: 524, term: "Descriptor", definition: "Type-specific metadata validated against MCP, A2A, skill, or custom schemas.", color: C.violet });
    termRow(slide, { x: 664, y: 216, w: 532, term: "Publisher", definition: "Creates, edits, and submits records for approval.", color: C.blue });
    termRow(slide, { x: 664, y: 326, w: 532, term: "Curator", definition: "Approves, rejects, or deprecates records against organizational standards.", color: C.aws });
    termRow(slide, { x: 664, y: 436, w: 532, term: "Consumer", definition: "Searches approved records through the API, CLI, console, or MCP endpoint.", color: C.teal });
    addText(slide, "A record is metadata about a resource - not the running resource itself.", { x: 196, y: 586, w: 888, h: 34, size: 24, color: C.ink, bold: true, align: "center" });
    setNotes(slide, [
      "Timing: 7:15-8:45.",
      "These terms matter because the demo crosses publisher, curator, and consumer actions.",
      "Do not use repository language; Registry is a catalog of metadata records.",
      `Source: ${sources.overview}`
    ]);
  }

  // 8. Record model
  {
    const slide = presentation.slides.add();
    addTitle(slide, 8, "RECORD MODEL", "The record is the governed discovery unit", "Common metadata identifies the record; descriptors explain the underlying protocol and capabilities.", "Source: AWS supported record types.");
    addText(slide, "EVERY RECORD", { x: 86, y: 230, w: 318, h: 24, size: 13, color: C.muted, bold: true });
    ["name", "description", "recordVersion", "descriptorType", "descriptors"].forEach((field, i) => {
      addText(slide, field, { x: 102, y: 276 + i * 56, w: 256, h: 28, size: 23, color: i >= 3 ? C.aws : C.ink, bold: true, font: MONO });
      if (i < 4) addRule(slide, { x: 102, y: 316 + i * 56, w: 272, h: 1, color: C.line });
    });
    addRule(slide, { x: 420, y: 232, w: 2, h: 360, color: C.line });
    addText(slide, "DESCRIPTOR TYPES", { x: 466, y: 230, w: 650, h: 24, size: 13, color: C.muted, bold: true });
    const types = [
      ["MCP", "server + tools", C.aws, C.amberLight],
      ["A2A agent", "agent card", C.blue, C.blueLight],
      ["Agent Skills", "skill markdown + definition", C.violet, C.violetLight],
      ["Custom", "organization-defined JSON", C.teal, C.tealLight]
    ];
    types.forEach(([head, detail, color, fill], i) => {
      const y = 272 + i * 72;
      addBox(slide, { x: 466, y, w: 294, h: 56, fill, line: color, radius: 5 });
      addText(slide, head, { x: 484, y: y + 15, w: 118, h: 24, size: 19, color: C.ink, bold: true });
      addText(slide, detail, { x: 610, y: y + 16, w: 132, h: 22, size: 14, color, bold: true, align: "right" });
    });
    addBox(slide, { x: 796, y: 272, w: 390, h: 272, fill: C.navy, line: C.navy, radius: 6 });
    addText(slide, "DEMO RECORD", { x: 824, y: 294, w: 334, h: 22, size: 13, color: C.aws, bold: true, font: MONO });
    addText(slide, "descriptorType: MCP", { x: 824, y: 338, w: 334, h: 28, size: 20, color: C.white, font: MONO, bold: true });
    addText(slide, "descriptors\n  server\n    acme/code-review\n  tools\n    review_code", { x: 824, y: 384, w: 330, h: 136, size: 18, color: "#DCE5EF", font: MONO, lineSpacing: 1.18 });
    addText(slide, "The demo registers an MCP record containing a tool definition.", { x: 474, y: 582, w: 704, h: 32, size: 23, color: C.ink, bold: true, align: "center" });
    setNotes(slide, [
      "Timing: 8:45-10:30.",
      "This corrects the phrase 'register a tool': the CLI demo registers an MCP record whose descriptors include review_code.",
      "AWS validates MCP and A2A content against supported protocol schemas.",
      `Source: ${sources.types}`
    ]);
  }

  // 9. Lifecycle
  {
    const slide = presentation.slides.add();
    addTitle(slide, 9, "GOVERNANCE LIFECYCLE", "Approval is the discovery boundary", "Lifecycle state determines which record revision consumers can find.", "Source: AWS record lifecycle documentation.");
    const xPositions = [84, 300, 550, 826, 1060];
    addRule(slide, { x: 106, y: 346, w: 984, h: 4, color: C.line });
    const life = [
      ["CREATE", "CREATING", C.muted, C.grayLight],
      ["EDIT", "DRAFT", C.blue, C.blueLight],
      ["SUBMIT", "PENDING_APPROVAL", C.aws, C.amberLight],
      ["CURATE", "APPROVED", C.green, C.greenLight],
      ["RETIRE", "DEPRECATED", C.muted, C.grayLight]
    ];
    life.forEach(([verb, state, color, fill], i) => {
      const x = xPositions[i];
      addNumberedCircle(slide, { x: x - 4, y: 316, diameter: 64, number: i + 1, fill, line: color, color, fontSize: 24 });
      addText(slide, verb, { x: x - 24, y: 404, w: 104, h: 22, size: 12, color, bold: true, align: "center" });
      addText(slide, state, { x: x - 64, y: 442, w: 184, h: 28, size: state.length > 12 ? 17 : 21, color: C.ink, bold: true, align: "center", font: MONO });
    });
    addBox(slide, { x: 506, y: 514, w: 234, h: 72, fill: C.redLight, line: C.red, radius: 6 });
    addText(slide, "REJECTED", { x: 530, y: 528, w: 186, h: 24, size: 20, color: C.red, bold: true, align: "center", font: MONO });
    addText(slide, "Edit creates a new DRAFT", { x: 530, y: 558, w: 186, h: 18, size: 13, color: C.muted, align: "center" });
    addText(slide, "Search API + Registry MCP endpoint", { x: 106, y: 232, w: 420, h: 28, size: 20, color: C.teal, bold: true });
    addText(slide, "return approved revisions only", { x: 544, y: 232, w: 336, h: 28, size: 20, color: C.ink, bold: true });
    addText(slide, "Editing an approved record creates a new DRAFT while the approved revision remains searchable.", { x: 176, y: 622, w: 928, h: 28, size: 17, color: C.muted, align: "center" });
    setNotes(slide, [
      "Timing: 10:30-12:45.",
      "Create is transient; DRAFT is where publishers edit. Submission moves to PENDING_APPROVAL unless auto-approval is enabled.",
      "Curators approve or reject with a reason. DEPRECATED is terminal.",
      "The technically important rule: search and MCP expose approved revisions only.",
      `Source: ${sources.lifecycle}`
    ]);
  }

  // 10. Discovery
  {
    const slide = presentation.slides.add();
    addTitle(slide, 10, "DISCOVERY", "Hybrid relevance inside a governance boundary", "AWS combines keyword matching with semantic understanding, then filters results through approval state.", "Source: AWS search documentation.");
    addBox(slide, { x: 90, y: 240, w: 1100, h: 70, fill: C.white, line: C.line, radius: 6 });
    addText(slide, "SEARCH QUERY", { x: 118, y: 258, w: 150, h: 20, size: 12, color: C.muted, bold: true });
    addText(slide, "code review security scanning", { x: 292, y: 254, w: 572, h: 30, size: 24, color: C.blue, bold: true });
    addText(slide, "1-256 characters", { x: 952, y: 260, w: 200, h: 20, size: 14, color: C.muted, align: "right" });
    const columns = [
      ["1", "Hybrid relevance", "Keyword matching for every query. Longer natural-language queries also use semantic understanding.", C.blue],
      ["2", "Approved-only results", "DRAFT, PENDING_APPROVAL, REJECTED, and DEPRECATED records never appear in search.", C.green],
      ["3", "Operational reality", "Indexing is eventually consistent. Retry with backoff and verify current status with GetRegistryRecord.", C.aws]
    ];
    columns.forEach(([num, head, body, color], i) => {
      const x = 90 + i * 372;
      addText(slide, num, { x, y: 360, w: 42, h: 42, size: 30, color, bold: true });
      addText(slide, head, { x: x + 54, y: 362, w: 286, h: 34, size: 24, color: C.ink, bold: true });
      addText(slide, body, { x: x + 54, y: 420, w: 286, h: 108, size: 17, color: C.muted, lineSpacing: 1.18 });
      if (i < 2) addRule(slide, { x: x + 350, y: 350, w: 1, h: 194, color: C.line });
    });
    addBox(slide, { x: 124, y: 574, w: 1032, h: 54, fill: C.navy, line: C.navy, radius: 5 });
    addText(slide, "aws bedrock-agentcore search-registry-records --search-query \"code review security\"", { x: 150, y: 590, w: 980, h: 24, size: 17, color: "#E7EEF7", font: MONO, align: "center" });
    setNotes(slide, [
      "Timing: 12:45-14:30.",
      "Do not claim we implement semantic search; AWS provides it.",
      "Filters support name, descriptorType, and version. Search supports one registry per request in preview.",
      "Mention eventual consistency because the demo includes a retry loop.",
      `Source: ${sources.search}`
    ]);
  }

  // 11. MCP + IDE
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.navy;
    addText(slide, "MCP + IDE INTEGRATION", { x: 72, y: 46, w: 520, h: 24, size: 12, color: C.aws, bold: true });
    addText(slide, "The registry is itself an MCP server", { x: 72, y: 82, w: 980, h: 58, size: 40, color: C.white, bold: true });
    addText(slide, "Connect a compatible client to the remote endpoint and search governed records without leaving the development environment.", { x: 74, y: 150, w: 1000, h: 52, size: 19, color: "#B9C5D3" });
    codePanel(slide, `{
  "mcpServers": {
    "agent-registry": {
      "type": "http",
      "url": "<registry-mcp-endpoint>",
      "headers": {
        "Authorization":
          "Bearer \${ACCESS_TOKEN}"
      }
    }
  }
}`, { x: 74, y: 236, w: 520, h: 356, title: "KIRO MCP CONFIG · OAUTH/JWT" });
    addText(slide, "ONE MCP TOOL", { x: 686, y: 250, w: 430, h: 24, size: 13, color: C.aws, bold: true });
    addText(slide, "search_registry_records", { x: 686, y: 292, w: 480, h: 40, size: 29, color: C.white, font: MONO, bold: true });
    addText(slide, "searchQuery", { x: 686, y: 372, w: 190, h: 26, size: 20, color: C.tealLight, font: MONO, bold: true });
    addText(slide, "required natural-language query", { x: 898, y: 374, w: 274, h: 24, size: 17, color: "#B9C5D3" });
    addText(slide, "maxResults", { x: 686, y: 424, w: 190, h: 26, size: 20, color: C.tealLight, font: MONO, bold: true });
    addText(slide, "1-20, default 10", { x: 898, y: 426, w: 274, h: 24, size: 17, color: "#B9C5D3" });
    addText(slide, "filter", { x: 686, y: 476, w: 190, h: 26, size: 20, color: C.tealLight, font: MONO, bold: true });
    addText(slide, "name, descriptorType, version", { x: 898, y: 478, w: 274, h: 24, size: 17, color: "#B9C5D3" });
    addRule(slide, { x: 686, y: 540, w: 486, h: 1, color: "#394553" });
    addText(slide, "IAM-based IDE clients can connect through mcp-proxy-for-aws; OAuth/JWT clients can connect over HTTP.", { x: 686, y: 564, w: 486, h: 58, size: 17, color: "#DCE5EF" });
    addFooter(slide, 11, "Source: AWS Registry MCP endpoint documentation.");
    setNotes(slide, [
      "Timing: 14:30-16:15.",
      "This slide fulfills the MCP and IDE integration promise without turning the talk into an OAuth tutorial.",
      "Use Kiro because AWS provides an official configuration example. The endpoint exposes one tool: search_registry_records.",
      `Source: ${sources.mcp}`
    ]);
  }

  // 12. Demo
  {
    const slide = presentation.slides.add();
    addTitle(slide, 12, "ENGINEERING DEMO", "Register, govern, discover", "One MCP server record. Four AWS CLI operations. No runtime invocation.", "Sources: AWS getting-started guide; official AgentCore samples.");
    const steps = [
      ["1", "REGISTER", "create-registry-record", "DRAFT", C.blue],
      ["2", "SUBMIT", "submit-registry-record-for-approval", "PENDING_APPROVAL", C.aws],
      ["3", "APPROVE", "update-registry-record-status", "APPROVED", C.green],
      ["4", "DISCOVER", "search-registry-records", "APPROVED RESULT", C.teal]
    ];
    steps.forEach(([num, verb, command, state, color], i) => {
      const x = 72 + i * 290;
      addText(slide, num, { x, y: 246, w: 48, h: 48, size: 34, color, bold: true });
      addText(slide, verb, { x: x + 56, y: 254, w: 184, h: 30, size: 21, color: C.ink, bold: true });
      addRule(slide, { x, y: 314, w: 244, h: 2, color });
      addText(slide, command, { x, y: 344, w: 246, h: 64, size: 16, color: C.ink, font: MONO, bold: true, lineSpacing: 1.12 });
      addText(slide, state, { x, y: 438, w: 246, h: 30, size: state.length > 14 ? 15 : 18, color, font: MONO, bold: true });
    });
    addBox(slide, { x: 118, y: 524, w: 1044, h: 88, fill: C.white, line: C.line, radius: 6 });
    addText(slide, "Demo record", { x: 150, y: 546, w: 140, h: 24, size: 16, color: C.muted, bold: true });
    addText(slide, "acme_code_review_mcp", { x: 304, y: 544, w: 286, h: 26, size: 19, color: C.ink, font: MONO, bold: true });
    addText(slide, "contains", { x: 610, y: 546, w: 84, h: 24, size: 16, color: C.muted, align: "center" });
    addText(slide, "server metadata + review_code tool definition", { x: 716, y: 544, w: 410, h: 28, size: 18, color: C.teal, bold: true });
    addText(slide, "Switch to the prepared CLI notebook. Search retries account for eventual consistency.", { x: 198, y: 582, w: 884, h: 22, size: 15, color: C.muted, align: "center" });
    setNotes(slide, [
      "Timing: 16:15-20:45 including the notebook demo.",
      "Switch to demo/aws-agent-registry-cli-demo.ipynb.",
      "Narrate the control-plane service for create/submit/approve and the data-plane service for search.",
      "Do not say the MCP server is deployed or invoked. The demo is registration and discovery metadata.",
      `Sources: ${sources.overview} | ${sources.sample}`
    ]);
  }

  // 13. Takeaways
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.navy;
    addText(slide, "TAKEAWAYS", { x: 72, y: 48, w: 360, h: 24, size: 12, color: C.aws, bold: true });
    addText(slide, "Three things to remember", { x: 72, y: 86, w: 920, h: 56, size: 42, color: C.white, bold: true });
    [
      ["1", "Registry catalogs metadata", "It can index resources regardless of where they are built or hosted."],
      ["2", "Lifecycle governs discovery", "Approved revisions are the records exposed to search and MCP consumers."],
      ["3", "Discovery belongs in the workflow", "Use the CLI, API, console, or IDE before another team rebuilds the capability."]
    ].forEach(([num, head, body], i) => {
      const y = 194 + i * 116;
      addText(slide, num, { x: 84, y, w: 48, h: 44, size: 34, color: C.aws, bold: true });
      addText(slide, head, { x: 154, y: y + 2, w: 410, h: 34, size: 26, color: C.white, bold: true });
      addText(slide, body, { x: 594, y: y + 4, w: 580, h: 58, size: 18, color: "#B9C5D3" });
      if (i < 2) addRule(slide, { x: 154, y: y + 86, w: 1020, h: 1, color: "#394553" });
    });
    addBox(slide, { x: 72, y: 562, w: 1136, h: 76, fill: C.navy2, line: "#394553", radius: 5 });
    addText(slide, "Resources", { x: 98, y: 580, w: 120, h: 24, size: 15, color: C.aws, bold: true });
    addText(slide, "docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry.html", { x: 228, y: 578, w: 650, h: 24, size: 15, color: C.white, font: MONO });
    addText(slide, "github.com/awslabs/agentcore-samples", { x: 228, y: 606, w: 500, h: 20, size: 14, color: "#DCE5EF", font: MONO });
    addText(slide, "Start with one governed slice.", { x: 844, y: 586, w: 326, h: 28, size: 21, color: C.white, bold: true, align: "right" });
    addFooter(slide, 13);
    setNotes(slide, [
      "Timing: 20:45-21:45. Leave at least three minutes for buffer or Q&A.",
      "Close with the distinction between metadata governance and runtime deployment.",
      "Invite the audience to start with one domain and one record type, not an enterprise-wide inventory project.",
      `Sources: ${sources.overview} | ${sources.sample}`
    ]);
  }

  // 14. Appendix - CLI
  {
    const slide = presentation.slides.add();
    addTitle(slide, 14, "APPENDIX", "AWS CLI sequence", "The exact control-plane and data-plane operations used by the demo.", "Sources: AWS getting-started guide; official AgentCore samples.");
    codePanel(slide, `# Control plane
aws bedrock-agentcore-control create-registry-record ...
aws bedrock-agentcore-control \\
  submit-registry-record-for-approval ...
aws bedrock-agentcore-control \\
  update-registry-record-status \\
  --status APPROVED --status-reason "..."

# Data plane
aws bedrock-agentcore search-registry-records \\
  --search-query "code review security scanning" ...`, { x: 126, y: 222, w: 1028, h: 370, title: "DEMO CHEAT SHEET" });
    addText(slide, "Control-plane service: bedrock-agentcore-control    |    Data-plane service: bedrock-agentcore", { x: 140, y: 618, w: 1000, h: 24, size: 16, color: C.muted, bold: true, align: "center" });
    setNotes(slide, ["Appendix only. Use if someone asks for the command names or the control-plane/data-plane distinction."]);
  }

  // 15. Appendix - lifecycle edge cases
  {
    const slide = presentation.slides.add();
    addTitle(slide, 15, "APPENDIX", "Lifecycle edge cases worth knowing", "The first-look talk uses the main path; these behaviors matter during implementation.", "Source: AWS record lifecycle documentation.");
    const cases = [
      ["APPROVED + edit", "Creates a new DRAFT revision. The approved revision remains searchable."],
      ["PENDING + edit", "Creates a new DRAFT and discards the pending revision."],
      ["REJECTED + edit", "Returns to DRAFT and follows the normal approval path."],
      ["Any state + deprecate", "Moves to DEPRECATED, a terminal state that is not searchable."]
    ];
    cases.forEach(([head, body], i) => {
      const y = 222 + i * 100;
      addText(slide, head, { x: 120, y, w: 300, h: 32, size: 23, color: [C.green, C.aws, C.red, C.muted][i], bold: true, font: MONO });
      addText(slide, body, { x: 454, y: y + 2, w: 680, h: 50, size: 18, color: C.ink });
      addRule(slide, { x: 120, y: y + 70, w: 1014, h: 1, color: C.line });
    });
    addText(slide, "Get/List return the latest revision. Search/MCP return the approved revision.", { x: 192, y: 616, w: 896, h: 28, size: 21, color: C.ink, bold: true, align: "center" });
    setNotes(slide, ["Appendix only. Use for questions about editing approved records and dual-revision behavior.", `Source: ${sources.lifecycle}`]);
  }

  return presentation;
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

async function exportDeck(presentation) {
  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(path.join(PREVIEW_DIR, `${stem}.png`), await presentation.export({ slide, format: "png", scale: 1 }));
    await fs.writeFile(path.join(LAYOUT_DIR, `${stem}.layout.json`), await (await slide.export({ format: "layout" })).text());
  }
  await writeBlob(path.join(PREVIEW_DIR, "deck-montage.webp"), await presentation.export({ format: "webp", montage: true, scale: 1 }));
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(FINAL_PPTX);
  try {
    await fs.rename(`${FINAL_PPTX}.inspect.ndjson`, path.join(TMP_DIR, "final-pptx.inspect.ndjson"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function writePlanningArtifacts() {
  const sourceNotes = `Official sources\n\n${Object.entries(sources).map(([key, value]) => `${key}: ${value}`).join("\n")}\n\nAll diagrams are original editable PowerPoint shapes. No third-party diagrams are reused. The CLI demo metadata is derived from the official AWS AgentCore sample repository under Apache License 2.0.\n`;
  const qa = `Visual QA checklist\n\n- Render and inspect every slide at full size.\n- Confirm all main-slide titles remain on one line.\n- Confirm no text crosses shape boundaries.\n- Confirm no connector direction ambiguity.\n- Confirm code is readable at projector scale.\n- Confirm AWS claims match official documentation.\n`;
  await fs.writeFile(path.join(TMP_DIR, "source-notes.txt"), sourceNotes);
  await fs.writeFile(path.join(QA_DIR, "visual-qa.txt"), qa);
}

async function main() {
  await ensureDirs();
  await writePlanningArtifacts();
  const presentation = makeDeck();
  await exportDeck(presentation);
  const stat = await fs.stat(FINAL_PPTX);
  console.log(JSON.stringify({
    finalPptx: FINAL_PPTX,
    slides: presentation.slides.items.length,
    bytes: stat.size,
    previewDir: PREVIEW_DIR,
    layoutDir: LAYOUT_DIR,
    workspace: WORKSPACE
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
