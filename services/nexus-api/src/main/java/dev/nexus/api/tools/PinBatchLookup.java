package dev.nexus.api.tools;

import java.util.List;

/**
 * M10 v616 — a MANIFEST of pins answered in one read.
 *
 * <p>A consumer reconciling a lockfile holds many pins, and asking the registry once per pin would scan the
 * revision table once per pin. This answer comes from ONE pass: every requested pin is checked against the
 * rows the scan already produced, and the declarations behind the hits are loaded in one query.
 *
 * <p>{@code found} counts the PINS that resolved (not the declarations), so
 * {@code found + missing.size() == requested} is a property the caller can check even though one pin can name
 * several declarations. {@code missing} names the pins that resolved to nothing, in the order asked for; the
 * matches are ordered by (request order, NAME), which is the order a caller can zip with its manifest.
 */
record PinBatchLookup(int requested, int found, List<PinLookup.Match> matches, List<String> missing) {
}