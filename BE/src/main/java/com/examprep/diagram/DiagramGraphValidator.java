package com.examprep.diagram;

import com.examprep.validation.ValidationError;
import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;

import java.util.*;

public class DiagramGraphValidator {

    private static final PolicyFactory SANITIZER = new HtmlPolicyBuilder()
            .allowElements("b", "i", "u", "strong", "em", "p", "br", "ul", "ol", "li", "span", "code", "pre", "sub", "sup")
            .allowAttributes("class").onElements("span", "code", "pre")
            .toFactory();

    public static List<ValidationError> validate(DiagramGraph graph, String pathPrefix) {
        List<ValidationError> errors = new ArrayList<>();
        String prefix = pathPrefix != null ? pathPrefix : "";

        if (graph == null) {
            errors.add(new ValidationError(prefix + "graph", "DiagramGraph cannot be null"));
            return errors;
        }

        DiagramType dt = null;
        try {
            if (graph.diagramType() == null || graph.diagramType().isBlank()) {
                errors.add(new ValidationError(prefix + "diagramType", "diagramType is required"));
            } else {
                dt = DiagramType.valueOf(graph.diagramType().toUpperCase());
            }
        } catch (IllegalArgumentException e) {
            errors.add(new ValidationError(prefix + "diagramType", "Invalid diagramType: " + graph.diagramType()));
            return errors;
        }

        List<GraphNode> nodes = graph.nodes();
        if (nodes == null || nodes.isEmpty() || nodes.size() > 50) {
            errors.add(new ValidationError(prefix + "nodes", "Nodes count must be between 1 and 50"));
            nodes = List.of();
        }

        List<GraphEdge> edges = graph.edges();
        if (edges == null) {
            edges = List.of();
        } else if (edges.size() > 100) {
            errors.add(new ValidationError(prefix + "edges", "Edges count cannot exceed 100"));
        }

        Set<String> nodeIds = new HashSet<>();
        Set<String> edgeIds = new HashSet<>();

        for (int i = 0; i < nodes.size(); i++) {
            GraphNode node = nodes.get(i);
            String nodePath = prefix + "nodes[" + i + "].";
            if (node == null) {
                errors.add(new ValidationError(nodePath + "node", "Node cannot be null"));
                continue;
            }

            String id = node.id();
            if (id == null || id.isBlank() || id.length() > 32) {
                errors.add(new ValidationError(nodePath + "id", "Node id is required and max 32 characters"));
            } else {
                if (!nodeIds.add(id)) {
                    errors.add(new ValidationError(nodePath + "id", "Duplicate node id: " + id));
                }
                if (edgeIds.contains(id)) {
                    errors.add(new ValidationError(nodePath + "id", "Node id conflicts with edge id: " + id));
                }
            }

            String label = node.label();
            if (label == null || label.trim().isEmpty() || label.length() > 200) {
                errors.add(new ValidationError(nodePath + "label", "Node label is required and max 200 characters"));
            } else {
                String sanitized = SANITIZER.sanitize(label);
                if (sanitized.toLowerCase().contains("javascript:") || sanitized.toLowerCase().contains("onclick")) {
                    errors.add(new ValidationError(nodePath + "label", "Node label contains forbidden constructs"));
                }
            }

            String kind = node.kind();

            if (kind == null || kind.isBlank() || kind.length() > 50) {
                errors.add(new ValidationError(
                        nodePath + "kind",
                        "Node kind is required and must not exceed 50 characters"
                ));
            }

            List<String> attrs = node.attributes();
            if (attrs != null) {
                if (attrs.size() > 30) {
                    errors.add(new ValidationError(nodePath + "attributes", "Attributes count cannot exceed 30"));
                }
                for (int j = 0; j < attrs.size(); j++) {
                    String attr = attrs.get(j);
                    if (attr == null || attr.length() > 200) {
                        errors.add(new ValidationError(nodePath + "attributes[" + j + "]", "Attribute max 200 characters"));
                    }
                }
            }
        }

        for (int i = 0; i < edges.size(); i++) {
            GraphEdge edge = edges.get(i);
            String edgePath = prefix + "edges[" + i + "].";
            if (edge == null) {
                errors.add(new ValidationError(edgePath + "edge", "Edge cannot be null"));
                continue;
            }

            String id = edge.id();
            if (id == null || id.isBlank() || id.length() > 32) {
                errors.add(new ValidationError(edgePath + "id", "Edge id is required and max 32 characters"));
            } else {
                if (!edgeIds.add(id)) {
                    errors.add(new ValidationError(edgePath + "id", "Duplicate edge id: " + id));
                }
                if (nodeIds.contains(id)) {
                    errors.add(new ValidationError(edgePath + "id", "Edge id conflicts with node id: " + id));
                }
            }

            String from = edge.from();
            if (from == null || !nodeIds.contains(from)) {
                errors.add(new ValidationError(edgePath + "from", "Edge 'from' must reference a valid node id"));
            }

            String to = edge.to();
            if (to == null || !nodeIds.contains(to)) {
                errors.add(new ValidationError(edgePath + "to", "Edge 'to' must reference a valid node id"));
            }

            String kind = edge.kind();

            if (kind == null || kind.isBlank() || kind.length() > 50) {
                errors.add(new ValidationError(
                        edgePath + "kind",
                        "Edge kind is required and must not exceed 50 characters"
                ));
            }

            String label = edge.label();
            if (label != null) {
                if (label.length() > 200) {
                    errors.add(new ValidationError(edgePath + "label", "Edge label max 200 characters"));
                } else {
                    String sanitized = SANITIZER.sanitize(label);
                    if (sanitized.toLowerCase().contains("javascript:") || sanitized.toLowerCase().contains("onclick")) {
                        errors.add(new ValidationError(edgePath + "label", "Edge label contains forbidden constructs"));
                    }
                }
            }
        }

        return errors;
    }
}
