import * as core from "@actions/core";
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
  CloudFormationServiceException,
} from "@aws-sdk/client-cloudformation";
import { withRetry } from "./utils";
import { CreateChangeSetInput, CreateStackInputWithName } from "./main";
import { EventMonitorImpl, EventMonitorConfig } from "./event-streaming";

export async function cleanupChangeSet(
  cfn: CloudFormationClient,
  stack: Stack,
  params: CreateChangeSetInput,
  noEmptyChangeSet: boolean,
  noDeleteFailedChangeSet: boolean,
): Promise<string | undefined> {
  const knownErrorMessages = [
    `No updates are to be performed`,
    `The submitted information didn't contain changes`,
  ];

  const changeSetStatus = await withRetry(() =>
    cfn.send(
      new DescribeChangeSetCommand({
        ChangeSetName: params.ChangeSetName,
        StackName: params.StackName,
      }),
    ),
  );

  if (changeSetStatus.Status === "FAILED") {
    core.debug("Deleting failed Change Set");

    if (!noDeleteFailedChangeSet) {
      await withRetry(() =>
        cfn.send(
          new DeleteChangeSetCommand({
            ChangeSetName: params.ChangeSetName,
            StackName: params.StackName,
          }),
        ),
      );
    }

    if (
      noEmptyChangeSet &&
      knownErrorMessages.some((err) =>
        changeSetStatus.StatusReason?.includes(err),
      )
    ) {
      return stack.StackId;
    }

    throw new Error(
      `Failed to create Change Set: ${changeSetStatus.StatusReason}`,
    );
  }
}

export async function updateStack(
  cfn: CloudFormationClient,
  stack: Stack,
  params: CreateChangeSetInput,
  noEmptyChangeSet: boolean,
  noExecuteChangeSet: boolean,
  noDeleteFailedChangeSet: boolean,
): Promise<string | undefined> {
  core.debug("Creating CloudFormation Change Set");
  await withRetry(() => cfn.send(new CreateChangeSetCommand(params)));

  try {
    core.debug("Waiting for CloudFormation Change Set creation");

    await waitUntilChangeSetCreateComplete(
      { client: cfn, maxWaitTime: 1800, minDelay: 10 },
      {
        ChangeSetName: params.ChangeSetName,
        StackName: params.StackName,
      },
    );
  } catch (err) {
    return cleanupChangeSet(
      cfn,
      stack,
      params,
      noEmptyChangeSet,
      noDeleteFailedChangeSet,
    );
  }

  if (noExecuteChangeSet) {
    core.debug("Not executing the change set");
    return stack.StackId;
  }

  core.debug("Executing CloudFormation change set");
  await withRetry(() =>
    cfn.send(
      new ExecuteChangeSetCommand({
        ChangeSetName: params.ChangeSetName,
        StackName: params.StackName,
      }),
    ),
  );

  core.debug("Updating CloudFormation stack");
  await waitUntilStackUpdateComplete(
    { client: cfn, maxWaitTime: 43200, minDelay: 10 },
    {
      StackName: params.StackName,
    },
  );

  return stack.StackId;
}

async function getStack(
  cfn: CloudFormationClient,
  stackNameOrId: string,
): Promise<Stack | undefined> {
  try {
    const stacks = await withRetry(() =>
      cfn.send(
        new DescribeStacksCommand({
          StackName: stackNameOrId,
        }),
      ),
    );

    if (stacks.Stacks?.[0]) {
      return stacks.Stacks[0];
    }

    throw new Error(
      `Stack ${stackNameOrId} not found, but CloudFormation did not throw an exception. This is an unexpected situation, has the SDK changed unexpectedly?`,
    );
  } catch (e) {
    if (
      e instanceof CloudFormationServiceException &&
      e.$metadata.httpStatusCode === 400 &&
      e.name === "ValidationError"
    ) {
      return undefined;
    }
    throw e;
  }
}

export async function deployStack(
  cfn: CloudFormationClient,
  params: CreateStackInputWithName,
  changeSetName: string,
  noEmptyChangeSet: boolean,
  noExecuteChangeSet: boolean,
  noDeleteFailedChangeSet: boolean,
  changeSetDescription?: string,
  enableEventStreaming = true,
): Promise<string | undefined> {
  let eventMonitor: EventMonitorImpl | undefined;

  // Initialize event monitoring if enabled with comprehensive error handling
  if (enableEventStreaming) {
    try {
      const eventConfig: EventMonitorConfig = {
        stackName: params.StackName,
        client: cfn,
        enableColors: true,
        pollIntervalMs: 2000,
        maxPollIntervalMs: 30000,
      };

      eventMonitor = new EventMonitorImpl(eventConfig);

      // Start monitoring before stack operations
      // Run concurrently - don't await to avoid blocking deployment
      eventMonitor.startMonitoring().catch((err) => {
        // Log streaming errors as warnings, not errors - requirement 6.2
        const errorMessage = err instanceof Error ? err.message : String(err);
        core.warning(
          `Event streaming failed but deployment continues: ${errorMessage}`,
        );

        // Log additional context for troubleshooting
        core.debug(
          `Event streaming error context: ${JSON.stringify({
            stackName: params.StackName,
            error: errorMessage,
            timestamp: new Date().toISOString(),
          })}`,
        );
      });

      core.debug("Event streaming started for stack deployment");
    } catch (err) {
      // If event monitor initialization fails, log warning and continue - requirement 6.2
      const errorMessage = err instanceof Error ? err.message : String(err);
      core.warning(
        `Failed to initialize event streaming, deployment continues without streaming: ${errorMessage}`,
      );

      // Ensure eventMonitor is undefined so cleanup doesn't fail
      eventMonitor = undefined;
    }
  }

  try {
    const stack = await getStack(cfn, params.StackName);

    let stackId: string | undefined;

    if (!stack) {
      core.debug(`Creating CloudFormation Stack`);

      const stack = await withRetry(() =>
        cfn.send(
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
            EnableTerminationProtection: params.EnableTerminationProtection,
          }),
        ),
      );

      await waitUntilStackCreateComplete(
        { client: cfn, maxWaitTime: 43200, minDelay: 10 },
        {
          StackName: params.StackName,
        },
      );

      stackId = stack.StackId;
    } else {
      stackId = await updateStack(
        cfn,
        stack,
        {
          ChangeSetName: changeSetName,
          Description: changeSetDescription,
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
 	    IncludeNestedStacks: params.IncludeNestedStacksChangeSet,
            Tags: params.Tags,
          },
        },
        noEmptyChangeSet,
        noExecuteChangeSet,
        noDeleteFailedChangeSet,
      );
    }

    return stackId;
  } catch (deploymentError) {
    // Preserve original deployment error - this is critical for requirement 6.3
    const originalError =
      deploymentError instanceof Error
        ? deploymentError
        : new Error(String(deploymentError));

    core.error(`Deployment failed: ${originalError.message}`);

    // Log deployment error context for debugging
    core.debug(
      `Deployment error context: ${JSON.stringify({
        stackName: params.StackName,
        error: originalError.message,
        errorName: originalError.name,
        timestamp: new Date().toISOString(),
        eventStreamingEnabled: enableEventStreaming,
        eventMonitorActive: eventMonitor?.isMonitoring() || false,
      })}`,
    );

    // Re-throw the original deployment error to maintain existing behavior - requirement 6.3
    throw originalError;
  } finally {
    // Always stop event monitoring when deployment completes or fails
    // This cleanup must not interfere with deployment results - requirement 6.2
    if (eventMonitor) {
      try {
        eventMonitor.stopMonitoring();
        core.debug("Event streaming stopped successfully");
      } catch (err) {
        // Log cleanup errors as warnings, don't affect deployment result - requirement 6.2
        const errorMessage = err instanceof Error ? err.message : String(err);
        core.warning(
          `Error stopping event streaming (deployment result unaffected): ${errorMessage}`,
        );
      }
    }
  }
}

export async function getStackOutputs(
  cfn: CloudFormationClient,
  stackId: string,
): Promise<Map<string, string>> {
  const outputs = new Map<string, string>();
  const stack = await getStack(cfn, stackId);

  if (stack && stack.Outputs) {
    for (const output of stack.Outputs) {
      if (output.OutputKey && output.OutputValue) {
        outputs.set(output.OutputKey, output.OutputValue);
      }
    }
  }

  return outputs;
}
