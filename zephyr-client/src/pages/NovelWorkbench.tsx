import { useState, useEffect } from 'react'
import {
  Typography,
  Box,
  Paper,
  TextField,
  Button,
 Alert,
  CircularProgress,
  Divider,
  Card,
  CardContent,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Tooltip,
} from '@mui/material'
import {
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  AutoFixHigh as AutoFixHighIcon,
  Description as DescriptionIcon,
  History as HistoryIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'

interface VolumeChapter {
  title: string
  synopsis: string
}

interface Volume {
  id?: number
  title: string
  theme: string
  synopsis: string
  chapters: VolumeChapter[] | string
}

/** Safely parse chapters JSON string to array */
function parseChapters(chapters: VolumeChapter[] | string): VolumeChapter[] {
  if (Array.isArray(chapters)) return chapters
  if (typeof chapters === 'string') {
    try {
      return JSON.parse(chapters)
    } catch {
      return []
    }
  }
  return []
}

interface Book {
  id: number
  title: string
  synopsis: string
  prompt: string
  status: string
  created_at: string
  updatedAt: string
}

interface GeneratedBook extends Book {
  volumes: Volume[]
}

interface Version {
  id: number
  book_id: number
  title: string
  synopsis: string
  style: string
  refine_prompt: string
  created_at: string
}

export default function NovelWorkbench() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [selectedBook, setSelectedBook] = useState<GeneratedBook | null>(null)

  // Version history state
  const [versions, setVersions] = useState<Version[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  // Displayed volumes for the current version (parsed from version detail API)
  const [displayedVolumes, setDisplayedVolumes] = useState<Volume[]>([])
  const [refinePrompt, setRefinePrompt] = useState('')
  const [refining, setRefining] = useState(false)

  const API = 'http://localhost:5010'

  // Fetch book list
  const fetchBooks = async () => {
    try {
      const res = await fetch(`${API}/ai/books`)
      if (res.ok) {
        const data = await res.json()
        setBooks(data)
      }
    } catch {
      // Silently fail if backend not running
    }
  }

  useEffect(() => {
    fetchBooks()
  }, [])

  // Generate outline
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入一句话灵感')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`${API}/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || `HTTP ${res.status}`)
      }

      const result = await res.json()
      setSuccess(`✅ 大纲生成成功！书名：${result.outline.title}`)
      setPrompt('')
      fetchBooks()
    } catch (err: any) {
      setError(err.message || '生成失败，请检查后端服务')
    } finally {
      setLoading(false)
    }
  }

  // View book details + load versions
  const handleViewBook = async (book: Book) => {
    try {
      const res = await fetch(`${API}/ai/books/${book.id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedBook(data)

        // Load versions
        const verRes = await fetch(`${API}/ai/books/${book.id}/versions`)
        if (verRes.ok) {
          const verData = await verRes.json()
          setVersions(verData)
          // Auto-select the initial version (first in the list, which is the oldest/initial)
          if (verData.length > 0) {
            const initialVer = verData[verData.length - 1]
            setSelectedVersionId(initialVer.id)
            // Load initial version's volumes to display in center panel
            const verDetailRes = await fetch(`${API}/ai/books/${book.id}/versions/${initialVer.id}`)
            if (verDetailRes.ok) {
              const verDetail = await verDetailRes.json()
              setDisplayedVolumes(verDetail.volumes || [])
            }
          }
        }
      }
    } catch {
      setError('无法加载书籍详情')
    }
  }

  // Refine outline
  const handleRefine = async () => {
    if (!refinePrompt.trim()) {
      setError('请输入修改要求')
      return
    }
    if (!selectedBook) return

    setRefining(true)
    setError(null)

    try {
      const res = await fetch(`${API}/ai/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: selectedBook.id,
          prompt: refinePrompt.trim(),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || `HTTP ${res.status}`)
      }

      const result = await res.json()
      setSuccess(`✅ 版本 ${result.versionId} 生成成功`)
      setRefinePrompt('')

      // Reload versions and load the latest version's volumes
      const verRes = await fetch(`${API}/ai/books/${selectedBook.id}/versions`)
      if (verRes.ok) {
        const verData = await verRes.json()
        setVersions(verData)
        // Load the latest version's volumes (last in list = newest)
        if (verData.length > 0) {
          const latestVer = verData[0]
          const verDetailRes = await fetch(`${API}/ai/books/${selectedBook.id}/versions/${latestVer.id}`)
          if (verDetailRes.ok) {
            const verDetail = await verDetailRes.json()
            setDisplayedVolumes(verDetail.volumes || [])
            setSelectedVersionId(latestVer.id)
          }
        }
      }
    } catch (err: any) {
      setError(err.message || '修订失败')
    } finally {
      setRefining(false)
    }
  }

  // Switch to a version
  const handleSwitchVersion = async (version: Version) => {
    try {
      const res = await fetch(`${API}/ai/books/${selectedBook?.id}/versions/${version.id}`)
      if (res.ok) {
        const data = await res.json()
        setDisplayedVolumes(data.volumes || [])
        setSelectedVersionId(version.id)
      }
    } catch {
      setError('无法加载版本')
    }
  }

  // Delete book
  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此书及其所有版本？')) return
    try {
      await fetch(`${API}/ai/books/${id}`, { method: 'DELETE' })
      setBooks((prev) => prev.filter((b) => b.id !== id))
      setSelectedBook(null)
      setDisplayedVolumes([])
      setVersions([])
    } catch {
      setError('删除失败')
    }
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* LEFT PANEL: Book list */}
      <Paper
        elevation={2}
        sx={{
          width: 280,
          minWidth: 280,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #333',
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid #333' }}>
          <Typography variant="h6" sx={{ color: '#4fc08d', fontWeight: 'bold', mb: 1 }}>
            <DescriptionIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            小说工作台
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            placeholder="一句话灵感，AI 生成大纲..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ mb: 1 }}
          />
          <Button
            fullWidth
            variant="contained"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}
            size="small"
            sx={{ bgcolor: '#e040fb', '&:hover': { bgcolor: '#c2185b' } }}
          >
            {loading ? '生成中...' : '✨ 生成大纲'}
          </Button>
        </Box>

        {/* Book list */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
          {books.length === 0 && (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 3 }}>
              暂无大纲
            </Typography>
          )}
          {books.map((book) => (
            <Card
              key={book.id}
              variant="outlined"
              sx={{
                mb: 1,
                cursor: 'pointer',
                border: selectedBook?.id === book.id ? '1px solid #4fc08d' : undefined,
                bgcolor: selectedBook?.id === book.id ? '#1a2e1a' : 'transparent',
                '&:hover': { borderColor: '#4fc08d' },
              }}
              onClick={() => handleViewBook(book)}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="body2" sx={{ color: '#4fc08d', fontWeight: 'bold', mb: 0.5 }}>
                  {book.title}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  <Chip label={book.status} size="small" color={book.status === 'ready' ? 'success' : 'warning'} />
                  <Chip label={new Date(book.created_at).toLocaleDateString('zh-CN')} size="small" />
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Paper>

      {/* CENTER PANEL: Outline display + refine input */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedBook ? (
          <>
            {/* Header */}
            <Box sx={{ p: 2, borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h6" sx={{ color: '#4fc08d' }}>
                  {selectedBook.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  灵感："{selectedBook.prompt}"
                </Typography>
              </Box>
              <Box>
                <Tooltip title="删除">
                  <IconButton onClick={() => handleDelete(selectedBook.id)} color="error">
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Outline display */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {/* Volumes accordion */}
              {displayedVolumes && displayedVolumes.length > 0 ? (
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#ff9800', mb: 1 }}>
                    卷规划（{displayedVolumes.length} 卷）
                  </Typography>
                  {displayedVolumes.map((vol, volIdx) => (
                    <Accordion key={vol.id || volIdx} sx={{ mb: 0.5 }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box>
                          <Typography variant="subtitle2" sx={{ color: '#ff9800' }}>
                            第{volIdx + 1}卷：{vol.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {vol.theme} | {parseChapters(vol.chapters).length} 章
                          </Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" sx={{ mb: 1, color: '#aaa' }}>
                          {vol.synopsis}
                        </Typography>
                        {parseChapters(vol.chapters).map((ch, chIdx) => (
                          <Box key={chIdx} sx={{ mb: 0.5, pl: 2 }}>
                            <Typography variant="body2" sx={{ color: '#4fc08d' }}>
                              第{chIdx + 1}章：{ch.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {ch.synopsis}
                            </Typography>
                          </Box>
                        ))}
                      </AccordionDetails>
                    </Accordion>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 3 }}>
                  暂无大纲内容
                </Typography>
              )}
            </Box>

            {/* Refine section */}
            <Divider />
            <Paper elevation={3} sx={{ p: 2, borderTop: '1px solid #333' }}>
              <Typography variant="subtitle2" sx={{ color: '#e040fb', mb: 1 }}>
                <RefreshIcon sx={{ mr: 1, verticalAlign: 'middle', fontSize: 18 }} />
                调整大纲
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={2}
                placeholder="输入修改要求，例如：把第一卷的章节增加到8章，增加一个反派角色..."
                value={refinePrompt}
                onChange={(e) => setRefinePrompt(e.target.value)}
                variant="outlined"
                size="small"
                sx={{ mb: 1 }}
              />
              <Button
                variant="contained"
                onClick={handleRefine}
                disabled={refining || !refinePrompt.trim()}
                startIcon={refining ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                size="small"
                sx={{ bgcolor: '#e040fb', '&:hover': { bgcolor: '#c2185b' } }}
              >
                {refining ? 'AI 修订中...' : '🔄 修订大纲'}
              </Button>
            </Paper>
          </>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="h5" color="text.secondary">
              选择左侧的大纲开始编辑
            </Typography>
          </Box>
        )}
      </Box>

      {/* RIGHT PANEL: Version history */}
      <Paper
        elevation={2}
        sx={{
          width: 260,
          minWidth: 260,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #333',
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid #333' }}>
          <Typography variant="subtitle2" sx={{ color: '#4fc08d', fontWeight: 'bold' }}>
            <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            版本历史
          </Typography>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {versions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 3, px: 2 }}>
              暂无修订版本
            </Typography>
          ) : (
            <List dense>
              {versions.map((ver) => (
                <ListItemButton
                  key={ver.id}
                  component="li"
                  selected={selectedVersionId === ver.id}
                  onClick={() => handleSwitchVersion(ver)}
                  sx={{
                    mb: 0.5,
                    px: 1,
                    borderLeft: '3px solid transparent',
                    '&.Mui-selected': { borderLeftColor: '#4fc08d', bgcolor: '#1a2e1a' },
                    '&:hover': { borderLeftColor: '#4fc08d' },
                  }}
                >
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ color: '#4fc08d', fontWeight: 'bold' }}>
                          v{ver.id}
                        </Typography>
                      }
                      secondary={
                        <>
                          <Typography variant="caption" sx={{ display: 'block', color: '#aaa' }}>
                            {ver.refine_prompt?.substring(0, 30)}...
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(ver.created_at).toLocaleString('zh-CN')}
                          </Typography>
                        </>
                      }
                    />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
      </Paper>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, maxWidth: 400 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, maxWidth: 400 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
    </Box>
  )
}
