import {
  Container,
  Typography,
  Card,
  CardContent,
  Box,
  Chip,
  Link,
} from '@mui/material'

function App() {
  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" component="h1" gutterBottom>
            🚀 Zephyr
          </Typography>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            Zephyr - NestJS + Bun + Drizzle + SQLite + Redis + React + MUI + Tailwind
          </Typography>
          <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip label="NestJS" color="primary" size="small" />
            <Chip label="Bun" color="success" size="small" />
            <Chip label="Drizzle" color="warning" size="small" />
            <Chip label="SQLite" color="info" size="small" />
            <Chip label="Redis" color="secondary" size="small" />
            <Chip label="React" color="primary" size="small" />
            <Chip label="MUI" color="success" size="small" />
            <Chip label="Tailwind" color="warning" size="small" />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            API Server: <Link href="http://localhost:5010" target="_blank">localhost:5010</Link>
            {' '}|{' '}
            Docs: <Link href="http://localhost:5010/api/docs" target="_blank">/api/docs</Link>
          </Typography>
        </CardContent>
      </Card>
    </Container>
  )
}

export default App
