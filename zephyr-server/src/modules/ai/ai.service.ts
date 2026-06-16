import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class AiService {
  private client: AxiosInstance;

  constructor(private configService: ConfigService) {
    const baseUrl = this.configService.get<string>('AI_BASE_URL', 'http://192.168.1.100:8080/v1');
    const apiKey = this.configService.get<string>('AI_API_KEY', '');

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 120_000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const { messages, model = 'default', temperature = 0.8, maxTokens = 8192 } = options;

    const response = await this.client.post('/chat/completions', {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    });

    const data = response.data;

    return {
      content: data.choices?.[0]?.message?.content ?? data.content ?? '',
      model: data.model ?? model,
      usage: data.usage,
    };
  }

  /** Generate a novel outline from a one-sentence prompt */
  async generateOutline(prompt: string): Promise<string> {
    const systemPrompt = `你是一位资深小说编辑和AI写作助手。你的任务是根据用户的一句话灵感，生成完整的小说大纲。

请严格按照以下 JSON 格式输出，不要包含任何额外文字或 markdown 标记：
{
  "title": "小说书名",
  "synopsis": "小说简介（200字以内）",
  "style": "题材风格描述（如：玄幻热血/都市悬疑/科幻史诗等）",
  "volumes": [
    {
      "title": "卷名",
      "theme": "本卷主题",
      "synopsis": "本卷简介",
      "chapters": [
        {
          "title": "章节标题",
          "synopsis": "章节内容概要（50字以内）"
        }
      ]
    }
  ]
}

要求：
1. 书名要有吸引力，简洁有力
2. 简介要能概括故事核心冲突
3. 卷规划合理，通常3-8卷
4. 每卷包含4-12个章节
5. 章节标题要引人入胜
6. 整体故事结构完整：开端-发展-高潮-结局`;

    const userPrompt = `请根据以下一句话灵感，生成完整的小说大纲：

"${prompt}"`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.chatCompletion({
      messages,
      temperature: 0.8,
      maxTokens: 8192,
    });

    return result.content;
  }
}
