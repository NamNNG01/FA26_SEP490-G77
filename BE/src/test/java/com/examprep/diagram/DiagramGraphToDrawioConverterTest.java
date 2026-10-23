package com.examprep.diagram;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class DiagramGraphToDrawioConverterTest {

    @Test
    void testDeterministicConversion() {
        GraphNode node1 = new GraphNode("n1", "Order & Co.", "CLASS", List.of("id: Long"));
        GraphNode node2 = new GraphNode("n2", "Line", "CLASS", List.of("qty: int"));
        GraphEdge edge = new GraphEdge("e1", "n1", "n2", "has <items>", "COMPOSITION", "1", "*");
        DiagramGraph graph = new DiagramGraph("CLASS", List.of(node1, node2), List.of(edge));

        String xml1 = DiagramGraphToDrawioConverter.convert(graph);
        String xml2 = DiagramGraphToDrawioConverter.convert(graph);

        assertEquals(xml1, xml2, "Conversion must be deterministic");
        assertTrue(xml1.contains("<mxfile>"));
        assertTrue(xml1.contains("Order &amp; Co."));
        assertTrue(xml1.contains("has &lt;items&gt;"));
        assertFalse(xml1.contains("DOCTYPE"));
        assertFalse(xml1.contains("ENTITY"));
    }
}
