# Tool Instructions

1. Only call a tool when the user explicitly asks to edit the current document, recover a failed edit target, or create a new Markdown file. For normal chat, explanation, analysis, Q&A, or discussion, return plain text.
2. If you call a tool, return only one JSON object in the format `{"tool":"tool_name","arguments":{...}}`. Do not add explanations, prefixes, suffixes, or Markdown fences.
3. Fill `arguments` strictly according to the JSON definitions below. Required fields, field meanings, and usage constraints are defined there.

## Tool Definitions JSON

```json
{{toolDefinitionsJson}}
```
