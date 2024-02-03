import * as core from '@actions/core'
import {
  CloudFormationClient,
  Stack,
  DescribeChangeSetCommand,
  DeleteChangeSetCommand,
  waitUntilChangeSetCreateComplete,
  waitUntilStackUpdateComplete,
  waitUntilStackCreateComplete,
  CreateChangeSetCommand,
  ExecuteChangeSetCommand,
  DescribeStacksCommand,
  CreateStackCommand,
  CloudFormationServiceException
} from '@aws-sdk/client-cloudformation'
import { CreateChangeSetInput, CreateStackInput } from './main'

export async function cleanupChangeSet(
  cfn: CloudFormationClient,
  stack: Stack,
  params: CreateChangeSetInput,
  noEmptyChangeSet: boolean,
  noDeleteFailedChangeSet: boolean
): Promise<string | undefined> {
  const knownErrorMessages = [
    `No updates are to be performed`,
    `The submitted information didn't contain changes`
  ]

  const changeSetStatus = await cfn.send(
    new DescribeChangeSetCommand({
      ChangeSetName: params.ChangeSetName,
      StackName: params.StackName
    })
  )

  if (changeSetStatus.Status === 'FAILED') {
    core.debug('Deleting failed Change Set')

    if (!noDeleteFailedChangeSet) {
      cfn.send(
        new DeleteChangeSetCommand({
          ChangeSetName: params.ChangeSetName,
          StackName: params.StackName
        })
      )
    }

    if (
      noEmptyChangeSet &&
      knownErrorMessages.some(err =>
        changeSetStatus.StatusReason?.includes(err)
      )
    ) {
      return stack.StackId
    }

    throw new Error(
      `Failed to create Change Set: ${changeSetStatus.StatusReason}`
    )
  }
}

export async function updateStack(
  cfn: CloudFormationClient,
  stack: Stack,
  params: CreateChangeSetInput,
  noEmptyChangeSet: boolean,
  noExecuteChangeSet: boolean,
  noDeleteFailedChangeSet: boolean
): Promise<string | undefined> {
  core.debug('Creating CloudFormation Change Set')
  await cfn.send(new CreateChangeSetCommand(params))

  try {
    core.debug('Waiting for CloudFormation Change Set creation')

    await waitUntilChangeSetCreateComplete(
      { client: cfn, maxWaitTime: 1800, minDelay: 10 },
      {
        ChangeSetName: params.ChangeSetName,
        StackName: params.StackName
      }
    )
  } catch (err) {
    return cleanupChangeSet(
      cfn,
      stack,
      params,
      noEmptyChangeSet,
      noDeleteFailedChangeSet
    )
  }

  if (noExecuteChangeSet) {
    core.debug('Not executing the change set')
    return stack.StackId
  }

  core.debug('Executing CloudFormation change set')
  await cfn.send(
    new ExecuteChangeSetCommand({
      ChangeSetName: params.ChangeSetName,
      StackName: params.StackName
    })
  )

  core.debug('Updating CloudFormation stack')
  await waitUntilStackUpdateComplete(
    { client: cfn, maxWaitTime: 43200, minDelay: 10 },
    {
      StackName: params.StackName
    }
  )

  return stack.StackId
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

    return stacks.Stacks?.[0]
  } catch (e) {
    if (e instanceof CloudFormationServiceException) {
      return undefined
    }
    throw e
  }
}

export async function deployStack(
  cfn: CloudFormationClient,
  params: CreateStackInput,
  changeSetName: string,
  noEmptyChangeSet: boolean,
  noExecuteChangeSet: boolean,
  noDeleteFailedChangeSet: boolean
): Promise<string | undefined> {
  const stack = await getStack(cfn, params.StackName || '')

  if (!stack) {
    core.debug(`Creating CloudFormation Stack`)

    const stack = await cfn.send(
      new CreateStackCommand({
        StackName: params.StackName,
        TemplateBody: params.TemplateBody,
        TemplateURL: params.TemplateURL,
        Parameters: params.Parameters,
        Capabilities: params.Capabilities,
        ResourceTypes: params.ResourceTypes,
        RoleARN: params.RoleARN,
        RollbackConfiguration: params.RollbackConfiguration,
        NotificationARNs: params.NotificationARNs,
        DisableRollback: params.DisableRollback,
        Tags: params.Tags,
        TimeoutInMinutes: params.TimeoutInMinutes,
        EnableTerminationProtection: params.EnableTerminationProtection
      })
    )

    await waitUntilStackCreateComplete(
      { client: cfn, maxWaitTime: 43200, minDelay: 10 },
      {
        StackName: params.StackName
      }
    )

    return stack.StackId
  }

  return await updateStack(
    cfn,
    stack,
    {
      ChangeSetName: changeSetName,
      ...{
        StackName: params.StackName,
        TemplateBody: params.TemplateBody,
        TemplateURL: params.TemplateURL,
        Parameters: params.Parameters,
        Capabilities: params.Capabilities,
        ResourceTypes: params.ResourceTypes,
        RoleARN: params.RoleARN,
        RollbackConfiguration: params.RollbackConfiguration,
        NotificationARNs: params.NotificationARNs,
        Tags: params.Tags
      }
    },
    noEmptyChangeSet,
    noExecuteChangeSet,
    noDeleteFailedChangeSet
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
