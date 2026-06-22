import { useState, useEffect, type ReactNode } from 'react'
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Grid,
  Tabs,
  Tab,
  List,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
} from '@mui/material'
import {
  Person as PersonIcon,
  AutoFixHigh as AutoFixHighIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Favorite as FavoriteIcon,
  Star as StarIcon,
  History as HistoryIcon,
  Restore as RestoreIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material'

interface CharacterCard {
  name: string
  title: string
  age: number
  occupation: string
  appearance: string
  figure: string
  measurements: string
  personality: string
  fashion: string
  color: string
  archetype: string
  background: string
  relationship: string
  attitude: string
  affection: string
  ability: string
  hidden_traits: string[]
  catchphrase: string
  suggestiveness: number
  service_tendency: string
}

interface CharacterEntry {
  id: number
  prompt: string
  card: CharacterCard
  created_at: string
}

interface CharacterVersion {
  id: number
  refine_prompt: string
  created_at: string
  card: CharacterCard
}

export default function CharacterWorkbench() {
  const [prompt, setPrompt] = useState('')
  const [selectedStyle, setSelectedStyle] = useState('默认')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [characters, setCharacters] = useState<CharacterEntry[]>([])
  const [viewingCard, setViewingCard] = useState<CharacterEntry | null>(null)
  const [viewMode, setViewMode] = useState<'read' | 'edit'>('read')
  const [editingCard, setEditingCard] = useState<CharacterEntry | null>(null)
  const [editCardData, setEditCardData] = useState<CharacterCard | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)

  // Refine mode state
  const [refinePrompt, setRefinePrompt] = useState('')
  const [refining, setRefining] = useState(false)
  const [versions, setVersions] = useState<CharacterVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)

  const API = 'http://192.168.1.200:5010'

  const fetchCharacters = async () => {
    try {
      const res = await fetch(`${API}/ai/characters`)
      if (res.ok) {
        const data = await res.json()
        setCharacters(data)
      }
    } catch {
      // Silently fail if backend not running
    }
  }

  useEffect(() => {
    fetchCharacters()
  }, [])

  const fetchVersions = async (charId: number) => {
    setLoadingVersions(true)
    try {
      const res = await fetch(`${API}/ai/characters/${charId}/versions`)
      if (res.ok) {
        const data = await res.json()
        setVersions(data)
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingVersions(false)
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入角色灵感')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`${API}/ai/characters/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), style: selectedStyle }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || `HTTP ${res.status}`)
      }

      const result = await res.json()
      setSuccess(`✅ 角色卡片生成成功：${result.card.name}`)
      setPrompt('')
      fetchCharacters()
    } catch (err: any) {
      setError(err.message || '生成失败，请检查后端服务')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这个角色卡片？')) return
    try {
      const res = await fetch(`${API}/ai/characters/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSuccess('✅ 已删除')
        fetchCharacters()
      }
    } catch {
      setError('删除失败')
    }
  }

  const openEditor = (entry: CharacterEntry) => {
    setEditingCard(entry)
    setEditCardData(JSON.parse(JSON.stringify(entry.card)))
  }

  const handleSaveEdit = async () => {
    if (!editingCard || !editCardData) return
    setSaveLoading(true)
    try {
      const res = await fetch(`${API}/ai/characters/${editingCard.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: editCardData }),
      })
      if (res.ok) {
        setSuccess('✅ 已保存修改')
        setEditingCard(null)
        setEditCardData(null)
        fetchCharacters()
      }
    } catch {
      setError('保存失败')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleRefine = async () => {
    if (!refinePrompt.trim() || !viewingCard) return
    setRefining(true)
    setError(null)
    try {
      const res = await fetch(`${API}/ai/characters/${viewingCard.id}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: refinePrompt.trim() }),
      })
      if (res.ok) {
        const result = await res.json()
        setViewingCard({ ...viewingCard, card: result.card })
        setRefinePrompt('')
        setSuccess('✅ AI 调整完成')
        // Refresh versions
        await fetchVersions(viewingCard.id)
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(errData.message || 'AI 调整失败')
      }
    } catch (err: any) {
      setError(err.message || 'AI 调整失败')
    } finally {
      setRefining(false)
    }
  }

  const handleRestoreVersion = async (versionId: number) => {
    if (!viewingCard) return
    try {
      const res = await fetch(`${API}/ai/characters/${viewingCard.id}/restore-version/${versionId}`)
      if (res.ok) {
        // Refresh the card data
        const verRes = await fetch(`${API}/ai/characters/${viewingCard.id}/versions/${versionId}`)
        if (verRes.ok) {
          const verData = await verRes.json()
          setViewingCard({ ...viewingCard, card: verData.card })
          setSuccess('✅ 已恢复该版本')
        }
      }
    } catch {
      setError('恢复版本失败')
    }
  }

  const handleViewCard = async (entry: CharacterEntry) => {
    setViewingCard(entry)
    setViewMode('read')
    setRefinePrompt('')
    setSelectedVersionId(null)
    await fetchVersions(entry.id)
  }

  const formatTime = (t: string) => {
    if (!t) return ''
    try {
      return new Date(t).toLocaleString('zh-CN')
    } catch {
      return t
    }
  }

  const renderCardChip = (color: string) => (
    <Box
      sx={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        bgcolor: color,
        border: '2px solid rgba(255,255,255,0.2)',
        display: 'inline-block',
        verticalAlign: 'middle',
        mr: 0.5,
      }}
    />
  )

  const renderSuggestiveness = (level: number) => {
    const stars: ReactNode[] = []
    for (let i = 0; i < 10; i++) {
      stars.push(
        <StarIcon
          key={i}
          sx={{
            fontSize: 16,
            color: i < level ? '#e040fb' : '#333',
          }}
        />
      )
    }
    return <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.2 }}>{stars}</Box>
  }

  const cardPaperProps: Record<string, any> = {
    bgcolor: '#1a1a2e',
    borderRadius: 2,
    border: '1px solid #333',
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
        <PersonIcon sx={{ color: '#e040fb', fontSize: 32 }} />
        <Typography variant="h4" sx={{ color: '#e040fb', fontWeight: 'bold' }}>
          角色卡片工作台
        </Typography>
      </Box>

      {/* Generation Panel */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: '#1a1a2e', borderRadius: 2, border: '1px solid #333' }}>
        <Typography variant="subtitle1" sx={{ color: '#e040fb', mb: 2, fontWeight: 'bold' }}>
          <AutoFixHighIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          AI 角色生成
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder="输入角色灵感，例如：一个在赛博朋克城市中经营茶馆的狐妖少女，表面温柔实则是个隐藏的战斗狂"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' },
                '& .MuiOutlinedInput-input': { color: '#e0e0e0' },
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: '#999' }}>风格</InputLabel>
              <Select
                value={selectedStyle}
                label="风格"
                onChange={(e) => setSelectedStyle(e.target.value)}
                sx={{
                  color: '#e0e0e0',
                  bgcolor: '#0f0f23',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#666' },
                }}
              >
                <MenuItem value="默认">默认</MenuItem>
                <MenuItem value="擦边劲爆">擦边劲爆</MenuItem>
                <MenuItem value="战锤">战锤</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <Button
              fullWidth
              variant="contained"
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}
              size="large"
              sx={{
                bgcolor: '#e040fb',
                '&:hover': { bgcolor: '#c2185b' },
                py: 1.2,
                fontSize: '1.05rem',
              }}
            >
              {loading ? 'AI 生成中...' : '✨ 生成角色卡片'}
            </Button>
          </Grid>
        </Grid>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {success && !error && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {success}
          </Alert>
        )}
      </Paper>

      {/* Character List */}
      <Typography variant="subtitle1" sx={{ color: '#aaa', mb: 2, fontWeight: 'bold' }}>
        已生成的角色（{characters.length}）
      </Typography>

      {characters.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', bgcolor: '#1a1a2e', borderRadius: 2, border: '1px solid #333' }}>
          <PersonIcon sx={{ fontSize: 64, color: '#333', mb: 2 }} />
          <Typography variant="h6" sx={{ color: '#666', mb: 1 }}>
            暂无角色卡片
          </Typography>
          <Typography variant="body2" sx={{ color: '#555' }}>
            在上方输入灵感，AI 将为你生成精美的女性角色卡片
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {characters.map((entry) => (
            <Grid item xs={12} md={6} lg={4} key={entry.id}>
              <Card
                sx={{
                  bgcolor: '#1a1a2e',
                  border: '1px solid #333',
                  borderRadius: 2,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  '&:hover': { borderColor: '#e040fb' },
                }}
                onClick={() => handleViewCard(entry)}
              >
                <CardContent sx={{ p: 2 }}>
                  {/* Name and Title */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box>
                      <Typography variant="h6" sx={{ color: '#e040fb', fontWeight: 'bold', mb: 0.3 }}>
                        {entry.card.name}
                      </Typography>
                      {entry.card.title && (
                        <Typography variant="caption" sx={{ color: '#999' }}>
                          「{entry.card.title}」
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        sx={{ color: '#aaa', '&:hover': { color: '#e040fb' } }}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditor(entry)
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        sx={{ color: '#aaa', '&:hover': { color: '#f44336' } }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(entry.id)
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Quick Info */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                    <Chip
                      label={`${entry.card.age}岁`}
                      size="small"
                      sx={{ bgcolor: '#2a2a4e', color: '#bbb', fontSize: '0.75rem' }}
                    />
                    <Chip
                      label={entry.card.occupation}
                      size="small"
                      sx={{ bgcolor: '#2a2a4e', color: '#bbb', fontSize: '0.75rem' }}
                    />
                    <Chip
                      label={entry.card.archetype}
                      size="small"
                      sx={{ bgcolor: '#2a2a4e', color: '#e040fb', fontSize: '0.75rem' }}
                    />
                    {renderCardChip(entry.card.color)}
                  </Box>

                  {/* Suggestiveness */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    <FavoriteIcon sx={{ fontSize: 14, color: '#e040fb' }} />
                    {renderSuggestiveness(entry.card.suggestiveness)}
                  </Box>

                  {/* Catchphrase Preview */}
                  <Typography
                    variant="caption"
                    sx={{ color: '#777', fontStyle: 'italic', display: 'block' }}
                  >
                    "{entry.card.catchphrase.substring(0, 40)}..."
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* View/Edit Card Dialog with dual modes + version history */}
      <Dialog
        open={!!viewingCard}
        onClose={() => { setViewingCard(null); setViewMode('read') }}
        maxWidth="lg"
        fullWidth
        PaperProps={cardPaperProps}
        sx={{ maxHeight: '90vh' }}
      >
        {viewingCard && (
          <>
            <DialogTitle sx={{ pb: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h5" sx={{ color: '#e040fb' }}>
                  {viewingCard.card.name}
                </Typography>
                {viewingCard.card.title && (
                  <Typography variant="subtitle2" sx={{ color: '#999' }}>
                    「{viewingCard.card.title}」 · {viewingCard.card.age}岁 · {viewingCard.card.occupation}
                  </Typography>
                )}
              </Box>
              <IconButton onClick={() => { setViewingCard(null); setViewMode('read') }} sx={{ color: '#999' }}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <Divider />

            {/* Mode Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
              <Tabs
                value={viewMode === 'read' ? 0 : 1}
                onChange={(_, v) => setViewMode(v === 0 ? 'read' : 'edit')}
                sx={{
                  '& .MuiTab-root': { color: '#999', '&.Mui-selected': { color: '#e040fb' } },
                }}
              >
                <Tab icon={<VisibilityIcon />} label="阅读模式" iconPosition="start" />
                <Tab icon={<EditIcon />} label="编辑模式" iconPosition="start" />
              </Tabs>
            </Box>

            <DialogContent dividers sx={{ p: 0, display: 'flex', height: 'calc(90vh - 200px)' }}>
              {/* Left: Card content */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
                {viewMode === 'read' ? (
                  <CharacterCardDetail card={viewingCard.card} renderCardChip={renderCardChip} renderSuggestiveness={renderSuggestiveness} />
                ) : (
                  <>
                    {/* AI Refine Section */}
                    <Box sx={{ mb: 3, p: 2, bgcolor: '#1a1a2e', borderRadius: 1, border: '1px solid #333' }}>
                      <Typography variant="subtitle2" sx={{ color: '#e040fb', mb: 1 }}>
                        <AutoFixHighIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        AI 调整角色
                      </Typography>
                      <TextField
                        fullWidth
                        multiline
                        rows={3}
                        placeholder="输入调整要求，例如：把性格改得更傲娇一些、增加一个隐藏身份、让穿搭更性感..."
                        value={refinePrompt}
                        onChange={(e) => setRefinePrompt(e.target.value)}
                        variant="outlined"
                        size="small"
                        sx={{
                          mb: 1,
                          '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' },
                          '& .MuiOutlinedInput-input': { color: '#e0e0e0' },
                        }}
                      />
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={handleRefine}
                        disabled={refining || !refinePrompt.trim()}
                        startIcon={refining ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}
                        size="small"
                        sx={{ bgcolor: '#e040fb', '&:hover': { bgcolor: '#c2185b' } }}
                      >
                        {refining ? 'AI 调整中...' : '✨ AI 调整'}
                      </Button>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        AI 将根据你的要求修改角色卡片的描述字段，核心设定（姓名/年龄/职业）保持不变
                      </Typography>
                    </Box>

                    {/* Quick Edit Section */}
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle2" sx={{ color: '#ff9800', mb: 1 }}>
                        快速编辑（仅修改文本字段）
                      </Typography>
                      <Grid container spacing={1.5}>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="外貌特征"
                            value={viewingCard.card.appearance}
                            onChange={(e) => setViewingCard({ ...viewingCard, card: { ...viewingCard.card, appearance: e.target.value } })}
                            size="small"
                            multiline
                            rows={2}
                            sx={{
                              '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' },
                              '& .MuiOutlinedInput-input': { color: '#e0e0e0' },
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="性格描述"
                            value={viewingCard.card.personality}
                            onChange={(e) => setViewingCard({ ...viewingCard, card: { ...viewingCard.card, personality: e.target.value } })}
                            size="small"
                            multiline
                            rows={2}
                            sx={{
                              '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' },
                              '& .MuiOutlinedInput-input': { color: '#e0e0e0' },
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="背景故事"
                            value={viewingCard.card.background}
                            onChange={(e) => setViewingCard({ ...viewingCard, card: { ...viewingCard.card, background: e.target.value } })}
                            size="small"
                            multiline
                            rows={3}
                            sx={{
                              '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' },
                              '& .MuiOutlinedInput-input': { color: '#e0e0e0' },
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="经典台词"
                            value={viewingCard.card.catchphrase}
                            onChange={(e) => setViewingCard({ ...viewingCard, card: { ...viewingCard.card, catchphrase: e.target.value } })}
                            size="small"
                            sx={{
                              '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' },
                              '& .MuiOutlinedInput-input': { color: '#e0e0e0' },
                            }}
                          />
                        </Grid>
                      </Grid>
                    </Box>

                    {/* Save Button */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                      <Button
                        variant="contained"
                        onClick={async () => {
                          setSaveLoading(true)
                          try {
                            const res = await fetch(`${API}/ai/characters/${viewingCard.id}`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ card: viewingCard.card }),
                            })
                            if (res.ok) {
                              setSuccess('✅ 已保存修改')
                              fetchCharacters()
                            }
                          } catch {
                            setError('保存失败')
                          } finally {
                            setSaveLoading(false)
                          }
                        }}
                        disabled={saveLoading}
                        startIcon={saveLoading ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                        sx={{ bgcolor: '#4fc08d', '&:hover': { bgcolor: '#388e3c' } }}
                      >
                        {saveLoading ? '保存中...' : '💾 保存修改'}
                      </Button>
                    </Box>
                  </>
                )}
              </Box>

              {/* Right: Version history sidebar (edit mode only) */}
              {viewMode === 'edit' && (
                <Box
                  sx={{
                    width: 280,
                    borderLeft: '1px solid #333',
                    bgcolor: '#12122a',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Box sx={{ p: 2, borderBottom: '1px solid #333' }}>
                    <Typography variant="subtitle2" sx={{ color: '#ff9800', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <HistoryIcon fontSize="small" />
                      历史版本
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#666', display: 'block', mt: 0.3 }}>
                      {versions.length} 个版本
                    </Typography>
                  </Box>

                  {loadingVersions ? (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <CircularProgress size={20} sx={{ color: '#666' }} />
                    </Box>
                  ) : versions.length === 0 ? (
                    <Box sx={{ p: 2 }}>
                      <Typography variant="body2" sx={{ color: '#555', textAlign: 'center' }}>
                        暂无历史版本
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#444', display: 'block', mt: 0.5, textAlign: 'center' }}>
                        使用 AI 调整后将自动记录版本
                      </Typography>
                    </Box>
                  ) : (
                    <List sx={{ overflow: 'auto', flex: 1 }}>
                      {versions.map((v) => (
                        <ListItemButton
                          key={v.id}
                          selected={selectedVersionId === v.id}
                          onClick={() => setSelectedVersionId(v.id)}
                          sx={{
                            borderBottom: '1px solid #222',
                            '&.Mui-selected': { bgcolor: '#1a1a3e' },
                            '&:hover': { bgcolor: '#1a1a3e' },
                          }}
                        >
                          <ListItemText
                            primary={formatTime(v.created_at)}
                            secondary={v.refine_prompt?.substring(0, 40) || '手动保存'}
                            primaryTypographyProps={{ variant: 'body2', sx: { color: '#ccc', fontSize: '0.8rem' } }}
                            secondaryTypographyProps={{ variant: 'caption', sx: { color: '#777', fontSize: '0.7rem' } }}
                          />
                          <ListItemSecondaryAction>
                            <Tooltip title="恢复此版本">
                              <IconButton
                                edge="end"
                                size="small"
                                sx={{ color: '#4fc08d' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRestoreVersion(v.id)
                                }}
                              >
                                <RestoreIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </ListItemSecondaryAction>
                        </ListItemButton>
                      ))}
                    </List>
                  )}
                </Box>
              )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => {
                  setViewMode('edit')
                }}
                sx={{ color: '#e040fb', borderColor: '#e040fb' }}
              >
                进入编辑模式
              </Button>
              <Button onClick={() => { setViewingCard(null); setViewMode('read') }} sx={{ color: '#999' }}>
                关闭
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Quick Editor Dialog (from list button) */}
      <Dialog
        open={!!editingCard}
        onClose={() => { setEditingCard(null); setEditCardData(null) }}
        maxWidth="md"
        fullWidth
        PaperProps={cardPaperProps}
      >
        {editingCard && editCardData && (
          <>
            <DialogTitle sx={{ pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: '#e040fb' }}>
                编辑角色卡片
              </Typography>
              <IconButton onClick={() => { setEditingCard(null); setEditCardData(null) }} sx={{ color: '#999' }}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <Divider />
            <DialogContent dividers sx={{ p: 3 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="姓名"
                    value={editCardData.name}
                    onChange={(e) => setEditCardData({ ...editCardData, name: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="称号/别名"
                    value={editCardData.title}
                    onChange={(e) => setEditCardData({ ...editCardData, title: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="年龄"
                    type="number"
                    value={editCardData.age}
                    onChange={(e) => setEditCardData({ ...editCardData, age: parseInt(e.target.value) || 0 })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="身份/职业"
                    value={editCardData.occupation}
                    onChange={(e) => setEditCardData({ ...editCardData, occupation: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="身体数据"
                    value={editCardData.measurements}
                    onChange={(e) => setEditCardData({ ...editCardData, measurements: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="萌点/属性"
                    value={editCardData.archetype}
                    onChange={(e) => setEditCardData({ ...editCardData, archetype: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="代表色"
                    value={editCardData.color}
                    onChange={(e) => setEditCardData({ ...editCardData, color: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="外貌特征"
                    value={editCardData.appearance}
                    onChange={(e) => setEditCardData({ ...editCardData, appearance: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="身材描写"
                    value={editCardData.figure}
                    onChange={(e) => setEditCardData({ ...editCardData, figure: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="性格描述"
                    value={editCardData.personality}
                    onChange={(e) => setEditCardData({ ...editCardData, personality: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="穿搭风格"
                    value={editCardData.fashion}
                    onChange={(e) => setEditCardData({ ...editCardData, fashion: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    label="背景故事"
                    value={editCardData.background}
                    onChange={(e) => setEditCardData({ ...editCardData, background: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="与男主关系"
                    value={editCardData.relationship}
                    onChange={(e) => setEditCardData({ ...editCardData, relationship: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="对男主态度"
                    value={editCardData.attitude}
                    onChange={(e) => setEditCardData({ ...editCardData, attitude: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="好感度倾向"
                    value={editCardData.affection}
                    onChange={(e) => setEditCardData({ ...editCardData, affection: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="特殊能力"
                    value={editCardData.ability}
                    onChange={(e) => setEditCardData({ ...editCardData, ability: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="隐藏属性（逗号分隔）"
                    value={editCardData.hidden_traits.join('、')}
                    onChange={(e) => setEditCardData({ ...editCardData, hidden_traits: e.target.value.split(/[、,，]/).filter(Boolean) })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="经典台词"
                    value={editCardData.catchphrase}
                    onChange={(e) => setEditCardData({ ...editCardData, catchphrase: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="服务倾向"
                    value={editCardData.service_tendency}
                    onChange={(e) => setEditCardData({ ...editCardData, service_tendency: e.target.value })}
                    size="small"
                    sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { bgcolor: '#0f0f23' }, '& .MuiOutlinedInput-input': { color: '#e0e0e0' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#999', whiteSpace: 'nowrap' }}>
                      擦边指数
                    </Typography>
                    <Slider
                      value={editCardData.suggestiveness}
                      onChange={(_, v) => setEditCardData({ ...editCardData, suggestiveness: v as number })}
                      min={0}
                      max={10}
                      step={1}
                      sx={{ color: '#e040fb', flex: 1 }}
                    />
                    <Typography variant="body2" sx={{ color: '#e040fb', minWidth: 20 }}>
                      {editCardData.suggestiveness}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button
                variant="contained"
                onClick={handleSaveEdit}
                disabled={saveLoading}
                startIcon={saveLoading ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                sx={{ bgcolor: '#4fc08d', '&:hover': { bgcolor: '#388e3c' } }}
              >
                {saveLoading ? '保存中...' : '💾 保存修改'}
              </Button>
              <Button
                onClick={() => { setEditingCard(null); setEditCardData(null) }}
                sx={{ color: '#999' }}
              >
                取消
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  )
}

/* ============================================================
   CharacterCardDetail - Sub-component for viewing a full card
   ============================================================ */
function CharacterCardDetail({
  card,
  renderCardChip,
  renderSuggestiveness,
}: {
  card: CharacterCard
  renderCardChip: (c: string) => ReactNode
  renderSuggestiveness: (n: number) => ReactNode
}) {
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="subtitle2" sx={{ color: '#e040fb', fontWeight: 'bold', mb: 0.8, fontSize: '0.95rem' }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: '#ccc', lineHeight: 1.7 }}>
        {children}
      </Typography>
    </Box>
  )

  return (
    <>
      <Section title="基本信息">
        <Typography variant="body2" sx={{ color: '#aaa', mb: 0.5 }}>
          <strong>姓名：</strong>{card.name}
        </Typography>
        {card.title && (
          <Typography variant="body2" sx={{ color: '#aaa', mb: 0.5 }}>
            <strong>称号：</strong>{card.title}
          </Typography>
        )}
        <Typography variant="body2" sx={{ color: '#aaa' }}>
          <strong>年龄：</strong>{card.age}岁 · <strong>身份：</strong>{card.occupation}
        </Typography>
      </Section>

      <Section title="外貌特征">
        <Typography variant="body2" sx={{ color: '#ccc', whiteSpace: 'pre-wrap', mb: 0.8 }}>
          {card.appearance}
        </Typography>
        <Typography variant="body2" sx={{ color: '#ccc', whiteSpace: 'pre-wrap', mb: 0.8 }}>
          {card.figure}
        </Typography>
        {card.measurements && (
          <Typography variant="body2" sx={{ color: '#e040fb' }}>
            📏 {card.measurements}
          </Typography>
        )}
        <Box sx={{ mt: 0.5 }}>
          {renderCardChip(card.color)}
          <Typography variant="body2" sx={{ color: '#aaa', verticalAlign: 'middle', ml: 0.5 }}>
            代表色：{card.color}
          </Typography>
        </Box>
      </Section>

      <Section title="穿搭风格">
        <Typography variant="body2" sx={{ color: '#ccc', whiteSpace: 'pre-wrap' }}>
          {card.fashion}
        </Typography>
      </Section>

      <Section title="性格">
        <Typography variant="body2" sx={{ color: '#ccc', whiteSpace: 'pre-wrap', mb: 0.8 }}>
          {card.personality}
        </Typography>
        <Chip label={card.archetype} sx={{ bgcolor: '#2a2a4e', color: '#e040fb' }} />
      </Section>

      <Section title="背景故事">
        <Typography variant="body2" sx={{ color: '#ccc', whiteSpace: 'pre-wrap' }}>
          {card.background}
        </Typography>
      </Section>

      <Section title="关系设定">
        <Typography variant="body2" sx={{ color: '#aaa', mb: 0.5 }}>
          <strong>与男主关系：</strong>{card.relationship}
        </Typography>
        <Typography variant="body2" sx={{ color: '#aaa', mb: 0.5 }}>
          <strong>对男主态度：</strong>{card.attitude}
        </Typography>
        <Typography variant="body2" sx={{ color: '#aaa', mb: 0.5 }}>
          <strong>好感度倾向：</strong>{card.affection}
        </Typography>
      </Section>

      <Section title="隐藏属性">
        {(() => {
          const traits = typeof (card as any).hidden_traits === 'string'
            ? (card as any).hidden_traits.split('、').filter(Boolean)
            : ((card as any).hidden_traits || [])
          return traits.map((trait: string, i: number) => (
            <Chip key={i} label={trait} size="small" sx={{ mr: 0.5, mb: 0.5, bgcolor: '#2a2a4e', color: '#ff9800' }} />
          ))
        })()}
      </Section>

      <Section title="能力">
        <Typography variant="body2" sx={{ color: '#ccc' }}>{card.ability}</Typography>
      </Section>

      <Section title="服务倾向">
        <Typography variant="body2" sx={{ color: '#ccc' }}>{card.service_tendency}</Typography>
      </Section>

      <Section title="经典台词">
        <Typography
          variant="body1"
          sx={{ color: '#e040fb', fontStyle: 'italic', borderLeft: '3px solid #e040fb', pl: 2, py: 0.5 }}
        >
          {card.catchphrase}
        </Typography>
      </Section>

      <Section title="擦边指数">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {renderSuggestiveness(card.suggestiveness)}
          <Typography variant="body2" sx={{ color: '#e040fb', ml: 1 }}>
            {card.suggestiveness}/10
          </Typography>
        </Box>
      </Section>
    </>
  )
}
