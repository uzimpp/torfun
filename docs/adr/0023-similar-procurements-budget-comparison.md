# ADR-0023: What "similar procurements" means for the budget comparison

- Status: **Proposed**. Needs the owner's sign-off, because the rule below is a product decision that #144 (market view) and #145 (price range and win chance) will reuse.
- Date: 2026-11-22
- Issue: #61 (budget comparison), in the bid strategy epic (#146).

## Context

#61 asks for a TOR's budget beside the budgets of similar past procurements, with "similar" defined by an explicit criterion, not an arbitrary sample. The comparison needs no outside data: it uses procurements TORfun has already stored. What is compared is `projectMoney`, the agency's **planned procurement budget**. It is not a winning price and not a contract price (those come from open data, ADR-0022, and are a different number).

Scope is software, e-bidding tenders, so most stored projects share the same e-GP goods category (4010, 4016, 99). A category rule alone is therefore broad, which is why more than one rule is offered.

## Decision

1. **Three separate groups, chosen by the officer, never merged:**
   - `category`: same `goodsId` and same `typeId` (e-GP codes, both known);
   - `agency`: same `deptName`;
   - `tech`: at least one `analysis.techStack` entry in common, compared whole, ignoring case and outer spaces.
     Each group says what it matched on and how many projects it found.
2. **Eligible comparable**, for every group: another procurement that an officer may see (`isVisibleTo('officer', ...)`: outcome `tor_analysed`, not removed), with a planned budget, announced **strictly before** this TOR (a missing or unreadable date excludes it; an undated TOR has no comparables). Held, queued, failed, removed and admin-only records never count, even with a budget and an analysis. A held record an administrator approved has become `tor_analysed` and counts. The pool is the same whoever asks.
3. **`count` is every eligible comparable**, never the number listed. Statistics and rank use all of them.
4. **Minimum sample of 5 per group** before any summary: below it, only the count and the listed projects are shown, with a notice.
5. **Statistics:** minimum, median (the mean of the two middle values for an even count) and maximum. **Rank** of this TOR's budget `b` among `N` comparables: `rank = below + 1` of `N + 1`, with `below` the comparables strictly lower; equal budgets share a rank and `equal` is reported. Position is `below_range`, `within_range` (ends included) or `above_range`. Amounts are compared in whole satang.
6. **Listing:** at most 10 projects, by smallest absolute budget difference from this TOR, then later announcement, then project id.
7. **Nothing is adjusted or cleaned:** no inflation or fiscal-year adjustment, no outlier removal. Each listed project shows its budget year, or "unknown".

## Consequences

- With few stored projects most groups will fall under 5 and show no summary. That is accepted; nothing is seeded to fill them (AGENTS.md).
- A budget is the agency's plan, not what the work sold for. The page says so, and never calls the figure a winning, contract or market price.
- #144 and #145 reuse these groups and this eligibility rule rather than defining their own.
- The `category` group is broad (see Context); the officer can switch to the agency or technology group.

## Unresolved

- Whether the minimum of 5 and the three criteria are right once real data exists.
- Whether budgets of different fiscal years should ever be adjusted before being compared.
- Whether a related-category rule (more than an exact code match) is wanted.
