package dev.nexus.api.search;

import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * v290 — a {@link Pageable} that skips an EXACT number of rows, in a given order.
 *
 * <p>Spring's own {@code PageRequest} cannot express an arbitrary skip: its offset is always
 * {@code pageNumber * pageSize}, so it can only ever skip a whole number of PAGES. That is fine for a
 * list numbered 1, 2, 3 and wrong for a window that says "the 25th row, and the 24 after it" — with a
 * page size of 24, {@code PageRequest.of(1, 24)} skips 24, and the next possible skip is 48. The row in
 * between is unreachable, and a search whose second page started at 48 would show the 25th result to
 * nobody.
 *
 * <p>So the search states the skip itself, and the ORDER with it: the window says which rows, and the
 * finder says in what order. A {@link Pageable} has several methods that must agree with each other, so
 * this is a class rather than a lambda.
 *
 * <p><b>Why this copy exists.</b> The publish package carries a window of the same shape, written by a
 * concurrent lane and not yet committed. Two copies of one idea is a wart, and this record says so rather
 * than hiding it: the search could not wait for a file another lane has not finished, and a search that
 * silently paged by whole pages would show a reader results that do not exist. When both copies are in
 * the tree they should be reconciled into one.
 */
final class SearchWindow implements Pageable {

    private final int offset;
    private final int size;
    private final Sort sort;

    SearchWindow(int offset, int size, Sort sort) {
        if (size <= 0) {
            throw new IllegalArgumentException("size must be a positive number, got " + size);
        }
        if (offset < 0) {
            throw new IllegalArgumentException("offset must not be negative, got " + offset);
        }
        this.offset = offset;
        this.size = size;
        this.sort = sort;
    }

    @Override
    public int getPageNumber() {
        // Derived, so the page number and the offset cannot disagree. A caller asking for the 25th row
        // with a size of 24 is on "page 1" — the page that CONTAINS it — and the offset says 25.
        return offset / size;
    }

    @Override
    public int getPageSize() {
        return size;
    }

    @Override
    public long getOffset() {
        return offset;
    }

    @Override
    public Sort getSort() {
        return sort;
    }

    @Override
    public Pageable next() {
        return new SearchWindow(offset + size, size, sort);
    }

    @Override
    public Pageable previousOrFirst() {
        return offset < size ? first() : new SearchWindow(offset - size, size, sort);
    }

    @Override
    public Pageable first() {
        return new SearchWindow(0, size, sort);
    }

    @Override
    public Pageable withPage(int pageNumber) {
        if (pageNumber < 0) {
            throw new IllegalArgumentException("page number must not be negative, got " + pageNumber);
        }
        return new SearchWindow(pageNumber * size, size, sort);
    }

    @Override
    public boolean hasPrevious() {
        return offset > 0;
    }

    @Override
    public String toString() {
        return "SearchWindow(offset=" + offset + ", size=" + size + ", sort=" + sort + ")";
    }
}
