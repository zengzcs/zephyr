import { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Grid,
  Card,
  CardContent,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import { Delete as DeleteIcon, ExpandMore as ExpandMoreIcon, AutoFixHigh as AutoFixHighIcon, Description as DescriptionIcon } from '@mui/icons-material'

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

export default function NovelWorkbench() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [selectedBook, setSelectedBook] = useState<GeneratedBook | null>(null)
  const [bookDialogOpen, setBookDialogOpen] = useState(false)

  // Fetch book list
  const fetchBooks = async () => {
    try {
      const res = await fetch('http://localhost:5010/ai/books')
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
      const res = await fetch('http://localhost:5010/ai/generate', {
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

  // View book details
  const handleViewBook = async (book: Book) => {
    try {
      const res = await fetch(`http://localhost:5010/ai/books/${book.id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedBook(data)
        setBookDialogOpen(true)
      }
    } catch {
      setError('无法加载书籍详情')
    }
  }

  // Delete book
  const handleDelete = async (id: number) => {
    try {
      await fetch(`http://localhost:5010/ai/books/${id}`, { method: 'DELETE' })
      setBooks((prev) => prev.filter((b) => b.id !== id))
      if (selectedBook?.id === id) {
        setSelectedBook(null)
        setBookDialogOpen(false)
      }
    } catch {
      setError('删除失败')
    }
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ color: '#4fc08d', fontWeight: 'bold' }}>
        ✍️ AI 小说工作台
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        输入一句话灵感，AI 为你生成完整小说大纲（书名、简介、卷规划、章节列表）
      </Typography>

      {/* Input Section */}
      <Paper elevation={3} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom sx={{ color: '#e040fb' }}>
          <AutoFixHighIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          一句话生成大纲
        </Typography>

        <TextField
          fullWidth
          multiline
          rows={4}
          placeholder="例如：一个落魄的剑客在末日废墟中找回了最后的尊严..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          variant="outlined"
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AutoFixHighIcon />}
            sx={{ minWidth: 160 }}
          >
            {loading ? 'AI 生成中...' : '✨ 生成大纲'}
          </Button>
        </Box>
      </Paper>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Book List */}
      {books.length > 0 && (
        <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="h6" gutterBottom sx={{ color: '#4fc08d' }}>
            <DescriptionIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            已生成大纲
          </Typography>

          <Grid container spacing={2}>
            {books.map((book) => (
              <Grid item xs={12} sm={6} md={4} key={book.id}>
                <Card
                  variant="outlined"
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: '#4fc08d' },
                  }}
                  onClick={() => handleViewBook(book)}
                >
                  <CardContent>
                    <Typography variant="h6" sx={{ color: '#4fc08d', mb: 1 }}>
                      {book.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {book.synopsis}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Chip label={book.status} size="small" color={book.status === 'ready' ? 'success' : 'warning'} />
                      <Chip label={new Date(book.created_at).toLocaleDateString('zh-CN')} size="small" />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* Book Detail Dialog */}
      <Dialog
        open={bookDialogOpen}
        onClose={() => setBookDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{selectedBook?.title}</span>
          <Box>
            <IconButton onClick={() => selectedBook && handleDelete(selectedBook.id)} sx={{ mr: 1 }}>
              <DeleteIcon color="error" />
            </IconButton>
            <IconButton onClick={() => setBookDialogOpen(false)}>
              ✕
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          {selectedBook && (
            <>
              <Typography variant="subtitle1" sx={{ mb: 2, color: '#e040fb' }}>
                灵感来源
              </Typography>
              <Paper sx={{ p: 2, mb: 3, bgcolor: '#1a1a2e' }}>
                <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                  "{selectedBook.prompt}"
                </Typography>
              </Paper>

              <Typography variant="subtitle1" sx={{ mb: 2, color: '#4fc08d' }}>
                故事简介
              </Typography>
              <Typography variant="body1" sx={{ mb: 3 }}>{selectedBook.synopsis}</Typography>

              <Divider sx={{ my: 2 }} />

              {selectedBook.volumes && selectedBook.volumes.length > 0 && (
                <>
                  <Typography variant="subtitle1" sx={{ mb: 2, color: '#4fc08d' }}>
                    卷规划（{selectedBook.volumes.length} 卷）
                  </Typography>
                  {selectedBook.volumes.map((vol, volIdx) => (
                    <Accordion key={vol.id || volIdx} sx={{ mb: 1 }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box>
                          <Typography variant="subtitle2" sx={{ color: '#ff9800' }}>
                            第{volIdx + 1}卷：{vol.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            主题：{vol.theme} | {parseChapters(vol.chapters).length} 章
                          </Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" sx={{ mb: 1, color: '#aaa' }}>
                          {vol.synopsis}
                        </Typography>
                        {parseChapters(vol.chapters).map((ch, chIdx) => (
                          <Box key={chIdx} sx={{ mb: 1, pl: 2 }}>
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
                </>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setBookDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}
