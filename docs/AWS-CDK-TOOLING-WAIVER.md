# AWS CDK tooling waiver

Temporary exception for the infrastructure toolchain only.

Current AWS CDK packages include a bundled `brace-expansion` version that npm audit reports at high severity. The affected package is used only while synthesizing or deploying infrastructure and is not included in the EZ Copyright API container.

CI may accept only the two currently known `brace-expansion` advisory identifiers for this infrastructure-only dependency. Any other high or critical infrastructure finding must fail the build. The main application and production container audits remain zero-tolerance at high/critical severity.

Recheck this exception by September 15, 2026, or sooner when AWS publishes a CDK package with the corrected bundled dependency. Remove the exception immediately after the upstream package is fixed.
