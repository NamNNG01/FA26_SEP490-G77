package com.examprep.util.diagram;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.helpers.DefaultHandler;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.Inflater;

/**
 * Reduces a draw.io file to what a grader needs: labelled shapes and the relations between them.
 * Colours, fonts and coordinates are dropped (SE-02 "chuẩn hóa DIAGRAM"); the only thing kept from the geometry is
 * the top-to-bottom order of connections, which is the message order of a sequence diagram.
 */
public final class DrawioNormalizer {
    private static final Set<String> RELATION_STYLE = Set.of("endArrow", "startArrow", "endFill", "startFill", "dashed");

    public record Result(String text, int elements) {}

    private DrawioNormalizer() {}

    /** @throws IllegalArgumentException when the text is not a readable draw.io diagram */
    public static Result normalize(String xml) {
        List<Element> models = new ArrayList<>();
        Element root = parse(xml).getDocumentElement();
        if ("mxGraphModel".equals(root.getNodeName())) {
            models.add(root);
        } else {
            for (Element diagram : children(root, "diagram")) {
                Element model = first(diagram, "mxGraphModel");
                if (model == null && !diagram.getTextContent().isBlank()) {
                    model = parse(inflate(diagram.getTextContent().strip())).getDocumentElement();
                }
                if (model != null) models.add(model);
            }
        }
        if (models.isEmpty()) throw new IllegalArgumentException("No diagram content");

        Map<String, String> labels = new HashMap<>();
        List<String[]> vertices = new ArrayList<>(); // id, label, shape, parent
        List<String[]> edges = new ArrayList<>();    // id, source, target, label, relation style
        Map<String, List<String>> edgeLabels = new HashMap<>();
        Set<String> edgeIds = new HashSet<>();
        for (Element model : models) {
            NodeList cells = model.getElementsByTagName("mxCell");
            Map<String, Element> byId = new HashMap<>();
            for (int i = 0; i < cells.getLength(); i++) {
                Element cell = (Element) cells.item(i);
                byId.put(id(cell), cell);
                if ("1".equals(cell.getAttribute("edge"))) edgeIds.add(id(cell));
            }
            List<String[]> pageEdges = new ArrayList<>();
            Map<String, Double> edgeY = new HashMap<>();
            for (int i = 0; i < cells.getLength(); i++) {
                Element cell = (Element) cells.item(i);
                String id = id(cell);
                String label = label(cell);
                Map<String, String> style = style(cell.getAttribute("style"));
                if ("1".equals(cell.getAttribute("edge"))) {
                    StringJoiner relation = new StringJoiner(", ");
                    style.forEach((k, v) -> { if (RELATION_STYLE.contains(k)) relation.add(k + "=" + v); });
                    pageEdges.add(new String[]{id, cell.getAttribute("source"), cell.getAttribute("target"), label, relation.toString()});
                    edgeY.put(id, edgeY(cell, byId));
                } else if ("1".equals(cell.getAttribute("vertex"))) {
                    String parent = cell.getAttribute("parent");
                    if (edgeIds.contains(parent)) {
                        if (!label.isEmpty()) edgeLabels.computeIfAbsent(parent, k -> new ArrayList<>()).add(label);
                        continue;
                    }
                    labels.put(id, label.isEmpty() ? "#" + id : label);
                    vertices.add(new String[]{id, label, style.getOrDefault("shape", style.getOrDefault("", "")), parent});
                }
            }
            pageEdges.sort(Comparator.comparingDouble(e -> edgeY.get(e[0]))); // stable: unpositioned keep file order
            edges.addAll(pageEdges);
        }

        StringBuilder text = new StringBuilder("Shapes:\n");
        for (String[] v : vertices) {
            text.append("- ").append(v[1].isEmpty() ? "(no label)" : v[1]);
            if (!v[2].isEmpty()) text.append(" [").append(v[2]).append(']');
            if (labels.containsKey(v[3])) text.append(" inside ").append(labels.get(v[3]));
            text.append('\n');
        }
        text.append("Connections (top to bottom):\n");
        int order = 0;
        for (String[] e : edges) {
            String label = String.join(" ", edgeLabels.getOrDefault(e[0], List.of()));
            if (!e[3].isEmpty()) label = label.isEmpty() ? e[3] : e[3] + " " + label;
            text.append(++order).append(". ").append(labels.getOrDefault(e[1], "(unconnected)"))
                    .append(" -> ").append(labels.getOrDefault(e[2], "(unconnected)"));
            if (!label.isEmpty()) text.append(" : ").append(label);
            if (!e[4].isEmpty()) text.append(" (").append(e[4]).append(')');
            text.append('\n');
        }
        return new Result(text.toString(), vertices.size() + edges.size());
    }

    /** Highest point of an edge: its own points, else the middle of its source (or target) shape. */
    private static double edgeY(Element edge, Map<String, Element> byId) {
        double top = Double.MAX_VALUE;
        NodeList points = edge.getElementsByTagName("mxPoint");
        for (int i = 0; i < points.getLength(); i++) {
            top = Math.min(top, number(((Element) points.item(i)).getAttribute("y")));
        }
        if (top != Double.MAX_VALUE) return top;
        for (String end : List.of(edge.getAttribute("source"), edge.getAttribute("target"))) {
            Element shape = byId.get(end);
            if (shape != null) return absoluteY(shape, byId, 0) + number(geometry(shape, "height")) / 2;
        }
        return Double.MAX_VALUE;
    }

    // Child shapes (e.g. activation bars on a lifeline) are positioned relative to their parent.
    private static double absoluteY(Element cell, Map<String, Element> byId, int depth) {
        Element parent = byId.get(cell.getAttribute("parent"));
        double y = number(geometry(cell, "y"));
        return parent == null || depth > 20 || !"1".equals(parent.getAttribute("vertex")) ? y : y + absoluteY(parent, byId, depth + 1);
    }

    private static String geometry(Element cell, String attribute) {
        Element geometry = first(cell, "mxGeometry");
        return geometry == null ? "" : geometry.getAttribute(attribute);
    }

    private static double number(String value) {
        try {
            return value.isBlank() ? 0 : Double.parseDouble(value);
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    // Cells with custom properties are wrapped: <UserObject id=".." label=".."><mxCell .../></UserObject>.
    private static String id(Element cell) {
        Node parent = cell.getParentNode();
        return cell.hasAttribute("id") || !(parent instanceof Element wrapper) ? cell.getAttribute("id") : wrapper.getAttribute("id");
    }

    private static String label(Element cell) {
        String value = cell.getAttribute("value");
        if (value.isEmpty() && cell.getParentNode() instanceof Element wrapper && wrapper.hasAttribute("label")) {
            value = wrapper.getAttribute("label");
        }
        // Labels may hold HTML; keep only the text.
        return value.replaceAll("(?i)<br\\s*/?>", " ").replaceAll("<[^>]*>", "")
                .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replaceAll("\\s+", " ").strip();
    }

    private static Map<String, String> style(String style) {
        Map<String, String> result = new LinkedHashMap<>();
        for (String part : style.split(";")) {
            if (part.isBlank()) continue;
            int eq = part.indexOf('=');
            if (eq < 0) result.putIfAbsent("", part.strip());
            else result.put(part.substring(0, eq).strip(), part.substring(eq + 1).strip());
        }
        return result;
    }

    // Compressed diagrams: base64 -> raw deflate -> URL-encoded XML.
    private static String inflate(String encoded) {
        try {
            Inflater inflater = new Inflater(true);
            inflater.setInput(Base64.getDecoder().decode(encoded));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            while (!inflater.finished()) {
                int n = inflater.inflate(buffer);
                if (n == 0 && (inflater.needsInput() || inflater.needsDictionary())) break;
                out.write(buffer, 0, n);
                if (out.size() > 5 * 1024 * 1024) throw new IllegalArgumentException("Diagram too large");
            }
            inflater.end();
            return URLDecoder.decode(out.toString(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Unreadable compressed diagram", ex);
        }
    }

    private static Document parse(String xml) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            builder.setErrorHandler(new DefaultHandler()); // no stderr noise; fatal errors still throw
            return builder.parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalArgumentException("Unreadable diagram XML", ex);
        }
    }

    private static List<Element> children(Element parent, String name) {
        List<Element> result = new ArrayList<>();
        for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && name.equals(e.getNodeName())) result.add(e);
        }
        return result;
    }

    private static Element first(Element parent, String name) {
        List<Element> found = children(parent, name);
        return found.isEmpty() ? null : found.get(0);
    }
}
