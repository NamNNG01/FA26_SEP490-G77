package com.examprep.util.diagram;

import java.util.List;

public class DiagramGraphToDrawioConverter {

    public static String convert(DiagramGraph graph) {
        if (graph == null) return "<mxfile><diagram name=\"Page-1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/></root></mxGraphModel></diagram></mxfile>";

        StringBuilder sb = new StringBuilder();
        sb.append("<mxfile><diagram name=\"Page-1\"><mxGraphModel><root>");
        sb.append("<mxCell id=\"0\"/>");
        sb.append("<mxCell id=\"1\" parent=\"0\"/>");

        List<GraphNode> nodes = graph.nodes() != null ? graph.nodes() : List.of();
        List<GraphEdge> edges = graph.edges() != null ? graph.edges() : List.of();

        int cols = 4;
        int startX = 40;
        int startY = 40;
        int gapX = 180;
        int gapY = 120;

        for (int i = 0; i < nodes.size(); i++) {
            GraphNode node = nodes.get(i);
            int row = i / cols;
            int col = i % cols;
            int x = startX + col * gapX;
            int y = startY + row * gapY;
            int w = 120;
            int h = 60;

            String style = getNodeStyle(node.kind());
            String cellId = "n-" + escapeXml(node.id());
            String label = escapeXml(node.label());

            if ("CLASS".equalsIgnoreCase(node.kind()) || "ABSTRACT_CLASS".equalsIgnoreCase(node.kind()) || "ENTITY".equalsIgnoreCase(node.kind())) {
                h = 60 + (node.attributes() != null ? node.attributes().size() * 20 : 0);
                style = "swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentWeight=1;collapsible=1;targetPerimeterSpacing=0;";
            }

            sb.append("<mxCell id=\"").append(cellId).append("\" value=\"").append(label).append("\" style=\"").append(style).append("\" vertex=\"1\" parent=\"1\">");
            sb.append("<mxGeometry x=\"").append(x).append("\" y=\"").append(y).append("\" width=\"").append(w).append("\" height=\"").append(h).append("\" as=\"geometry\"/>");
            sb.append("</mxCell>");

            if (node.attributes() != null && !node.attributes().isEmpty()) {
                int attrY = 26;
                for (int a = 0; a < node.attributes().size(); a++) {
                    String attr = escapeXml(node.attributes().get(a));
                    String attrId = cellId + "-attr-" + a;
                    sb.append("<mxCell id=\"").append(attrId).append("\" value=\"").append(attr).append("\" style=\"text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;\" vertex=\"1\" parent=\"").append(cellId).append("\">");
                    sb.append("<mxGeometry y=\"").append(attrY).append("\" width=\"").append(w).append("\" height=\"20\" as=\"geometry\"/>");
                    sb.append("</mxCell>");
                    attrY += 20;
                }
            }
        }

        for (int i = 0; i < edges.size(); i++) {
            GraphEdge edge = edges.get(i);
            String edgeId = "e-" + escapeXml(edge.id());
            String source = "n-" + escapeXml(edge.from());
            String target = "n-" + escapeXml(edge.to());
            String style = getEdgeStyle(edge.kind());
            String label = edge.label() != null ? escapeXml(edge.label()) : "";

            sb.append("<mxCell id=\"").append(edgeId).append("\" value=\"").append(label).append("\" style=\"").append(style).append("\" edge=\"1\" source=\"").append(source).append("\" target=\"").append(target).append("\" parent=\"1\">");
            sb.append("<mxGeometry relative=\"1\" as=\"geometry\"/>");
            sb.append("</mxCell>");

            if (edge.fromMultiplicity() != null && !edge.fromMultiplicity().isBlank()) {
                String m1Id = edgeId + "-m1";
                String m1Val = escapeXml(edge.fromMultiplicity());
                sb.append("<mxCell id=\"").append(m1Id).append("\" value=\"").append(m1Val).append("\" style=\"resizable=0;html=1;align=left;verticalAlign=bottom;labelBackgroundColor=none;\" connectable=\"0\" vertex=\"1\" parent=\"").append(edgeId).append("\">");
                sb.append("<mxGeometry x=\"-1\" relative=\"1\" as=\"geometry\"><mxPoint as=\"offset\"/></mxGeometry>");
                sb.append("</mxCell>");
            }
            if (edge.toMultiplicity() != null && !edge.toMultiplicity().isBlank()) {
                String m2Id = edgeId + "-m2";
                String m2Val = escapeXml(edge.toMultiplicity());
                sb.append("<mxCell id=\"").append(m2Id).append("\" value=\"").append(m2Val).append("\" style=\"resizable=0;html=1;align=right;verticalAlign=bottom;labelBackgroundColor=none;\" connectable=\"0\" vertex=\"1\" parent=\"").append(edgeId).append("\">");
                sb.append("<mxGeometry x=\"1\" relative=\"1\" as=\"geometry\"><mxPoint as=\"offset\"/></mxGeometry>");
                sb.append("</mxCell>");
            }
        }

        sb.append("</root></mxGraphModel></diagram></mxfile>");
        return sb.toString();
    }

    private static String getNodeStyle(String kind) {
        if (kind == null || kind.isBlank()) {
            return "rounded=1;whiteSpace=wrap;html=1;";
        }

        return switch (kind.trim().toUpperCase(java.util.Locale.ROOT)) {
            // UML actors and use cases
            case "ACTOR" ->
                    "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;";
            case "USE_CASE" ->
                    "ellipse;whiteSpace=wrap;html=1;";
            case "SYSTEM" ->
                    "rounded=0;whiteSpace=wrap;html=1;dashed=1;";
            case "PACKAGE" ->
                    "shape=folder;tabWidth=40;tabHeight=14;html=1;";

            // Class and object diagrams
            case "CLASS", "ABSTRACT_CLASS", "ENTITY", "ENUM", "RECORD",
                 "OBJECT", "ANNOTATION", "PARTICIPANT", "LIFELINE",
                 "BOUNDARY", "CONTROL" ->
                    "swimlane;fontStyle=1;align=center;verticalAlign=top;"
                            + "horizontal=1;startSize=26;html=1;";

            case "INTERFACE" ->
                    "shape=umlInterface;whiteSpace=wrap;html=1;";

            // Activity and state diagrams
            case "DECISION", "CHOICE", "MERGE" ->
                    "rhombus;whiteSpace=wrap;html=1;";
            case "INITIAL" ->
                    "ellipse;aspect=fixed;fillColor=#000000;strokeColor=#000000;html=1;";
            case "FINAL" ->
                    "ellipse;shape=doubleEllipse;aspect=fixed;html=1;";
            case "FORK", "JOIN" ->
                    "rounded=0;fillColor=#000000;strokeColor=#000000;html=1;";
            case "STATE", "ACTION", "PROCESS", "ACTIVITY" ->
                    "rounded=1;whiteSpace=wrap;html=1;";

            // Infrastructure and components
            case "DATABASE" ->
                    "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;";
            case "COMPONENT" ->
                    "shape=component;whiteSpace=wrap;html=1;";
            case "NODE" ->
                    "shape=mxgraph.cisco19.misc.workstation;whiteSpace=wrap;html=1;";
            case "ARTIFACT" ->
                    "shape=note;whiteSpace=wrap;html=1;";
            case "PORT" ->
                    "rounded=0;whiteSpace=wrap;html=1;";

            // Safe fallback for new AI-generated kinds
            default ->
                    "rounded=1;whiteSpace=wrap;html=1;";
        };
    }

    private static String getEdgeStyle(String kind) {
        if (kind == null || kind.isBlank()) {
            return "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;";
        }

        return switch (kind.trim().toUpperCase(java.util.Locale.ROOT)) {
            case "INHERITANCE", "GENERALIZATION" ->
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;"
                            + "endArrow=block;endFill=0;endSize=12;";

            case "AGGREGATION" ->
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;"
                            + "startArrow=diamond;startFill=0;startSize=12;endArrow=none;";

            case "COMPOSITION" ->
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;"
                            + "startArrow=diamond;startFill=1;startSize=12;endArrow=none;";

            case "DEPENDENCY", "REALIZATION", "INCLUDE", "EXTEND",
                 "IMPLEMENTS", "USES", "USAGE" ->
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;"
                            + "endArrow=open;endSize=12;dashed=1;";

            case "MESSAGE", "SYNCHRONOUS_CALL", "RETURN", "REPLY" ->
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;";

            case "ASYNCHRONOUS_CALL", "SELF_MESSAGE", "FOUND_MESSAGE", "LOST_MESSAGE" ->
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=open;";

            case "CREATE" ->
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;dashed=1;";

            case "DESTROY" ->
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=ERone;";

            case "ASSOCIATION", "RELATION", "TRANSITION", "CONTROL_FLOW",
                 "OBJECT_FLOW", "ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_MANY" ->
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;";

            case "DELEGATION", "ASSEMBLY", "CONNECTOR", "INTERRUPT_FLOW" ->
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;";

            default ->
                // Kind mới vẫn được giữ lại và render bằng connector mặc định
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;";
        };
    }

    private static String escapeXml(String str) {
        if (str == null) return "";
        return str.replace("&", "&amp;")
                  .replace("<", "&lt;").replace(">", "&gt;")
                  .replace("\"", "&quot;").replace("'", "&apos;");
    }
}
