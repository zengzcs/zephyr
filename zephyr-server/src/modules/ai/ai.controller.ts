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
      const markdownMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (markdownMatch) {
        jsonStr = markdownMatch[1].trim();
      }
      outline = JSON.parse(jsonStr);
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
      const markdownMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (markdownMatch) {
        jsonStr = markdownMatch[1].trim();
      }
      refined = JSON.parse(jsonStr);
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

  @Get('books')
  async getBooks() {
    const books = this.rawDb.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
    return books;
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

    const volumes = this.rawDb.prepare(
      'SELECT * FROM volumes WHERE book_id = ? ORDER BY "order"',
    ).all(id);

    return {
      ...version,
      outline: typeof version.outline_json === 'string' ? JSON.parse(version.outline_json) : version.outline_json,
      volumes: volumes || [],
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
}
