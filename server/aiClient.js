export class OpenAiCompatibleClient {
  constructor({ baseUrl, apiKey, model }) {
    this.baseUrl = baseUrl?.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.model = model || 'gpt-5.5';
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  async completeJson(messages) {
    if (!this.isConfigured()) {
      throw new Error('AI服务未配置，请设置 AI_BASE_URL、AI_API_KEY 和 AI_MODEL。');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`AI服务调用失败：${response.status} ${detail}`);
    }

    const payload = await response.json();
    const choice = payload?.choices?.[0];
    const content = extractChoiceContent(choice);
    if (!content) {
      const reason = choice?.finish_reason ? `，结束原因：${choice.finish_reason}` : '';
      throw new Error(`AI服务未返回有效内容${reason}。`);
    }

    return content;
  }
}

export function extractChoiceContent(choice) {
  const message = choice?.message || {};
  const content = message.content ?? choice?.text;

  // OpenAI-compatible providers differ slightly: most return a string, while
  // some proxy multimodal-style content as typed array segments.
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        return part?.text || part?.content || '';
      })
      .join('')
      .trim();
  }

  return '';
}
