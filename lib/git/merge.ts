import { normalizeGitComparableContent } from './sync'

export interface MergeConflictBlock {
  base: string[]
  local: string[]
  remote: string[]
}

export interface MergeGitTextResult {
  mergedText: string
  hasConflicts: boolean
  conflictBlocks: MergeConflictBlock[]
}

type ChangeKind = 'insert' | 'delete' | 'replace'

interface MergeChange {
  kind: ChangeKind
  baseStart: number
  baseEnd: number
  baseLines: string[]
  nextLines: string[]
}

type DiffOp =
  | { type: 'equal'; line: string }
  | { type: 'delete'; line: string }
  | { type: 'insert'; line: string }

function splitPreserveLines(content: string) {
  if (!content) {
    return [] as string[]
  }

  const normalizedContent = content.replace(/\r\n/g, '\n')
  const lines = normalizedContent.split('\n')

  // A terminal newline is a line ending, not an extra empty content line.
  if (normalizedContent.endsWith('\n')) {
    lines.pop()
  }

  return lines
}

function joinLines(lines: string[]) {
  return lines.join('\n')
}

function linesMeaningfullyEqual(left: string[], right: string[]) {
  return normalizeGitComparableContent(joinLines(left)) === normalizeGitComparableContent(joinLines(right))
}

function lineMeaningfullyEqual(left: string, right: string) {
  return normalizeGitComparableContent(left) === normalizeGitComparableContent(right)
}

function buildConflictBlock(base: string[], local: string[], remote: string[]) {
  return [
    '<<<<<<< LOCAL',
    ...local,
    '=======',
    ...remote,
    '>>>>>>> REMOTE',
  ]
}

function buildDiffOps(baseLines: string[], nextLines: string[]) {
  const rows = baseLines.length
  const cols = nextLines.length
  const dp = Array.from({ length: rows + 1 }, () => Array<number>(cols + 1).fill(0))

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      if (lineMeaningfullyEqual(baseLines[row], nextLines[col])) {
        dp[row][col] = dp[row + 1][col + 1] + 1
      } else {
        dp[row][col] = Math.max(dp[row + 1][col], dp[row][col + 1])
      }
    }
  }

  const ops: DiffOp[] = []
  let row = 0
  let col = 0

  while (row < rows && col < cols) {
    if (lineMeaningfullyEqual(baseLines[row], nextLines[col])) {
      ops.push({ type: 'equal', line: baseLines[row] })
      row += 1
      col += 1
      continue
    }

    if (dp[row + 1][col] >= dp[row][col + 1]) {
      ops.push({ type: 'delete', line: baseLines[row] })
      row += 1
    } else {
      ops.push({ type: 'insert', line: nextLines[col] })
      col += 1
    }
  }

  while (row < rows) {
    ops.push({ type: 'delete', line: baseLines[row] })
    row += 1
  }

  while (col < cols) {
    ops.push({ type: 'insert', line: nextLines[col] })
    col += 1
  }

  return ops
}

function getChanges(baseText: string, nextText: string) {
  const baseLines = splitPreserveLines(baseText)
  const nextLines = splitPreserveLines(nextText)
  const ops = buildDiffOps(baseLines, nextLines)
  const changes: MergeChange[] = []
  let baseCursor = 0
  let index = 0

  while (index < ops.length) {
    const op = ops[index]

    if (op.type === 'equal') {
      baseCursor += 1
      index += 1
      continue
    }

    const baseStart = baseCursor
    const removed: string[] = []
    const inserted: string[] = []

    while (index < ops.length && ops[index].type !== 'equal') {
      const currentOp = ops[index]
      if (currentOp.type === 'delete') {
        removed.push(currentOp.line)
        baseCursor += 1
      } else if (currentOp.type === 'insert') {
        inserted.push(currentOp.line)
      }
      index += 1
    }

    const baseEnd = baseCursor

    if (removed.length > 0 && inserted.length > 0) {
      changes.push({
        kind: 'replace',
        baseStart,
        baseEnd,
        baseLines: removed,
        nextLines: inserted,
      })
      continue
    }

    if (removed.length > 0) {
      changes.push({
        kind: 'delete',
        baseStart,
        baseEnd,
        baseLines: removed,
        nextLines: [],
      })
      continue
    }

    changes.push({
      kind: 'insert',
      baseStart,
      baseEnd: baseStart,
      baseLines: [],
      nextLines: inserted,
    })
  }

  return changes
}

function changesOverlap(left: MergeChange, right: MergeChange) {
  if (left.kind === 'insert' && right.kind === 'insert') {
    return left.baseStart === right.baseStart
  }

  if (left.kind === 'insert') {
    if (right.kind === 'replace') {
      return right.baseStart < left.baseStart && left.baseStart <= right.baseEnd
    }
    return right.baseStart <= left.baseStart && left.baseStart < right.baseEnd
  }

  if (right.kind === 'insert') {
    if (left.kind === 'replace') {
      return left.baseStart < right.baseStart && right.baseStart <= left.baseEnd
    }
    return left.baseStart <= right.baseStart && right.baseStart < left.baseEnd
  }

  return left.baseStart < right.baseEnd && right.baseStart < left.baseEnd
}

function canAutoMergeOverlappingChanges(localChange: MergeChange, remoteChange: MergeChange) {
  if (localChange.kind === 'insert' && remoteChange.kind === 'insert') {
    return true
  }

  if (localChange.kind === 'delete' && remoteChange.kind === 'insert') {
    return true
  }

  if (localChange.kind === 'insert' && remoteChange.kind === 'delete') {
    return true
  }

  if (localChange.kind === 'delete' && remoteChange.kind === 'delete') {
    return true
  }

  return false
}

function applyChangeLines(localChange: MergeChange | null, remoteChange: MergeChange | null) {
  if (localChange && remoteChange) {
    if (localChange.kind === 'insert' && remoteChange.kind === 'insert') {
      return [...remoteChange.nextLines, ...localChange.nextLines]
    }

    if (localChange.kind === 'delete' && remoteChange.kind === 'insert') {
      return [...remoteChange.nextLines]
    }

    if (localChange.kind === 'insert' && remoteChange.kind === 'delete') {
      return [...localChange.nextLines]
    }

    if (localChange.kind === 'delete' && remoteChange.kind === 'delete') {
      return [] as string[]
    }
  }

  const single = localChange || remoteChange
  if (!single) {
    return [] as string[]
  }

  if (single.kind === 'delete') {
    return [] as string[]
  }

  return [...single.nextLines]
}

function buildConflict(localChange: MergeChange, remoteChange: MergeChange): MergeConflictBlock {
  return {
    base:
      localChange.baseStart === remoteChange.baseStart &&
      localChange.baseEnd === remoteChange.baseEnd
        ? localChange.baseLines
        : [],
    local: localChange.nextLines,
    remote: remoteChange.nextLines,
  }
}

export function mergeGitText(baseText: string, localText: string, remoteText: string): MergeGitTextResult {
  const baseLines = splitPreserveLines(baseText)
  const localLines = splitPreserveLines(localText)
  const remoteLines = splitPreserveLines(remoteText)

  if (linesMeaningfullyEqual(localLines, remoteLines)) {
    return {
      mergedText: localText,
      hasConflicts: false,
      conflictBlocks: [],
    }
  }

  if (linesMeaningfullyEqual(baseLines, localLines)) {
    return {
      mergedText: remoteText,
      hasConflicts: false,
      conflictBlocks: [],
    }
  }

  if (linesMeaningfullyEqual(baseLines, remoteLines)) {
    return {
      mergedText: localText,
      hasConflicts: false,
      conflictBlocks: [],
    }
  }

  const localChanges = getChanges(baseText, localText)
  const remoteChanges = getChanges(baseText, remoteText)
  const mergedLines: string[] = []
  const conflictBlocks: MergeConflictBlock[] = []
  let baseCursor = 0
  let localIndex = 0
  let remoteIndex = 0

  while (localIndex < localChanges.length || remoteIndex < remoteChanges.length) {
    const nextLocal = localChanges[localIndex] || null
    const nextRemote = remoteChanges[remoteIndex] || null
    const nextBasePosition = Math.min(
      nextLocal?.baseStart ?? Number.POSITIVE_INFINITY,
      nextRemote?.baseStart ?? Number.POSITIVE_INFINITY
    )

    if (nextBasePosition > baseCursor) {
      mergedLines.push(...baseLines.slice(baseCursor, nextBasePosition))
      baseCursor = nextBasePosition
    }

    let localChange = nextLocal && nextLocal.baseStart === baseCursor ? nextLocal : null
    let remoteChange = nextRemote && nextRemote.baseStart === baseCursor ? nextRemote : null

    if (localChange && !remoteChange && nextRemote && changesOverlap(localChange, nextRemote)) {
      remoteChange = nextRemote
    }

    if (remoteChange && !localChange && nextLocal && changesOverlap(nextLocal, remoteChange)) {
      localChange = nextLocal
    }

    if (!localChange && !remoteChange) {
      if (baseCursor < baseLines.length) {
        mergedLines.push(baseLines[baseCursor])
        baseCursor += 1
        continue
      }
      break
    }

    if (localChange && remoteChange && changesOverlap(localChange, remoteChange)) {
      if (canAutoMergeOverlappingChanges(localChange, remoteChange)) {
        mergedLines.push(...applyChangeLines(localChange, remoteChange))
      } else {
        const conflict = buildConflict(localChange, remoteChange)
        conflictBlocks.push(conflict)
        mergedLines.push(...buildConflictBlock(conflict.base, conflict.local, conflict.remote))
      }

      baseCursor = Math.max(baseCursor, localChange.baseEnd, remoteChange.baseEnd)
      localIndex += 1
      remoteIndex += 1
      continue
    }

    if (localChange && (!remoteChange || localChange.baseStart < remoteChange.baseStart)) {
      mergedLines.push(...applyChangeLines(localChange, null))
      baseCursor = Math.max(baseCursor, localChange.baseEnd)
      localIndex += 1
      continue
    }

    if (remoteChange) {
      mergedLines.push(...applyChangeLines(null, remoteChange))
      baseCursor = Math.max(baseCursor, remoteChange.baseEnd)
      remoteIndex += 1
    }
  }

  if (baseCursor < baseLines.length) {
    mergedLines.push(...baseLines.slice(baseCursor))
  }

  return {
    mergedText: mergedLines.join('\n'),
    hasConflicts: conflictBlocks.length > 0,
    conflictBlocks,
  }
}
