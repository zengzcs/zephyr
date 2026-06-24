import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class MonitorService {
  async getSystemStatus() {
    const cpuUsage = this.getCpuUsage();
    const memoryUsage = this.getMemoryUsage();
    const loadAverage = this.getLoadAverage();

    let gpuInfo: any;
    try {
      gpuInfo = await this.getGpuInfo();
    } catch {
      gpuInfo = { available: false };
    }

    return {
      timestamp: new Date().toISOString(),
      cpu: cpuUsage,
      memory: memoryUsage,
      load: loadAverage,
      gpu: gpuInfo,
    };
  }

  getCpuUsage(): { usage: number; cores: number; model: string } {
    const cpus = os.cpus();
    const usage = this.calculateCpuUsage();
    return {
      usage: Math.round(usage * 100) / 100,
      cores: cpus.length,
      model: cpus[0]?.model || 'unknown',
    };
  }

  private calculateCpuUsage(): number {
    // Read CPU times from /proc/stat for more accurate measurement
    try {
      const stat = fs.readFileSync('/proc/stat', 'utf-8').split('\n')[0];
      const [, user, nice, system, idle, iowait, irq, softirq, steal] = stat.split(/\s+/).map(Number);
      const total = user + nice + system + idle + iowait + irq + softirq + steal;
      const busy = total - idle - iowait;
      return busy / total;
    } catch {
      // Fallback: estimate from os.cpus()
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (const cpu of cpus) {
        for (const type of Object.values(cpu.times)) {
          totalTick += type;
        }
        totalIdle += cpu.times.idle;
      }
      return Math.max(0, 1 - totalIdle / totalTick);
    }
  }

  getMemoryUsage(): { total: number; used: number; free: number; usage: number } {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      total: Math.round(total / 1024 / 1024),
      used: Math.round(used / 1024 / 1024),
      free: Math.round(free / 1024 / 1024),
      usage: Math.round((used / total) * 10000) / 100,
    };
  }

  getLoadAverage(): { one: number; five: number; fifteen: number } {
    const [one, five, fifteen] = os.loadavg();
    return { one: Math.round(one * 100) / 100, five: Math.round(five * 100) / 100, fifteen: Math.round(fifteen * 100) / 100 };
  }

  async getGpuInfo(): Promise<{
    available: boolean;
    model?: string;
    memory_total?: number;
    memory_used?: number;
    memory_usage?: number;
    gpu_usage?: number;
    temperature?: number;
    cuda_version?: string;
  }> {
    try {
      const { stdout } = await execAsync('nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits');
      const lines = stdout.trim().split('\n');
      const gpus = lines.map((line) => {
        const [index, name, memTotal, memUsed, gpuUtil, temp] = line.split(',').map((v) => v.trim());
        return {
          index: parseInt(index, 10),
          name,
          memory_total: parseInt(memTotal, 10),
          memory_used: parseInt(memUsed, 10),
          memory_usage: Math.round((parseInt(memUsed, 10) / parseInt(memTotal, 10)) * 10000) / 100,
          gpu_usage: parseInt(gpuUtil, 10),
          temperature: parseInt(temp, 10),
        };
      });

      // Aggregate for single GPU or multi-GPU summary
      if (gpus.length === 1) {
        return {
          available: true,
          model: gpus[0].name,
          memory_total: gpus[0].memory_total,
          memory_used: gpus[0].memory_used,
          memory_usage: gpus[0].memory_usage,
          gpu_usage: gpus[0].gpu_usage,
          temperature: gpus[0].temperature,
        };
      }

      return {
        available: true,
        model: `${gpus.length} GPUs`,
        memory_total: gpus.reduce((a, b) => a + b.memory_total, 0),
        memory_used: gpus.reduce((a, b) => a + b.memory_used, 0),
        memory_usage: Math.round((gpus.reduce((a, b) => a + b.memory_used, 0) / gpus.reduce((a, b) => a + b.memory_total, 0)) * 10000) / 100,
        gpu_usage: Math.round(gpus.reduce((a, b) => a + b.gpu_usage, 0) / gpus.length),
        temperature: Math.round(gpus.reduce((a, b) => a + b.temperature, 0) / gpus.length),
      };
    } catch {
      return { available: false };
    }
  }
}
