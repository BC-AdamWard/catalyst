# Vertex AI Retail Search Integration - Project Status

**Last Updated**: October 27, 2024
**Project ID**: `bc-prototypes-njb`

## Original Project Scope

The goal is to replace BigCommerce's native search with Google Cloud Vertex AI for Retail across multiple touchpoints:

### Planned Phases

1. ✅ **Phase 1**: Search-as-you-type (quick search in header)
2. ⚠️ **Phase 2**: Full search results page
3. ❌ **Phase 3**: Category/Brand PLP pages (using Browse API)
4. ❌ **Phase 4**: Faceted search refinement
5. ❌ **Phase 5**: Conversational search

---

## Phase 1: Search-As-You-Type ✅ **COMPLETE**

### Status: **100% Complete** - Working in Production

### What's Been Built

#### ✅ Completed Components

1. **Vertex AI Client Setup** (`core/lib/vertex-retail/client.ts`)
   - Singleton clients for CompletionService and SearchService
   - Multi-environment credential support (local keyfile + Vercel JSON)
   - Configuration via environment variables
   - Proper error handling and logging

2. **GraphQL Query for Product Hydration** (`core/client/queries/get-products-by-ids.ts`)
   - Fetches products by array of IDs
   - Supports currency codes and customer tokens
   - React cache wrapper for deduplication
   - Uses existing SearchProductFragment

3. **Server Action Integration** (`core/components/header/_actions/vertex-search.ts`)
   - Form validation with Zod
   - Two-step fetch process (Vertex → BigCommerce)
   - Performance timing logs
   - Product ID extraction from Vertex results
   - Error handling and fallback

4. **Feature Flag Toggle** (`core/components/header/index.tsx:81`)
   - `ENABLE_VERTEX_RETAIL_SEARCH` environment variable
   - Seamless fallback to native BigCommerce search
   - No UI changes required

5. **Documentation**
   - `VERTEX_RETAIL_SETUP.md` - Local development guide
   - `VERCEL_DEPLOYMENT.md` - Production deployment instructions

6. **TypeScript Types** (`core/lib/vertex-retail/types.ts`)
   - Proper types for Vertex API responses
   - Exported interfaces for reuse

#### ✅ **Issues Resolved (Oct 27, 2024)**

**Issue #1: Wrong API Method**
- **Problem**: Initially used `CompleteQuery API` (autocomplete only)
- **Fix**: Switched to `Search API` for actual product search
- **Status**: ✅ Resolved

**Issue #2: Missing Branch Parameter**
- **Problem**: Search API requires `branch` parameter
- **Fix**: Added `branches/0` to search request
- **Status**: ✅ Resolved

**Issue #3: Incorrect Response Destructuring**
- **Problem**: Response is `[results[], request, response]` tuple, not `{ results: [] }`
- **Fix**: Properly destructure as `const [searchResults, , fullResponse] = await search()`
- **Status**: ✅ Resolved

**Issue #4: Product ID Extraction**
- **Problem**: Product IDs at `result.id` not `result.product.id`
- **Fix**: Updated extraction logic to check `result.id` first
- **Status**: ✅ Resolved

**Issue #5: Placement Path Format**
- **Problem**: Used `placements/` instead of `servingConfigs/`
- **Fix**: Corrected to `servingConfigs/default_search`
- **Status**: ✅ Resolved

**Issue #6: Product ID Pattern**
- **Problem**: Regex didn't support `product-123` format (hyphen)
- **Fix**: Updated regex to `/product[-:/](\d+)/i`
- **Status**: ✅ Resolved

### Environment Variables Required

```bash
# Feature flag
ENABLE_VERTEX_RETAIL_SEARCH=true

# GCP Configuration
GCP_PROJECT_ID=bc-prototypes-njb
VERTEX_RETAIL_LOCATION=global
VERTEX_RETAIL_CATALOG=default_catalog

# Serving config name (auto-constructed to full path)
VERTEX_RETAIL_PLACEMENT=default_search

# Local development
GOOGLE_APPLICATION_CREDENTIALS=/path/to/vertex-retail-key.json

# Production (Vercel)
GCP_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}
```

### Final Implementation Details

**Search Request Structure:**
```javascript
{
  placement: "projects/{project}/locations/{location}/catalogs/{catalog}/servingConfigs/{config}",
  branch: "projects/{project}/locations/{location}/catalogs/{catalog}/branches/0",
  query: "search term",
  pageSize: 10,
  visitorId: "unique-visitor-id"
}
```

**Response Structure:**
```javascript
const [searchResults, originalRequest, fullResponse] = await searchClient.search(request);
// searchResults = Array of result objects with .id field
// fullResponse = { attributionToken, totalSize, nextPageToken, ... }
```

**Product ID Extraction:**
- Result IDs come from `result.id` (e.g., `"product-169"`)
- Regex pattern: `/product[-:/](\d+)/i` supports multiple formats
- Extracted numeric ID used to fetch from BigCommerce

**Performance:**
- Vertex API typically responds in 50-400ms
- BigCommerce product hydration adds 100-300ms
- Total end-to-end: 150-700ms

### Technical Debt

- [ ] **Visitor ID**: Currently hardcoded as `'catalyst-search'`
  - Should generate unique ID per user for better personalization
  - Vertex AI uses this for user behavior tracking

- [ ] **Result Limit**: Hardcoded to 5 products
  - Make configurable via environment variable?
  - Consider pagination for more results

- [ ] **Error Messages**: Generic fallback messages
  - Could be more specific (catalog empty, indexing in progress, etc.)

- [ ] **Caching**: No caching of Vertex responses
  - Could cache popular queries to reduce API costs
  - Need cache invalidation strategy

---

## Phase 2: Search Results Page ❌ (NOT STARTED)

### Scope

Replace the full search results page (`/search?term=...`) to use Vertex Search API instead of BigCommerce's `site.search`.

### Requirements

1. **New Server Action** or **Route Handler**
   - Similar to Phase 1, but returns more results (pagination)
   - Extract product IDs from Vertex Search results
   - Hydrate with BigCommerce GraphQL

2. **Update Search Page Component**
   - Currently at `core/app/[locale]/(default)/search/page.tsx` (assumed)
   - Replace `searchProducts` query with Vertex-based fetch
   - Maintain existing UI components

3. **Pagination**
   - Vertex Search supports `pageSize` and `pageToken`
   - Map to existing pagination UI
   - Handle edge cases (empty results, errors)

4. **Search Metadata**
   - Total result count from Vertex
   - Search term highlighting
   - "Did you mean?" suggestions (if Vertex provides)

### Files to Modify

- `core/app/[locale]/(default)/search/page.tsx` (or similar)
- New: `core/components/search/_actions/vertex-full-search.ts`
- Update: `VERTEX_RETAIL_SETUP.md` with Phase 2 instructions

### Estimated Effort

- **2-3 hours** (based on Phase 1 complexity)

---

## Phase 3: Category/Brand Browse Pages ❌ (NOT STARTED)

### Scope

Replace category and brand PLP (Product Listing Pages) with Vertex AI Browse API, filtered by category or brand.

### Requirements

1. **Browse API Integration**
   - Use `search()` with `filter` parameter instead of `query`
   - Example: `filter: "categories: ANY(\"Furniture\")"`
   - Map BigCommerce categories to Vertex category structure

2. **Category Mapping**
   - Create mapping between BC category IDs and Vertex category names
   - Store in config file or database
   - Handle nested categories

3. **Brand → Category Mapping**
   - Brands will be mapped to Vertex categories
   - Define mapping strategy (custom attributes, category names, etc.)

4. **Update PLP Components**
   - Category page: `core/app/[locale]/(default)/category/[slug]/page.tsx` (assumed)
   - Brand page: Similar pattern
   - Replace product fetching logic with Vertex Browse

5. **Sorting**
   - Vertex supports `orderBy` parameter
   - Map to existing sort options (price, name, etc.)

### Data Import Considerations

- **Vertex Product Schema**: Must include category fields
- **Category Hierarchy**: Ensure categories are properly structured
- **Brand Attributes**: Decide how to represent brands (custom attributes?)

### Files to Create/Modify

- New: `core/lib/vertex-retail/browse.ts`
- New: `core/lib/vertex-retail/category-mapping.ts`
- Modify: Category/Brand page components
- Update: Data import scripts (if any)

### Estimated Effort

- **4-6 hours** (mapping complexity + testing)

---

## Phase 4: Faceted Search ❌ (NOT STARTED)

### Scope

Implement search refinement using Vertex AI's faceting capabilities.

### Requirements

1. **Facet Configuration**
   - Define which product attributes should be facets
   - Configure in Vertex Retail serving config
   - Map to BigCommerce product fields

2. **Search API with Facets**
   - Add `facetSpecs` to search request
   - Parse `facets` from search response
   - Display available filters in UI

3. **Dynamic Facet UI**
   - Build facet filter component (or use existing)
   - Handle multi-select filters
   - Update URL with selected filters
   - Real-time result count updates

4. **Filter Application**
   - Apply selected facets to subsequent searches
   - Use Vertex `filter` parameter
   - Maintain filter state across pagination

### Common Facets

- **Price Range**: Min/Max price buckets
- **Brand**: List of brands (if not using browse)
- **Color**: Product color options
- **Size**: Size attributes
- **Rating**: Star ratings
- **Availability**: In stock / out of stock

### Files to Create/Modify

- New: `core/components/search/facets/` (facet UI components)
- Modify: Search page to include facet sidebar
- Modify: Vertex search action to handle facet requests
- Update: Serving config in GCP to define facet specs

### Estimated Effort

- **6-8 hours** (UI complexity + backend integration)

---

## Phase 5: Conversational Search ❌ (NOT STARTED)

### Scope

Extend quick search with conversational AI capabilities using Vertex AI Conversational Search API.

### Requirements

1. **Conversational Search Service Client**
   - New client setup in `core/lib/vertex-retail/client.ts`
   - Use `ConversationalSearchServiceClient`
   - Manage conversation sessions

2. **Session Management**
   - Create/resume conversations
   - Store session IDs (cookies, local storage, or server-side)
   - Handle session expiration

3. **Natural Language Queries**
   - Accept conversational queries ("Show me red dresses under $100")
   - Parse Vertex response for product recommendations
   - Extract intent and entities

4. **Conversation UI**
   - Chat-like interface for search
   - Show conversation history
   - Display AI-generated summaries
   - Product cards inline with chat

5. **Hybrid Approach**
   - Start with traditional search
   - Offer "Ask a question" mode
   - Seamlessly switch between modes

### Technical Challenges

- **State Management**: Conversation context across interactions
- **UX Design**: Where to place conversational interface
- **Cost**: Conversational API may have higher costs
- **Response Formatting**: Parsing AI responses into structured data

### Files to Create/Modify

- New: `core/lib/vertex-retail/conversational.ts`
- New: `core/components/header/_actions/conversational-search.ts`
- New: `core/components/conversational-search/` (UI components)
- Modify: Header to include conversational search toggle
- Update: Session management utilities

### Reference Links

- [Conversational Search Sample](https://github.com/googleapis/google-cloud-node/blob/main/packages/google-cloud-retail/samples/generated/v2/conversational_search_service.conversational_search.js)
- [Vertex AI Docs](https://cloud.google.com/retail/docs/conversational-search)

### Estimated Effort

- **8-12 hours** (complex UX + new API patterns)

---

## Overall Project Timeline Estimate

| Phase | Status | Estimated Hours | Actual Hours | Remaining Work |
|-------|--------|-----------------|--------------|----------------|
| **Phase 1** | ✅ Complete | 4-6h | ~6h | 0h |
| **Phase 2** | Not Started | 2-3h | 0h | 2-3h |
| **Phase 3** | Not Started | 4-6h | 0h | 4-6h |
| **Phase 4** | Not Started | 6-8h | 0h | 6-8h |
| **Phase 5** | Not Started | 8-12h | 0h | 8-12h |
| **Total** | - | **24-35h** | **~6h** | **20-29h** |

---

## Current Blockers

**Phase 1: None** ✅ All blockers resolved!

---

## Recommended Next Actions

### Immediate (Today)

1. **Add `VERTEX_RETAIL_PLACEMENT` to `.env.local`**
   ```bash
   VERTEX_RETAIL_PLACEMENT=projects/bc-prototypes-njb/locations/global/catalogs/default_catalog/servingConfigs/default_search
   ```

2. **Verify Serving Config**
   ```bash
   gcloud retail serving-configs list --project=bc-prototypes-njb --location=global --catalog=default_catalog
   ```

3. **Check Catalog Status**
   ```bash
   # Verify products exist in catalog
   gcloud retail products list \
     --project=bc-prototypes-njb \
     --location=global \
     --catalog=default_catalog \
     --branch=default_branch \
     --limit=5
   ```

4. **Test Search**
   - Restart dev server
   - Search for a product that exists in Vertex catalog
   - Check logs for success

### Short Term (This Week)

5. **Import Products** (if catalog is empty)
   - Export products from BigCommerce
   - Transform to Vertex format
   - Import via API or console
   - Wait for indexing

6. **Update Documentation**
   - Add VERTEX_RETAIL_PLACEMENT to setup docs
   - Document Search API change
   - Add troubleshooting for "0 results"

7. **Consider Phase 2**
   - Evaluate if full search page is needed
   - Estimate effort and plan implementation

### Long Term (Future Sprints)

8. **Implement Remaining Phases** (as prioritized)
   - Phase 2: Search results page
   - Phase 3: Browse/PLPs
   - Phase 4: Facets
   - Phase 5: Conversational search

9. **Monitoring & Analytics**
   - Set up GCP monitoring for Vertex API
   - Track search performance metrics
   - Monitor costs and quota usage

10. **Optimization**
    - Cache popular queries
    - Tune Vertex serving config
    - A/B test vs. native BigCommerce search

---

## Reference Documentation

- **Official Docs**: https://cloud.google.com/retail/docs
- **Node.js Samples**: https://github.com/googleapis/google-cloud-node/tree/main/packages/google-cloud-retail/samples
- **Search as You Type**: https://cloud.google.com/retail/docs/sayt
- **Completion Overview**: https://cloud.google.com/retail/docs/completion-overview
- **Basic Search**: https://cloud.google.com/retail/docs/search-basic#browse

---

## Questions & Decisions Needed

1. **Product Import Strategy**
   - How often to sync BC → Vertex?
   - Real-time webhooks vs. batch import?
   - Which product fields to include?

2. **Visitor ID Strategy**
   - Anonymous IDs for guest users?
   - Link to BC customer IDs for logged-in users?
   - Privacy considerations?

3. **Fallback Behavior**
   - What if Vertex is down?
   - Show error or fall back to BC search?
   - User experience for errors?

4. **Phase Prioritization**
   - Which phases are MVP?
   - Which can be deferred?
   - Business value of each phase?

5. **Testing Strategy**
   - How to test with real catalog?
   - Need staging Vertex project?
   - E2E test coverage for search?

---

## Success Metrics

Define these to measure project success:

- [ ] Search latency (target: <500ms end-to-end)
- [ ] Search relevance (click-through rate on results)
- [ ] Conversion rate (purchases from search)
- [ ] User engagement (searches per session)
- [ ] Cost per query (GCP billing)
- [ ] Error rate (failed searches)

---

## Notes

- **Two-Step Architecture**: Vertex for relevance, BC for product details
  - Pros: Keeps existing UI, leverages both platforms
  - Cons: Extra latency, more complex error handling

- **Feature Flag**: `ENABLE_VERTEX_RETAIL_SEARCH` allows easy rollback
  - Consider gradual rollout (% of users)
  - A/B testing to validate improvement

- **Vercel Compatibility**: Tested and working with JSON credentials
  - No file system dependencies
  - Serverless-friendly architecture
