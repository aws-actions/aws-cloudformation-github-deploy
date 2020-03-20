import * as core from '@actions/core';
import * as aws from 'aws-sdk';
import { CreateChangeSetInput, CreateStackInput } from './main';

export type Stack = aws.CloudFormation.Stack;

export async function updateStack(
  cfn: aws.CloudFormation,
  stack: Stack,
  params: CreateChangeSetInput,
  noEmptyChangeSet: boolean
): Promise<string | undefined> {
  core.debug('Creating CloudFormation Change Set');

  await cfn.createChangeSet(params).promise();
  const changeSetStatus = await cfn
    .describeChangeSet({
      ChangeSetName: params.ChangeSetName,
      StackName: params.StackName
    })
    .promise();

  if (changeSetStatus.Status === 'FAILED') {
    core.debug('Deleting failed Change Set');

    await cfn
      .deleteChangeSet({
        ChangeSetName: params.ChangeSetName,
        StackName: params.StackName
      })
      .promise();

    if (
      noEmptyChangeSet &&
      changeSetStatus.StatusReason?.includes(
        "The submitted information didn't contain changes"
      )
    ) {
      return stack.StackId;
    }

    throw new Error(
      `Failed to create Change Set: ${changeSetStatus.StatusReason}`
    );
  }

  core.debug('Executing CloudFormation Change Set');
  await cfn
    .waitFor('changeSetCreateComplete', {
      ChangeSetName: params.ChangeSetName,
      StackName: params.StackName
    })
    .promise();

  await cfn
    .executeChangeSet({
      ChangeSetName: params.ChangeSetName,
      StackName: params.StackName
    })
    .promise();

  core.debug('Updating CloudFormation Stack');
  await cfn
    .waitFor('stackUpdateComplete', { StackName: stack.StackId })
    .promise();

  return stack.StackId;
}

export async function deployStack(
  cfn: aws.CloudFormation,
  params: CreateStackInput,
  noEmptyChangeSet: boolean
): Promise<string | undefined> {
  const stacks = await cfn.describeStacks().promise();
  const stack = stacks['Stacks']?.find(
    stack => stack.StackName === params.StackName
  );

  if (!stack) {
    core.debug(`Creating CloudFormation Stack`);

    const stack = await cfn.createStack(params).promise();
    await cfn
      .waitFor('stackCreateComplete', { StackName: params.StackName })
      .promise();

    return stack.StackId;
  }

  return await updateStack(
    cfn,
    stack,
    {
      ...params,
      ChangeSetName: `${params.StackName}-CS`
    },
    noEmptyChangeSet
  );
}
