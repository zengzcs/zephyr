import { Controller, Post, Body, Get, Param, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { AiService } from './ai.service';
import { DatabaseService } from '../database/database.service';
import { z } from 'zod';

const GenerateOutlineDto = z.object({
  prompt: z.string().min(1).max(500),
});

const RefineOutlineDto = z.object({
  bookId: z.number(),
  prompt: z.string().min(1).max(2000),
});

const GenerateChapterDto = z.object({
  bookId: z.number(),
  chapterIndex: z.number(),
  chapterTitle: z.string(),
  chapterSynopsis: z.string(),
  context: z.string(),
  prompt: z.string().min(1).max(5000),
});

const SaveChapterDto = z.object({
  bookId: z.number(),
  volumeIndex: z.number(),
  chapterIndex: z.number(),
  body: z.string().max(50000),
});

const RefineChapterDto = z.object({
  bookId: z.number(),
  volumeIndex: z.number(),
  chapterIndex: z.number(),
  body: z.string().max(50000),
  prompt: z.string().min(1).max(2000),
});

interface VolumeChapter {
  title: string;
  synopsis: string;
}

interface Volume {
  title: string;
  theme: string;
  synopsis: string;
  chapters: VolumeChapter[];
}

interface GeneratedOutline {
  title: string;
  synopsis: string;
  style: string;
  volumes: Volume[];
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly dbService: DatabaseService,
  ) {}

  private get rawDb() {
    return this.dbService.getRawDb();
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateOutline(@Body() body: { prompt: string }) {
    const { prompt } = GenerateOutlineDto.parse(body);

    // Call AI to generate outline
    const rawContent = await this.aiService.generateOutline(prompt);

    // Parse the JSON response
    let outline: GeneratedOutline;
    try {
      let jsonStr = rawContent.trim();
      // Strip BOM if present
      jsonStr = jsonStr.replace(/^\uFEFF/, '');
      // Extract from markdown code block if present
      const markdownMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (markdownMatch) {
        jsonStr = markdownMatch[1].trim();
      }
      // Try direct parse first
      try {
        outline = JSON.parse(jsonStr);
      } catch {
        // Try to fix common issues: remove trailing commas, comments
        let cleaned = jsonStr
          .replace(/,\s*}/g, '}')  // trailing comma before }
          .replace(/,\s*\]/g, ']')  // trailing comma before ]
          .replace(/\/\/.*$/gm, '')  // line comments
          .replace(/\/\*[\s\S]*?\*\//g, '');  // block comments
        cleaned = cleaned.trim();
        outline = JSON.parse(cleaned);
      }
    } catch (err) {
      throw new Error(`AI 返回格式错误，无法解析为 JSON: ${rawContent.substring(0, 200)}...`);
    }

    // Save to database
    const stmt = this.rawDb.prepare(`
      INSERT INTO books (title, synopsis, prompt, status)
      VALUES (?, ?, ?, 'ready')
    `);
    const result = stmt.run(outline.title, outline.synopsis, prompt);

    // Insert volumes and chapters
    if (outline.volumes && Array.isArray(outline.volumes)) {
      const volStmt = this.rawDb.prepare(`
        INSERT INTO volumes (book_id, "order", title, theme, synopsis, chapters)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < outline.volumes.length; i++) {
        const vol = outline.volumes[i];
        const chaptersJson = JSON.stringify(vol.chapters || []);
        volStmt.run(result.lastInsertRowid, i + 1, vol.title, vol.theme, vol.synopsis, chaptersJson);
      }
    }

    // Create initial version record (v1) for version history
    const versionStmt = this.rawDb.prepare(`
      INSERT INTO versions (book_id, title, synopsis, style, outline_json, refine_prompt, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    versionStmt.run(
      result.lastInsertRowid,
      outline.title,
      outline.synopsis,
      outline.style || '',
      JSON.stringify(outline),
      `初始生成: ${prompt}`,
    );

    return {
      success: true,
      bookId: result.lastInsertRowid,
      outline,
    };
  }

  @Post('refine')
  @HttpCode(HttpStatus.OK)
  async refineOutline(@Body() body: { bookId: number; prompt: string }) {
    const { bookId, prompt } = RefineOutlineDto.parse(body);

    // Fetch current book and volumes
    const book = this.rawDb.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) throw new Error('Book not found');

    const volumes = this.rawDb.prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY "order"').all(bookId);
    if (!volumes || volumes.length === 0) throw new Error('No volumes found for this book');

    // Build current outline JSON string to send to AI
    const currentOutline: GeneratedOutline = {
      title: book.title as string,
      synopsis: book.synopsis as string,
      style: (book as any).style || '',
      volumes: volumes.map((v: any) => ({
        title: v.title,
        theme: v.theme,
        synopsis: v.synopsis,
        chapters: typeof v.chapters === 'string' ? JSON.parse(v.chapters) : v.chapters,
      })),
    };
    const outlineJson = JSON.stringify(currentOutline);

    // Call AI to refine
    const rawContent = await this.aiService.refineOutline(outlineJson, prompt);

    // Parse refined JSON
    let refined: GeneratedOutline;
    try {
      let jsonStr = rawContent.trim();
      jsonStr = jsonStr.replace(/^\uFEFF/, '');
      const markdownMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (markdownMatch) {
        jsonStr = markdownMatch[1].trim();
      }
      try {
        refined = JSON.parse(jsonStr);
      } catch {
        let cleaned = jsonStr
          .replace(/,\s*}/g, '}')
          .replace(/,\s*\]/g, ']')
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '');
        cleaned = cleaned.trim();
        refined = JSON.parse(cleaned);
      }
    } catch (err) {
      throw new Error(`AI 返回格式错误，无法解析为 JSON: ${rawContent.substring(0, 200)}...`);
    }

    // Save as a new version
    const versionStmt = this.rawDb.prepare(`
      INSERT INTO versions (book_id, title, synopsis, style, outline_json, refine_prompt, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const versionResult = versionStmt.run(
      bookId,
      refined.title,
      refined.synopsis,
      refined.style || '',
      JSON.stringify(refined),
      prompt,
    );

    // Delete old volumes for this book (version replaces current state)
    this.rawDb.prepare('DELETE FROM volumes WHERE book_id = ?').run(bookId);

    // Insert new volumes
    if (refined.volumes && Array.isArray(refined.volumes)) {
      const volStmt = this.rawDb.prepare(`
        INSERT INTO volumes (book_id, "order", title, theme, synopsis, chapters)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < refined.volumes.length; i++) {
        const vol = refined.volumes[i];
        const chaptersJson = JSON.stringify(vol.chapters || []);
        volStmt.run(bookId, i + 1, vol.title, vol.theme, vol.synopsis, chaptersJson);
      }
    }

    return {
      success: true,
      versionId: versionResult.lastInsertRowid,
      outline: refined,
    };
  }

  @Post('generate-chapter')
  @HttpCode(HttpStatus.OK)
  async generateChapter(@Body() body: { bookId: number; chapterIndex: number; chapterTitle: string; chapterSynopsis: string; context: string; prompt: string }) {
    const { bookId, chapterIndex, chapterTitle, chapterSynopsis, context, prompt } = GenerateChapterDto.parse(body);

    const book = this.rawDb.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) throw new Error('Book not found');

    const systemPrompt = `你是一位专业的网络小说作家。根据以下上下文信息，为指定章节生成详细的正文内容。

${context}

用户要求：${prompt}

请直接输出章节正文，不要包含章节标题。正文风格应与故事整体风格一致，字数在800-2000字之间。使用中文写作。`;

    const bodyContent = await this.aiService.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请为第${chapterIndex}章"${chapterTitle}"生成正文。` },
      ],
      temperature: 0.8,
      maxTokens: 4096,
    });

    return {
      success: true,
      bookId,
      chapterIndex,
      chapterTitle,
      body: bodyContent,
    };
  }

  @Post('chapters/save')
  @HttpCode(HttpStatus.OK)
  async saveChapter(@Body() body: { bookId: number; volumeIndex: number; chapterIndex: number; body: string }) {
    const { bookId, volumeIndex, chapterIndex, body: chapterBody } = SaveChapterDto.parse(body);

    const book = this.rawDb.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) throw new Error('Book not found');

    const volumes = this.rawDb.prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY "order"').all(bookId);
    if (!volumes || volumes.length === 0) throw new Error('No volumes found for this book');

    const volume = volumes[volumeIndex];
    if (!volume) throw new Error('Volume not found');

    const chapters = typeof volume.chapters === 'string' ? JSON.parse(volume.chapters) : volume.chapters;
    if (!chapters[chapterIndex]) throw new Error('Chapter not found');

    chapters[chapterIndex].body = chapterBody;

    this.rawDb.prepare('UPDATE volumes SET chapters = ? WHERE id = ?').run(JSON.stringify(chapters), volume.id);

    return { success: true };
  }

 @Post('chapters/refine')
  @HttpCode(HttpStatus.OK)
  async refineChapter(@Body() body: z.infer<typeof RefineChapterDto>) {
    const { bookId, volumeIndex, chapterIndex, body: chapterBody, prompt } = body;

    const book = this.rawDb.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) throw new Error('Book not found');

    const volumes = this.rawDb.prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY "order"').all(bookId);
    if (!volumes || volumes.length === 0) throw new Error('No volumes found for this book');

    const volume = volumes[volumeIndex];
    if (!volume) throw new Error('Volume not found');

    const chapters = typeof volume.chapters === 'string' ? JSON.parse(volume.chapters) : volume.chapters;
    if (!chapters[chapterIndex]) throw new Error('Chapter not found');

    const chapter = chapters[chapterIndex];

    // Load main version for context reference
    let mainVersionContext = '';
    try {
      const mainVer = this.rawDb.prepare(
        'SELECT id, chapter_index, body FROM chapter_body_versions WHERE book_id = ? AND is_main = 1 LIMIT 1',
      ).get(bookId);
      if (mainVer && mainVer.body) {
        mainVersionContext = `\n\n=== 主版本参考（第${mainVer.chapter_index + 1}章） ===\n${mainVer.body}`;
      }
    } catch {
      // Non-critical
    }

    // Load recent chapters for continuity (up to 5 chapters with body)
    let recentChaptersContext = '';
    const allVols = this.rawDb.prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY "order"').all(bookId);
    const recentChapters: string[] = [];
    for (const vol of allVols) {
      if (!vol?.chapters) continue;
      const volChapters = typeof vol.chapters === 'string' ? JSON.parse(vol.chapters) : (vol.chapters || []);
      for (const ch of volChapters) {
        if (ch?.body && ch.body.trim()) {
          recentChapters.push(`第${volChapters.indexOf(ch) + 1}章「${ch.title}」概要：${ch.synopsis || ''}\n正文（前500字）：${ch.body.substring(0, 500)}...`);
        }
      }
    }
    if (recentChapters.length > 0) {
      recentChaptersContext = `\n\n=== 前文章节参考（剧情连续性） ===\n${recentChapters.slice(-5).join('\n\n---\n')}`;
    }

    const context = `书名：${book.title}\n故事概要：${book.synopsis}\n\n`
      + `当前卷：${volume.title}（${volume.synopsis}）\n`
      + `当前章节：第${chapterIndex + 1}章「${chapter.title}」\n`
      + `章节概要：${chapter.synopsis}\n\n`
      + `当前正文：\n${chapter.body || '（暂无正文）'}\n`
      + `${mainVersionContext}${recentChaptersContext}`;

    const systemPrompt = `你是一位专业的网络小说作家。根据以下上下文和用户要求，对指定章节正文进行调整。

${context}

用户要求：${prompt}

请输出调整后的完整正文，不要包含章节标题。保持原有风格，字数在800-2000字之间。使用中文写作。`;

    const bodyContent = await this.aiService.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请调整第${chapterIndex + 1}章正文。` },
      ],
      temperature: 0.8,
      maxTokens: 4096,
    });

    return {
      success: true,
      bookId,
      volumeIndex,
      chapterIndex,
      body: bodyContent,
    };
  }

  @Post('chapters/version')
  @HttpCode(HttpStatus.OK)
  async saveChapterVersion(@Body() body: z.infer<typeof RefineChapterDto>) {
    const { bookId, volumeIndex, chapterIndex, body: chapterBody, prompt } = body;

    const book = this.rawDb.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) throw new Error('Book not found');

    const result = this.rawDb.prepare(`
      INSERT INTO chapter_body_versions (book_id, volume_index, chapter_index, body, refine_prompt, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(bookId, volumeIndex, chapterIndex, chapterBody, prompt || '手动保存');

    return { success: true, versionId: result.lastInsertRowid };
  }

  @Get('books/:bookId/volumes/:volumeIndex/chapters/:chapterIndex/versions')
  async getChapterVersions(@Param('bookId') bookId: string, @Param('volumeIndex') volumeIndex: string, @Param('chapterIndex') chapterIndex: string) {
    const versions = this.rawDb.prepare(
      'SELECT id, book_id, volume_index, chapter_index, body, refine_prompt, created_at FROM chapter_body_versions WHERE book_id = ? AND volume_index = ? AND chapter_index = ? ORDER BY created_at DESC',
    ).all(bookId, volumeIndex, chapterIndex);
    return versions;
  }

  @Get('books/:bookId/volumes/:volumeIndex/chapters/:chapterIndex/versions/:versionId')
  async getChapterVersion(@Param('bookId') bookId: string, @Param('volumeIndex') volumeIndex: string, @Param('chapterIndex') chapterIndex: string, @Param('versionId') versionId: string) {
    const version = this.rawDb.prepare(
      'SELECT * FROM chapter_body_versions WHERE id = ? AND book_id = ? AND volume_index = ? AND chapter_index = ?',
    ).get(versionId, bookId, volumeIndex, chapterIndex);
    if (!version) throw new Error('Version not found');
    return version;
  }

  @Delete('books/:bookId/volumes/:volumeIndex/chapters/:chapterIndex/versions/:versionId')
  @HttpCode(HttpStatus.OK)
  async deleteChapterVersion(@Param('bookId') bookId: string, @Param('volumeIndex') volumeIndex: string, @Param('chapterIndex') chapterIndex: string, @Param('versionId') versionId: string) {
    const result = this.rawDb.prepare(
      'DELETE FROM chapter_body_versions WHERE id = ? AND book_id = ? AND volume_index = ? AND chapter_index = ?',
    ).run(versionId, bookId, volumeIndex, chapterIndex);
    if (result.changes === 0) throw new Error('Version not found');
    return { success: true };
  }

  @Get('books')
  async getBooks() {
    const books = this.rawDb.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
    return books;
  }

  @Get('books/:id/chapters/:volumeIndex')
  async getCurrentChapters(@Param('id') id: string, @Param('volumeIndex') volumeIndex: string) {
    const vol = this.rawDb.prepare(
      'SELECT chapters FROM volumes WHERE book_id = ? AND "order" = ?',
    ).get(id, parseInt(volumeIndex) + 1);
    if (!vol) return [];
    try {
      return typeof vol.chapters === 'string' ? JSON.parse(vol.chapters) : vol.chapters;
    } catch {
      return [];
    }
  }

  @Post('chapters/sync-version')
  @HttpCode(HttpStatus.OK)
  async syncChapterToVersion(@Body() body: { bookId: number; volumeIndex: number; chapterIndex: number; body: string }) {
    const { bookId, volumeIndex, chapterIndex, body: chapterBody } = body;

    // Get the oldest version for this book
    const version = this.rawDb.prepare(
      'SELECT id, outline_json FROM versions WHERE book_id = ? ORDER BY created_at ASC LIMIT 1',
    ).get(bookId);
    if (!version) return { success: false };

    let outlineData: any;
    try {
      outlineData = typeof version.outline_json === 'string'
        ? JSON.parse(version.outline_json)
        : version.outline_json;
    } catch {
      return { success: false };
    }

    if (!outlineData.volumes || !Array.isArray(outlineData.volumes)) return { success: false };

    const vol = outlineData.volumes[volumeIndex];
    if (!vol || !Array.isArray(vol.chapters)) return { success: false };

    if (chapterIndex >= 0 && chapterIndex < vol.chapters.length) {
      vol.chapters[chapterIndex].body = chapterBody;
    }

    this.rawDb.prepare('UPDATE versions SET outline_json = ? WHERE id = ?').run(
      JSON.stringify(outlineData),
      version.id,
    );

    return { success: true };
  }

  @Get('books/:id')
  async getBook(@Param('id') id: string) {
    const book = this.rawDb.prepare('SELECT * FROM books WHERE id = ?').get(id);
    if (!book) throw new Error('Book not found');

    const volumes = this.rawDb.prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY "order"').all(id);
    return { ...book, volumes: volumes || [] };
  }

  @Get('books/:id/versions')
  async getVersions(@Param('id') id: string) {
    const versions = this.rawDb.prepare(
      'SELECT id, book_id, title, synopsis, style, refine_prompt, created_at FROM versions WHERE book_id = ? ORDER BY created_at DESC',
    ).all(id);
    return versions;
  }

  @Get('books/:id/versions/:versionId')
  async getVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    const version = this.rawDb.prepare('SELECT * FROM versions WHERE id = ? AND book_id = ?').get(versionId, id);
    if (!version) throw new Error('Version not found');

    // Parse outline_json to get the volumes for this specific version
    let outlineData: any;
    try {
      outlineData = typeof version.outline_json === 'string'
        ? JSON.parse(version.outline_json)
        : version.outline_json;
    } catch {
      outlineData = {};
    }

    // Convert outline volumes to the same format as volumes table
    const outlineVolumes = outlineData.volumes || [];
    const volumes = outlineVolumes.map((v: any, index: number) => ({
      id: index + 1,
      book_id: id,
      order: index + 1,
      title: v.title || '',
      theme: v.theme || '',
      synopsis: v.synopsis || '',
      chapters: typeof v.chapters === 'string' ? v.chapters : JSON.stringify(v.chapters || []),
      created_at: version.created_at,
    }));

    return {
      ...version,
      outline: outlineData,
      volumes: volumes,
    };
  }

  @Delete('books/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBook(@Param('id') id: string) {
    this.rawDb.prepare('DELETE FROM versions WHERE book_id = ?').run(id);
    this.rawDb.prepare('DELETE FROM volumes WHERE book_id = ?').run(id);
    this.rawDb.prepare('DELETE FROM books WHERE id = ?').run(id);
    return { success: true };
  }

  // Get all chapter body versions for a book (book-level, not chapter-specific)
  @Get('books/:id/all-chapter-versions')
  async getAllChapterBodyVersions(@Param('id') id: string) {
    const versions = this.rawDb.prepare(
      'SELECT id, book_id, volume_index, chapter_index, body, refine_prompt, created_at, is_main FROM chapter_body_versions WHERE book_id = ? ORDER BY created_at DESC',
    ).all(id);
    return versions;
  }

  // Set a chapter body version as the main version for a book
  @Post('books/:id/set-main-version')
  @HttpCode(HttpStatus.OK)
  async setMainChapterVersion(@Param('id') id: string, @Body() body: { versionId: number }) {
    const { versionId } = body;

    // Verify the version belongs to this book
    const version = this.rawDb.prepare(
      'SELECT id FROM chapter_body_versions WHERE id = ? AND book_id = ?',
    ).get(versionId, id);
    if (!version) throw new Error('Version not found');

    // Unset all other main versions first
    this.rawDb.prepare(
      'UPDATE chapter_body_versions SET is_main = 0 WHERE book_id = ?',
    ).run(id);

    // Set this version as main
    this.rawDb.prepare(
      'UPDATE chapter_body_versions SET is_main = 1 WHERE id = ?',
    ).run(versionId);

    return { success: true, versionId };
  }

  // Get the main version id for a book
  @Get('books/:id/main-version')
  async getMainChapterVersion(@Param('id') id: string) {
    const version = this.rawDb.prepare(
      'SELECT id FROM chapter_body_versions WHERE book_id = ? AND is_main = 1 LIMIT 1',
    ).get(id);
    return version || null;
  }
}
