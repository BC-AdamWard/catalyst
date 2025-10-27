# Phase 2: Full Search Results Page - Implementation Plan

**Goal**: Replace BigCommerce's `site.search.searchProducts` with Vertex AI Search API for the full search results page at `/search?term=...`

**Status**: ✅ COMPLETED
**Actual Time**: ~3 hours (including faceted search implementation)

## Implementation Summary

Phase 2 has been successfully completed with full faceted search support:

✅ **Core Search Functionality**
- Created `fetch-vertex-search.ts` data fetcher using Vertex AI Search API
- Integrated with search page using conditional logic based on feature flag
- Implemented pagination with Vertex's pageToken system
- Added sort option mapping (price asc/desc, title asc/desc, relevance)

✅ **Faceted Search**
- Implemented Vertex automatic facets (brands, categories, colors, price)
- Created `vertex-facets-transformer.ts` to transform Vertex facets to UI format
- Built filter support with `buildVertexFilter()` for multi-facet filtering
- Updated page.tsx to bypass BigCommerce transformer for Vertex facets

✅ **Files Created/Modified**
- `app/[locale]/(default)/(faceted)/fetch-vertex-search.ts` (new)
- `app/[locale]/(default)/(faceted)/vertex-facets-transformer.ts` (new)
- `app/[locale]/(default)/(faceted)/search/page.tsx` (modified)

---

## Overview

The full search results page currently uses BigCommerce's GraphQL search at:
- **File**: `core/app/[locale]/(default)/(faceted)/search/page.tsx`
- **Data Fetcher**: `fetch-faceted-search.ts`
- **GraphQL Query**: `GetProductSearchResultsQuery` → `site.search.searchProducts`

We'll create a Vertex AI alternative that:
1. Searches products via Vertex AI Search API
2. Fetches product details from BigCommerce by IDs
3. Maintains existing UI components (facets, pagination, filters)
4. Supports pagination with Vertex's `pageToken`
5. Falls back to BigCommerce search if disabled

---

## Current Architecture

### Data Flow (BigCommerce)
```
User → /search?term=desk
  → fetchFacetedSearch()
    → GetProductSearchResultsQuery (GraphQL)
      → site.search.searchProducts(filters: { searchTerm: "desk" })
        → Returns: products[], facets[], pageInfo
  → Transform products for UI
  → Render ProductsListSection
```

### Files Involved
1. **Page Component**: `app/[locale]/(default)/(faceted)/search/page.tsx`
   - Main search results page
   - Creates streamable data for products, filters, pagination

2. **Data Fetcher**: `app/[locale]/(default)/(faceted)/fetch-faceted-search.ts`
   - Queries BigCommerce `site.search.searchProducts`
   - Returns products, facets, pageInfo

3. **Transformers**:
   - `facetsTransformer()` - Convert BC facets to UI format
   - `pricesTransformer()` - Format product prices
   - `pageInfoTransformer()` - Convert BC pagination to UI format

---

## New Architecture (Vertex AI)

### Data Flow (Vertex AI)
```
User → /search?term=desk
  → isVertexRetailEnabled() ? vertexFacetedSearch() : fetchFacetedSearch()
    → Vertex Search API
      → search({ query: "desk", pageSize: 24, pageToken: ... })
        → Returns: searchResults[], fullResponse{ totalSize, nextPageToken }
    → Extract product IDs from results
    → getProductsByIds(ids)
      → BigCommerce GraphQL
        → Returns: full product details
    → Transform:
      - Products → UI format
      - Vertex pagination → UI pageInfo
      - Facets → UI filters (or skip for Phase 2)
  → Render ProductsListSection
```

---

## Implementation Steps

### Step 1: Create Vertex Search Data Fetcher
**File**: `core/app/[locale]/(default)/(faceted)/fetch-vertex-search.ts`

```typescript
import { cache } from 'react';
import { getSearchClient, getCatalogPath, getPlacement } from '~/lib/vertex-retail/client';
import { getProductsByIds } from '~/client/queries/get-products-by-ids';
import { CurrencyCode } from '~/components/header/fragment';

interface VertexSearchParams {
  term?: string;
  after?: string;  // pageToken for next page
  before?: string; // pageToken for prev page
  first?: number;  // page size
  sort?: string;   // sort option
}

export const fetchVertexSearch = cache(
  async (
    searchParams: VertexSearchParams,
    currencyCode?: CurrencyCode,
    customerAccessToken?: string,
  ) => {
    const searchClient = getSearchClient();
    const placement = getPlacement();
    const catalogPath = getCatalogPath();
    const branch = `${catalogPath}/branches/0`;

    if (!searchClient || !placement || !searchParams.term) {
      return {
        products: { items: [], pageInfo: {}, collectionInfo: { totalItems: 0 } },
        facets: { items: [] },
      };
    }

    // Call Vertex Search API
    const pageSize = searchParams.first || 24;
    const pageToken = searchParams.after || searchParams.before || undefined;

    const [searchResults, , fullResponse] = await searchClient.search(
      {
        placement,
        branch,
        query: searchParams.term,
        pageSize,
        pageToken,
        visitorId: 'catalyst-search', // TODO: unique visitor ID
        // TODO: Add orderBy for sort options
      },
      { autoPaginate: false },
    );

    // Extract product IDs
    const productIds = searchResults
      .map((result) => {
        const match = /product[-:/](\d+)/i.exec(result.id || '');
        return match ? Number(match[1]) : null;
      })
      .filter((id): id is number => id !== null);

    // Fetch products from BigCommerce
    const products = await getProductsByIds(productIds, currencyCode, customerAccessToken);

    // Transform to expected format
    return {
      products: {
        items: products,
        pageInfo: {
          hasNextPage: !!fullResponse.nextPageToken,
          hasPreviousPage: !!searchParams.after || !!searchParams.before,
          startCursor: null, // Vertex uses pageToken, not cursors
          endCursor: fullResponse.nextPageToken || null,
        },
        collectionInfo: {
          totalItems: fullResponse.totalSize || 0,
        },
      },
      facets: {
        items: [], // TODO: Phase 4 - implement facets
      },
    };
  },
);
```

### Step 2: Update Search Page to Use Vertex
**File**: `core/app/[locale]/(default)/(faceted)/search/page.tsx`

**Changes:**
```typescript
import { isVertexRetailEnabled } from '~/lib/vertex-retail/client';
import { fetchVertexSearch } from './fetch-vertex-search';

// In streamableFacetedSearch:
const search = isVertexRetailEnabled()
  ? await fetchVertexSearch(
      {
        ...searchParams,
        ...parsedSearchParams,
      },
      currencyCode,
      customerAccessToken,
    )
  : await fetchFacetedSearch(
      {
        ...searchParams,
        ...parsedSearchParams,
      },
      currencyCode,
      customerAccessToken,
    );
```

### Step 3: Handle Pagination
**Challenge**: Vertex uses `pageToken`, BigCommerce uses `before`/`after` cursors

**Solution**: Map Vertex pageToken to `after` parameter
```typescript
// In page.tsx pagination:
paginationInfo={{
  startCursorParamName: 'before',
  endCursorParamName: 'after',
  endCursor: search.products.pageInfo.endCursor, // Vertex's nextPageToken
  startCursor: null, // Vertex doesn't support backward pagination easily
}}
```

### Step 4: Handle Sorting
**Vertex orderBy Options:**
- `""`  (empty = relevance)
- `"price desc"`
- `"price asc"`
- `"title asc"`
- `"title desc"`

**Map from UI sort options:**
```typescript
function getVertexOrderBy(sort?: string): string {
  const sortMap: Record<string, string> = {
    'featured': '',
    'relevance': '',
    'lowest_price': 'price asc',
    'highest_price': 'price desc',
    'a_to_z': 'title asc',
    'z_to_a': 'title desc',
    // 'newest', 'best_selling', 'best_reviewed' not directly supported
  };
  return sortMap[sort || ''] || '';
}
```

### Step 5: Implement Vertex Automatic Facets ✅
**Implementation:**

1. **Request facets in search** - Added facetSpecs to search request:
```typescript
facetSpecs: [
  { facetKey: { key: 'brands' }, limit: 20 },
  { facetKey: { key: 'categories' }, limit: 20 },
  { facetKey: { key: 'colorFamilies' }, limit: 20 },
  { facetKey: { key: 'priceInfo.price' }, limit: 10, intervals: [...] },
]
```

2. **Transform Vertex facets to UI format** - Created `vertex-facets-transformer.ts`:
```typescript
export function transformVertexFacets(vertexFacets: VertexFacet[]): UIFacet[] {
  // Maps to toggle-group for brands, categories, colors
  // Maps to range for price with min/max
}
```

3. **Bypass BigCommerce transformer** - Updated page.tsx to return Vertex facets directly:
```typescript
if (isVertexRetailEnabled()) {
  const refinedSearch = await streamableFacetedSearch;
  return refinedSearch.facets.items; // Already transformed
}
```

### Step 6: Implement Filter Support ✅
**Implementation:**

1. **Added filter parameters** to VertexSearchParams interface:
```typescript
interface VertexSearchParams {
  brand?: string | string[];
  category?: string | string[];
  color?: string | string[];
  minPrice?: string;
  maxPrice?: string;
}
```

2. **Created filter builder** - `buildVertexFilter()` function:
```typescript
function buildVertexFilter(params: VertexSearchParams): string {
  // Converts UI parameters to Vertex filter syntax:
  // brands: ANY("Apple") AND colorFamilies: ANY("Red")
}
```

3. **Integrated filter** into search request:
```typescript
const filter = buildVertexFilter(searchParams);
await searchClient.search({
  // ...
  filter: filter || undefined,
});
```

---

## Testing Checklist

- [x] Search with term returns Vertex results
- [x] Pagination works (next page)
- [x] Empty search term shows no results
- [x] Sorting by price works
- [x] Sorting by relevance works
- [x] Product details display correctly
- [x] Feature flag toggle works (ENABLE_VERTEX_RETAIL_SEARCH)
- [x] Falls back to BC search when disabled
- [x] Performance: < 1 second for search
- [x] Logs show Vertex API calls
- [x] Facets render visually on search page
- [x] Brand filter works
- [x] Category filter works
- [x] Color filter works
- [x] Price range filter works
- [x] Multiple filters can be applied together

---

## Environment Variables

**No new variables needed!** Uses existing:
- `ENABLE_VERTEX_RETAIL_SEARCH=true`
- `GCP_PROJECT_ID`
- `VERTEX_RETAIL_LOCATION`
- `VERTEX_RETAIL_CATALOG`
- `VERTEX_RETAIL_PLACEMENT`

---

## Performance Considerations

**Expected Latency:**
- Vertex Search API: 50-400ms
- BigCommerce product fetch (24 products): 200-500ms
- **Total**: 250-900ms (vs ~300-600ms for BC native search)

**Optimizations:**
- Cache `fetchVertexSearch` with React `cache()`
- Use `pageSize` parameter to control result count
- Consider implementing Vertex `filter` for better relevance

---

## Risks & Mitigations

### Risk 1: Pagination Complexity
**Issue**: Vertex uses `pageToken`, BC uses `before`/`after` cursors
**Mitigation**: Map pageToken to `after`, disable backward pagination for now

### Risk 2: Sort Options Mismatch
**Issue**: Some BC sort options don't exist in Vertex (e.g., "best_selling")
**Mitigation**: Fall back to relevance for unsupported sorts, document in UI

### Risk 3: Facets Not Available
**Issue**: Vertex facets require different configuration
**Mitigation**: Use BC facets for Phase 2, implement Vertex facets in Phase 4

---

## Success Criteria

1. ✅ Search results page uses Vertex AI when enabled
2. ✅ Product results match quality of BC search
3. ✅ Pagination works for at least "next page"
4. ✅ Price sorting works correctly
5. ✅ Feature flag allows easy rollback
6. ✅ Performance is comparable to BC search
7. ✅ No breaking changes to existing UI
8. ✅ Faceted search with Vertex automatic facets
9. ✅ Filter support for brands, categories, colors, and price ranges

---

## Next Steps After Phase 2

**Phase 3**: Category/Brand PLPs with Browse API
**Phase 4**: Faceted search with Vertex facets
**Phase 5**: Conversational search

---

## Open Questions

1. **Visitor ID Strategy**: How to generate unique visitor IDs?
   - Option A: Generate on first visit, store in cookie
   - Option B: Use session ID
   - Option C: Hash IP address (privacy concerns)

2. **Backward Pagination**: Do we need it?
   - Vertex doesn't easily support going back
   - Most users only go forward
   - **Decision**: Skip for Phase 2

3. **Facets**: BC or Vertex?
   - **Decision**: Use BC facets for Phase 2, defer Vertex facets to Phase 4

4. **Empty Search**: Should we show recommendations?
   - Vertex supports recommendation API
   - Could show trending/popular products
   - **Decision**: Defer to Phase 5

---

## Estimated Timeline

1. **Create fetch-vertex-search.ts** - 30 minutes
2. **Update page.tsx with conditional logic** - 20 minutes
3. **Implement pagination mapping** - 30 minutes
4. **Implement sort mapping** - 20 minutes
5. **Handle facets (hybrid approach)** - 30 minutes
6. **Testing** - 30 minutes
7. **Documentation updates** - 20 minutes

**Total**: ~3 hours

---

## Ready to Start?

When you're ready to begin Phase 2, we'll:
1. Create `fetch-vertex-search.ts`
2. Update the search page component
3. Test with real searches
4. Update documentation
5. Commit changes

Let me know when you want to proceed!
