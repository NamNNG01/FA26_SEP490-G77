package com.examprep.util.diagram;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = false)
public record DiagramGraph(
    String diagramType,
    List<GraphNode> nodes,
    List<GraphEdge> edges
) {}
