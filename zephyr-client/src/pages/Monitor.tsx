import { useState, useEffect, useCallback } from 'react'
import {
  Container,
  Typography,
  Grid,
  Box,
  Chip,
  CircularProgress,
  Alert,
  AlertTitle,
  Paper,
} from '@mui/material'
import EChartsReact from 'echarts-for-react'
import * as echarts from 'echarts'

interface SystemStats {
  timestamp: string
  cpu: {
    usage: number
    cores: number
    model: string
  }
  memory: {
    total: number
    used: number
    free: number
    usage: number
  }
  load: {
    one: number
    five: number
    fifteen: number
  }
  gpu: {
    available: boolean
    model?: string
    memory_total?: number
    memory_used?: number
    memory_usage?: number
    gpu_usage?: number
    temperature?: number
  }
}

function Monitor() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:5010/monitor/system')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStats(data)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch stats')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 5000)
    return () => clearInterval(interval)
  }, [fetchStats])

  const getOption = (seriesName: string, value: number, max: number, color: string): echarts.EChartsOption => ({
    series: [
      {
        type: 'gauge',
        min: 0,
        max: max,
        progress: { show: true, width: 18 },
        axisLine: { lineStyle: { width: 18, color: [[1, '#eee']] } },
        axisTick: { show: false },
        splitLine: { length: 15, lineStyle: { width: 2, color: '#999' } },
        axisLabel: { distance: 25, color: '#999', fontSize: 12 },
        anchor: { show: true, showAbove: true, size: 25, itemStyle: { color } },
        title: { show: true, color: '#999' },
        detail: {
          valueAnimation: true,
          fontWeight: 'bold',
          fontSize: 20,
          color: '#fff',
          offsetCenter: [0, '20%'],
          formatter: '{value}%',
        },
        data: [{ value: Math.round(value * 100) / 100, name: seriesName }],
      },
    ],
  })

  const getBarOption = (_seriesName: string, data: { name: string; value: number }[]): echarts.EChartsOption => ({
    grid: { left: '10%', right: '10%', bottom: '15%', top: '10%' },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      axisLabel: { color: '#fff', fontSize: 12 },
      axisLine: { lineStyle: { color: '#555' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#fff', fontSize: 12 },
      splitLine: { lineStyle: { color: '#333' } },
      axisLine: { lineStyle: { color: '#555' } },
    },
    series: [
      {
        data: data.map((d) => d.value),
        type: 'bar',
        barWidth: '40%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#4fc08d' },
            { offset: 1, color: '#2d8cf0' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
    tooltip: { trigger: 'axis', backgroundColor: '#333', borderColor: '#555', textStyle: { color: '#fff' } },
  })

  const chartTheme: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    textStyle: { color: '#ccc' },
  }

  if (loading && !stats) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error">
          <AlertTitle>连接失败</AlertTitle>
          无法连接到后端服务: {error}
          <br />
          请确保后端服务运行在 http://localhost:5010
        </Alert>
      </Container>
    )
  }

  if (!stats) return null

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ color: '#4fc08d', fontWeight: 'bold' }}>
        📊 服务器监控仪表盘
      </Typography>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 3, display: 'block' }}>
        最后更新: {new Date(stats.timestamp).toLocaleString('zh-CN')} | 刷新间隔: 5s
      </Typography>

      <Grid container spacing={3}>
        {/* CPU Gauge */}
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#ff9800' }}>
              CPU 使用率
            </Typography>
            <EChartsReact option={{ ...chartTheme, ...getOption('CPU', stats.cpu.usage, 100, '#ff9800') }} />
            <Box sx={{ mt: 1, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Chip label={`核心数: ${stats.cpu.cores}`} size="small" />
              <Chip label={stats.cpu.model} size="small" color="default" />
            </Box>
          </Paper>
        </Grid>

        {/* Memory Gauge */}
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#2196f3' }}>
              内存使用率
            </Typography>
            <EChartsReact option={{ ...chartTheme, ...getOption('内存', stats.memory.usage, 100, '#2196f3') }} />
            <Box sx={{ mt: 1, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Chip label={`已用: ${stats.memory.used} MB`} size="small" />
              <Chip label={`空闲: ${stats.memory.free} MB`} size="small" />
              <Chip label={`总计: ${stats.memory.total} MB`} size="small" />
            </Box>
          </Paper>
        </Grid>

        {/* GPU Gauges */}
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#e91e63' }}>
              GPU 使用率
            </Typography>
            {stats.gpu.available ? (
              <>
                <EChartsReact
                  option={{
                    ...chartTheme,
                    ...getOption('GPU', stats.gpu.gpu_usage ?? 0, 100, '#e91e63'),
                  }}
                />
                <Box sx={{ mt: 1, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Chip label={`显存: ${stats.gpu.memory_used ?? 0}/${stats.gpu.memory_total ?? 0} MB`} size="small" />
                  <Chip label={`温度: ${stats.gpu.temperature ?? 0}°C`} size="small" />
                  <Chip label={stats.gpu.model} size="small" color="default" />
                </Box>
              </>
            ) : (
              <Alert severity="warning">
                <AlertTitle>未检测到 GPU</AlertTitle>
                未找到 NVIDIA GPU 或未安装 nvidia-smi
              </Alert>
            )}
          </Paper>
        </Grid>

        {/* Load Average Bar Chart */}
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#9c27b0' }}>
              系统负载
            </Typography>
            <EChartsReact
              option={{
                ...chartTheme,
                ...getBarOption('Load', [
                  { name: '1分钟', value: stats.load.one },
                  { name: '5分钟', value: stats.load.five },
                  { name: '15分钟', value: stats.load.fifteen },
                ]),
              }}
            />
            <Typography variant="caption" color="text.secondary">
              负载平均值 (数值越低越好，超过 CPU 核心数表示过载)
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}

export default Monitor
