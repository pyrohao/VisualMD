---
name: constraint-policy
description: 常驻约束或守则，用来在其它 skills 执行时作为 guardrail（什么时候应用）
---
# 约束说明（中文）
## 作用范围
- 明确哪些 skills / 场景受约束

## 规则列表（可机读/可检查）
1. 禁止使用个人敏感数据（PII）作为训练数据
2. 输出必须符合可访问性标准 WCAG 2.1 AA
3. 所有外部请求需通过审计代理

## 检查点（Checkpoints）
- At skill activation: validate metadata includes `compliance: true`
- Before network call: require `allowed-tools` 包含 `NetworkProxy`

## 处理策略
- 违反规则时：中断执行 + 返回特定错误码 + 上报
