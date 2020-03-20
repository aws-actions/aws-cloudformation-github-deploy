const path = require("path");
const core = require("@actions/core");
const aws = require("aws-sdk");
const fs = require("fs");

// The custom client configuration for the CloudFormation clients.
const clientConfiguration = {
  customUserAgent: "aws-cfn-deploy-for-github-actions"
};

async function deployStack(cfn, params, noEmptyChangeSet) {
  const stacks = await cfn.describeStacks().promise();
  const stack = stacks["Stacks"].find(
    stack => stack.StackName === params.StackName
  );

  if (!stack) {
    core.debug(`Creating CloudFormation Stack`);

    const stack = await cfn.createStack(params).promise();
    await cfn
      .waitFor("stackCreateComplete", { StackName: params.StackName })
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

async function updateStack(cfn, stack, params, noEmptyChangeSet) {
  core.debug("Creating CloudFormation Change Set");

  await cfn.createChangeSet(params).promise();
  const changeSetStatus = await cfn
    .describeChangeSet({
      ChangeSetName: params.ChangeSetName,
      StackName: params.StackName
    })
    .promise();

  if (changeSetStatus.Status === "FAILED") {
    core.debug("Deleting failed Change Set");

    await cfn
      .deleteChangeSet({
        ChangeSetName: params.ChangeSetName,
        StackName: params.StackName
      })
      .promise();

    if (
      !noEmptyChangeSet &&
      changeSetStatus.StatusReason.includes(
        "The submitted information didn't contain changes"
      )
    ) {
      return stack.StackId;
    }

    throw new Error(
      `Failed to create Change Set: ${changeSetStatus.StatusReason}`
    );
  }

  core.debug("Executing CloudFormation Change Set");
  await cfn
    .waitFor("changeSetCreateComplete", {
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

  core.debug("Updating CloudFormation Stack");
  await cfn
    .waitFor("stackUpdateComplete", { StackName: stack.StackName })
    .promise();

  return stack.StackId;
}

async function run() {
  try {
    const cfn = new aws.CloudFormation({ ...clientConfiguration });

    // Get inputs
    const templateFile = core.getInput("template", { required: true });
    const stackName = core.getInput("name", { required: true });
    const capabilities = core.getInput("capabilities", {
      required: false,
      default: "CAPABILITY_IAM"
    });
    const parameterOverrides = core.getInput("parameter-overrides", {
      required: false
    });
    const noEmptyChangeSet = !!+core.getInput("no-fail-on-empty-changeset", {
      required: false
    });

    // Get CloudFormation Stack
    core.debug("Loading CloudFormation Stack template");
    const templateFilePath = path.isAbsolute(templateFile)
      ? templateFile
      : path.join(process.env.GITHUB_WORKSPACE, templateFile);
    const templateBody = fs.readFileSync(templateFilePath, "utf8");

    // CloudFormation Stack Parameter for the creation or update
    const params = {
      StackName: stackName,
      Capabilities: [...capabilities.split(",").map(cap => cap.trim())],
      TemplateBody: templateBody,
      Parameters: [
        ...parameterOverrides.split(",").map(parameter => {
          const [key, value] = parameter.trim().split("=");
          return {
            ParameterKey: key,
            ParameterValue: value
          };
        })
      ]
    };

    core.setOutput(
      "stack-id",
      await deployStack(cfn, params, noEmptyChangeSet)
    );
  } catch (err) {
    core.setFailed(err.message);
    core.debug(err.stack);
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
  run();
}
