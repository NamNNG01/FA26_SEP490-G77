package com.examprep.diagram;

import java.util.Map;
import java.util.Set;

public class DiagramKinds {
    private static final Map<DiagramType, Set<String>> NODE_KINDS = Map.of(
        DiagramType.CLASS, Set.of("CLASS", "INTERFACE", "ENUM", "ABSTRACT_CLASS"),
        DiagramType.SEQUENCE, Set.of("ACTOR", "LIFELINE", "PARTICIPANT"),
        DiagramType.ACTIVITY, Set.of("INITIAL", "ACTION", "DECISION", "MERGE", "FORK", "JOIN", "FINAL"),
        DiagramType.USE_CASE, Set.of("ACTOR", "USE_CASE", "SYSTEM"),
        DiagramType.ENTITY, Set.of("ENTITY", "ATTRIBUTE", "RELATIONSHIP"),
        DiagramType.STATE, Set.of("INITIAL", "STATE", "CHOICE", "FINAL"),
        DiagramType.COMPONENT, Set.of("COMPONENT", "INTERFACE", "NODE", "ARTIFACT")
    );

    private static final Map<DiagramType, Set<String>> EDGE_KINDS = Map.of(
        DiagramType.CLASS, Set.of("ASSOCIATION", "INHERITANCE", "AGGREGATION", "COMPOSITION", "DEPENDENCY", "REALIZATION"),
        DiagramType.SEQUENCE, Set.of("SYNCHRONOUS_CALL", "ASYNCHRONOUS_CALL", "RETURN", "CREATE", "DESTROY"),
        DiagramType.ACTIVITY, Set.of("TRANSITION"),
        DiagramType.USE_CASE, Set.of("ASSOCIATION", "INCLUDE", "EXTEND", "GENERALIZATION"),
        DiagramType.ENTITY, Set.of("RELATION"),
        DiagramType.STATE, Set.of("TRANSITION"),
        DiagramType.COMPONENT, Set.of("DELEGATION", "ASSEMBLY", "DEPENDENCY")
    );

    public static boolean isValidNodeKind(DiagramType type, String kind) {
        Set<String> kinds = NODE_KINDS.get(type);
        return kinds != null && kind != null && kinds.contains(kind.toUpperCase());
    }

    public static boolean isValidEdgeKind(DiagramType type, String kind) {
        Set<String> kinds = EDGE_KINDS.get(type);
        return kinds != null && kind != null && kinds.contains(kind.toUpperCase());
    }
}
