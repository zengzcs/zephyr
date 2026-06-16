import { Controller, Post, Body, Get, Param, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { AiService } from './ai.service';
import { DatabaseService } from '../database/database.service';
import { z } from 'zod';

const GenerateOutlineDto = z.object({
  prompt: z.string().min(1).max(500),
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
      // Try to extract JSON from possible markdown code blocks
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

    return {
      success: true,
      bookId: result.lastInsertRowid,
      outline,
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

  @Delete('books/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBook(@Param('id') id: string) {
    this.rawDb.prepare('DELETE FROM volumes WHERE book_id = ?').run(id);
    this.rawDb.prepare('DELETE FROM books WHERE id = ?').run(id);
    return { success: true };
  }
}
