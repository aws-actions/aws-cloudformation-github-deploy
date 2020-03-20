import * as path from 'path';
import * as core from '@actions/core';
import * as aws from 'aws-sdk';
import * as fs from 'fs';
import { deployStack } from './deploy';

export type CreateStackInput = aws.CloudFormation.Types.CreateStackInput;
export type CreateChangeSetInput = aws.CloudFormation.Types.CreateChangeSetInput;
export type InputNoFailOnEmptyChanges = '1' | '0';
export type InputCapabilities =
  | 'CAPABILITY_IAM'
  | 'CAPABILITY_NAMED_IAM'
  | 'CAPABILITY_AUTO_EXPAND';

export type Inputs = {
  [key: string]: string;
};

// The custom client configuration for the CloudFormation clients.
const clientConfiguration = {
  customUserAgent: 'aws-cloudformation-github-deploy-for-github-actions'
};

export async function run(): Promise<void> {
  try {
    const cfn = new aws.CloudFormation({ ...clientConfiguration });
    const { GITHUB_WORKSPACE = __dirname } = process.env;

    // Get inputs
    const templateFile = core.getInput('template', { required: true });
    const stackName = core.getInput('name', { required: true });
    const capabilities = core.getInput('capabilities', {
      required: false
    });
    const parameterOverrides = core.getInput('parameter-overrides', {
      required: false
    });
    const noEmptyChangeSet = !!+core.getInput('no-fail-on-empty-changeset', {
      required: false
    });

    // Get CloudFormation Stack
    core.debug('Loading CloudFormation Stack template');
    const templateFilePath = path.isAbsolute(templateFile)
      ? templateFile
      : path.join(GITHUB_WORKSPACE, templateFile);
    const templateBody = fs.readFileSync(templateFilePath, 'utf8');

    // CloudFormation Stack Parameter for the creation or update
    const params: CreateStackInput = {
      StackName: stackName,
      Capabilities: [...capabilities.split(',').map(cap => cap.trim())],
      TemplateBody: templateBody
    };

    if (parameterOverrides) {
      params.Parameters = [
        ...parameterOverrides.split(',').map(parameter => {
          const [key, value] = parameter.trim().split('=');
          return {
            ParameterKey: key,
            ParameterValue: value
          };
        })
      ];
    }

    core.setOutput(
      'stack-id',
      (await deployStack(cfn, params, noEmptyChangeSet)) || 'UNKOWN'
    );
  } catch (err) {
    core.setFailed(err.message);
    core.debug(err.stack);
  }
}

/* istanbul ignore next */
if (require.main === module) {
  run();
}
