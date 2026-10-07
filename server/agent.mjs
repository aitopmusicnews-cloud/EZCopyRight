function requireAgentConfig(config) {
  if (!config.azureOpenAiEndpoint || !config.azureOpenAiApiKey || !config.azureOpenAiModel) {
    throw new Error('Azure AI agent configuration is incomplete.');
  }
}

function normalizeEndpoint(value) {
  return value.replace(/\/$/, '');
}

export function createAgentBridge(config) {
  return {
    async ask({ message, confirmDeployment = false }) {
      requireAgentConfig(config);

      const response = await fetch(normalizeEndpoint(config.azureOpenAiEndpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': config.azureOpenAiApiKey,
        },
        body: JSON.stringify({
          model: config.azureOpenAiModel,
          input: [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text: [
                    'You are the EZCopyRight operations agent.',
                    'You help the owner understand application health, deployment status, billing issues, configuration, and operational risks.',
                    'The application is hosted on Azure. Do not suggest AWS services or AWS deployment steps.',
                    'Do not claim to have changed production unless the surrounding application explicitly performed the action.',
                    'For deployment or destructive changes, require explicit confirmation before proceeding.',
                    confirmDeployment
                      ? 'The owner has explicitly confirmed the pending deployment action in the application UI.'
                      : 'No deployment confirmation has been granted for this request.',
                  ].join(' '),
                },
              ],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: message }],
            },
          ],
          max_output_tokens: 1200,
        }),
      });

      const raw = await response.text();
      if (!response.ok) {
        let detail = '';
        try {
          const parsed = JSON.parse(raw);
          detail = parsed?.error?.message || parsed?.message || '';
        } catch {
          detail = raw;
        }
        throw new Error(`Azure AI agent request failed with status ${response.status}${detail ? `: ${detail}` : ''}.`);
      }

      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error('The Azure AI agent returned an invalid response.');
      }

      const reply =
        payload?.output_text
        || payload?.output?.flatMap?.((item) => item?.content || [])
          ?.find?.((item) => item?.type === 'output_text')?.text
        || '';

      if (!reply) throw new Error('The Azure AI agent returned an empty response.');

      return {
        ok: true,
        reply,
        requiresConfirmation: false,
        model: config.azureOpenAiModel,
      };
    },
  };
}
