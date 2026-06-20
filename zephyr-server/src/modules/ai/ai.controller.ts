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

  /**
   * Generate a novel outline from a prompt.
   * Creates: book → volumes + outline_version + chapters
   */
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
      jsonStr = jsonStr.replace(/^\uFEFF/, '');
      const markdownMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (markdownMatch) {
        jsonStr = markdownMatch[1].trim();
      }
      try {
        outline = JSON.parse(jsonStr);
      } catch {
        let cleaned = jsonStr
          .replace(/,\s*}/g, '}')
          .replace(/,\s*\]/g, ']')
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '');
        cleaned = cleaned.trim();
        outline = JSON.parse(cleaned);
      }
    } catch (err) {
      throw new Error(`AI 返回格式错误，无法解析为 JSON: ${rawContent.substring(0, 200)}...`);
    }

    // Create book
    const bookStmt = this.rawDb.prepare(`
      INSERT INTO books (title, synopsis, prompt, status)
      VALUES (?, ?, ?, 'ready')
    `);
    const bookResult = bookStmt.run(outline.title, outline.synopsis, prompt);
    const bookId = bookResult.lastInsertRowid;

    // Create volumes
    if (outline.volumes && Array.isArray(outline.volumes)) {
      const volStmt = this.rawDb.prepare(`
        INSERT INTO volumes (book_id, "order", title, theme, synopsis, chapters)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < outline.volumes.length; i++) {
        const vol = outline.volumes[i];
        const chaptersJson = JSON.stringify(vol.chapters || []);
        volStmt.run(bookId, i + 1, vol.title, vol.theme, vol.synopsis, chaptersJson);
      }
    }

    // Create initial outline_version
    const ovStmt = this.rawDb.prepare(`
      INSERT INTO outline_versions (book_id, title, synopsis, style, outline_json, refine_prompt, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const ovResult = ovStmt.run(
      bookId,
      outline.title,
      outline.synopsis,
      outline.style || '',
      JSON.stringify(outline),
      `初始生成: ${prompt}`,
    );
    const outlineVersionId = ovResult.lastInsertRowid;

    // Create chapters linked to this outline version
    if (outline.volumes && Array.isArray(outline.volumes)) {
      const chStmt = this.rawDb.prepare(`
        INSERT INTO chapters (outline_version_id, book_id, volume_index, chapter_index, title, synopsis)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (let vi = 0; vi < outline.volumes.length; vi++) {
        const vol = outline.volumes[vi];
        if (vol.chapters && Array.isArray(vol.chapters)) {
          for (let ci = 0; ci < vol.chapters.length; ci++) {
            const ch = vol.chapters[ci];
            chStmt.run(outlineVersionId, bookId, vi, ci, ch.title, ch.synopsis);
          }
        }
      }
    }

    return {
      success: true,
      bookId,
      outline,
    };
  }

  /**
   * Refine the outline.
   * Creates: new outline_version + chapters (old ones become historical).
   * Deletes old volumes, creates new volumes.
   * Old chapter_bodies remain linked to old chapters (historical).
   */
  @Post('refine')
  @HttpCode(HttpStatus.OK)
  async refineOutline(@Body() body: { bookId: number; prompt: string }) {
    const { bookId, prompt } = RefineOutlineDto.parse(body);

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

    // Create new outline_version
    const ovStmt = this.rawDb.prepare(`
      INSERT INTO outline_versions (book_id, title, synopsis, style, outline_json, refine_prompt, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const ovResult = ovStmt.run(
      bookId,
      refined.title,
      refined.synopsis,
      refined.style || '',
      JSON.stringify(refined),
      prompt,
    );
    const outlineVersionId = ovResult.lastInsertRowid;

    // Create chapters for this new outline version
    if (refined.volumes && Array.isArray(refined.volumes)) {
      const chStmt = this.rawDb.prepare(`
        INSERT INTO chapters (outline_version_id, book_id, volume_index, chapter_index, title, synopsis)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (let vi = 0; vi < refined.volumes.length; vi++) {
        const vol = refined.volumes[vi];
        if (vol.chapters && Array.isArray(vol.chapters)) {
          for (let ci = 0; ci < vol.chapters.length; ci++) {
            const ch = vol.chapters[ci];
            chStmt.run(outlineVersionId, bookId, vi, ci, ch.title, ch.synopsis);
          }
        }
      }
    }

    // Delete old volumes and create new ones
    this.rawDb.prepare('DELETE FROM volumes WHERE book_id = ?').run(bookId);

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
      outlineVersionId,
      outline: refined,
    };
  }

  /**
   * Generate a chapter body via AI.
   */
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

  /**
   * Save a chapter body.
   * Updates: volumes.chapters JSON (backward compat) + chapter_bodies (new system).
   * If the chapter doesn't exist in the current outline version, it's created first.
   */
  @Post('chapters/save')
  @HttpCode(HttpStatus.OK)
  async saveChapter(@Body() body: { bookId: number; volumeIndex: number; chapterIndex: number; body: string }) {
    const { bookId, volumeIndex, chapterIndex, body: chapterBody } = SaveChapterDto.parse(body);

    const book = this.rawDb.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) throw new Error('Book not found');

    // Get current outline version (latest) and find/create the chapter
    const latestOv = this.rawDb.prepare(`
      SELECT id FROM outline_versions WHERE book_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(bookId) as { id: number } | undefined;

    if (!latestOv) throw new Error('No outline version found');

    // Find existing chapter or create it
    let chapter = this.rawDb.prepare(`
      SELECT id FROM chapters WHERE outline_version_id = ? AND volume_index = ? AND chapter_index = ?
    `).get(latestOv.id, volumeIndex, chapterIndex) as { id: number } | undefined;

    if (!chapter) {
      // Chapter doesn't exist in current outline version — create it
      // First, get the chapter metadata from volumes JSON
      const volumes = this.rawDb.prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY "order"').all(bookId);
      const vol = volumes[volumeIndex];
      if (!vol) throw new Error('Volume not found');

      const chapters = typeof vol.chapters === 'string' ? JSON.parse(vol.chapters) : vol.chapters;
      const chData = chapters[chapterIndex];
      if (!chData) throw new Error('Chapter not found');

      const insertCh = this.rawDb.prepare(`
        INSERT INTO chapters (outline_version_id, book_id, volume_index, chapter_index, title, synopsis)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const chResult = insertCh.run(latestOv.id, bookId, volumeIndex, chapterIndex, chData.title, chData.synopsis);
      chapter = { id: chResult.lastInsertRowid as number };
    }

    // Update volumes.chapters JSON (backward compat)
    const volumes = this.rawDb.prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY "order"').all(bookId);
    const volume = volumes[volumeIndex];
    if (!volume) throw new Error('Volume not found');

    const chapters = typeof volume.chapters === 'string' ? JSON.parse(volume.chapters) : volume.chapters;
    if (!chapters[chapterIndex]) throw new Error('Chapter not found');
    chapters[chapterIndex].body = chapterBody;
    this.rawDb.prepare('UPDATE volumes SET chapters = ? WHERE id = ?').run(JSON.stringify(chapters), volume.id);

    // Create chapter_body entry
    const bodyStmt = this.rawDb.prepare(`
      INSERT INTO chapter_bodies (chapter_id, body, refine_prompt, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    bodyStmt.run(chapter.id, chapterBody, '手动保存');

    return { success: true };
  }

  /**
   * Refine a chapter body via AI.
   * Uses the new chapters + chapter_bodies tables for context.
   */
  @Post('chapters/refine')
  @HttpCode(HttpStatus.OK)
  async refineChapter(@Body() body: z.infer<typeof RefineChapterDto>) {
    const { bookId, volumeIndex, chapterIndex, body: chapterBody, prompt } = body;

    const book = this.rawDb.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) throw new Error('Book not found');

    // Get current outline version and chapter
    const latestOv = this.rawDb.prepare(`
      SELECT id FROM outline_versions WHERE book_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(bookId) as { id: number } | undefined;

    if (!latestOv) throw new Error('No outline version found');

    const chapter = this.rawDb.prepare(`
      SELECT * FROM chapters WHERE outline_version_id = ? AND volume_index = ? AND chapter_index = ?
    `).get(latestOv.id, volumeIndex, chapterIndex) as any;

    if (!chapter) throw new Error('Chapter not found');

    // Get current body text for this chapter (latest)
    const currentBody = this.rawDb.prepare(`
      SELECT body FROM chapter_bodies WHERE chapter_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(chapter.id) as { body: string } | undefined;
    const currentBodyText = currentBody?.body || '';

    // Get recent chapters for continuity (up to 5)
    let recentChaptersContext = '';
    const allChaptersWithBodies: Array<{
      volume_index: number;
      chapter_index: number;
      title: string;
      synopsis: string;
      body: string;
    }> = [];

    // Query latest chapters for this book
    const chaptersStmt = this.rawDb.prepare(`
      SELECT ch.volume_index, ch.chapter_index, ch.title, ch.synopsis,
             cb.body
      FROM chapters ch
      LEFT JOIN (
        SELECT chapter_id, body FROM chapter_bodies cb1
        WHERE created_at = (
          SELECT MAX(created_at) FROM chapter_bodies cb2 WHERE cb2.chapter_id = cb1.chapter_id
        )
      ) cb ON cb.chapter_id = ch.id
      WHERE ch.outline_version_id = ?
      ORDER BY ch.volume_index, ch.chapter_index
    `).all(latestOv.id) as any[];

    for (const ch of chaptersStmt) {
      if (ch?.body?.trim()) {
        allChaptersWithBodies.push({
          volume_index: ch.volume_index,
          chapter_index: ch.chapter_index,
          title: ch.title,
          synopsis: ch.synopsis || '',
          body: ch.body,
        });
      }
    }

    // Filter to only chapters before or at the current one, take up to 5
    if (allChaptersWithBodies.length > 0) {
      const recent = allChaptersWithBodies
        .filter(c => (c.volume_index < volumeIndex) || (c.volume_index === volumeIndex && c.chapter_index < chapterIndex))
        .slice(-5);
      if (recent.length > 0) {
        recentChaptersContext = `\n\n=== 前文章节参考（剧情连续性） ===\n`
          + recent.map(c => `第${c.chapter_index + 1}章「${c.title}」概要：${c.synopsis}\n正文（前500字）：${c.body.substring(0, 500)}...`)
          .join('\n\n---\n');
      }
    }

    const volumes = this.rawDb.prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY "order"').all(bookId);
    const volume = volumes[volumeIndex];

    const context = `书名：${book.title}\n故事概要：${book.synopsis}\n\n`
      + `当前卷：${volume.title}（${volume.synopsis}）\n`
      + `当前章节：第${chapterIndex + 1}章「${chapter.title}」\n`
      + `章节概要：${chapter.synopsis}\n\n`
      + `当前正文：\n${currentBodyText || '（暂无正文）'}\n`
      + `${recentChaptersContext}`;

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

  /**
   * Save a chapter body version (manual save).
   */
  @Post('chapters/version')
  @HttpCode(HttpStatus.OK)
  async saveChapterVersion(@Body() body: z.infer<typeof RefineChapterDto>) {
    const { bookId, volumeIndex, chapterIndex, body: chapterBody, prompt } = body;

    const book = this.rawDb.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) throw new Error('Book not found');

    // Find the chapter in the latest outline version
    const latestOv = this.rawDb.prepare(`
      SELECT id FROM outline_versions WHERE book_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(bookId) as { id: number } | undefined;

    if (!latestOv) throw new Error('No outline version found');

    const chapter = this.rawDb.prepare(`
      SELECT id FROM chapters WHERE outline_version_id = ? AND volume_index = ? AND chapter_index = ?
    `).get(latestOv.id, volumeIndex, chapterIndex) as { id: number } | undefined;

    if (!chapter) throw new Error('Chapter not found');

    const result = this.rawDb.prepare(`
      INSERT INTO chapter_bodies (chapter_id, body, refine_prompt, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(chapter.id, chapterBody, prompt || '手动保存');

    return { success: true, versionId: result.lastInsertRowid };
  }

  /**
   * List all chapter body versions for a specific chapter.
   */
  @Get('books/:bookId/volumes/:volumeIndex/chapters/:chapterIndex/versions')
  async getChapterVersions(
    @Param('bookId') bookId: string,
    @Param('volumeIndex') volumeIndex: string,
    @Param('chapterIndex') chapterIndex: string,
  ) {
    // Find the chapter ID in the latest outline version
    const latestOv = this.rawDb.prepare(`
      SELECT id FROM outline_versions WHERE book_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(bookId) as { id: number } | undefined;

    if (!latestOv) return [];

    const chapter = this.rawDb.prepare(`
      SELECT id FROM chapters WHERE outline_version_id = ? AND volume_index = ? AND chapter_index = ?
    `).get(latestOv.id, parseInt(volumeIndex), parseInt(chapterIndex)) as { id: number } | undefined;

    if (!chapter) return [];

    const versions = this.rawDb.prepare(`
      SELECT id, chapter_id, body, refine_prompt, created_at
      FROM chapter_bodies
      WHERE chapter_id = ?
      ORDER BY created_at DESC
    `).all(chapter.id);

    // Attach chapter coordinate info for frontend compatibility
    return (versions as any[]).map((v: any) => ({
      ...v,
      book_id: parseInt(bookId),
      volume_index: parseInt(volumeIndex),
      chapter_index: parseInt(chapterIndex),
    }));
  }

  /**
   * Get a specific chapter body version.
   */
  @Get('books/:bookId/volumes/:volumeIndex/chapters/:chapterIndex/versions/:versionId')
  async getChapterVersion(
    @Param('bookId') bookId: string,
    @Param('volumeIndex') volumeIndex: string,
    @Param('chapterIndex') chapterIndex: string,
    @Param('versionId') versionId: string,
  ) {
    // Find the chapter ID
    const latestOv = this.rawDb.prepare(`
      SELECT id FROM outline_versions WHERE book_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(bookId) as { id: number } | undefined;

    if (!latestOv) throw new Error('No outline version found');

    const chapter = this.rawDb.prepare(`
      SELECT id FROM chapters WHERE outline_version_id = ? AND volume_index = ? AND chapter_index = ?
    `).get(latestOv.id, parseInt(volumeIndex), parseInt(chapterIndex)) as { id: number } | undefined;

    if (!chapter) throw new Error('Chapter not found');

    const version = this.rawDb.prepare(`
      SELECT * FROM chapter_bodies WHERE id = ? AND chapter_id = ?
    `).get(versionId, chapter.id) as any;

    if (!version) throw new Error('Version not found');

    return {
      ...version,
      book_id: parseInt(bookId),
      volume_index: parseInt(volumeIndex),
      chapter_index: parseInt(chapterIndex),
    };
  }

  /**
   * Delete a specific chapter body version.
   */
  @Delete('books/:bookId/volumes/:volumeIndex/chapters/:chapterIndex/versions/:versionId')
  @HttpCode(HttpStatus.OK)
  async deleteChapterVersion(
    @Param('bookId') bookId: string,
    @Param('volumeIndex') volumeIndex: string,
    @Param('chapterIndex') chapterIndex: string,
    @Param('versionId') versionId: string,
  ) {
    const latestOv = this.rawDb.prepare(`
      SELECT id FROM outline_versions WHERE book_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(bookId) as { id: number } | undefined;

    if (!latestOv) throw new Error('No outline version found');

    const chapter = this.rawDb.prepare(`
      SELECT id FROM chapters WHERE outline_version_id = ? AND volume_index = ? AND chapter_index = ?
    `).get(latestOv.id, parseInt(volumeIndex), parseInt(chapterIndex)) as { id: number } | undefined;

    if (!chapter) throw new Error('Chapter not found');

    const result = this.rawDb.prepare(
      'DELETE FROM chapter_bodies WHERE id = ? AND chapter_id = ?',
    ).run(versionId, chapter.id);

    if (result.changes === 0) throw new Error('Version not found');
    return { success: true };
  }

  /**
   * List all books.
   */
  @Get('books')
  async getBooks() {
    const books = this.rawDb.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
    return books;
  }

  /**
   * Get current chapters for a volume (from volumes table JSON).
   */
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

  /**
   * Sync chapter body into the latest outline version's JSON.
   */
  @Post('chapters/sync-version')
  @HttpCode(HttpStatus.OK)
  async syncChapterToVersion(@Body() body: { bookId: number; volumeIndex: number; chapterIndex: number; body: string }) {
    const { bookId, volumeIndex, chapterIndex, body: chapterBody } = body;

    // Get the latest outline version for this book
    const version = this.rawDb.prepare(
      'SELECT id, outline_json FROM outline_versions WHERE book_id = ? ORDER BY created_at DESC LIMIT 1',
    ).get(bookId) as { id: number; outline_json: string } | undefined;

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

    this.rawDb.prepare('UPDATE outline_versions SET outline_json = ? WHERE id = ?').run(
      JSON.stringify(outlineData),
      version.id,
    );

    return { success: true };
  }

  /**
   * Get a book with its volumes.
   */
  @Get('books/:id')
  async getBook(@Param('id') id: string) {
    const book = this.rawDb.prepare('SELECT * FROM books WHERE id = ?').get(id);
    if (!book) throw new Error('Book not found');

    const volumes = this.rawDb.prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY "order"').all(id);
    return { ...book, volumes: volumes || [] };
  }

  /**
   * List outline versions for a book.
   */
  @Get('books/:id/versions')
  async getVersions(@Param('id') id: string) {
    const versions = this.rawDb.prepare(
      'SELECT id, book_id, title, synopsis, style, refine_prompt, created_at FROM outline_versions WHERE book_id = ? ORDER BY created_at DESC',
    ).all(id);
    return versions;
  }

  /**
   * Get a specific outline version detail with its chapters and bodies.
   */
  @Get('books/:id/versions/:versionId')
  async getVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    const version = this.rawDb.prepare(
      'SELECT * FROM outline_versions WHERE id = ? AND book_id = ?',
    ).get(versionId, id) as any;

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

    // Get chapters for this outline version, along with their latest body texts
    const chapters = this.rawDb.prepare(`
      SELECT ch.volume_index, ch.chapter_index, ch.title, ch.synopsis,
             cb.body
      FROM chapters ch
      LEFT JOIN (
        SELECT chapter_id, body FROM chapter_bodies cb1
        WHERE created_at = (
          SELECT MAX(created_at) FROM chapter_bodies cb2 WHERE cb2.chapter_id = cb1.chapter_id
        )
      ) cb ON cb.chapter_id = ch.id
      WHERE ch.outline_version_id = ?
      ORDER BY ch.volume_index, ch.chapter_index
    `).all(version.id) as any[];

    // Group chapters by volume for the response
    const volumes = outlineData.volumes?.map((vol: any, vi: number) => {
      const volChapters = chapters
        .filter(ch => ch.volume_index === vi)
        .map(ch => ({
          title: ch.title,
          synopsis: ch.synopsis,
          body: ch.body || '',
        }));

      // Fill in missing chapters from outline JSON
      const outlineChapters = vol?.chapters || [];
      for (let ci = 0; ci < outlineChapters.length; ci++) {
        if (!volChapters[ci]) {
          volChapters.push({
            title: outlineChapters[ci]?.title || '',
            synopsis: outlineChapters[ci]?.synopsis || '',
            body: '',
          });
        }
      }

      return {
        id: vi + 1,
        book_id: id,
        order: vi + 1,
        title: vol?.title || '',
        theme: vol?.theme || '',
        synopsis: vol?.synopsis || '',
        chapters: volChapters,
        created_at: version.created_at,
      };
    }) || [];

    return {
      ...version,
      outline: outlineData,
      volumes,
    };
  }

  /**
   * Delete a book and all its related data.
   */
  @Delete('books/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBook(@Param('id') id: string) {
    this.rawDb.prepare('DELETE FROM outline_versions WHERE book_id = ?').run(id);
    this.rawDb.prepare('DELETE FROM volumes WHERE book_id = ?').run(id);
    this.rawDb.prepare('DELETE FROM books WHERE id = ?').run(id);
    return { success: true };
  }

  /**
   * Get all chapter body versions for a book (book-level, not chapter-specific).
   * Returns the latest body for each chapter.
   */
  @Get('books/:id/all-chapter-versions')
  async getAllChapterBodyVersions(@Param('id') id: string) {
    // Get the latest outline version for this book
    const latestOv = this.rawDb.prepare(`
      SELECT id FROM outline_versions WHERE book_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(id) as { id: number } | undefined;

    if (!latestOv) return [];

    // Get all chapters in the latest outline version, along with their latest body
    const chapters = this.rawDb.prepare(`
      SELECT ch.id as chapter_id, ch.volume_index, ch.chapter_index, ch.title, ch.synopsis,
             cb.body, cb.refine_prompt, cb.created_at
      FROM chapters ch
      LEFT JOIN (
        SELECT chapter_id, body, refine_prompt, created_at FROM chapter_bodies cb1
        WHERE created_at = (
          SELECT MAX(created_at) FROM chapter_bodies cb2 WHERE cb2.chapter_id = cb1.chapter_id
        )
      ) cb ON cb.chapter_id = ch.id
      WHERE ch.outline_version_id = ?
      ORDER BY ch.volume_index, ch.chapter_index
    `).all(latestOv.id) as any[];

    return chapters.map((ch: any) => ({
      id: ch.chapter_id,
      book_id: parseInt(id),
      volume_index: ch.volume_index,
      chapter_index: ch.chapter_index,
      body: ch.body || '',
      refine_prompt: ch.refine_prompt || '',
      created_at: ch.created_at || '',
    }));
  }

  /**
   * Set a chapter body version as the "current" version for a chapter.
   * In the new design, "current" means the latest body for a chapter.
   * This endpoint allows manually selecting which body version is the latest.
   */
  @Post('books/:id/set-main-version')
  @HttpCode(HttpStatus.OK)
  async setMainChapterVersion(@Param('id') id: string, @Body() body: { versionId: number }) {
    const { versionId } = body;

    // Verify the version belongs to this book
    const version = this.rawDb.prepare(`
      SELECT cb.id, cb.chapter_id, ch.outline_version_id, ov.book_id
      FROM chapter_bodies cb
      JOIN chapters ch ON ch.id = cb.chapter_id
      JOIN outline_versions ov ON ov.id = ch.outline_version_id
      WHERE cb.id = ? AND ov.book_id = ?
    `).get(versionId, id) as any;

    if (!version) throw new Error('Version not found');

    // Get all chapter bodies for the same chapter
    const allForChapter = this.rawDb.prepare(`
      SELECT id FROM chapter_bodies WHERE chapter_id = ?
    `).all(version.chapter_id) as { id: number }[];

    // Delete all but the selected one (effectively making it the latest)
    const deleteStmt = this.rawDb.prepare('DELETE FROM chapter_bodies WHERE id = ?');
    for (const entry of allForChapter) {
      if (entry.id !== versionId) {
        deleteStmt.run(entry.id);
      }
    }

    return { success: true, versionId };
  }

  /**
   * Get the latest chapter body version for a book.
   * In the new design, this returns the latest body for the first chapter.
   */
  @Get('books/:id/main-version')
  async getMainChapterVersion(@Param('id') id: string) {
    const latestOv = this.rawDb.prepare(`
      SELECT id FROM outline_versions WHERE book_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(id) as { id: number } | undefined;

    if (!latestOv) return null;

    // Get the first chapter's latest body
    const firstChapter = this.rawDb.prepare(`
      SELECT id FROM chapters WHERE outline_version_id = ? ORDER BY volume_index, chapter_index LIMIT 1
    `).get(latestOv.id) as { id: number } | undefined;

    if (!firstChapter) return null;

    const version = this.rawDb.prepare(`
      SELECT id, chapter_id, body, refine_prompt, created_at
      FROM chapter_bodies
      WHERE chapter_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(firstChapter.id) as any;

    if (!version) return null;

    return {
      ...version,
      volume_index: 0,
      chapter_index: 0,
    };
  }
}
