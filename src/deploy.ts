import * as core from '@actions/core'
import {
  CloudFormationClient,
  Stack,
  DescribeChangeSetCommand,
  DeleteChangeSetCommand,
  waitUntilChangeSetCreateComplete,
  CreateChangeSetCommand,
  ExecuteChangeSetCommand,
  DescribeStacksCommand,
  DescribeEventsCommand,
  CloudFormationServiceException
} from '@aws-sdk/client-cloudformation'
import { CreateChangeSetInput, CreateStackInputWithName } from './main'

export interface ChangeSetInfo {
  changeSetId?: string
  changeSetName?: string
  hasChanges: boolean
  changesCount: number
  changesSummary: string
}

export async function waitUntilStackOperationComplete(
  params: {
    client: CloudFormationClient
    maxWaitTime: number
    minDelay: number
  },
  input: { StackName: string }
): Promise<void> {
  const { client, maxWaitTime, minDelay } = params
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime * 1000) {
    try {
      const result = await client.send(new DescribeStacksCommand(input))
      const stack = result.Stacks?.[0]

      if (!stack) {
        throw new Error(`Stack ${input.StackName} not found`)
      }

      const status = stack.StackStatus
      core.debug(`Stack status: ${status}`)

      // Success states - operation completed successfully
      if (
        status === 'CREATE_COMPLETE' ||
        status === 'UPDATE_COMPLETE' ||
        status === 'IMPORT_COMPLETE'
      ) {
        core.debug(`Stack operation completed with status: ${status}`)
        return
      }

      // Failure states - operation failed
      if (
        status === 'CREATE_FAILED' ||
        status === 'UPDATE_FAILED' ||
        status === 'DELETE_FAILED' ||
        status === 'ROLLBACK_COMPLETE' ||
        status === 'ROLLBACK_FAILED' ||
        status === 'UPDATE_ROLLBACK_COMPLETE' ||
        status === 'UPDATE_ROLLBACK_FAILED' ||
        status === 'IMPORT_ROLLBACK_COMPLETE' ||
        status === 'IMPORT_ROLLBACK_FAILED'
      ) {
        // Get failed events using change set ID if available
        let failureReason = `Stack operation failed with status: ${status}`
        throw new Error(failureReason)
      }

      // In-progress states - keep waiting
      core.debug(`Stack still in progress, waiting ${minDelay} seconds...`)
      await new Promise(resolve => setTimeout(resolve, minDelay * 1000))
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        throw new Error(`Stack ${input.StackName} does not exist`)
      }
      throw error
    }
  }

  throw new Error(`Timeout after ${maxWaitTime} seconds`)
}

export async function executeExistingChangeSet(
  cfn: CloudFormationClient,
  stackName: string,
  changeSetId: string,
  maxWaitTime = 21000
): Promise<string | undefined> {
  core.debug(`Executing existing change set: ${changeSetId}`)

  await cfn.send(
    new ExecuteChangeSetCommand({
      ChangeSetName: changeSetId,
      StackName: stackName
    })
  )

  core.debug('Waiting for CloudFormation stack operation to complete')
  try {
    await waitUntilStackOperationComplete(
      { client: cfn, maxWaitTime, minDelay: 10 },
      { StackName: stackName }
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('Timeout after')) {
      core.warning(
        `Stack operation exceeded ${
          maxWaitTime / 60
        } minutes but may still be in progress. ` +
          `Check AWS CloudFormation console for stack '${stackName}' status.`
      )
      const stack = await getStack(cfn, stackName)
      return stack?.StackId
    }
    throw error
  }

  const stack = await getStack(cfn, stackName)
  return stack?.StackId
}

export async function getChangeSetInfo(
  cfn: CloudFormationClient,
  changeSetName: string,
  stackName: string
): Promise<ChangeSetInfo> {
  const MAX_CHANGES_IN_SUMMARY = 50 // Limit to prevent exceeding GitHub Actions output limits
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allChanges: any[] = []
  let nextToken: string | undefined

  // Paginate through all changes
  do {
    const changeSetStatus = await cfn.send(
      new DescribeChangeSetCommand({
        ChangeSetName: changeSetName,
        StackName: stackName,
        IncludePropertyValues: true,
        NextToken: nextToken
      })
    )

    const changes = changeSetStatus.Changes || []
    allChanges = allChanges.concat(changes)
    nextToken = changeSetStatus.NextToken

    // Get the first response for metadata
    if (!nextToken) {
      const hasChanges = allChanges.length > 0
      const limitedChanges = allChanges.slice(0, MAX_CHANGES_IN_SUMMARY)
      const truncated = allChanges.length > MAX_CHANGES_IN_SUMMARY

      const changesSummary = {
        changes: limitedChanges,
        totalChanges: allChanges.length,
        truncated,
        executionStatus: changeSetStatus.ExecutionStatus,
        status: changeSetStatus.Status,
        creationTime: changeSetStatus.CreationTime
      }

      return {
        changeSetId: changeSetStatus.ChangeSetId,
        changeSetName: changeSetStatus.ChangeSetName,
        hasChanges,
        changesCount: allChanges.length,
        changesSummary: JSON.stringify(changesSummary, null, 2)
      }
    }
  } while (nextToken)

  // This should never be reached, but TypeScript requires it
  throw new Error('Unexpected end of pagination')
}

export async function cleanupChangeSet(
  cfn: CloudFormationClient,
  stack: Stack,
  params: CreateChangeSetInput,
  failOnEmptyChangeSet: boolean,
  noDeleteFailedChangeSet: boolean,
  changeSetId?: string
): Promise<string | undefined> {
  const knownErrorMessages = [
    `No updates are to be performed`,
    `The submitted information didn't contain changes`
  ]

  const changeSetStatus = await cfn.send(
    new DescribeChangeSetCommand({
      ChangeSetName: params.ChangeSetName,
      StackName: params.StackName,
      IncludePropertyValues: true
    })
  )

  if (changeSetStatus.Status === 'FAILED') {
    core.debug('Deleting failed Change Set')

    // Get detailed failure information BEFORE deleting the change set
    let failureReason = `Failed to create Change Set: ${changeSetStatus.StatusReason}`

    // Only call DescribeEvents for validation failures (ExecutionStatus: UNAVAILABLE, Status: FAILED)
    if (
      changeSetStatus.ExecutionStatus === 'UNAVAILABLE' &&
      changeSetStatus.Status === 'FAILED'
    ) {
      const eventChangeSetId = changeSetId || changeSetStatus.ChangeSetId
      if (eventChangeSetId) {
        try {
          core.info(
            `Attempting to get validation failure details for: ${eventChangeSetId}`
          )
          const events = await cfn.send(
            new DescribeEventsCommand({
              ChangeSetName: eventChangeSetId
            })
          )
          core.info(
            `Retrieved ${
              events.OperationEvents?.length || 0
            } events for change set`
          )
          const validationEvents = events.OperationEvents?.filter(
            event => event.EventType === 'VALIDATION_ERROR'
          )
          if (validationEvents && validationEvents.length > 0) {
            const reasons = validationEvents
              .map(
                event =>
                  `${event.ValidationPath}: ${event.ValidationStatusReason}`
              )
              .join('; ')
            failureReason += `. Validation errors: ${reasons}`
          }
        } catch (error) {
          core.info(`Failed to get validation event details: ${error}`)
        }
      }
    }

    if (!noDeleteFailedChangeSet) {
      cfn.send(
        new DeleteChangeSetCommand({
          ChangeSetName: params.ChangeSetName,
          StackName: params.StackName
        })
      )
    }

    if (
      !failOnEmptyChangeSet &&
      knownErrorMessages.some(err =>
        changeSetStatus.StatusReason?.includes(err)
      )
    ) {
      return stack.StackId
    }

    throw new Error(failureReason)
  }
}

export async function updateStack(
  cfn: CloudFormationClient,
  stack: Stack,
  params: CreateChangeSetInput,
  failOnEmptyChangeSet: boolean,
  noExecuteChangeSet: boolean,
  noDeleteFailedChangeSet: boolean,
  maxWaitTime = 21000,
  onChangeSetReady?: () => void
): Promise<{ stackId?: string; changeSetInfo?: ChangeSetInfo }> {
  core.debug('Creating CloudFormation Change Set')
  const createResponse = await cfn.send(new CreateChangeSetCommand(params))

  try {
    core.debug('Waiting for CloudFormation Change Set creation')

    await waitUntilChangeSetCreateComplete(
      { client: cfn, maxWaitTime: 1800, minDelay: 10 },
      {
        ChangeSetName: params.ChangeSetName,
        StackName: params.StackName
      }
    )
  } catch {
    core.debug(
      'Change set creation waiter failed, getting change set info anyway'
    )

    // Still try to get change set info even if waiter failed
    const changeSetInfo = await getChangeSetInfo(
      cfn,
      params.ChangeSetName!,
      params.StackName!
    )

    const result = await cleanupChangeSet(
      cfn,
      stack,
      params,
      failOnEmptyChangeSet,
      noDeleteFailedChangeSet,
      createResponse.Id
    )
    return { stackId: result, changeSetInfo }
  }

  // Get change set information
  const changeSetInfo = await getChangeSetInfo(
    cfn,
    params.ChangeSetName!,
    params.StackName!
  )

  if (noExecuteChangeSet) {
    core.debug('Not executing the change set')
    return { stackId: stack.StackId, changeSetInfo }
  }

  // Notify that changeset is ready (for event monitoring to start)
  if (onChangeSetReady) {
    onChangeSetReady()
  }

  core.debug('Executing CloudFormation change set')
  await cfn.send(
    new ExecuteChangeSetCommand({
      ChangeSetName: params.ChangeSetName,
      StackName: params.StackName
    })
  )

  core.debug('Updating CloudFormation stack')
  try {
    await waitUntilStackOperationComplete(
      {
        client: cfn,
        maxWaitTime,
        minDelay: 10
      },
      {
        StackName: params.StackName!
      }
    )
  } catch (error) {
    // Handle timeout gracefully
    if (error instanceof Error && error.message.includes('Timeout after')) {
      core.warning(
        `Stack operation exceeded ${
          maxWaitTime / 60
        } minutes but may still be in progress. ` +
          `Check AWS CloudFormation console for stack '${params.StackName}' status.`
      )
      // Try to get current stack ID
      const currentStack = await getStack(cfn, params.StackName!)
      return { stackId: currentStack?.StackId || stack.StackId }
    }

    // Get execution failure details using OperationId
    const stackResponse = await cfn.send(
      new DescribeStacksCommand({ StackName: params.StackName! })
    )
    const executionOp = stackResponse.Stacks?.[0]?.LastOperations?.find(
      op =>
        op.OperationType === 'UPDATE_STACK' ||
        op.OperationType === 'CREATE_STACK'
    )

    if (executionOp?.OperationId) {
      const eventsResponse = await cfn.send(
        new DescribeEventsCommand({
          OperationId: executionOp.OperationId,
          Filters: { FailedEvents: true }
        })
      )

      if (eventsResponse.OperationEvents?.length) {
        const failureEvent = eventsResponse.OperationEvents[0]
        throw new Error(
          `Stack execution failed: ${
            failureEvent.ResourceStatusReason || failureEvent.ResourceStatus
          }`
        )
      }
    }
    throw error
  }

  // Get final stack to retrieve ID (important for CREATE operations where stack.StackId was initially undefined)
  const finalStack = await getStack(cfn, params.StackName!)
  return { stackId: finalStack?.StackId || stack.StackId }
}

async function getStack(
  cfn: CloudFormationClient,
  stackNameOrId: string
): Promise<Stack | undefined> {
  try {
    const stacks = await cfn.send(
      new DescribeStacksCommand({
        StackName: stackNameOrId
      })
    )

    if (stacks.Stacks?.[0]) {
      return stacks.Stacks[0]
    }

    throw new Error(
      `Stack ${stackNameOrId} not found, but CloudFormation did not throw an exception. This is an unexpected situation, has the SDK changed unexpectedly?`
    )
  } catch (e) {
    if (
      e instanceof CloudFormationServiceException &&
      e.$metadata.httpStatusCode === 400 &&
      e.name === 'ValidationError'
    ) {
      return undefined
    }
    throw e
  }
}

function buildCreateChangeSetParams(
  params: CreateStackInputWithName,
  changeSetName: string
): CreateChangeSetInput {
  return {
    ChangeSetName: changeSetName,
    StackName: params.StackName,
    TemplateBody: params.TemplateBody,
    TemplateURL: params.TemplateURL,
    Parameters: params.Parameters,
    Capabilities: params.Capabilities,
    ResourceTypes: params.ResourceTypes,
    RoleARN: params.RoleARN,
    RollbackConfiguration: params.RollbackConfiguration,
    NotificationARNs: params.NotificationARNs,
    Tags: params.Tags,
    ChangeSetType: 'CREATE',
    IncludeNestedStacks: params.IncludeNestedStacksChangeSet
    // DeploymentMode is not valid for CREATE change sets
  }
}

function buildUpdateChangeSetParams(
  params: CreateStackInputWithName,
  changeSetName: string
): CreateChangeSetInput {
  return {
    ChangeSetName: changeSetName,
    StackName: params.StackName,
    TemplateBody: params.TemplateBody,
    TemplateURL: params.TemplateURL,
    Parameters: params.Parameters,
    Capabilities: params.Capabilities,
    ResourceTypes: params.ResourceTypes,
    RoleARN: params.RoleARN,
    RollbackConfiguration: params.RollbackConfiguration,
    NotificationARNs: params.NotificationARNs,
    Tags: params.Tags,
    ChangeSetType: 'UPDATE',
    IncludeNestedStacks: params.IncludeNestedStacksChangeSet,
    DeploymentMode: params.DeploymentMode // Only valid for UPDATE change sets
  }
}

export async function deployStack(
  cfn: CloudFormationClient,
  params: CreateStackInputWithName,
  changeSetName: string,
  failOnEmptyChangeSet: boolean,
  noExecuteChangeSet: boolean,
  noDeleteFailedChangeSet: boolean,
  maxWaitTime = 21000,
  onChangeSetReady?: () => void
): Promise<{ stackId?: string; changeSetInfo?: ChangeSetInfo }> {
  const stack = await getStack(cfn, params.StackName)

  if (!stack) {
    core.debug(`Creating CloudFormation Stack via Change Set`)
    const createParams = buildCreateChangeSetParams(params, changeSetName)

    return await updateStack(
      cfn,
      { StackId: undefined } as Stack,
      createParams,
      failOnEmptyChangeSet,
      noExecuteChangeSet,
      noDeleteFailedChangeSet,
      maxWaitTime,
      onChangeSetReady
    )
  }

  core.debug(`Updating CloudFormation Stack via Change Set`)
  const updateParams = buildUpdateChangeSetParams(params, changeSetName)

  return await updateStack(
    cfn,
    stack,
    updateParams,
    failOnEmptyChangeSet,
    noExecuteChangeSet,
    noDeleteFailedChangeSet,
    maxWaitTime,
    onChangeSetReady
  )
}

export async function getStackOutputs(
  cfn: CloudFormationClient,
  stackId: string
): Promise<Map<string, string>> {
  const outputs = new Map<string, string>()
  const stack = await getStack(cfn, stackId)

  if (stack && stack.Outputs) {
    for (const output of stack.Outputs) {
      if (output.OutputKey && output.OutputValue) {
        outputs.set(output.OutputKey, output.OutputValue)
      }
    }
  }

  return outputs
}
