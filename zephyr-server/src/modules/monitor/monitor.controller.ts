import { Controller, Get } from '@nestjs/common';
import { MonitorService } from './monitor.service';

@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Get('system')
  getSystemStatus() {
    return this.monitorService.getSystemStatus();
  }
}
