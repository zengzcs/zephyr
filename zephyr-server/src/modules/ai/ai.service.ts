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
  timeout?: number;
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
    const { messages, model = 'default', temperature = 0.8, maxTokens = 8192, timeout } = options;

    const response = await this.client.post('/chat/completions', {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }, { timeout });

    const data = response.data;

    return {
      content: data.choices?.[0]?.message?.content ?? data.content ?? '',
      model: data.model ?? model,
      usage: data.usage,
    };
  }

  /** Generate a novel outline from a one-sentence prompt */
  async generateOutline(prompt: string): Promise<string> {
    const systemPrompt = `你是一位深谙番茄小说爆款之道的资深小说编辑和AI写作助手，擅长创作让人一口气读完、停不下来的故事。你的任务是根据用户的一句话灵感，生成完整的小说大纲。

=== 总纲三要素（全书灵魂）===
1. 核心矛盾：主角和最终敌手的根本冲突是什么？（一句话概括）
2. 成长弧线：主角从哪里出发，最终变成什么样的人？（从废材→强者/从隐忍→爆发等）
3. 结局方向：大结局的基本形态（不需要细节，但要确定方向）

=== 番茄爆款大纲设计法则 ===

【黄金三章法则】
- 第1章：前300字内抛出核心冲突（死亡/背叛/危机/羞辱），开场即高潮
- 第2章：1000字内触发首个爽点（打脸/反转/获得金手指）
- 第3章：引入金手指，奠定逆袭基础，留下追读钩子

【力量体系设计】
- 等级划分清晰（如：练气→筑基→金丹→元婴→化神→渡劫）
- 每个等级有具体能力描述
- 境界突破是换地图的驱动力

【升级打怪循环结构】（网文最常用）
核心循环：新地图 → 低调装逼 → 结仇 → 修炼突破 → 打脸 → 获得奖励 → 更大舞台
- 每卷等级翻倍，舞台翻倍
- 每个循环必须有一个"超出预期"的差异化元素（不能纯套路）
- 同一地图不超过30万字，换地图=换反派+升境界

【爽点分布】
- 前3章：每章1个小爽点（密集输出，快速上头）
- 前期：每章1个小爽点
- 中期：3-5章1个中爽点（完整打脸流程/实力跃升/关系突破）
- 每卷高潮：1个大爽点（Boss逆转/身份曝光/伏笔回收）
- 爽点类型多样化：打脸/反转/意外收获/身份揭示/实力碾压/智取对手

【伏笔规划】
- 总纲阶段列出所有伏笔
- 标注每个伏笔的埋设章节和回收章节
- 伏笔回收要制造"拍大腿"时刻

=== 角色矩阵 ===
- 主角：性格特点 + 金手指 + 短期目标 + 中期目标 + 长期目标
- 女主：3-5个，性格各异，关系线索清晰
- 反派：初中后期各一个，动机合理，智商在线（不能纯工具人）
- 配角：兄弟/队友/师父/导师，各有功能

=== 章节设计要点 ===
- 章节标题要引人入胜，避免平淡的描述性标题
- 每章概要包含：主要事件、冲突点、场景方向、悬念钩子
- 每章遵循"铺垫→升级→转折→爽点→钩子"的情绪曲线
- 章末钩子类型：悬念式/反转式/情绪炸弹/信息投放式
- 平路不超过3章，平淡章节也要有小爽点
- 每章之间要有因果关联，不能孤立

请严格按照以下 JSON 格式输出，不要包含任何额外文字或 markdown 标记：
{
  "title": "小说书名（要有吸引力，简洁有力）",
  "synopsis": "小说简介（200字以内，概括核心冲突、金手指和故事走向）",
  "style": "题材风格（如：玄幻热血/都市逆袭/修仙冒险等）",
  "core_conflict": "核心矛盾（一句话：主角vs最终敌手的根本冲突）",
  "growth_arc": "成长弧线（从什么状态→通过什么成长→最终变成什么样的人）",
  "ending_direction": "结局方向（一句话概述）",
  "power_system": "力量体系（等级划分：如练气→筑基→金丹→元婴→化神）",
  "golden_finger": {
    "ability": "金手指能力描述",
    "limitation": "限制条件",
    "progression": "成长阶梯（Lv1→Lv2→Lv3→Lv4）",
    "secret": "隐藏秘密（金手指背后的故事）"
  },
  "characters": {
    "protagonist": "主角设定（性格+金手指+短/中/长期目标）",
    "heroines": ["女主1设定", "女主2设定"],
    "antagonists": ["初期反派（动机+能力）", "中期反派", "最终反派"],
    "supporting": "重要配角设定"
  },
  "foreshadowing": [
    {"name": "伏笔名称", "plant_chapter": "埋设章节", "reveal_chapter": "回收章节"}
  ],
  "volumes": [
    {
      "title": "卷名",
      "theme": "本卷主题",
      "synopsis": "本卷简介（300字以内，包含核心事件和主角状态变化）",
      "power_range": "本卷境界范围",
      "word_count": "预计字数",
      "climax": "本卷大爽点/高潮事件",
      "hook": "卷末钩子（引导追下一卷的悬念）",
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
1. 卷规划：通常5-10卷，每卷4-12章，总章数30-80章
2. 整体结构完整：黄金三章开篇→发展→高潮→结局
3. 每卷有明确目标、核心事件、高潮爽点、卷末钩子
4. 危机感递增：前期小危机 → 中期大危机 → 后期终极危机
5. 换地图时机：每卷结束换地图/换势力/升境界
6. 反派递进：初期小反派（打脸用）→ 中期大反派（实力碾压）→ 最终反派（宿命对决）
7. 金手指贯穿始终，每卷解锁新能力`;

    const userPrompt = `请根据以下一句话灵感，生成完整的小说大纲：

"${prompt}"`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.chatCompletion({
      messages,
      temperature: 0.8,
      maxTokens: 16384,
      timeout: 500_000,
    });

    return result.content;
  }

  /** Refine an existing outline with a user prompt */
  async refineOutline(currentOutline: string, userPrompt: string): Promise<string> {
    const systemPrompt = `你是一位深谙番茄小说爆款之道的资深小说编辑。用户将提供当前小说大纲和修改要求，请根据要求调整大纲。

请严格按照以下 JSON 格式输出（与输入格式一致），不要包含任何额外文字或 markdown 标记：
{
  "title": "小说书名",
  "synopsis": "小说简介",
  "style": "题材风格描述",
  "core_conflict": "核心矛盾",
  "growth_arc": "成长弧线",
  "ending_direction": "结局方向",
  "power_system": "力量体系",
  "golden_finger": { "ability": "", "limitation": "", "progression": "", "secret": "" },
  "characters": { "protagonist": "", "heroines": [], "antagonists": [], "supporting": "" },
  "foreshadowing": [],
  "volumes": [
    {
      "title": "卷名",
      "theme": "本卷主题",
      "synopsis": "本卷简介",
      "power_range": "本卷境界范围",
      "word_count": "预计字数",
      "climax": "本卷大爽点/高潮事件",
      "hook": "卷末钩子",
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
- 保持故事逻辑连贯，确保爽点分布合理、钩子到位
- 如果用户要求增加/减少章节，保持每卷4-12章的合理范围
- 确保修改后仍符合爆款节奏：黄金三章开篇、每章有爽点、章末有钩子`;

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
      maxTokens: 16384,
      timeout: 500_000,
    });

    return result.content;
  }
}
