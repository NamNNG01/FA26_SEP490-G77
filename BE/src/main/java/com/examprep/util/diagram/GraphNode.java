package com.examprep.util.diagram;

import java.util.List;

public record GraphNode(
    String id,
    String label,
    String kind,
    List<String> attributes
) {}
