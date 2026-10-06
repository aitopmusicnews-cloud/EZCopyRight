import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

export function createAgentBridge(config, { client } = {}) {
  const lambda = client || new LambdaClient({ region: config.awsRegion });

  return {
    async ask({ message, confirmDeployment = false }) {
      const response = await lambda.send(new InvokeCommand({
        FunctionName: config.agentFunctionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify({ message, confirmDeployment })),
      }));

      if (response.FunctionError) {
        throw new Error('The EZCopyRight agent could not complete the request.');
      }

      const raw = response.Payload ? Buffer.from(response.Payload).toString('utf8') : '';
      if (!raw) throw new Error('The EZCopyRight agent returned an empty response.');

      let result;
      try {
        result = JSON.parse(raw);
      } catch {
        throw new Error('The EZCopyRight agent returned an invalid response.');
      }

      if (!result || typeof result !== 'object') {
        throw new Error('The EZCopyRight agent returned an invalid response.');
      }

      return result;
    },
  };
}
