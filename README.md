# Agentic Sprawl to Enterprise Spool

Conference session resources presented by **Anil Yanamandra**, FDE - Applied AI
@PwC and AWS Community Builder, at **AWS User Group Midwest
Community Day**.

The session provides a first look at AWS Agent Registry and demonstrates how to
create and govern a registry using real AWS CLI commands. The executable lab
models three personas, registers multiple resource types, verifies authorization
boundaries, approves records, and confirms that only approved metadata is
discoverable.

The registry catalogs metadata. It does not deploy or invoke the MCP servers,
agents, or custom resources represented by its records.

## Artifacts

- `docs/assets/aws-agent-registry-first-look.pdf` - manually published session presentation.
- `demo/aws-agent-registry-cli-demo.ipynb` - complete executable governance lab.
- `demo/cloudshell-demo.sh` - optional lifecycle-only CLI helper for an existing registry.
- `demo/mcp-code-review-descriptors.json` - MCP server and tool descriptors.
- `demo/a2a-compliance-descriptor.json` - inline A2A agent card.
- `demo/custom-data-pipeline-descriptor.json` - organization-defined custom metadata.
- `docs/` - static technical resource page.

## About the speaker

Anil Yanamandra is a Forward Deployed Engineer in Applied AI and an AWS
Community Builder with more than 18 years of experience building global,
consumer-facing applications. He applies generative AI to transform legacy
enterprise systems and bridges emerging research with production-ready AI
engineering.

## Workflow

The notebook implements this sequence:

1. Validate the AWS CLI, credentials, Region, and service model.
2. Create a registry with IAM authorization and manual approval.
3. Define Administrator, Publisher, and Consumer policies.
4. Create temporary IAM users and in-memory credentials for each persona.
5. Register MCP, A2A, and custom records as the Publisher.
6. Poll every record until it reaches `DRAFT`.
7. Verify that the Publisher cannot approve and the Consumer cannot create.
8. Verify that pending records do not appear in search.
9. Submit and approve records with the correct personas.
10. Search with exponential backoff until approved records are indexed.
11. Delete records, the registry, access keys, policies, and IAM users.

## Prerequisites

- An AWS account in a Region where AWS Agent Registry preview is available.
- Python 3.10 or newer and a Jupyter-compatible environment such as VS Code.
- A current AWS CLI containing both AgentCore service models:
  - `bedrock-agentcore-control`
  - `bedrock-agentcore`
- Configured AWS credentials with permission to create and delete:
  - AgentCore registries and registry records
  - IAM users, inline policies, and access keys
  - STS caller identity requests

The walkthrough intentionally requires elevated bootstrap permissions because it
creates temporary identities to prove separation of duties. Use a sandbox AWS
account rather than a production account.

## Run the notebook

1. Open `demo/aws-agent-registry-cli-demo.ipynb` in VS Code or JupyterLab.
2. Review the resource and cleanup behavior.
3. Set `CONFIRM_RESOURCE_CREATION = True` in the configuration cell.
4. Keep `CLEANUP_RESOURCES = True` unless resources must remain for inspection.
5. Run all cells from top to bottom.

The notebook prints clear `DEBUG`, `INFO`, `PASS`, `ERROR`, and `SUMMARY` logs.
Access-key secrets are held only in notebook memory and are never displayed.

If execution stops before the cleanup cell, resolve the error and run the
cleanup cell manually before closing the kernel.

## Publish a revised session PDF

The PDF is intentionally updated manually after edits in Google Slides. Export
the final deck using the exact filename `aws-agent-registry-first-look.pdf`,
then replace the file in `docs/assets/`.

- Public URL: https://anilsharmay.github.io/aws-agent-registry/assets/aws-agent-registry-first-look.pdf
- Upload location: https://github.com/anilsharmay/aws-agent-registry/upload/main/docs/assets

The local PPTX is a private build intermediate and is not committed or linked
from the public repository.

## Lifecycle-only CLI helper

`demo/cloudshell-demo.sh` performs the narrower record lifecycle against an
existing IAM-authorized registry:

```bash
export AWS_REGION=us-west-2
export REGISTRY_ID=<registry-id>
export REGISTRY_ARN=<registry-arn>
./demo/cloudshell-demo.sh
```

The script creates one MCP record, waits for `DRAFT`, submits it, approves it,
and searches for it with exponential backoff. It retains the record by default.
Set `CLEANUP_RESOURCES=1` to delete the record after the search succeeds.

## Security and publication

- Do not commit notebook outputs containing account identifiers or resource ARNs.
- Never persist the generated access-key secret outside notebook memory.
- Keep cleanup enabled for normal runs.
- Review the AWS account after cleanup and confirm no walkthrough resources remain.
- Replace the temporary IAM-user model with organizational roles for production use.

## Official sources

- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-concepts.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-record-lifecycle.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-search-records.html
- https://github.com/awslabs/agentcore-samples/tree/main/06-workshops/10-Agent-Registry

This walkthrough is derived from the logical flow of the AWS AgentCore sample
repository. The AWS sample repository is licensed under Apache License 2.0.
