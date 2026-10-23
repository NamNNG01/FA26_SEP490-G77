package com.examprep.diagram;

public record GraphEdge(
    String id,
    String from,
    String to,
    String label,
    String kind,
    String fromMultiplicity,
    String toMultiplicity
) {}
