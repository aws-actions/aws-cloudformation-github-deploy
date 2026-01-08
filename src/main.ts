import * as path from 'path'
import * as core from '@actions/core'
import {
  CloudFormationClient,
  CreateChangeSetCommandInput,
  CreateStackCommandInput,
  Capability
} from '@aws-sdk/client-cloudformation'
import * as fs from 'fs'
import { deployStack, getStackOutputs } from './deploy'
import {
  formatError,
  isUrl,
  parseTags,
  parseString,
  parseNumber,
  parseARNs,
  parseParameters,
  configureProxy
} from './utils'
import { NodeHttpHandler } from '@smithy/node-http-handler'

// Validated by core.getInput() which throws if not set
export type CreateStackInputWithName = CreateStackCommandInput & {
  StackName: string
  IncludeNestedStacksChangeSet?: boolean
}

export type CreateChangeSetInput = CreateChangeSetCommandInput
export type InputNoFailOnEmptyChanges = '1' | '0'
export type InputCapabilities =
  | 'CAPABILITY_IAM'
  | 'CAPABILITY_NAMED_IAM'
  | 'CAPABILITY_AUTO_EXPAND'

export type OutputFormat = 'json' | 'yaml'

export type Inputs = {
  [key: string]: string
}

// The custom client configuration for the CloudFormation clients.
let clientConfiguration = {
  customUserAgent: 'aws-cloudformation-github-deploy-for-github-actions'
}
export async function run(): Promise<void> {
  const outputFormat =
    (core.getInput('output-format', { required: false }) as OutputFormat) ||
    'json'

  try {
    /* istanbul ignore next */
    const { GITHUB_WORKSPACE = __dirname } = process.env

    // Get inputs
    const template = core.getInput('template', { required: true })
    const stackName = core.getInput('name', { required: true })

    const capabilities = core
      .getInput('capabilities', {
        required: false
      })
      .split(',')
      .map(capability => capability.trim()) as Capability[]

    // Get parameter overrides - could be a string or a parsed YAML object
    const parameterOverrides = core.getInput('parameter-overrides', {
      required: false
    })

    const noEmptyChangeSet = !!+core.getInput('no-fail-on-empty-changeset', {
      required: false
    })
    const noExecuteChangeSet = !!+core.getInput('no-execute-changeset', {
      required: false
    })
    const noDeleteFailedChangeSet = !!+core.getInput(
      'no-delete-failed-changeset',
      {
        required: false
      }
    )
    const disableRollback = !!+core.getInput('disable-rollback', {
      required: false
    })
    const timeoutInMinutes = parseNumber(
      core.getInput('timeout-in-minutes', {
        required: false
      })
    )
    const notificationARNs = parseARNs(
      core.getInput('notification-arns', {
        required: false
      })
    )
    const roleARN = parseString(
      core.getInput('role-arn', {
        required: false
      })
    )
    const tags = parseTags(
      core.getInput('tags', {
        required: false
      })
    )
    const terminationProtections = !!+core.getInput('termination-protection', {
      required: false
    })
    const httpProxy = parseString(
      core.getInput('http-proxy', {
        required: false
      })
    )
    const changeSetName = parseString(
      core.getInput('change-set-name', {
        required: false
      })
    )
    const changeSetDescription = parseString(
      core.getInput('change-set-description', {
        required: false
      })
    )
    const enableEventStreaming =
      core.getInput('enable-event-streaming', {
        required: false
      }) !== '0' // Default to enabled unless explicitly set to '0'

    const includeNestedStacksChangeSet = !!+core.getInput(
      'include-nested-stacks-change-set',
      {
        required: false
      }
    )
    // Configures proxy
    const agent = configureProxy(httpProxy)
    if (agent) {
      clientConfiguration = {
        ...clientConfiguration,
        ...{
          requestHandler: new NodeHttpHandler({
            httpAgent: agent,
            httpsAgent: agent
          })
        }
      }
    }

    const cfn = new CloudFormationClient({ ...clientConfiguration })

    // Setup CloudFormation Stack
    let templateBody
    let templateUrl

    if (isUrl(template)) {
      core.debug('Using CloudFormation Stack from Amazon S3 Bucket')
      templateUrl = template
    } else {
      core.debug('Loading CloudFormation Stack template')
      const templateFilePath = path.isAbsolute(template)
        ? template
        : path.join(GITHUB_WORKSPACE, template)
      templateBody = fs.readFileSync(templateFilePath, 'utf8')
    }

    // CloudFormation Stack Parameter for the creation or update
    const params: CreateStackInputWithName = {
      StackName: stackName,
      Capabilities: capabilities,
      RoleARN: roleARN,
      NotificationARNs: notificationARNs,
      DisableRollback: disableRollback,
      TimeoutInMinutes: timeoutInMinutes,
      TemplateBody: templateBody,
      TemplateURL: templateUrl,
      Tags: tags,
      EnableTerminationProtection: terminationProtections,
      IncludeNestedStacksChangeSet: includeNestedStacksChangeSet
    }

    if (parameterOverrides) {
      params.Parameters = parseParameters(parameterOverrides)
    }

    const stackId = await deployStack(
      cfn,
      params,
      changeSetName ? changeSetName : `${params.StackName}-CS`,
      noEmptyChangeSet,
      noExecuteChangeSet,
      noDeleteFailedChangeSet,
      changeSetDescription,
      enableEventStreaming
    )
    core.setOutput('stack-id', stackId || 'UNKNOWN')

    if (stackId) {
      const outputs = await getStackOutputs(cfn, stackId)
      for (const [key, value] of outputs) {
        core.setOutput(key, value)
      }
    }
  } catch (err) {
    core.setFailed(formatError(err, outputFormat))
    core.debug(formatError(err, outputFormat))
  }
}

/* istanbul ignore next */
if (require.main === module) {
  run()
}
