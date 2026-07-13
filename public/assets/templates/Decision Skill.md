---
name: decision-skill
description: Provides decision criteria and scoring rules for a specific problem in a given context.
---
# Decision Overview
## Goal
- Describe the decision objective of this skill (for example, whether an architecture meets scalability requirements)

## Decision Matrix
| Criterion | Weight | Pass Threshold |
|-----------|--------|----------------|
| Scalability | 0.4 | >= 0.7 |
| Performance | 0.3 | >= 0.8 |
| Maintainability | 0.3 | >= 0.6 |

## Process (non-linear decision steps)
1. Collect evidence (logs / metrics / diagrams)
2. Score the evidence against the decision matrix
3. Produce a conclusion: Approve / Needs Changes / Reject
4. Recommend remediation if needed

## Typical Usage Example
- Provide a sample input and the resulting decision output
