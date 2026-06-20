import { useState, useEffect, useCallback } from 'react'
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
  Dialog,
  DialogTitle,
  DialogActions,
  Tab,
  Tabs,
 } from '@mui/material'
import {
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  AutoFixHigh as AutoFixHighIcon,
  Description as DescriptionIcon,
  History as HistoryIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  MenuBook as MenuBookIcon,
  Save as SaveIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material'

interface VolumeChapter {
  title: string
  synopsis: string
  body?: string
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

  // Chapter detail modal state
  const [chapterModalOpen, setChapterModalOpen] = useState(false)
  const [selectedChapter, setSelectedChapter] = useState<{
    chapter: VolumeChapter
    volumeIdx: number
    chapterIdx: number
  } | null>(null)
 const [chapterBody, setChapterBody] = useState('')
  const [chapterTab, setChapterTab] = useState(0) // 0 = synopsis, 1 = body
  const [chapterAiPrompt, setChapterAiPrompt] = useState('')
  const [chapterGenerating, setChapterGenerating] = useState(false)
  const [refinePrompt, setRefinePrompt] = useState('')
  const [refining, setRefining] = useState(false)
  const [saveTimer, setSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  // Chapter body version history state
  const [chapterVersions, setChapterVersions] = useState<any[]>([])
 
  const [chapterRefinePrompt, setChapterRefinePrompt] = useState('')
  const [chapterRefining, setChapterRefining] = useState(false)
  const [chapterSaving, setChapterSaving] = useState(false)

  // Reading mode state
  const [chapterSelectedVersionId, setChapterSelectedVersionId] = useState<number | null>(null)

  const API = 'http://192.168.1.200:5010'

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
    return () => {
      if (saveTimer) clearTimeout(saveTimer)
    }
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
          } else {
            // No version history — use the book's volumes directly (legacy books without version feature)
            setDisplayedVolumes(data.volumes || [])
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

  // AI generate chapter body
  const handleGenerateChapterBody = async () => {
    if (!chapterAiPrompt.trim() || !selectedBook || !selectedChapter) return
    if (!confirm(`将使用 AI 生成章节正文，当前内容将被覆盖。确定？`)) return

    setChapterGenerating(true)
    setError(null)

    try {
      // Build context: book synopsis + current volume context + chapter synopsis
      const volIdx = selectedChapter.volumeIdx
      const currentVolume = displayedVolumes[volIdx]
      const prevVolumes = displayedVolumes.slice(0, volIdx).map(v => v.synopsis).join('\n')
      const context = `书名：${selectedBook.title}
故事概要：${selectedBook.synopsis}
前一卷内容概要：${prevVolumes || '无'}
当前卷概要：${currentVolume?.synopsis || '无'}
第${selectedChapter.chapterIdx + 1}章概要：${selectedChapter.chapter.synopsis}`

      const res = await fetch(`${API}/ai/generate-chapter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: selectedBook.id,
          chapterIndex: selectedChapter.chapterIdx + 1,
          chapterTitle: selectedChapter.chapter.title,
          chapterSynopsis: selectedChapter.chapter.synopsis,
          context,
          prompt: chapterAiPrompt.trim(),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || `HTTP ${res.status}`)
      }

    const result = await res.json()
      // result.body 可能是字符串（直接正文）或包含 content 字段（OpenAI 格式）
      const chapterText = typeof result.body === 'string' ? result.body : (result.body?.content || '')
      setChapterBody(chapterText)
      setSuccess(`✅ 章节正文生成成功`)
      setChapterAiPrompt('')
      // Auto-save generated body to backend
      try {
        await fetch(`${API}/ai/chapters/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookId: selectedBook.id,
            volumeIndex: selectedChapter.volumeIdx,
            chapterIndex: selectedChapter.chapterIdx,
            body: chapterText,
          }),
        })
      } catch {
        // Save failure is non-critical
      }
    } catch (err: any) {
      setError(err.message || 'AI 生成章节失败')
    } finally {
      setChapterGenerating(false)
    }
  }

  // Save chapter body to backend
  const saveChapterBody = useCallback(async (body: string) => {
    if (!selectedBook || !selectedChapter) return
    try {
      await fetch(`${API}/ai/chapters/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: selectedBook.id,
          volumeIndex: selectedChapter.volumeIdx,
          chapterIndex: selectedChapter.chapterIdx,
          body,
        }),
      })
      // Also sync body to version snapshot so ch.body is populated on next open
      await fetch(`${API}/ai/chapters/sync-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: selectedBook.id,
          volumeIndex: selectedChapter.volumeIdx,
          chapterIndex: selectedChapter.chapterIdx,
          body,
        }),
      }).catch(() => {})
    } catch {
      // Save failure is non-critical
    }
  }, [selectedBook, selectedChapter, API])

  // Load chapter body version history
  const loadChapterVersions = useCallback(async () => {
    if (!selectedBook || !selectedChapter) return null
    setChapterVersions([]) // Reset immediately to prevent stale data
    try {
      const res = await fetch(
        `${API}/ai/books/${selectedBook.id}/volumes/${selectedChapter.volumeIdx}/chapters/${selectedChapter.chapterIdx}/versions`,
      )
      if (res.ok) {
        const data = await res.json()
        setChapterVersions(data)
        return data
      }
    } catch {
      // Non-critical
    }
    return null
  }, [selectedBook, selectedChapter, API])

  // Open chapter modal - also load version history
  const openChapterModal = async (volIdx: number, chIdx: number, ch: VolumeChapter) => {
    setSelectedChapter({ chapter: ch, volumeIdx: volIdx, chapterIdx: chIdx })
    setChapterBody(ch.body || '')
    setChapterAiPrompt(ch.synopsis)
    setChapterTab(0)
    setChapterRefinePrompt('')
    setChapterRefining(false)
    setChapterSaving(false)
    setChapterSelectedVersionId(null)
    setChapterModalOpen(true)

    // Load chapter version history and auto-fill reading mode with the latest version
    const versions = await loadChapterVersions()
    if (versions && versions.length > 0) {
      setChapterBody(versions[0].body || '')
    } else if (!ch.body) {
      // Fallback: if no version records and ch.body is empty, check current chapters JSON
      // (saveChapterBody updates current volumes but not the version snapshot)
      try {
        const res = await fetch(`${API}/ai/books/${selectedBook?.id}/chapters/${volIdx}`)
        if (res.ok) {
          const currentChapters = await res.json()
          const currentCh = currentChapters?.[chIdx]
          if (currentCh?.body) {
            setChapterBody(currentCh.body)
          }
        }
      } catch {
        // Non-critical
      }
    }
  }

  // Save chapter body version (manual save)
  const saveChapterBodyVersion = useCallback(async () => {
    if (!selectedBook || !selectedChapter) return
    try {
      setChapterSaving(true)
      const res = await fetch(`${API}/ai/chapters/version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: selectedBook.id,
          volumeIndex: selectedChapter.volumeIdx,
          chapterIndex: selectedChapter.chapterIdx,
          body: chapterBody,
          prompt: '手动保存',
        }),
      })
      if (res.ok) {
        setSuccess('✅ 章节版本已保存')
        await loadChapterVersions()
      }
    } catch {
      setError('保存版本失败')
    } finally {
      setChapterSaving(false)
    }
  }, [selectedBook, selectedChapter, chapterBody, API, loadChapterVersions])

  // AI refine chapter body
  const handleRefineChapterBody = async () => {
    if (!chapterRefinePrompt.trim() || !selectedBook || !selectedChapter) return
    if (!chapterBody.trim()) {
      setError('当前章节没有正文，无法调整。请先生成或撰写正文。')
      return
    }

    setChapterRefining(true)
    setError(null)

    try {
      const res = await fetch(`${API}/ai/chapters/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: selectedBook.id,
          volumeIndex: selectedChapter.volumeIdx,
          chapterIndex: selectedChapter.chapterIdx,
          body: chapterBody,
          prompt: chapterRefinePrompt.trim(),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || `HTTP ${res.status}`)
      }

      const result = await res.json()
      const refinedBody = typeof result.body === 'string' ? result.body : (result.body?.content || '')
      setChapterBody(refinedBody)
      setSuccess('✅ 章节正文调整完成')
      setChapterRefinePrompt('')
      // Auto-save the refined version
      try {
        await fetch(`${API}/ai/chapters/version`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookId: selectedBook.id,
            volumeIndex: selectedChapter.volumeIdx,
            chapterIndex: selectedChapter.chapterIdx,
            body: refinedBody,
            prompt: `AI 调整: ${chapterRefinePrompt.trim()}`,
          }),
        })
        await loadChapterVersions()
      } catch {
        // Non-critical
      }
    } catch (err: any) {
      setError(err.message || 'AI 调整章节失败')
    } finally {
      setChapterRefining(false)
    }
  }

  // Restore a chapter body version (instant, no confirm)
  const restoreChapterVersion = async (version: any) => {
    setChapterSelectedVersionId(version.id)
    setChapterBody(version.body)
    await loadChapterVersions()
  }

  // Delete a chapter body version
  const deleteChapterVersion = async (versionId: number) => {
    if (!selectedBook || !selectedChapter) return
    try {
      const res = await fetch(
        `${API}/ai/books/${selectedBook.id}/volumes/${selectedChapter.volumeIdx}/chapters/${selectedChapter.chapterIdx}/versions/${versionId}`,
        { method: 'DELETE' },
      )
      if (res.ok) {
        setSuccess('✅ 版本已删除')
        // Reload and get the updated versions
        const updatedVersions = await loadChapterVersions()
        // If deleted version is currently selected, restore to first available version
        if (chapterSelectedVersionId === versionId) {
          setChapterSelectedVersionId(null)
          if (updatedVersions && updatedVersions.length > 0) {
            setChapterBody(updatedVersions[0].body)
          }
        }
      }
    } catch {
      setError('删除版本失败')
    }
  }

  // Debounced save handler for chapter body changes
  const handleChapterBodyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setChapterBody(value)
    if (saveTimer) clearTimeout(saveTimer)
    const timer = setTimeout(() => saveChapterBody(value), 1500)
    setSaveTimer(timer)
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
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                cursor: 'pointer',
                                '&:hover': { color: '#81c784' },
                              }}
                              onClick={() => openChapterModal(volIdx, chIdx, ch)}
                            >
                              <Typography variant="body2" sx={{ color: '#4fc08d' }}>
                                第{chIdx + 1}章：{ch.title}
                              </Typography>
                              <Tooltip title="查看/编辑章节">
                                <EditIcon sx={{ fontSize: 14, color: '#666' }} />
                              </Tooltip>
                            </Box>
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

      {/* Chapter Detail Modal */}
      <Dialog
        open={chapterModalOpen}
        onClose={() => setChapterModalOpen(false)}
        maxWidth="lg"
        fullWidth
        sx={{ '& .MuiDialog-paper': { bgcolor: '#1a1a2e', maxWidth: '95vw' } }}
      >
        {selectedChapter && (
          <>
            <DialogTitle sx={{ borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 1 }}>
              <MenuBookIcon sx={{ color: '#4fc08d' }} />
              第{selectedChapter.chapterIdx + 1}章：{selectedChapter.chapter.title}
            </DialogTitle>

            {/* Main Tabs: Synopsis / Reading / Editing */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={chapterTab} onChange={(_, v) => setChapterTab(v)} sx={{ bgcolor: '#1a1a2e' }}>
                <Tab label="📋 章节概要" icon={<DescriptionIcon />} iconPosition="start" sx={{ color: '#aaa' }} />
                <Tab label="📖 阅读模式" icon={<VisibilityIcon />} iconPosition="start" sx={{ color: '#aaa' }} />
                <Tab label="✍️ 编辑模式" icon={<EditIcon />} iconPosition="start" sx={{ color: '#aaa' }} />
              </Tabs>
            </Box>

            {/* Shared Layout: Left Sidebar (Version History) + Right Content */}
            <Box sx={{ display: 'flex', height: '70vh', bgcolor: '#1a1a2e' }}>
              {/* Left Sidebar: Version History (shared across all tabs) */}
              <Box
                sx={{
                  width: 300,
                  minWidth: 300,
                  borderRight: '1px solid #333',
                  display: 'flex',
                  flexDirection: 'column',
                  bgcolor: '#12122a',
                }}
              >
                <Box sx={{ p: 1.5, borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" sx={{ color: '#4fc08d' }}>
                    <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle', fontSize: 16 }} />
                    版本历史
                  </Typography>
                  {chapterTab === 2 && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={saveChapterBodyVersion}
                      disabled={chapterSaving || !chapterBody.trim()}
                      startIcon={chapterSaving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                      sx={{ bgcolor: '#4fc08d', '&:hover': { bgcolor: '#388e3c' }, fontSize: '0.7rem' }}
                    >
                      {chapterSaving ? '保存中...' : '💾 保存'}
                    </Button>
                  )}
                </Box>

                <Box sx={{ flex: 1, overflow: 'auto' }}>
                  {chapterVersions.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 3, px: 1 }}>
                      暂无正文版本记录
                    </Typography>
                  ) : (
                    <List dense>
                      {chapterVersions.map((ver) => (
                        <ListItemButton
                          key={ver.id}
                          component="li"
                          selected={chapterSelectedVersionId === ver.id}
                          onClick={() => restoreChapterVersion(ver)}
                          sx={{
                            mb: 0.5,
                            px: 1,
                            borderLeft: '3px solid transparent',
                            borderRadius: 1,
                            '&.Mui-selected': { borderLeftColor: '#4fc08d', bgcolor: '#1a2e1a' },
                            '&:hover': { borderLeftColor: '#4fc08d' },
                          }}
                        >
                          <ListItemText
                            primary={
                              <Typography variant="body2" sx={{ color: chapterSelectedVersionId === ver.id ? '#4fc08d' : '#aaa', fontSize: '0.75rem' }}>
                                v{ver.id}
                              </Typography>
                            }
                            secondary={
                               <>
                                 <Typography variant="caption" sx={{ display: 'block', color: '#888', fontSize: '0.6rem' }}>
                                   第{selectedChapter?.chapterIdx + 1}章：{selectedChapter?.chapter?.title}
                                 </Typography>
                                 <Typography variant="caption" sx={{ display: 'block', color: '#666', fontSize: '0.55rem' }}>
                                   {ver.refine_prompt?.substring(0, 20)}...
                                 </Typography>
                                 <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.5rem' }}>
                                   {ver.created_at}
                                 </Typography>
                               </>
                             }
                          />
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="查看此版本">
                              <IconButton size="small" sx={{ color: '#4fc08d' }}>
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="删除此版本">
                              <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); deleteChapterVersion(ver.id); }}
                                sx={{ color: '#ef5350' }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </ListItemButton>
                      ))}
                    </List>
                  )}
                </Box>

                {/* Status bar */}
                <Box sx={{ p: 1, borderTop: '1px solid #333' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right' }}>
                    {chapterSelectedVersionId
                      ? `当前版本: v${chapterSelectedVersionId}（点击切换）`
                      : '当前为编辑中正文'}
                  </Typography>
                </Box>
              </Box>

              {/* Right Content Area */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                {/* Synopsis Tab */}
                {chapterTab === 0 && (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="body1" sx={{ color: '#e0e0e0', lineHeight: 1.8 }}>
                      {selectedChapter.chapter.synopsis || '暂无概要'}
                    </Typography>
                  </Box>
                )}

                {/* Reading Mode Tab */}
                {chapterTab === 1 && (
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ flex: 1, bgcolor: '#0f0f23', borderRadius: 1, m: 2, p: 3, overflow: 'auto' }}>
                      {chapterBody ? (
                        <Typography variant="body1" sx={{ color: '#e0e0e0', fontFamily: 'Georgia, serif', lineHeight: 2, whiteSpace: 'pre-wrap' }}>
                          {chapterBody}
                        </Typography>
                      ) : (
                        <Typography variant="body1" sx={{ color: '#888', fontStyle: 'italic' }}>
                          暂无正文内容，切换到编辑模式生成或撰写
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}

                {/* Editing Mode Tab */}
                {chapterTab === 2 && (
                  <Box sx={{ p: 2 }}>
                    {/* AI Generation Section */}
                    <Box sx={{ mb: 2, p: 2, bgcolor: '#1a1a2e', borderRadius: 1, border: '1px solid #333' }}>
                      <Typography variant="subtitle2" sx={{ color: '#e040fb', mb: 1 }}>
                        <AutoFixHighIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        AI 生成章节正文
                      </Typography>
                      <TextField
                        fullWidth
                        multiline
                        rows={3}
                        placeholder="输入生成要求，例如：加入环境描写、增加对话、突出主角的内心挣扎..."
                        value={chapterAiPrompt}
                        onChange={(e) => setChapterAiPrompt(e.target.value)}
                        variant="outlined"
                        size="small"
                        sx={{ mb: 1 }}
                      />
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={handleGenerateChapterBody}
                        disabled={chapterGenerating || !chapterAiPrompt.trim() || !selectedBook}
                        startIcon={chapterGenerating ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}
                        size="small"
                        sx={{ bgcolor: '#e040fb', '&:hover': { bgcolor: '#c2185b' } }}
                      >
                        {chapterGenerating ? 'AI 生成中...' : '✨ AI 生成正文'}
                      </Button>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        默认使用章节概要作为生成基础，输入要求可进一步细化
                      </Typography>
                    </Box>

                    {/* AI Refine Section */}
                    <Box sx={{ mb: 2, p: 2, bgcolor: '#1a1a2e', borderRadius: 1, border: '1px solid #333' }}>
                      <Typography variant="subtitle2" sx={{ color: '#ff9800', mb: 1 }}>
                        <RefreshIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        AI 调整章节正文
                      </Typography>
                      <TextField
                        fullWidth
                        multiline
                        rows={2}
                        placeholder="输入调整要求，例如：增加对话、加强冲突、补充细节描写..."
                        value={chapterRefinePrompt}
                        onChange={(e) => setChapterRefinePrompt(e.target.value)}
                        variant="outlined"
                        size="small"
                        sx={{ mb: 1 }}
                        disabled={!chapterBody.trim()}
                      />
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={handleRefineChapterBody}
                        disabled={chapterRefining || !chapterRefinePrompt.trim() || !chapterBody.trim()}
                        startIcon={chapterRefining ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                        size="small"
                        sx={{ bgcolor: '#ff9800', '&:hover': { bgcolor: '#f57c00' } }}
                      >
                        {chapterRefining ? 'AI 调整中...' : '🔄 AI 调整正文'}
                      </Button>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        基于当前正文进行调整，调整后的版本自动保存为历史版本
                      </Typography>
                    </Box>

                    {/* Chapter Body */}
                    <TextField
                      fullWidth
                      multiline
                      rows={18}
                      placeholder="在此撰写章节正文内容..."
                      value={chapterBody}
                      onChange={handleChapterBodyChange}
                      variant="outlined"
                      sx={{
                        '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' },
                        '& .MuiOutlinedInput-input': { color: '#e0e0e0', fontFamily: 'Georgia, serif' },
                      }}
                    />

                    {/* Save Button (also in sidebar) */}
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant="contained"
                        onClick={saveChapterBodyVersion}
                        disabled={chapterSaving || !chapterBody.trim()}
                        startIcon={chapterSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                        size="small"
                        sx={{ bgcolor: '#4fc08d', '&:hover': { bgcolor: '#388e3c' } }}
                      >
                        {chapterSaving ? '保存中...' : '💾 保存版本'}
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>

            <DialogActions sx={{ px: 2, py: 1, borderTop: '1px solid #333' }}>
              <Button onClick={() => setChapterModalOpen(false)} color="inherit">
                关闭
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  )
}
