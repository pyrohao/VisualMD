---
name: constraint-policy
description: Persistent constraints or policies used as guardrails while other skills are executing.
---
# Constraint Overview
## Scope
- Define which skills or scenarios are constrained.

## Rule List (machine-readable / checkable)
1. Do not use personally identifiable information (PII) as training data
2. Output must comply with WCAG 2.1 AA accessibility standards
3. All external requests must go through the audit proxy

## Checkpoints
- At skill activation: validate that metadata includes `compliance: true`
- Before a network call: require `allowed-tools` to include `NetworkProxy`

## Response Strategy
- On rule violation: stop execution + return a specific error code + report the incident
