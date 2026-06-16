import { Box, Container, Typography } from '@mui/material'

function Home() {
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ color: '#4fc08d', fontWeight: 'bold' }}>
        Zephyr 仪表盘
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        欢迎使用 Zephyr 监控系统。请通过顶部导航访问各功能页面。
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary">
          后端服务: http://localhost:5010
        </Typography>
        <Typography variant="body2" color="text.secondary">
          前端服务: http://localhost:5011
        </Typography>
      </Box>
    </Container>
  )
}

export default Home
