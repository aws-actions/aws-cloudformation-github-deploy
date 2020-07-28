## AWS CloudFormation "Deploy CloudFormation Stack" Action for GitHub Actions

![Package](https://github.com/aws-actions/aws-cloudformation-github-deploy/workflows/Package/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Deploys AWS CloudFormation Stacks.

## Usage

```yaml
- name: Deploy to AWS CloudFormation
  uses: aws-actions/aws-cloudformation-github-deploy@v1
  with:
    name: MyStack
    template: myStack.yaml
    parameter-overrides: "MyParam1=myValue,MyParam2=${{ secrets.MY_SECRET_VALUE }}"
```

The action can be passed a CloudFormation Stack `name` and a `template` file. It will create the Stack if it does not exist, or create a [Change Set](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html) to update the Stack. The change set is executed by default. By setting `no-execute-changeset: "1"` the change set is not executed and can be viewed. An update fails by default when the Change Set is empty. Setting `no-fail-on-empty-changeset: "1"` will override this behavior and not throw an error.

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.

> You can learn more about [AWS CloudFormation](https://aws.amazon.com/cloudformation/)

## Credentials and Region

This action relies on the [default behavior of the AWS SDK for Javascript](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) to determine AWS credentials and region.
Use [the `aws-actions/configure-aws-credentials` action](https://github.com/aws-actions/configure-aws-credentials) to configure the GitHub Actions environment with environment variables containing AWS credentials and your desired region.

We recommend following [Amazon IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) for the AWS credentials used in GitHub Actions workflows, including:

- Do not store credentials in your repository's code. You may use [GitHub Actions secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets) to store credentials and redact credentials from GitHub Actions workflow logs.
- [Create an individual IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#create-iam-users) with an access key for use in GitHub Actions workflows, preferably one per repository. Do not use the AWS account root user access key.
- [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege) to the credentials used in GitHub Actions workflows. Grant only the permissions required to perform the actions in your GitHub Actions workflows. See the Permissions section below for the permissions required by this action.
- [Rotate the credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#rotate-credentials) used in GitHub Actions workflows regularly.
- [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log) of the credentials used in GitHub Actions workflows.

## Permissions

This action requires the following minimum set of permissions:

> We recommend to read [AWS CloudFormation Security Best Practices](https://aws.amazon.com/blogs/devops/aws-cloudformation-security-best-practices/)

```
{
    "Version":"2012-10-17",
    "Statement":[{
        "Effect":"Allow",
        "Action":[
            "cloudformation:*"
        ],
        "Resource":"*"
    },
    {
        "Effect":"Deny",
        "Action":[
            "cloudformation:DeleteStack"
        ],
        "Resource":"arn:aws:cloudformation:us-east-1:123456789012:stack/MyProductionStack/*"
    }]
}
```

> The policy above prevents the stack to be deleted by a policy for production

## License

[MIT](/LICENSE)
