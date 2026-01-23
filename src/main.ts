import * as path from 'path'
import * as core from '@actions/core'
import {
  CloudFormationClient,
  CreateChangeSetCommandInput,
  CreateStackCommandInput,
  Capability,
  CloudFormationServiceException
} from '@aws-sdk/client-cloudformation'
import * as fs from 'fs'
import {
  deployStack,
  getStackOutputs,
  executeExistingChangeSet
} from './deploy'
import { isUrl, configureProxy } from './utils'
import { validateAndParseInputs } from './validation'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { EventMonitorImpl, EventMonitorConfig } from './event-streaming'

// Validated by core.getInput() which throws if not set
export type CreateStackInputWithName = CreateStackCommandInput & {
  StackName: string
  IncludeNestedStacksChangeSet?: boolean
  DeploymentMode?: 'REVERT_DRIFT'
}

export type CreateChangeSetInput = CreateChangeSetCommandInput
export type InputNoFailOnEmptyChanges = '1' | '0'
export type InputCapabilities =
  | 'CAPABILITY_IAM'
  | 'CAPABILITY_NAMED_IAM'
  | 'CAPABILITY_AUTO_EXPAND'

export type Inputs = {
  [key: string]: string
}

// The custom client configuration for the CloudFormation clients.
let clientConfiguration = {
  customUserAgent: 'aws-cloudformation-github-deploy-for-github-actions'
}
export async function run(): Promise<void> {
  try {
    /* istanbul ignore next */
    const { GITHUB_WORKSPACE = __dirname } = process.env

    // Collect all inputs
    const rawInputs: Record<string, string | undefined> = {
      mode: core.getInput('mode', { required: false }),
      name: core.getInput('name', { required: true }),
      template: core.getInput('template', { required: false }),
      capabilities: core.getInput('capabilities', { required: false }),
      'parameter-overrides': core.getInput('parameter-overrides', {
        required: false
      }),
      'fail-on-empty-changeset': core.getInput('fail-on-empty-changeset', {
        required: false
      }),
      'no-execute-changeset': core.getInput('no-execute-changeset', {
        required: false
      }),
      'no-delete-failed-changeset': core.getInput(
        'no-delete-failed-changeset',
        { required: false }
      ),
      'disable-rollback': core.getInput('disable-rollback', {
        required: false
      }),
      'timeout-in-minutes': core.getInput('timeout-in-minutes', {
        required: false
      }),
      'notification-arns': core.getInput('notification-arns', {
        required: false
      }),
      'role-arn': core.getInput('role-arn', { required: false }),
      tags: core.getInput('tags', { required: false }),
      'termination-protection': core.getInput('termination-protection', {
        required: false
      }),
      'http-proxy': core.getInput('http-proxy', { required: false }),
      'change-set-name': core.getInput('change-set-name', { required: false }),
      'include-nested-stacks-change-set': core.getInput(
        'include-nested-stacks-change-set',
        { required: false }
      ),
      'deployment-mode': core.getInput('deployment-mode', { required: false }),
      'execute-change-set-id': core.getInput('execute-change-set-id', {
        required: false
      })
    }

    // Validate and parse inputs
    const inputs = validateAndParseInputs(rawInputs)

    // Configures proxy
    const agent = configureProxy(inputs['http-proxy'])
    if (agent) {
      clientConfiguration = {
        ...clientConfiguration,
        ...{
          requestHandler: new NodeHttpHandler({
            httpsAgent: agent
          })
        }
      }
    }

    const cfn = new CloudFormationClient({ ...clientConfiguration })

    // Execute existing change set mode
    if (inputs.mode === 'execute-only') {
      // Calculate maxWaitTime for execute-only mode
      const defaultMaxWaitTime = 21000 // 5 hours 50 minutes in seconds
      const timeoutMinutes = inputs['timeout-in-minutes']
      const maxWaitTime =
        typeof timeoutMinutes === 'number'
          ? timeoutMinutes * 60
          : defaultMaxWaitTime

      const stackId = await executeExistingChangeSet(
        cfn,
        inputs.name,
        inputs['execute-change-set-id']!,
        maxWaitTime
      )
      core.setOutput('stack-id', stackId || 'UNKNOWN')

      if (stackId) {
        const outputs = await getStackOutputs(cfn, stackId)
        for (const [key, value] of outputs) {
          core.setOutput(key, value)
        }
      }
      return
    }

    // Setup CloudFormation Stack
    let templateBody
    let templateUrl

    if (isUrl(inputs.template!)) {
      core.debug('Using CloudFormation Stack from Amazon S3 Bucket')
      templateUrl = inputs.template
    } else {
      core.debug('Loading CloudFormation Stack template')
      const templateFilePath = path.isAbsolute(inputs.template!)
        ? inputs.template!
        : path.join(GITHUB_WORKSPACE, inputs.template!)
      templateBody = fs.readFileSync(templateFilePath, 'utf8')
    }

    // CloudFormation Stack Parameter for the creation or update
    const params: CreateStackInputWithName = {
      StackName: inputs.name,
      Capabilities: inputs.capabilities as Capability[],
      RoleARN: inputs['role-arn'],
      NotificationARNs: inputs['notification-arns'],
      DisableRollback: inputs['disable-rollback'],
      TimeoutInMinutes: inputs['timeout-in-minutes'],
      TemplateBody: templateBody,
      TemplateURL: templateUrl,
      Tags: inputs.tags,
      EnableTerminationProtection: inputs['termination-protection'],
      IncludeNestedStacksChangeSet: inputs['include-nested-stacks-change-set'],
      DeploymentMode: inputs['deployment-mode'],
      Parameters: inputs['parameter-overrides']
    }

    // Calculate maxWaitTime: use timeout-in-minutes if provided, otherwise default to 5h50m (safe for GitHub Actions 6h limit)
    const defaultMaxWaitTime = 21000 // 5 hours 50 minutes in seconds
    const timeoutMinutes = inputs['timeout-in-minutes']
    const maxWaitTime =
      typeof timeoutMinutes === 'number'
        ? timeoutMinutes * 60
        : defaultMaxWaitTime

    const changeSetName = inputs['change-set-name'] || `${params.StackName}-CS`

    // Initialize event streaming for real-time deployment feedback
    let eventMonitor: EventMonitorImpl | undefined
    try {
      const eventConfig: EventMonitorConfig = {
        stackName: params.StackName,
        changeSetName,
        client: cfn,
        enableColors: true, // GitHub Actions supports ANSI colors
        pollIntervalMs: 2000, // Poll every 2 seconds
        maxPollIntervalMs: 30000 // Max 30 seconds between polls
      }
      eventMonitor = new EventMonitorImpl(eventConfig)
      eventMonitor.startMonitoring().catch(err => {
        core.warning(
          `Event streaming failed but deployment continues: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      })
      core.debug('Event streaming started for stack deployment')
    } catch (error) {
      core.warning(
        `Failed to initialize event streaming, deployment continues: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      eventMonitor = undefined
    }

    try {
      const result = await deployStack(
        cfn,
        params,
        changeSetName,
        inputs['fail-on-empty-changeset'],
        inputs['no-execute-changeset'] || inputs.mode === 'create-only',
        inputs['no-delete-failed-changeset'],
        maxWaitTime
      )

      core.setOutput('stack-id', result.stackId || 'UNKNOWN')

      // Set change set outputs when not executing
      if (result.changeSetInfo) {
        core.setOutput('change-set-id', result.changeSetInfo.changeSetId || '')
        core.setOutput(
          'change-set-name',
          result.changeSetInfo.changeSetName || ''
        )
        core.setOutput(
          'has-changes',
          result.changeSetInfo.hasChanges.toString()
        )
        core.setOutput(
          'changes-count',
          result.changeSetInfo.changesCount.toString()
        )
        core.setOutput('changes-summary', result.changeSetInfo.changesSummary)
      }

      if (result.stackId) {
        const outputs = await getStackOutputs(cfn, result.stackId)
        for (const [key, value] of outputs) {
          core.setOutput(key, value)
        }
      }
    } finally {
      // Always stop event monitoring when deployment completes or fails
      if (eventMonitor) {
        eventMonitor.stopMonitoring()
        core.debug('Event streaming stopped')
      }
    }
  } catch (err) {
    if (
      err instanceof CloudFormationServiceException &&
      err.message?.includes(
        'Member must have length less than or equal to 51200'
      )
    ) {
      core.setFailed(
        'Template size exceeds CloudFormation limit (51,200 bytes). Consider using a template URL from S3 instead of inline template content.'
      )
    } else {
      // @ts-expect-error: Object is of type 'unknown'
      core.setFailed(err.message || 'Unknown error occurred')
    }

    // @ts-expect-error: Object is of type 'unknown'
    core.debug(err.stack)
  }
}

/* istanbul ignore next */
if (require.main === module) {
  run()
}
