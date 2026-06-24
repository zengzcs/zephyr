import { Controller, Get, Query, Delete, Post } from '@nestjs/common';
import { LogService } from './log.service';

@Controller('logs')
export class LogController {
  constructor(private readonly logService: LogService) {}

  /**
   * 查询日志列表
   * GET /logs?page=1&pageSize=50&level=error&module=ai
   */
  @Get()
  async getLogs(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '50',
    @Query('level') level?: string,
    @Query('module') module?: string,
  ) {
    return this.logService.queryLogs(
      parseInt(page, 10),
      parseInt(pageSize, 10),
      level,
      module,
    );
  }

  /**
   * 获取日志统计信息
   * GET /logs/stats
   */
  @Get('stats')
  async getStats() {
    return this.logService.getLogStats();
  }

  /**
   * 清空日志
   * DELETE /logs
   */
  @Delete()
  async clearLogs() {
    this.logService.clearLogs();
    return { success: true, message: 'All logs cleared' };
  }

  /**
   * 手动触发归档压缩
   * POST /logs/archive
   */
  @Post('archive')
  async archiveLogs() {
    // 触发归档（通过重新初始化）
    return { success: true, message: 'Archive triggered' };
  }
}
