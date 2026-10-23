package com.examprep.diagram;

import com.examprep.validation.ValidationError;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class DiagramGraphValidatorTest {

    @Test
    void testValidGraph() {
        GraphNode node1 = new GraphNode("n1", "Order", "CLASS", List.of("id: Long"));
        GraphNode node2 = new GraphNode("n2", "Line", "CLASS", List.of("qty: int"));
        GraphEdge edge = new GraphEdge("e1", "n1", "n2", "contains", "COMPOSITION", "1", "*");
        DiagramGraph graph = new DiagramGraph("CLASS", List.of(node1, node2), List.of(edge));

        List<ValidationError> errors = DiagramGraphValidator.validate(graph, "");
        assertTrue(errors.isEmpty(), "Expected no errors, got: " + errors);
    }

    @Test
    void testInvalidDiagramType() {
        DiagramGraph graph = new DiagramGraph("INVALID_TYPE", List.of(), List.of());
        List<ValidationError> errors = DiagramGraphValidator.validate(graph, "");
        assertFalse(errors.isEmpty());
        assertTrue(errors.stream().anyMatch(e -> e.getPath().equals("diagramType")));
    }

    @Test
    void testNodeCountBounds() {
        DiagramGraph graph0 = new DiagramGraph("CLASS", List.of(), List.of());
        assertFalse(DiagramGraphValidator.validate(graph0, "").isEmpty());
    }

    @Test
    void testDuplicateNodeId() {
        GraphNode node1 = new GraphNode("n1", "A", "CLASS", null);
        GraphNode node2 = new GraphNode("n1", "B", "CLASS", null);
        DiagramGraph graph = new DiagramGraph("CLASS", List.of(node1, node2), List.of());
        List<ValidationError> errors = DiagramGraphValidator.validate(graph, "");
        assertTrue(errors.stream().anyMatch(e -> e.getPath().contains("nodes[1].id")));
    }

    @Test
    void testInvalidEdgeReference() {
        GraphNode node1 = new GraphNode("n1", "A", "CLASS", null);
        GraphEdge edge = new GraphEdge("e1", "n1", "missing_node", "assoc", "ASSOCIATION", null, null);
        DiagramGraph graph = new DiagramGraph("CLASS", List.of(node1), List.of(edge));
        List<ValidationError> errors = DiagramGraphValidator.validate(graph, "");
        assertTrue(errors.stream().anyMatch(e -> e.getPath().equals("edges[0].to")));
    }
}
