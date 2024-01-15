import * as core from '@actions/core'
import * as aws from 'aws-sdk'
import { CreateChangeSetInput, CreateStackInput } from './main'

export type Stack = aws.CloudFormation.Stack

interface IdOutputs {
  StackId?: string
  ChangeSetId?: string
}

export async function cleanupChangeSet(
  cfn: aws.CloudFormation,
  stack: Stack,
  params: CreateChangeSetInput,
  noEmptyChangeSet: boolean,
  noDeleteFailedChangeSet: boolean
): Promise<IdOutputs> {
  const knownErrorMessages = [
    `No updates are to be performed`,
    `The submitted information didn't contain changes`
  ]

  const changeSetStatus = await cfn
    .describeChangeSet({
      ChangeSetName: params.ChangeSetName,
      StackName: params.StackName
    })
    .promise()

  if (changeSetStatus.Status === 'FAILED') {
    core.debug('Deleting failed Change Set')

    if (!noDeleteFailedChangeSet) {
      await cfn
        .deleteChangeSet({
          ChangeSetName: params.ChangeSetName,
          StackName: params.StackName
        })
        .promise()
    }

    if (
      noEmptyChangeSet &&
      knownErrorMessages.some(err =>
        changeSetStatus.StatusReason?.includes(err)
      )
    ) {
      return {
        StackId: stack.StackId,
        ChangeSetId: changeSetStatus.ChangeSetId
      }
    }

    throw new Error(
      `Failed to create Change Set: ${changeSetStatus.StatusReason}`
    )
  }
  return {
    StackId: stack.StackId,
    ChangeSetId: changeSetStatus.ChangeSetId
  }
}

export async function updateStack(
  cfn: aws.CloudFormation,
  stack: Stack,
  params: CreateChangeSetInput,
  noEmptyChangeSet: boolean,
  noExecuteChangeSet: boolean,
  noDeleteFailedChangeSet: boolean
): Promise<IdOutputs> {
  core.debug('Creating CloudFormation Change Set')
  const createChangeSet = await cfn.createChangeSet(params).promise()

  try {
    core.debug('Waiting for CloudFormation Change Set creation')
    await cfn
      .waitFor('changeSetCreateComplete', {
        ChangeSetName: params.ChangeSetName,
        StackName: params.StackName
      })
      .promise()
  } catch (_) {
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
    return {
      StackId: stack.StackId,
      ChangeSetId: createChangeSet.Id
    }
  }

  core.debug('Executing CloudFormation change set')
  await cfn
    .executeChangeSet({
      ChangeSetName: params.ChangeSetName,
      StackName: params.StackName
    })
    .promise()

  core.debug('Updating CloudFormation stack')
  await cfn
    .waitFor('stackUpdateComplete', { StackName: stack.StackId })
    .promise()

  return {
    StackId: stack.StackId,
    ChangeSetId: createChangeSet.Id
  }
}

async function getStack(
  cfn: aws.CloudFormation,
  stackNameOrId: string
): Promise<Stack | undefined> {
  try {
    const stacks = await cfn
      .describeStacks({
        StackName: stackNameOrId
      })
      .promise()
    return stacks.Stacks?.[0]
  } catch (e) {
    // @ts-expect-error: Object is of type 'unknown'
    if (e.code === 'ValidationError' && e.message.match(/does not exist/)) {
      return undefined
    }
    throw e
  }
}

export async function deployStack(
  cfn: aws.CloudFormation,
  params: CreateStackInput,
  changeSetName: string,
  noEmptyChangeSet: boolean,
  noExecuteChangeSet: boolean,
  noDeleteFailedChangeSet: boolean
): Promise<IdOutputs> {
  const stack = await getStack(cfn, params.StackName)

  if (!stack) {
    core.debug(`Creating CloudFormation Stack`)

    const stack = await cfn.createStack(params).promise()
    await cfn
      .waitFor('stackCreateComplete', { StackName: params.StackName })
      .promise()

    return {
      StackId: stack.StackId
    }
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
  cfn: aws.CloudFormation,
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
