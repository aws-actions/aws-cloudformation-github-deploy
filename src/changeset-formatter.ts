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
  changes: Array<{
    type?: string
    resourceChange?: {
      action?: string
      logicalResourceId?: string
      physicalResourceId?: string
      resourceType?: string
      replacement?: string
      scope?: string[]
      details?: ResourceChangeDetail[]
    }
  }>
  totalChanges: number
  truncated: boolean
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
  enableColors: boolean
): string[] {
  const lines: string[] = []
  const target = detail.Target

  if (!target) return lines

  const style = getActionStyle('Modify', enableColors)
  const gray = enableColors ? COLORS.gray : ''
  const reset = enableColors ? COLORS.reset : ''

  // Property name/path
  const propertyName = target.Name || target.Attribute || 'Unknown'
  lines.push(` └─ ${style.color}[${style.symbol}] ${propertyName}${reset}`)

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
  const rc = change.resourceChange
  if (!rc) {
    return { title: 'Unknown Change', details: [] }
  }

  const style = getActionStyle(rc.action, enableColors)
  const reset = enableColors ? COLORS.reset : ''
  const bold = enableColors ? COLORS.bold : ''
  const yellow = enableColors ? COLORS.yellow : ''

  // Title line for the group
  const title = `${style.color}[${style.symbol}] ${bold}${rc.resourceType || 'Unknown'}${reset}${style.color} ${rc.logicalResourceId || 'Unknown'}${reset}`

  const details: string[] = []

  // Show replacement warning
  if (rc.action === 'Modify' && rc.replacement === 'True') {
    details.push(
      `${yellow}⚠️  Resource will be replaced (may cause downtime)${reset}`
    )
  } else if (rc.action === 'Modify' && rc.replacement === 'Conditional') {
    details.push(`${yellow}⚠️  May require replacement${reset}`)
  }

  // Show property-level changes
  if (rc.details && rc.details.length > 0) {
    for (const detail of rc.details) {
      const detailLines = formatDetail(detail, enableColors)
      details.push(...detailLines)
    }
  } else if (rc.scope && rc.scope.length > 0) {
    // Fallback to scope if no details
    const gray = enableColors ? COLORS.gray : ''
    details.push(`${gray}Modified: ${rc.scope.join(', ')}${reset}`)
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
      const action = change.resourceChange?.action
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
