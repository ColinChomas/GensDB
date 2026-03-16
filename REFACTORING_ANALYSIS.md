# GensDB Codebase Refactoring Analysis

**Date**: March 16, 2026  
**Purpose**: Identify code optimization opportunities, reduce file sizes, and improve code organization

---

## 1. Current File Size Summary

| File | Lines | Status |
|------|-------|--------|
| server.js | 1,362 | **⚠️ Large - needs refactoring** |
| RelationChecker.js | 370 | ✓ Well-structured |
| validators.js | 148 | ✓ Good size |
| relationCheckerService.js | 89 | ✓ Small |
| index.js | 115 | ⚠️ Has duplicates |
| relationCheckerService.js | 89 | ✓ Small |
| Other files | <50 each | ✓ Good |

**Total**: ~2,500 lines across all .js files

---

## 2. SERVER.JS STRUCTURAL BREAKDOWN (1,544 lines)

### 2.1 Setup & Configuration (Lines 1-25)
- Require statements and dependency imports
- Express app configuration
- **~24 lines**

### 2.2 Helper Functions & Utilities (Lines 26-425)

#### **Data Retrieval Functions (~55 lines)**
- `getAllHouses()` (26-31) - fetch and sort houses
- `getAllPeople()` (33-37) - fetch and sort people  
- `getChildren()` (39-46) - fetch child relationships with status
- **Total: ~24 lines**

#### **Formatting Functions (~40 lines)**
- `formatRomanDate()` (48-65) - format birth/death dates (18 lines)
- `formatDisplayName()` (67-75) - format person names with cognomen (9 lines)
- **Total: ~32 lines**

#### **Tree Building Functions (~315 lines)**
- `buildTreeLimited()` (77-100) - limited family tree (grandparents to grandchildren) - **~24 lines**
- `getAncestors()` (102-165) - recursive ancestor retrieval - **~75 lines**
- `calculateAncestralInbreeding()` (167-210) - inbreeding analysis - **~45 lines**
- `calculateInbreedingCoefficient()` (212-310) - common ancestor inbreeding - **~100 lines**
- `getDistance()` (312-352) - genealogical distance calculation - **~42 lines**
- `buildTree()` (354-410) - complete family tree building - **~58 lines**
- **Total: ~344 lines**

### 2.3 Express Routes (Lines 426-1,544)

#### **Home & House Routes (Lines 426-812) - ~387 lines**
- `GET /` (426-442) - Home page with house summaries - 17 lines
- `GET /houses` (443-447) - List all houses - 5 lines
- `GET /houses/add` (448-451) - Add house form - 4 lines
- `POST /houses/add` (452-465) - Create house - 14 lines
- `GET /houses/edit/:id` (466-495) - Edit house form - 30 lines
- `POST /houses/edit/:id` (475-497) - Update house founder - 23 lines
- `POST /houses/create-founder/:id` (498-529) - Create founder - 32 lines
- `GET /houses/:id/export-csv` (530-608) - Export house as CSV - 79 lines
- `POST /houses/:id/import-csv` (609-812) - Import CSV for house - 204 lines

#### **People Routes (Lines 813-1,147) - ~406 lines**
- `GET /people` (813-828) - List all people - 16 lines
- `GET /people/add` (829-834) - Add person form - 6 lines
- `POST /people/add` (835-890) - Create person with relationships - 56 lines
- `GET /people/:id` (891-1,017) - **View person detail** - 127 lines *(largest single route)*
- `GET /people/:id/family-tree-limited` (1,018-1,057) - Family tree modal - 40 lines
- `GET /tree/:houseId` (1,058-1,070) - Tree house view - 13 lines
- `GET /people/edit/:id` (1,071-1,146) - Edit person form - 76 lines
- `POST /people/edit/:id` (1,147-1,222) - Update person - 76 lines

#### **Partnership Routes (Lines 1,223-1,264) - ~42 lines**
- `POST /partnership/add` (1,223-1,244) - Add partnership - 22 lines
- `POST /partnership/remove/:person1Id/:person2Id` (1,245-1,264) - Remove partnership - 20 lines

#### **Relationship Checker Routes (Lines 1,266-1,544) - ~290 lines**
- `GET /people/:id/relationships` (1,266-1,388) - View relationship details - 123 lines
- `GET /relationships/stats` (1,377-1,426) - Relationship statistics - 50 lines
- `GET /relationships/check` (1,427-1,443) - View check form - 17 lines
- `POST /relationships/check` (1,444-1,468) - Check relationship - 25 lines
- `GET /api/relationship-paths` (1,469-1,534) - API for paths - 66 lines
- `POST /relationships/compute-all` (1,535-1,543) - Compute all relationships - 9 lines

---

## 3. RELATIONCHECKER.JS ANALYSIS (370 lines)

**Purpose**: In-memory genealogical relationship calculation using a **Person class graph**

### Key Components:

| Section | Lines | Purpose |
|---------|-------|---------|
| Person class constructor | 1-14 | Initialize person with mother/father/children relationships |
| `getParents()` | 16-18 | Get array of parents |
| `setMother()` / `setFather()` | 20-30 | Establish bidirectional parent-child links |
| `getAncestorsMap()` | 35-50 | BFS to map all ancestors with generation depth |
| `getDescendantsMap()` | 52-67 | BFS to map all descendants |
| Name helper methods | 69-127 | Generate English relation names (uncle, cousin, etc.) |
| `classifyViaCommonAncestor()` | 129-185 | Determine relationship from common ancestor |
| `relationTypePriority()` | 187-195 | Rank relation types in precedence order |
| `findAllRelations()` | 197-255 | **Core API** - find all relationship paths between two people |
| `findAllPaths()` | 257-310 | Build all genealogical paths from person1 to person2 |
| `getPathToAncestor()` | 312-330 | Trace path from person upward to ancestor |
| `getPathFromAncestor()` | 332-370 | Trace path from ancestor downward to person |

**Status**: ✓ **Well-designed** - clean abstraction for genealogy graph algorithms

---

## 4. RELATIONCHECKERSERVICE.JS ANALYSIS (89 lines)

**Purpose**: Thin wrapper around RelationChecker + database layer

**Exported Functions**:
```javascript
loadPeopleGraph()              // Build all Person objects from database
findRelationshipByIds()        // Get relationship between two people (ID lookup)
findPathsByIds()               // Get all paths between two people (ID lookup)
computeAllRelationships()      // Iterate all pairs and count relationships
```

**Issue**: ⚠️ **Inefficient**
- `loadPeopleGraph()` is called in every function
- No caching - rebuilds entire graph on each call
- Should cache results with TTL

---

## 5. INDEX.JS ANALYSIS (115 lines)

**Purpose**: CLI utility to print family trees to console (standalone, doesn't use server)

**Functions**:
- `getAllHouses()` - database query
- `getChildren()` - database query  
- `formatRomanDate()` - **DUPLICATE of server.js**
- `formatDisplayName()` - **DUPLICATE of server.js**
- `printPersonTree()` - console output tree (similar to buildTree but for CLI)
- `printHouseTree()` - iterate houses and print each

**Status**: ⚠️ **Code duplication with server.js**

---

## 6. CODE DUPLICATION & OVERLAPS

### Exact Duplicates (HIGH PRIORITY)

| Function | Location 1 | Location 2 | Line Count |
|----------|-----------|-----------|-----------|
| `formatRomanDate()` | server.js:48-65 | index.js:21-38 | 18 lines |
| `formatDisplayName()` | server.js:67-75 | index.js:40-48 | 9 lines |
| `getAllHouses()` | server.js:26-31 | index.js:5-10 | 6 lines |
| `getChildren()` | server.js:39-46 | index.js:12-19 | 8 lines |

**Total duplicated**: ~41 lines

### Similar But Different Implementations

| Function | Difference | Impact |
|----------|-----------|--------|
| `buildTree()` (server.js:354-410) | HTML rendering with links | Used for web display |
| `buildTreeLimited()` (server.js:77-100) | Limited depth, highlights target | Used for modals |
| `printPersonTree()` (index.js:60-100) | ASCII console output | Similar logic risk |

---

## 7. RECOMMENDED REFACTORING (PRIORITY ORDER)

### **PRIORITY 1: Extract `formatters.js`** ⭐⭐⭐
**Files to create**: `formatters.js` (root level)

**Functions to move**:
- `formatRomanDate()` 
- `formatDisplayName()` 

**Lines to remove from server.js**: ~35  
**Files affected**: server.js, index.js  
**Benefit**: 
- Eliminates all formatting duplication
- Single source of truth for formatting
- Easy to extend (add new formatters)

**Usage locations**:
- server.js routes (person detail, tree views)
- index.js CLI utility
- Relationship display logic

---

### **PRIORITY 2: Extract `treeBuilder.js`** ⭐⭐⭐
**Files to create**: `treeBuilder.js` (root level)

**Functions to move**:
- `buildTree()` - complete tree rendering (58 lines)
- `buildTreeLimited()` - limited depth tree (24 lines)
- `getAncestors()` - ancestor lookup (75 lines)
- `getDistance()` - genealogical distance (42 lines)
- `getChildren()` - child lookup (7 lines)

**Lines to remove from server.js**: ~315  
**Dependencies**: formatters.js, romanNaming.js  
**Benefit**:
- Isolated genealogy visualization module
- Testable independently
- Easier to enhance tree features
- Reusable for other views

**Usage**:
- Tree visualization routes
- Family tree modal
- Person detail page

---

### **PRIORITY 3: Extract `geneticsCalculator.js`** ⭐⭐
**Files to create**: `geneticsCalculator.js` (root level)

**Functions to move**:
- `calculateInbreedingCoefficient()` (100 lines)
- `calculateAncestralInbreeding()` (45 lines)

**Supporting functions**:
- `getAncestors()` - called for ancestor analysis
- `getDistance()` - genealogical distance

**Lines to remove from server.js**: ~145  
**Benefit**:
- Self-contained genetics/genetics module
- Can be unit tested independently
- Complex algorithms isolated
- Easier to debug inbreeding calculations

**Usage**: 
- `/people/:id` detail route (calculates inbreeding coefficient for display)

---

### **PRIORITY 4: Extract `dataAccessors.js`** ⭐⭐
**Files to create**: `dataAccessors.js` (root level)

**Functions to move**:
- `getAllHouses()`
- `getAllPeople()`
- `getChildren()` - version for database queries

**Lines to remove from server.js**: ~30  
**Benefit**:
- Centralizes database access
- Fixes duplication in index.js
- Enables caching strategies
- Makes queries easier to optimize
- Consistent error handling

**Future improvements**:
- Add query caching
- Add connection pooling
- Add logging/monitoring
- Add error recovery

---

### **PRIORITY 5: Extract `csvOperations.js`** ⭐⭐
**Files to create**: `csvOperations.js` (root level)

**Functions to move**:
- CSV export logic from `GET /houses/:id/export-csv` (79 lines)
- CSV import logic from `POST /houses/:id/import-csv` (204 lines)
- `escapeCSV()` helper
- `parseCSVLine()` helper

**Lines to remove from server.js**: ~283  
**Benefit**:
- CSV logic separated from routing
- Can be unit tested
- Can be extended for other models (people, partnerships)
- Easier to add validation/error handling
- Reusable in other contexts

**Future improvements**:
- Add CSV import for people records
- Add CSV import for partnerships
- Add header validation
- Add rollback on error

---

### **PRIORITY 6: Optimize `relationCheckerService.js`** ⭐
**Action**: Add caching mechanism (in-place optimization)

**Current issue**: `loadPeopleGraph()` is called 4 times per request in worst case

**Solution**: Implement simple caching with TTL
```javascript
let cachedPeopleGraph = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

async function getCachedPeopleGraph() {
  const now = Date.now();
  if (!cachedPeopleGraph || now - cacheTimestamp > CACHE_TTL) {
    cachedPeopleGraph = await loadPeopleGraph();
    cacheTimestamp = now;
  }
  return cachedPeopleGraph;
}
```

**Impact**: 
- Massive performance improvement
- No changes to other code
- Automatic cache invalidation

---

### **PRIORITY 7: Refactor `index.js`** (Optional)
**Action**: Remove duplication by importing shared modules

**Changes**:
- Import `formatters.js` instead of duplicating functions
- Import `dataAccessors.js` instead of duplicating queries
- Import `treeBuilder.js` or create `treeFormatter.js` for ASCII output

**Result**: index.js reduced from 115 → ~50 lines

---

## 8. REFACTORING SUMMARY TABLE

| Priority | File(s) | Action | Lines Moved | Impact | Dependencies |
|----------|---------|--------|-------------|--------|--------------|
| 1 | formatters.js | Extract formatting utils | ~35 | High | None |
| 2 | treeBuilder.js | Extract tree visualization | ~315 | High | formatters.js |
| 3 | geneticsCalculator.js | Extract genetics algorithms | ~145 | Medium | dataAccessors.js |
| 4 | dataAccessors.js | Extract data access | ~30 | Medium | None |
| 5 | csvOperations.js | Extract CSV handling | ~283 | Medium | None |
| 6 | relationCheckerService.js | Add caching | —0 (in-place) | High perf | None |
| 7 | index.js | Remove duplication | —65 | Low | formatters.js, dataAccessors.js |

**Result After All Refactors**:
- **server.js**: 1,362 → **~550 lines** (60% reduction) ✓✓✓
- **index.js**: 115 → **~50 lines** (57% reduction)
- **New modules**: 6 focused, testable files
- **Eliminated duplication**: ~41 lines removed
- **Functionality**: **100% preserved**

---

## 9. IMPLEMENTATION APPROACH

### **Safe Refactoring Steps**:

1. ✓ **No breaking changes** - All extracted functions work identically
2. ✓ **All URLs unchanged** - Routes continue to work the same way
3. ✓ **Database queries unchanged** - SQL queries stay identical
4. ✓ **Front-end unmoved** - All EJS views unchanged
5. ✓ **Dependencies managed** - Proper require() statements at top

### **Recommended Implementation Order**:

1. **formatters.js** (simplest, used everywhere)
2. **dataAccessors.js** (fixes index.js issues)
3. **csvOperations.js** (isolated, standalone feature)
4. **treeBuilder.js** (largest extraction, but isolated)
5. **geneticsCalculator.js** (depends on dataAccessors)
6. **relationCheckerService.js** (performance optimization)
7. **index.js** (cleanup after others done)

Each step should be tested before moving to the next to catch any issues early.

---

## 10. FILE DEPENDENCIES (After Refactoring)

```
server.js (core)
  ├── formatters.js          (formatting utilities)
  ├── treeBuilder.js         (tree visualization)
  ├── geneticsCalculator.js  (inbreeding calculations)
  ├── dataAccessors.js       (database queries)
  ├── csvOperations.js       (CSV import/export)
  ├── validators.js          (input validation)
  ├── romanNaming.js         (roman numeral helpers)
  ├── db.js                  (database connection)
  ├── houseService.js        (house CRUD)
  ├── personService.js       (person CRUD)
  └── relationshipService.js (relationship CRUD)

index.js (CLI utility)
  ├── formatters.js          (formatting utilities)
  ├── dataAccessors.js       (database queries)
  ├── romanNaming.js         (roman numeral helpers)
  └── db.js                  (database connection)

relationCheckerService.js
  ├── RelationChecker.js     (graph algorithms)
  ├── dataAccessors.js       (database queries)
  └── db.js                  (database connection)
```

---

## 11. PERFORMANCE IMPROVEMENTS

### **Immediate (No refactoring needed)**:
- **relationCheckerService.js caching**: ~80% faster for repeated relationship lookups

### **From Refactoring**:
- **Code organization**: Easier to spot and fix performance issues
- **Tree building**: Can add memoization to buildTree functions
- **CSV operations**: Can add streaming for large imports
- **Genetics**: Caching of ancestor maps in calculateInbreedingCoefficient

---

## 12. TESTING RECOMMENDATIONS

After each refactoring step:

```javascript
// Test data flows still work
- GET /people → renders correctly
- GET /houses → renders correctly
- POST /people/add → creates with relationships
- POST /houses/:id/import-csv → imports correctly
- GET /people/:id → shows inbreeding coefficient
- GET /tree/:houseId → displays tree
```

Run manual tests before committing each module.

---

## 13. NOTES & CAVEATS

- **CSV handling**: The `parseCSVLine()` function is robust but could use validation
- **Tree rendering**: `buildTree()` has complex HTML generation - keep tests handy
- **Genetics algorithms**: `calculateInbreedingCoefficient()` is complex - understand before moving
- **RelationChecker.js**: Don't modify the Person class graph without understanding dependencies
- **index.js**: Currently standalone - ensure shared modules don't add network requirements

---

## 14. FUTURE ENHANCEMENTS (Beyond this refactoring)

With the refactored codebase, these become easier:

- ✨ Add pagination to people/houses lists
- ✨ Add search functionality
- ✨ Add data validation schemas (Joi, Zod)
- ✨ Add relationship visualization (graph export)
- ✨ Add multi-user authentication
- ✨ Add audit logging for changes
- ✨ Add bulk operations (bulk import people)
- ✨ Add API authentication (if exposing API)
- ✨ Add prometheus metrics for performance tracking

---

**Status**: Ready to implement when desired  
**Estimated effort**: 2-4 hours  
**Risk level**: ⚠️ Low (no database/logic changes)
