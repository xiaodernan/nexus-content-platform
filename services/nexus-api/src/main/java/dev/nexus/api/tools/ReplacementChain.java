package dev.nexus.api.tools;

import java.util.List;

/**
 * M10 v622 - where a deprecation's replacement hints actually END, as the service computes it.
 *
 * <p>A step is one DECLARATION the walk reached. The first is the tool the caller asked about; each later one
 * is the declaration its predecessor's hint named. {@code outcome} is the chain's verdict, not a row's:
 * {@code live} (the last step is a declaration with no warning), {@code none} (the last warning names no
 * successor), {@code unresolved} (the hint names no declaration), {@code cycle} (the hint names a step already
 * walked, reported in {@code cycleTo}) or {@code depth} (the walk reached its bound with another hop pending).
 * {@code cycleTo} is null unless the outcome is a cycle.
 */
public record ReplacementChain(
        String toolId,
        String name,
        String outcome,
        String cycleTo,
        List<Step> steps) {

    /**
     * One declaration on the walk. {@code deprecated} says whether it carries a warning; {@code replacement}
     * is that warning's hint (null when it has none or no warning); {@code replacementStatus} is the SAME
     * derived vocabulary the warning list uses, and null for a live declaration - a tool with no warning has no
     * hint state to name.
     */
    public record Step(
            String toolId,
            String name,
            boolean deprecated,
            String replacement,
            String replacementStatus) {
    }
}