
package com.examprep.util.diagram;

import java.util.Map;
import java.util.Set;

public class DiagramKinds {

    private static final Map<DiagramType, Set<String>> NODE_KINDS = Map.of(
            DiagramType.CLASS, Set.of(
                    "CLASS", "INTERFACE", "ENUM", "ABSTRACT_CLASS",
                    "ANNOTATION", "RECORD", "OBJECT", "PACKAGE"
            ),
            DiagramType.SEQUENCE, Set.of(
                    "ACTOR", "LIFELINE", "PARTICIPANT", "OBJECT",
                    "BOUNDARY", "CONTROL", "ENTITY", "DATABASE"
            ),
            DiagramType.ACTIVITY, Set.of(
                    "INITIAL", "ACTION", "DECISION", "MERGE",
                    "FORK", "JOIN", "FINAL", "ACTIVITY",
                    "OBJECT", "SWIMLANE", "INPUT", "OUTPUT"
            ),
            DiagramType.USE_CASE, Set.of(
                    "ACTOR", "USE_CASE", "SYSTEM", "PACKAGE",
                    "NOTE"
            ),
            DiagramType.ENTITY, Set.of(
                    "ENTITY", "ATTRIBUTE", "RELATIONSHIP",
                    "WEAK_ENTITY", "KEY_ATTRIBUTE"
            ),
            DiagramType.STATE, Set.of(
                    "INITIAL", "STATE", "CHOICE", "FINAL",
                    "COMPOSITE_STATE", "FORK", "JOIN",
                    "HISTORY", "TERMINATE"
            ),
            DiagramType.COMPONENT, Set.of(
                    "COMPONENT", "INTERFACE", "NODE",
                    "ARTIFACT", "PACKAGE", "PORT",
                    "DATABASE"
            )
    );

    private static final Map<DiagramType, Set<String>> EDGE_KINDS = Map.of(
            DiagramType.CLASS, Set.of(
                    "ASSOCIATION", "INHERITANCE", "AGGREGATION",
                    "COMPOSITION", "DEPENDENCY", "REALIZATION",
                    "GENERALIZATION", "IMPLEMENTS", "USES"
            ),
            DiagramType.SEQUENCE, Set.of(
                    "MESSAGE", "SYNCHRONOUS_CALL",
                    "ASYNCHRONOUS_CALL", "RETURN",
                    "CREATE", "DESTROY", "REPLY",
                    "SELF_MESSAGE", "FOUND_MESSAGE",
                    "LOST_MESSAGE"
            ),
            DiagramType.ACTIVITY, Set.of(
                    "TRANSITION", "CONTROL_FLOW",
                    "OBJECT_FLOW", "INTERRUPT_FLOW"
            ),
            DiagramType.USE_CASE, Set.of(
                    "ASSOCIATION", "INCLUDE", "EXTEND",
                    "GENERALIZATION", "DEPENDENCY"
            ),
            DiagramType.ENTITY, Set.of(
                    "RELATION", "ONE_TO_ONE", "ONE_TO_MANY",
                    "MANY_TO_MANY", "IDENTIFYING_RELATION"
            ),
            DiagramType.STATE, Set.of(
                    "TRANSITION", "INTERNAL_TRANSITION",
                    "COMPLETION_TRANSITION"
            ),
            DiagramType.COMPONENT, Set.of(
                    "DELEGATION", "ASSEMBLY", "DEPENDENCY",
                    "REALIZATION", "USAGE", "CONNECTOR"
            )
    );

    public static boolean isValidNodeKind(DiagramType type, String kind) {
        return type != null
                && kind != null
                && !kind.trim().isEmpty()
                && kind.trim().length() <= 50;
    }

    public static boolean isValidEdgeKind(DiagramType type, String kind) {
        return type != null
                && kind != null
                && !kind.trim().isEmpty()
                && kind.trim().length() <= 50;
    }
}
