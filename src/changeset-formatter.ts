/**
 * Formats CloudFormation change set with colors and expandable groups
 * Shows before/after values for property changes
 */

import * as core from '@actions/core'
import {
  Change,
  ResourceChangeDetail,
  ResourceTargetDefinition
} from '@aws-sdk/client-cloudformation'

interface ChangeSetSummary {
  changes: Change[]
  totalChanges: number
  truncated: boolean
}

/**
 * Generate a git-style diff view of JSON objects with recreation warnings
 */
function generateJsonDiff(
  before: unknown,
  after: unknown,
  details?: Array<{ Target?: { Name?: string; RequiresRecreation?: string } }>
): string {
  const beforeJson = before ? JSON.stringify(before, null, 2) : '{}'
  const afterJson = after ? JSON.stringify(after, null, 2) : '{}'

  if (beforeJson === afterJson) {
    return '```json\n' + beforeJson + '\n```\n'
  }

  // Build map of properties that require recreation
  const recreationMap = new Map<string, string>()
  if (details) {
    for (const detail of details) {
      const target = detail.Target
      if (
        target?.Name &&
        target.RequiresRecreation &&
        target.RequiresRecreation !== 'Never'
      ) {
        recreationMap.set(target.Name, target.RequiresRecreation)
      }
    }
  }

  const beforeLines = beforeJson.split('\n')
  const afterLines = afterJson.split('\n')

  const diff: string[] = []
  let i = 0
  let j = 0

  while (i < beforeLines.length || j < afterLines.length) {
    const beforeLine = beforeLines[i]
    const afterLine = afterLines[j]

    if (beforeLine === afterLine) {
      diff.push(' ' + beforeLine)
      i++
      j++
    } else if (i < beforeLines.length && !afterLines.includes(beforeLines[i])) {
      diff.push('-' + beforeLine)
      i++
    } else if (j < afterLines.length) {
      let line = '+' + afterLine
      // Check if this line contains a property that requires recreation
      for (const [propName, recreationType] of recreationMap) {
        if (afterLine.includes(`"${propName}"`)) {
          line += ` ⚠️ Requires recreation: ${recreationType}`
          break
        }
      }
      diff.push(line)
      j++
    } else {
      i++
    }
  }

  return '```diff\n' + diff.join('\n') + '\n```\n'
}

/**
 * ANSI color codes
 */
const COLORS = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
}

/**
 * Get action symbol and color
 */
function getActionStyle(
  action?: string,
  enableColors = true
): { symbol: string; color: string } {
  const styles = {
    Add: { symbol: '+', color: COLORS.green },
    Modify: { symbol: '~', color: COLORS.blue },
    Remove: { symbol: '-', color: COLORS.red }
  }

  const style = styles[action as keyof typeof styles] || {
    symbol: '•',
    color: ''
  }
  return {
    symbol: style.symbol,
    color: enableColors ? style.color : ''
  }
}

/**
 * Format before/after values with proper indentation
 */
function formatBeforeAfter(
  target: ResourceTargetDefinition,
  enableColors: boolean
): string[] {
  const lines: string[] = []
  const gray = enableColors ? COLORS.gray : ''
  const red = enableColors ? COLORS.red : ''
  const green = enableColors ? COLORS.green : ''
  const reset = enableColors ? COLORS.reset : ''

  const hasBeforeValue = target.BeforeValue !== undefined
  const hasAfterValue = target.AfterValue !== undefined

  if (hasBeforeValue || hasAfterValue) {
    if (hasBeforeValue) {
      const beforeLines = (target.BeforeValue || '').split('\n')
      if (beforeLines.length === 1) {
        lines.push(`     ├─ ${red}[-]${reset} ${gray}${beforeLines[0]}${reset}`)
      } else {
        lines.push(`     ├─ ${red}[-]${reset}`)
        beforeLines.forEach((line, idx) => {
          const prefix =
            idx === beforeLines.length - 1 ? '     │  ' : '     │  '
          lines.push(`${prefix}${gray}${line}${reset}`)
        })
      }
    }

    if (hasAfterValue) {
      const afterLines = (target.AfterValue || '').split('\n')
      if (afterLines.length === 1) {
        lines.push(
          `     └─ ${green}[+]${reset} ${gray}${afterLines[0]}${reset}`
        )
      } else {
        lines.push(`     └─ ${green}[+]${reset}`)
        afterLines.forEach((line, idx) => {
          const prefix = idx === afterLines.length - 1 ? '        ' : '        '
          lines.push(`${prefix}${gray}${line}${reset}`)
        })
      }
    }
  }

  return lines
}

/**
 * Format a property change detail
 */
function formatDetail(
  detail: ResourceChangeDetail,
  enableColors: boolean,
  isLast = true
): string[] {
  const lines: string[] = []
  const target = detail.Target

  if (!target) return lines

  const style = getActionStyle('Modify', enableColors)
  const gray = enableColors ? COLORS.gray : ''
  const reset = enableColors ? COLORS.reset : ''

  // Property name/path - use ├─ for non-last items, └─ for last
  const branch = isLast ? '└─' : '├─'
  const propertyName = target.Name || target.Attribute || 'Unknown'
  lines.push(
    ` ${branch} ${style.color}[${style.symbol}] ${propertyName}${reset}`
  )

  // Show recreation requirement if present
  if (target.RequiresRecreation && target.RequiresRecreation !== 'Never') {
    const yellow = enableColors ? COLORS.yellow : ''
    const recreationText =
      target.RequiresRecreation === 'Always'
        ? '⚠️  Requires replacement'
        : '⚠️  May require replacement'
    lines.push(`     ${yellow}${recreationText}${reset}`)
  }

  // Show change source if not direct modification
  if (detail.ChangeSource && detail.ChangeSource !== 'DirectModification') {
    const causingEntity = detail.CausingEntity
      ? ` (${detail.CausingEntity})`
      : ''
    lines.push(
      `     ${gray}Source: ${detail.ChangeSource}${causingEntity}${reset}`
    )
  }

  // Show before/after values
  const beforeAfterLines = formatBeforeAfter(target, enableColors)
  lines.push(...beforeAfterLines)

  return lines
}

/**
 * Format a single resource change
 */
function formatResourceChange(
  change: Change,
  enableColors: boolean
): { title: string; details: string[] } {
  const rc = change.ResourceChange
  if (!rc) {
    return { title: 'Unknown Change', details: [] }
  }

  const style = getActionStyle(rc.Action, enableColors)
  const reset = enableColors ? COLORS.reset : ''
  const bold = enableColors ? COLORS.bold : ''
  const yellow = enableColors ? COLORS.yellow : ''

  // Title line for the group
  const title = `${style.color}[${style.symbol}] ${bold}${rc.ResourceType || 'Unknown'}${reset}${style.color} ${rc.LogicalResourceId || 'Unknown'}${reset}`

  const details: string[] = []

  // Show replacement warning
  if (rc.Action === 'Modify' && rc.Replacement === 'True') {
    details.push(
      `${yellow}⚠️  Resource will be replaced (may cause downtime)${reset}`
    )
  } else if (rc.Action === 'Modify' && rc.Replacement === 'Conditional') {
    details.push(`${yellow}⚠️  May require replacement${reset}`)
  }

  // Show property-level changes
  if (rc.Details && rc.Details.length > 0) {
    for (let i = 0; i < rc.Details.length; i++) {
      const isLast = i === rc.Details.length - 1
      const detailLines = formatDetail(rc.Details[i], enableColors, isLast)
      details.push(...detailLines)
    }
  } else if (rc.Scope && rc.Scope.length > 0) {
    // Fallback to scope if no details
    const gray = enableColors ? COLORS.gray : ''
    details.push(`${gray}Modified: ${rc.Scope.join(', ')}${reset}`)
  }

  // Show AfterContext for Add actions (contains the properties being added)
  if (rc.Action === 'Add' && rc.AfterContext) {
    const gray = enableColors ? COLORS.gray : ''
    const green = enableColors ? COLORS.green : ''
    try {
      const afterProps = JSON.parse(rc.AfterContext)
      details.push(`${gray}Properties:${reset}`)
      const propsJson = JSON.stringify(afterProps, null, 2)
      propsJson.split('\n').forEach(line => {
        details.push(`  ${green}${line}${reset}`)
      })
    } catch {
      // If parsing fails, show raw
      details.push(`${gray}Properties: ${rc.AfterContext}${reset}`)
    }
  }

  // Show BeforeContext for Remove actions
  if (rc.Action === 'Remove' && rc.BeforeContext) {
    const gray = enableColors ? COLORS.gray : ''
    const red = enableColors ? COLORS.red : ''
    try {
      const beforeProps = JSON.parse(rc.BeforeContext)
      details.push(`${gray}Properties:${reset}`)
      const propsJson = JSON.stringify(beforeProps, null, 2)
      propsJson.split('\n').forEach(line => {
        details.push(`  ${red}${line}${reset}`)
      })
    } catch {
      details.push(`${gray}Properties: ${rc.BeforeContext}${reset}`)
    }
  }

  return { title, details }
}

/**
 * Display formatted change set with colors and expandable groups
 */
export function displayChangeSet(
  changesSummary: string,
  changesCount: number,
  enableColors = true
): void {
  try {
    const summary: ChangeSetSummary = JSON.parse(changesSummary)

    // Group changes by action
    const grouped = {
      Add: [] as Change[],
      Modify: [] as Change[],
      Remove: [] as Change[]
    }

    for (const change of summary.changes) {
      const action = change.ResourceChange?.Action
      if (action && action in grouped) {
        grouped[action as keyof typeof grouped].push(change as Change)
      }
    }

    const addCount = grouped.Add.length
    const modifyCount = grouped.Modify.length
    const removeCount = grouped.Remove.length

    const reset = enableColors ? COLORS.reset : ''
    const green = enableColors ? COLORS.green : ''
    const blue = enableColors ? COLORS.blue : ''
    const red = enableColors ? COLORS.red : ''

    // Main summary
    core.info(
      `\n📋 Change Set: ${green}${addCount} to add${reset}, ${blue}${modifyCount} to change${reset}, ${red}${removeCount} to remove${reset}\n`
    )

    // Display each resource in its own expandable group
    const allChanges = [...grouped.Add, ...grouped.Modify, ...grouped.Remove]

    for (const change of allChanges) {
      const { title, details } = formatResourceChange(change, enableColors)

      // Each resource is a collapsible group
      core.startGroup(title)
      for (const line of details) {
        core.info(line)
      }
      core.endGroup()
    }

    // Truncation warning
    if (summary.truncated) {
      core.warning(
        `\n⚠️  Change set truncated. Showing ${summary.changes.length} of ${summary.totalChanges} total changes.`
      )
    }

    // Raw JSON in separate group for debugging
    core.startGroup('📄 Raw Change Set JSON')
    core.info(changesSummary)
    core.endGroup()
  } catch (error) {
    core.warning(
      `Failed to format change set: ${error instanceof Error ? error.message : String(error)}`
    )
    core.info('\nChange Set Details:')
    core.info(changesSummary)
  }
}

/**
 * Generate markdown-formatted change set for PR comments
 */
export function generateChangeSetMarkdown(changesSummary: string): string {
  try {
    const summary: ChangeSetSummary = JSON.parse(changesSummary)

    // Group changes by action
    const grouped = {
      Add: [] as Change[],
      Modify: [] as Change[],
      Remove: [] as Change[]
    }

    for (const change of summary.changes) {
      const action = change.ResourceChange?.Action
      if (action && action in grouped) {
        grouped[action as keyof typeof grouped].push(change as Change)
      }
    }

    const addCount = grouped.Add.length
    const removeCount = grouped.Remove.length

    // Count in-place modifications vs replacements
    let modifyCount = 0
    let replaceCount = 0
    for (const change of grouped.Modify) {
      if (change.ResourceChange?.Replacement === 'True') {
        replaceCount++
      } else {
        modifyCount++
      }
    }

    let markdown = '## 📋 CloudFormation Change Set\n\n'
    const parts = []
    if (addCount > 0) parts.push(`${addCount} to add`)
    if (modifyCount > 0) parts.push(`${modifyCount} to modify`)
    if (replaceCount > 0) parts.push(`${replaceCount} to replace`)
    if (removeCount > 0) parts.push(`${removeCount} to remove`)
    markdown += `**Summary:** ${parts.join(', ')}\n\n`

    if (summary.truncated) {
      markdown += `> ⚠️ **Warning:** Change set truncated. Showing ${summary.changes.length} of ${summary.totalChanges} total changes.\n\n`
    }

    // Display changes by type
    const allChanges = [...grouped.Add, ...grouped.Modify, ...grouped.Remove]

    if (allChanges.length === 0) {
      markdown += '_No changes detected_\n'
      return markdown
    }

    for (const change of allChanges) {
      const rc = change.ResourceChange
      if (!rc) continue

      // Determine symbol based on action and replacement
      let symbol = '⚪'
      if (rc.Action === 'Add') {
        symbol = '🟢'
      } else if (rc.Action === 'Remove') {
        symbol = '🔴'
      } else if (rc.Action === 'Modify') {
        symbol = rc.Replacement === 'True' ? '🟡' : '🔵'
      }

      // Create expandable section - logical ID first, then resource type
      const summary = `${symbol} <strong>${rc.LogicalResourceId}</strong> <code>${rc.ResourceType}</code>`
      markdown += `<details>\n<summary>${summary}</summary>\n\n`

      // Physical resource ID
      if (rc.PhysicalResourceId) {
        markdown += `**Physical ID:** \`${rc.PhysicalResourceId}\`\n\n`
      }

      // Replacement warning
      if (rc.Action === 'Modify' && rc.Replacement === 'True') {
        markdown += `⚠️ **This resource will be replaced** (potential downtime/data loss)\n\n`
      } else if (rc.Action === 'Modify' && rc.Replacement === 'Conditional') {
        markdown += `⚠️ **May require replacement**\n\n`
      }

      // Show diff view using BeforeContext/AfterContext when available
      if (rc.BeforeContext || rc.AfterContext) {
        try {
          const before = rc.BeforeContext
            ? JSON.parse(rc.BeforeContext)
            : undefined
          const after = rc.AfterContext
            ? JSON.parse(rc.AfterContext)
            : undefined
          markdown += generateJsonDiff(before, after, rc.Details)
        } catch {
          // If parsing fails, fall back to showing raw JSON
          if (rc.AfterContext) {
            markdown += '\n**Properties:**\n```json\n'
            markdown += rc.AfterContext
            markdown += '\n```\n'
          } else if (rc.BeforeContext) {
            markdown += '\n**Properties:**\n```json\n'
            markdown += rc.BeforeContext
            markdown += '\n```\n'
          }
        }
      }

      markdown += '\n</details>\n\n'
    }

    return markdown
  } catch (error) {
    return `## ⚠️ Failed to format change set\n\n\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\`\n`
  }
}
