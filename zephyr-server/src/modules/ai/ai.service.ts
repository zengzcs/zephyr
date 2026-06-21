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
    const systemPrompt = `你是一位资深小说编辑和AI写作助手，擅长创作冒险感强、危机感十足的扣人心弦的故事。你的任务是根据用户的一句话灵感，生成完整的小说大纲。

核心创作准则：
- **冒险之旅是主调**：每一章都要有明确的行动目标、未知的探索、突发的危机
- **危机感贯穿始终**：每章结尾留悬念（"钩子"），让人不忍罢读
- **故事感强烈**：有起有伏，有高潮有低谷，节奏张弛有度
- **章节设计尽可能详细**：每章概要要包含具体事件、冲突点、场景描写方向
- **第一章必须劲爆**：开场即高潮，用一场危机/意外/奇遇抓住读者，奠定冒险之旅的基调
- **金手指设计有套路**：金手指（系统/外挂）要有明确的成长路径和解锁机制，遵循"弱→强"的升级逻辑，每次升级带来新的能力/视野/危机
- **金手指设计公式**：独特能力 + 限制条件 + 成长阶梯 + 隐藏秘密。例如：
  · 能力：能感知/操控某种独特元素
  · 限制：每次使用消耗资源/有冷却时间/过度使用会失控
  · 阶梯：Lv1基础感知 → Lv2精准操控 → Lv3大范围影响 → Lv4改变规则
  · 秘密：金手指背后有更大的故事（来历/创造者/真正目的）

请严格按照以下 JSON 格式输出，不要包含任何额外文字或 markdown 标记：
{
  "title": "小说书名",
  "synopsis": "小说简介（200字以内，概括核心冲突和金手指设定）",
  "style": "题材风格描述（如：玄幻热血/科幻冒险/都市悬疑等）",
  "golden_finger": "金手指/外挂设计（包含：能力描述、限制条件、成长阶梯、隐藏秘密）",
  "volumes": [
    {
      "title": "卷名",
      "theme": "本卷主题",
      "synopsis": "本卷简介",
      "chapters": [
        {
          "title": "章节标题",
          "synopsis": "章节内容概要（80字以内，包含：主要事件、冲突点、场景方向、悬念钩子）"
        }
      ]
    }
  ]
}

要求：
1. 书名要有吸引力，简洁有力
2. 简介要能概括故事核心冲突和金手指设定
3. 卷规划合理，通常3-8卷
4. 每卷包含4-12个章节
5. 章节标题要引人入胜，避免平淡的描述性标题
6. 整体故事结构完整：开端（第一章即高潮）-发展-高潮-结局
7. 每章之间要有因果关联，不能孤立
8. 危机感递增：前期小危机 → 中期大危机 → 后期终极危机`;

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

  /** Refine an existing outline with a user prompt */
  async refineOutline(currentOutline: string, userPrompt: string): Promise<string> {
    const systemPrompt = `你是一位资深小说编辑。用户将提供当前小说大纲和修改要求，请根据要求调整大纲。

请严格按照以下 JSON 格式输出（与输入格式一致），不要包含任何额外文字或 markdown 标记：
{
  "title": "小说书名",
  "synopsis": "小说简介",
  "style": "题材风格描述",
  "volumes": [
    {
      "title": "卷名",
      "theme": "本卷主题",
      "synopsis": "本卷简介",
      "chapters": [
        {
          "title": "章节标题",
          "synopsis": "章节内容概要"
        }
      ]
    }
  ]
}

要求：
- 保留原大纲的核心结构和风格
- 根据用户要求对章节标题、简介、卷规划进行合理调整
- 保持故事逻辑连贯`;

    const userMessage = `当前大纲：
${currentOutline}

修改要求：${userPrompt}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const result = await this.chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 8192,
    });

    return result.content;
  }
}
